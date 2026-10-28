import type { ReceivedShare } from "./relationship.share";

// 공유받은 리캡 화면의 보기 방식별 배치 계산. DOM 과 무관한 순수 함수로 두어 브라우저 없이 검증한다.
// 좌표는 모두 무대 중심이 원점이다. 서버는 건드리지 않고 목록 응답의 이름·동의 시각만 쓴다.

export type ShareView = "sky" | "fan";
export type StageMode = ShareView;

export const SHARE_VIEWS: readonly { id: ShareView; label: string }[] = [
  { id: "sky", label: "별자리" },
  { id: "fan", label: "카드" },
];
export const DEFAULT_SHARE_VIEW: ShareView = "sky";
export const SHARE_VIEW_KEY = "recap.shared.view";

// 예전에 저장된 값(목록·궤도 보기 등)이 지금 없는 보기면 기본 보기로 돌아간다.
export const parseShareView = (value: unknown): ShareView => SHARE_VIEWS.find(view => view.id === value)?.id ?? DEFAULT_SHARE_VIEW;

export const DOT_PX = 36;
export const CARD_W = 300;
export const CARD_H = 400;

const DAY = 86_400_000;
const kstDay = (ms: number) => Math.floor((ms + 9 * 3_600_000) / DAY);
// 한국 날짜 기준 경과 일수. 동의한 날과 같은 날이면 0이다.
export const daysSince = (iso: string, now: number) => Math.max(0, kstDay(now) - kstDay(Date.parse(iso)));

export type Tier = 0 | 1 | 2 | 3;
export const tierOf = (days: number): Tier => days <= 7 ? 0 : days <= 30 ? 1 : days <= 90 ? 2 : 3;

export interface ShareItem { id: string; consentedAt: string }

// 한 시청자의 현재 자세. dot 은 원형 점, card 는 카드의 섞임 정도(0=점, 1=카드)다.
export interface Pose { x: number; y: number; rot: number; dot: number; card: number; cardScale: number; opacity: number; z: number }

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
// 같은 시청자는 어느 화면에서나 같은 높이·위상에 놓이도록 id 로 고정된 0~1 값을 만든다.
export function unit(id: string, salt = 0): number {
  let hash = (2166136261 ^ salt) >>> 0;
  for (const char of id) hash = Math.imul(hash ^ (char.codePointAt(0) ?? 0), 16777619) >>> 0;
  return (hash % 10_000) / 10_000;
}

const pose = (partial: Partial<Pose>, dot: number): Pose => ({ x: 0, y: 0, rot: 0, dot, card: 0, cardScale: dot * DOT_PX / CARD_W, opacity: 1, z: 0, ...partial });

const SKY_SCALE = [.62, .48, .38, .3] as const;
const SKY_OPACITY = [1, .95, .86, .74] as const;

// 별자리: 가로는 시간(오래된 쪽이 왼쪽), 세로는 id 로 정한 높이다. 겹치는 별은 서로 밀어낸다.
export function skyPoses(items: readonly ShareItem[], now: number, w: number, h: number): Pose[] {
  const padX = 40, padTop = 36, padBottom = 64;
  const times = items.map(item => Date.parse(item.consentedAt));
  const min = Math.min(...times), span = (Math.max(...times) - min) || 1;
  const tiers = items.map(item => tierOf(daysSince(item.consentedAt, now)));
  const pts = items.map((item, i) => ({
    x: items.length === 1 ? w / 2 : padX + ((times[i] - min) / span) * Math.max(0, w - padX * 2),
    y: padTop + unit(item.id) * Math.max(0, h - padTop - padBottom),
    r: DOT_PX * SKY_SCALE[tiers[i]] / 2 + 4,
  }));
  for (let pass = 0; pass < 10; pass++) {
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const a = pts[i], b = pts[j];
        let dx = b.x - a.x, dy = b.y - a.y;
        let dist = Math.hypot(dx, dy);
        const gap = a.r + b.r;
        if (dist >= gap) continue;
        if (dist < .01) { dx = unit(items[i].id, j) - .5; dy = unit(items[j].id, i) - .5; dist = Math.hypot(dx, dy) || 1; }
        const push = (gap - dist) / 2 / dist;
        a.x -= dx * push; a.y -= dy * push; b.x += dx * push; b.y += dy * push;
      }
    }
    for (const p of pts) { p.x = clamp(p.x, padX / 2, w - padX / 2); p.y = clamp(p.y, padTop, h - padBottom); }
  }
  return pts.map((p, i) => pose({ x: p.x - w / 2, y: p.y - h / 2, opacity: SKY_OPACITY[tiers[i]], z: 50 - tiers[i] * 10 }, SKY_SCALE[tiers[i]]));
}

