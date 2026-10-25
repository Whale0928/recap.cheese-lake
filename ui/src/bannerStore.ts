import { fetchBanners } from "./bannerFeed.ts";
import { activeCampaigns, assignSlots, nextBoundary, rankedCampaigns, type BannerSlot, type SlotBanner } from "./bannerRotation.ts";
import type { BannerCampaign } from "./promotion.config.ts";

export type Slots = Record<BannerSlot, SlotBanner | null>;

// 화면을 켜 둔 동안 이 간격으로 목록을 다시 받는다. 관리자가 끄거나 켠 배너, 첫 요청 실패 뒤의 복구가 여기서 반영된다.
export const REFETCH_EVERY_MS = 5 * 60_000;
// 탭으로 돌아왔을 때 이보다 오래 전에 받으려 했다면 바로 다시 받는다. 서버 응답의 공개 캐시 시간과 같다.
export const REFETCH_AFTER_MS = 60_000;
// 경계 시각이 아주 멀어도 한 시간마다는 다시 계산한다(setTimeout 의 최대 지연을 넘지 않게).
const MAX_WAIT_MS = 60 * 60_000;

interface Deps {
  fetchList: () => Promise<BannerCampaign[] | null>;
  now: () => number;
  random: () => number;
  doc: Pick<Document, "addEventListener" | "removeEventListener" | "visibilityState">;
}

/**
 * 하단과 좌우 사이드가 같은 결과를 나눠 쓰는 배너 상태. 페이지에 하나만 둔다.
 * 무작위 순서는 방문 동안 유지하고, 기간 경계·주기 재조회·탭 복귀 때 노출 대상을 다시 계산한다.
 * 타이머와 재조회는 구독자(화면의 배너 컴포넌트)가 있는 동안만 돈다.
 */
export function createBannerStore(deps: Partial<Deps> = {}) {
  const { fetchList = fetchBanners, now = Date.now, random = Math.random } = deps;
  const doc = () => deps.doc ?? document;
  let list: BannerCampaign[] | null = null;
  let slots: Slots | null = null;
  let triedAt = 0;
  let loading: Promise<void> | undefined;
  let boundaryTimer: ReturnType<typeof setTimeout> | undefined;
  let refetchTimer: ReturnType<typeof setInterval> | undefined;
  const rank = new Map<string, number>();
  const listeners = new Set<() => void>();

  function recompute() {
    clearTimeout(boundaryTimer);
    boundaryTimer = undefined;
    if (!list) return;
    const at = now();
    slots = assignSlots(rankedCampaigns(activeCampaigns(list, at), rank, random));
    const next = nextBoundary(list, at);
    if (next !== undefined && listeners.size) boundaryTimer = setTimeout(recompute, Math.min(next - at + 50, MAX_WAIT_MS));
    listeners.forEach(listener => listener());
  }

  function load(): Promise<void> {
    triedAt = now();
    loading ??= fetchList().then(received => {
      // 받기에 실패하면 이미 보이던 목록을 그대로 두고 기간 계산만 이어 간다. 처음부터 실패하면 배너 없이 그리고
      // 다음 주기 재조회에서 다시 시도한다.
      if (received) list = received;
      else list ??= [];
      recompute();
    }).finally(() => { loading = undefined; });
    return loading;
  }

  function onVisible() {
    if (doc().visibilityState !== "visible") return;
    if (now() - triedAt >= REFETCH_AFTER_MS) void load(); else recompute();
  }

  function subscribe(listener: () => void) {
    listeners.add(listener);
    if (listeners.size === 1) {
      doc().addEventListener("visibilitychange", onVisible);
      refetchTimer = setInterval(() => { void load(); }, REFETCH_EVERY_MS);
      // 처음 붙거나, 모두 떨어졌다가 오래 지나 다시 붙으면 목록을 받는다. 진행 중인 요청은 load 가 함께 쓴다.
      if (!list || now() - triedAt >= REFETCH_AFTER_MS) void load(); else recompute();
    }
    return () => {
      listeners.delete(listener);
      if (listeners.size) return;
      doc().removeEventListener("visibilitychange", onVisible);
      clearInterval(refetchTimer);
      clearTimeout(boundaryTimer);
      refetchTimer = boundaryTimer = undefined;
    };
  }

  return { subscribe, getSnapshot: () => slots, load };
}
