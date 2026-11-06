import { test } from "node:test";
import assert from "node:assert/strict";
import { entryReward } from "../src/eventReward.ts";
const valid = { status: "granted", tickets: 1, reward: { eventId: "1", title: "첫 방문 선물", kind: "insight_ticket", quantity: 1, href: "/recap/#period-heading" } };
test("entry requests and the receipt are shared by duplicate subscribers", async () => {
  let calls = 0;
  const transport: typeof fetch = async (url, init) => { calls++; assert.equal(url, "/api/me/events/entry"); assert.equal(init?.method, "POST"); assert.equal(init?.body, "{}"); return Response.json(valid); };
  const a = entryReward("share", transport), b = entryReward("share", transport);
  assert.equal(a, b); assert.deepEqual(await a, valid.reward); assert.equal(calls, 1);
});
test("unavailable/no reward responses do not announce a grant", async () => {
  for (const [i, body] of [{ status: "none" }, { status: "deferred" }, { ...valid, tickets: -1 }, { ...valid, reward: { ...valid.reward, href: "https://outside.test" } }, { ...valid, reward: { ...valid.reward, quantity: 0 } }].entries()) assert.equal(await entryReward(`invalid${i}`, async () => Response.json(body)), null);
  assert.equal(await entryReward("network", async () => { throw new Error("offline"); }), null);
});
