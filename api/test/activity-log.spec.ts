import "reflect-metadata";
import { jest } from "@jest/globals";
import { BadRequestException, Logger } from "@nestjs/common";
import { DataSource } from "typeorm";
import { ActivityLogService } from "../src/database/activity-log.service.js";
import { ActivityType } from "../src/database/activity-log.types.js";
import { ChzzkAccountStore } from "../src/database/chzzk-account.store.js";

const context = { channelId: "a".repeat(32), activityType: ActivityType.RECAP_VIEW };
let database: DataSource;
beforeEach(() => {
  database = new DataSource({ type: "postgres" });
  jest.spyOn(database, "query").mockResolvedValue([]);
  jest.spyOn(Logger, "warn").mockImplementation(() => undefined);
});
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

it("returns the original response and writes only activity metadata once", async () => {
  const value = { token: "must-not-be-persisted", chats: ["private chat"] };
  expect(await new ActivityLogService(database).track(context, async () => value)).toBe(value);
  const query = jest.mocked(database.query);
  expect(query).toHaveBeenCalledTimes(1);
  const fields = query.mock.calls[0]![1]!;
  if (!Array.isArray(fields)) throw new Error("Expected positional query parameters");
  expect(fields).toEqual([context.channelId, "recap_view", expect.any(Date), expect.any(Date), expect.any(Number), "success", 200, null, null]);
  expect(fields[4]).toBeGreaterThanOrEqual(0);
  expect(JSON.stringify(query.mock.calls)).not.toContain("must-not-be-persisted");
  expect(JSON.stringify(query.mock.calls)).not.toContain("private chat");
});

it.each([new BadRequestException("private input"), new Error("secret driver payload")])("preserves the original thrown error and stores a sanitized code", async error => {
  await expect(new ActivityLogService(database).track(context, async () => { throw error; })).rejects.toBe(error);
  const fields = jest.mocked(database.query).mock.calls[0]![1]!;
  expect(fields.slice(5)).toEqual(["failure", error instanceof BadRequestException ? 400 : 500, "request", error instanceof BadRequestException ? "REQUEST_REJECTED" : "PROCESSING_FAILED"]);
  expect(JSON.stringify(fields)).not.toContain(error.message);
});

it.each([false, true])("keeps the business result when persistence fails (business failure: %s)", async fail => {
  jest.mocked(database.query).mockRejectedValue(new Error("secret database details"));
  const original = new Error("original processing error");
  const result = new ActivityLogService(database).track(context, async () => { if (fail) throw original; return "ok"; });
  if (fail) await expect(result).rejects.toBe(original);
  else await expect(result).resolves.toBe("ok");
  expect(Logger.warn).toHaveBeenCalledWith("Activity log persistence failed", "ActivityLogService");
});

it("does not require a database in local development", async () => {
  await expect(new ActivityLogService(null).track(context, async () => "ok")).resolves.toBe("ok");
  expect(database.query).not.toHaveBeenCalled();
});

it("cleans expired logs on startup and hourly, and stops on shutdown", async () => {
  jest.useFakeTimers();
  const service = new ActivityLogService(database);
  await service.onModuleInit();
  expect(database.query).toHaveBeenCalledWith(expect.stringContaining("INTERVAL '90 days'"));
  await jest.advanceTimersByTimeAsync(60 * 60_000);
  expect(database.query).toHaveBeenCalledTimes(2);
  service.onModuleDestroy();
  await jest.advanceTimersByTimeAsync(60 * 60_000);
  expect(database.query).toHaveBeenCalledTimes(2);
});

it("does not break login or log credentials when account persistence fails", async () => {
  jest.mocked(database.query).mockRejectedValue(new Error("secret database details"));
  await expect(new ChzzkAccountStore(database).upsert({ channelId: context.channelId, channelName: "테스트" })).resolves.toBeUndefined();
  expect(Logger.warn).toHaveBeenCalledWith("Account reference persistence failed", "ChzzkAccountStore");
});
