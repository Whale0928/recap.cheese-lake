import type { ChannelProfile, ProfileRefresh, ProfileResponse } from "./activity.types.ts";

const delays = [2_000, 4_000, 8_000];
const cooldown = 15 * 60_000;
const storageKey = "recap.profileRefresh.v1";
interface Budget { attempts: number; nextAt: number; expiresAt: number }
const memory = new Map<string, Budget>();

function budgets(): Map<string, Budget> {
  try {
    const saved: unknown = JSON.parse(sessionStorage.getItem(storageKey) ?? "[]");
    if (Array.isArray(saved)) for (const entry of saved) {
      if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== "string" || !/^[a-f0-9]{64}$/.test(entry[0])) continue;
      const b: unknown = entry[1];
      if (!b || typeof b !== "object" || !("attempts" in b) || !("nextAt" in b) || !("expiresAt" in b)) continue;
      if (typeof b.attempts === "number" && Number.isInteger(b.attempts) && b.attempts >= 0 && b.attempts <= 3 && typeof b.nextAt === "number" && Number.isSafeInteger(b.nextAt) && typeof b.expiresAt === "number" && Number.isSafeInteger(b.expiresAt) && b.expiresAt > Date.now() && b.expiresAt <= Date.now() + cooldown) memory.set(entry[0], { attempts: b.attempts, nextAt: b.nextAt, expiresAt: b.expiresAt });
    }
  } catch {
    // 저장소가 막혀도 현재 페이지의 메모리 예산과 서버의 재검증 한도를 사용한다.
  }
  for (const [key, b] of memory) if (b.expiresAt <= Date.now()) memory.delete(key);
  while (memory.size > 128) memory.delete(memory.keys().next().value!);
  return memory;
}
function save(key: string, value: Budget): void {
  memory.set(key, value);
  while (memory.size > 128) memory.delete(memory.keys().next().value!);
  try { sessionStorage.setItem(storageKey, JSON.stringify([...memory])); }
  catch { /* 저장소 차단 시 메모리 예산을 유지한다. */ }
}
function validRefresh(value: ProfileRefresh | undefined): value is ProfileRefresh {
  return !!value && /^[a-f0-9]{64}$/.test(value.key) && Number.isSafeInteger(value.retryAt) && value.retryAt >= 0;
}
export function waitUntil(at: number, signal: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    if (signal.aborted) { resolve(); return; }
    const done = () => { clearTimeout(timer); signal.removeEventListener("abort", done); resolve(); };
    const timer = setTimeout(done, Math.max(0, at - Date.now()));
    signal.addEventListener("abort", done, { once: true });
  });
}

export async function refreshProfiles(url: string, initial: ProfileRefresh, signal: AbortSignal, update: (profiles: ChannelProfile[]) => void): Promise<void> {
  if (!validRefresh(initial)) return;
  let refresh = initial;
  const budget = budgets().get(initial.key) ?? { attempts: 0, nextAt: initial.retryAt, expiresAt: Date.now() + cooldown };
  save(initial.key, budget);
  while (budget.attempts < delays.length && !signal.aborted) {
    const at = Math.max(budget.nextAt, refresh.retryAt);
    if (at >= budget.expiresAt) return;
    await waitUntil(at, signal);
    if (signal.aborted || Date.now() >= budget.expiresAt) return;
    budget.attempts++;
    budget.nextAt = Date.now() + (delays[budget.attempts] ?? cooldown);
    save(initial.key, budget);
    try {
      const response = await fetch(url, { credentials: "same-origin", headers: { Accept: "application/json" }, signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]) });
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        budget.attempts = delays.length;
        save(initial.key, budget);
        return;
      }
      if (response.status === 429) {
        const header = response.headers.get("Retry-After");
        const retryAt = header && /^\d+$/.test(header) ? Date.now() + Number(header) * 1000 : Date.parse(header ?? "");
        if (Number.isFinite(retryAt)) { budget.nextAt = Math.max(budget.nextAt, retryAt); save(initial.key, budget); }
        continue;
      }
      if (!response.ok) continue;
      const body = await response.json() as ProfileResponse;
      if (signal.aborted) return;
      if (body.profiles.status !== "ready") {
        if (body.profiles.reason !== "rate_limited") return;
        budget.nextAt = Math.max(budget.nextAt, Date.now() + (body.profiles.retryAfterSeconds ?? 1) * 1000);
        save(initial.key, budget);
        continue;
      }
      update(body.profiles.data);
      if (!validRefresh(body.profileRefresh) || body.profileRefresh.key !== initial.key) return;
      refresh = body.profileRefresh;
    } catch {
      // 원래 화면은 유지한다. 네트워크 실패도 횟수를 소모하고 Abort는 다음 반복 전에 종료한다.
    }
  }
}
