export interface EntryReward { eventId: string; title: string; kind: "insight_ticket"; quantity: number; href: "/recap/#period-heading" }
const pending = new Map<string, Promise<EntryReward | null>>();

/** StrictMode와 병렬 구독에서도 같은 화면 진입 요청과 그 결과를 공유한다. */
export function entryReward(subject: string, request: typeof fetch = fetch): Promise<EntryReward | null> {
  const previous = pending.get(subject);
  if (previous) return previous;
  const work = (async () => {
    try {
      const response = await request("/api/me/events/entry", { method: "POST", credentials: "same-origin", signal: AbortSignal.timeout(25000), headers: { "Content-Type": "application/json", Accept: "application/json" }, body: "{}" });
      if (!response.ok) return null;
      const body = await response.json();
      const r = body?.reward;
      if (body.status !== "granted" || !Number.isSafeInteger(body.tickets) || body.tickets < 0 || !r || typeof r.eventId !== "string" || !r.eventId || typeof r.title !== "string" || !r.title.trim() || r.kind !== "insight_ticket" || !Number.isSafeInteger(r.quantity) || r.quantity < 1 || r.href !== "/recap/#period-heading") return null;
      return { eventId: r.eventId, title: r.title, kind: r.kind, quantity: r.quantity, href: r.href } as EntryReward;
    } catch { return null; }
  })();
  if (pending.size >= 100) pending.delete(pending.keys().next().value!);
  pending.set(subject, work);
  return work;
}