// 카드 한 장이 무대에 들어오도록 줄이는 비율.
export const fanFit = (w: number, h: number) => Math.max(.3, Math.min(1, (h - 56) / CARD_H, (w - 24) / CARD_W));
// 손가락이 이만큼 움직이면 카드 한 장이 넘어간다.
export const fanStep = (w: number, h: number) => CARD_W * fanFit(w, h) * .45;

// 시청자 목록 순서와 카드 덱 순서는 별개다. order[i] 는 i 번째 시청자의 덱 위치이고, 셔플은 이 순서만 바꾼다.
export function shuffleOrder(count: number, random: () => number = Math.random): number[] {
  const order = Array.from({ length: count }, (_, i) => i);
  for (let i = count - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  return order;
}
export const invertOrder = (order: readonly number[]) => { const inverse: number[] = []; order.forEach((pos, i) => { inverse[pos] = i; }); return inverse; };

// 카드 부채: focus 가 가운데 카드의 덱 위치(소수 가능)다. 끌 때는 소수 위치가 그대로 들어온다.
// stack 이 1이면 카드가 양쪽 두 더미로 갈라지고, 2이면 한 더미로 겹친다(셔플 연출).
export function fanPoses(count: number, focus: number, w: number, h: number, order?: readonly number[], stack = 0): Pose[] {
  const fit = fanFit(w, h);
  const near = Math.min(CARD_W * fit * .8, w * .34), far = Math.min(CARD_W * fit * .32, w * .1);
  return Array.from({ length: count }, (_, i) => {
    const deck = order?.[i] ?? i, d = deck - focus;
    if (stack > 0) {
      const side = deck % 2 ? 1 : -1, tilt = ((deck * 37) % 11 - 5) * 1.6;
      return pose({ x: stack === 1 ? side * fit * CARD_W * .3 : 0, y: -4 + (deck % 3) * 1.5, rot: tilt + (stack === 1 ? side * 5 : 0), card: 1, cardScale: fit, opacity: d > -2 && d < 8 ? 1 : 0, z: 300 - deck }, fit * CARD_W / DOT_PX);
    }
    const a = Math.min(Math.abs(d), 3.6), side = Math.sign(d);
    const x = side * (a < 1 ? a * near : near + (a - 1) * far);
    const cardScale = fit * (1 - a * .06);
    return pose({
      x, y: a * a * 7 - 6, rot: clamp(d, -3.6, 3.6) * 6, card: 1, cardScale,
      opacity: Math.abs(d) <= 2.2 ? 1 : clamp(1 - (Math.abs(d) - 2.2) / 1.2, 0, 1),
      z: 200 - Math.round(Math.abs(d) * 20) - (d > 0 ? 1 : 0),
    }, cardScale * CARD_W / DOT_PX);
  });
}

// 카드와 상세 영역에 쓰는 경과 문구.
export const elapsed = (days: number) => days === 0
  ? { big: "오늘", unit: "", label: "방금 보여 주기 시작했어요" }
  : { big: String(days), unit: "일째", label: "보여 준 지" };

// API 응답 한 건을 화면이 믿고 쓸 수 있는 모양으로 바로잡는다. 모양이 틀린 건은 버리고, 사진은 https 주소만 받는다.
export function parseReceivedShare(raw: unknown): ReceivedShare | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.ownerChannelId !== "string" || !/^[0-9a-f]{32}$/.test(r.ownerChannelId) || typeof r.consentedAt !== "string" || !Number.isFinite(Date.parse(r.consentedAt))) return null;
  const count = (value: unknown, min: number) => typeof value === "number" && Number.isFinite(value) && value >= min ? Math.floor(value) : undefined;
  return {
    ownerChannelId: r.ownerChannelId,
    ownerChannelName: typeof r.ownerChannelName === "string" && r.ownerChannelName.trim() ? r.ownerChannelName : null,
    ownerChannelImageUrl: typeof r.ownerChannelImageUrl === "string" && r.ownerChannelImageUrl.length <= 2048 && r.ownerChannelImageUrl.startsWith("https://") ? r.ownerChannelImageUrl : null,
    consentedAt: r.consentedAt,
    subscriptionMonths: count(r.subscriptionMonths, 0), rank: count(r.rank, 1),
  };
}

