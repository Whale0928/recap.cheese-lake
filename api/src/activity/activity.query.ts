import { BadRequestException } from "@nestjs/common";
import type { ActivityPeriod, Interval } from "./activity.types.js";
const DAY = 86_400_000;
export function activityPeriod(query: Record<string, unknown>, trend: boolean): ActivityPeriod {
  if (Object.keys(query).some(k => !["from", "to", ...(trend ? ["interval"] : [])].includes(k))) throw new BadRequestException("Unsupported query parameter");
  const today = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
  const date = (value: unknown, fallback: string): number => {
    const s = value === undefined ? fallback : value;
    if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new BadRequestException("Use YYYY-MM-DD dates");
    const n = Date.parse(`${s}T00:00:00Z`);
    if (!Number.isFinite(n) || new Date(n).toISOString().slice(0, 10) !== s) throw new BadRequestException("Invalid calendar date");
    return n - 9 * 3_600_000;
  };
  const toDay = date(query.to, today);
  const from = date(query.from, new Date(Date.parse(`${today}T00:00:00Z`) - 29 * DAY).toISOString().slice(0, 10));
  const to = toDay + DAY;
  if (from < 0 || to / 1000 > 0xffffffff || from >= to || to - from > 366 * DAY) throw new BadRequestException("Period must contain 1 to 366 days");
  const interval = query.interval ?? "day";
  if (typeof interval !== "string" || !["day", "week", "month"].includes(interval)) throw new BadRequestException("Invalid interval");
  return { from: new Date(from).toISOString(), to: new Date(to).toISOString(), interval: interval as Interval };
}

export function recapPeriod(query: Record<string, unknown>): ActivityPeriod {
  if (query.period === undefined && query.month === undefined) return activityPeriod(query, true);
  const today = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
  if (query.period === "all" && Object.keys(query).length === 1) {
    return { from: new Date(0).toISOString(), to: new Date(Date.parse(`${today}T00:00:00Z`) + DAY - 9 * 3_600_000).toISOString(), interval: "day" };
  }
  if (Object.keys(query).length !== 1 || typeof query.month !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(query.month) || query.month > today.slice(0, 7) || query.month < "1970-02") throw new BadRequestException("Use period=all or month=YYYY-MM");
  const start = `${query.month}-01`;
  const next = new Date(`${start}T00:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const last = new Date(next.getTime() - DAY).toISOString().slice(0, 10);
  return activityPeriod({ from: start, to: last > today ? today : last }, false);
}