// 이름이 없는 시청자도 같은 문구와 이니셜(?)로 보여 준다.
type NamedShare = { ownerChannelName: string | null };
export const shareName = (share: NamedShare) => share.ownerChannelName || "이름 없는 시청자";
export const shareInitial = (share: NamedShare) => share.ownerChannelName ? Array.from(share.ownerChannelName)[0] : "?";

export const MODE_HINT: Record<StageMode, string> = {
  sky: "별을 누르면 기록이 열려요. 방향키로 시청자를 옮길 수 있어요.",
  fan: "카드를 끌어서 넘기거나 셔플로 섞어 보세요. 카드를 누르면 기록이 열려요.",
};


// 프로필 사진은 크기를 줄인 이미지를 받는다. 치지직 CDN(pstatic.net)만 크기 지정(type=f{N}_{N}_na)을 알고 있어 그 밖의 주소는 그대로 둔다.
// 화면 픽셀 수의 두 배를 요청해 고해상도 화면에서도 또렷하게 한다.
export function thumb(url: string, px: number): string {
  let target: URL;
  try { target = new URL(url); } catch { return url; }
  if (target.protocol !== "https:" || !/(^|\.)pstatic\.net$/.test(target.hostname) || target.search) return url;
  const side = [60, 120, 240, 480].find(size => size >= px * 2) ?? 480;
  return `${url}?type=f${side}_${side}_na`;
}

export type ViewerKind = "ranker" | "subscriber" | "default";
export interface ViewerBadge { kind: ViewerKind; tier: 0 | 1 | 2 | 3 | 4; medal: 1 | 2 | 3 | null; months: number; rank: number | null }
export const RANKER_MAX = 10;
// 사진이 없을 때의 기본 모양과 효과 단계를 정한다. 랭킹 상위는 랭커, 구독 중이면 구독자, 그 밖에는 기본이다.
// 효과 단계는 구독 개월 수가 길수록 높다(1개월~, 6개월~, 12개월~, 24개월~). 기준은 이 한 곳에서만 바꾼다.
export function viewerBadge(share: { subscriptionMonths?: number | null; rank?: number | null }): ViewerBadge {
  const months = Number.isFinite(share.subscriptionMonths) && (share.subscriptionMonths as number) > 0 ? Math.floor(share.subscriptionMonths as number) : 0;
  const rank = Number.isFinite(share.rank) && (share.rank as number) >= 1 ? Math.floor(share.rank as number) : null;
  const kind: ViewerKind = rank !== null && rank <= RANKER_MAX ? "ranker" : months > 0 ? "subscriber" : "default";
  const tier = months >= 24 ? 4 : months >= 12 ? 3 : months >= 6 ? 2 : months >= 1 ? 1 : 0;
  return { kind, tier, medal: rank !== null && rank <= 3 ? rank as 1 | 2 | 3 : null, months, rank };
}
