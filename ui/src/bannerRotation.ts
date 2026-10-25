import type { BannerCampaign, BannerPlacement, PlacementKind } from "./promotion.config";

export type BannerSlot = "bottom" | "left" | "right";

export interface SlotBanner {
  campaignId: string;
  href: string;
  placement: BannerPlacement;
}

const kindOf: Record<BannerSlot, PlacementKind> = { bottom: "bottom", left: "side", right: "side" };

// 기간은 [startsAt, endsAt) 로 본다. 시각을 읽을 수 없는 홍보물은 노출하지 않는다.
export function activeCampaigns(campaigns: readonly BannerCampaign[], now: number): BannerCampaign[] {
  return campaigns.filter(campaign => {
    const start = Date.parse(campaign.startsAt), end = Date.parse(campaign.endsAt);
    return Number.isFinite(start) && Number.isFinite(end) && start <= now && now < end;
  });
}

/**
 * 방문 동안 유지하는 무작위 순서로 정렬한다. 처음 보는 배너에만 새 순번을 뽑아 rank 에 적어 두므로,
 * 목록을 다시 받아도 이미 보던 배너의 앞뒤가 바뀌지 않는다(새로고침하면 rank 가 새로 시작한다).
 */
export function rankedCampaigns(campaigns: readonly BannerCampaign[], rank: Map<string, number>, random: () => number = Math.random): BannerCampaign[] {
  for (const campaign of campaigns) if (!rank.has(campaign.id)) rank.set(campaign.id, random());
  return [...campaigns].sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
}

/** now 뒤에 오는 가장 이른 시작·종료 시각. 이 시각에 노출 대상을 다시 계산한다. 없으면 undefined. */
export function nextBoundary(campaigns: readonly BannerCampaign[], now: number): number | undefined {
  let next: number | undefined;
  for (const campaign of campaigns) {
    for (const at of [Date.parse(campaign.startsAt), Date.parse(campaign.endsAt)]) {
      if (Number.isFinite(at) && at > now && (next === undefined || at < next)) next = at;
    }
  }
  return next;
}

// 순서의 첫 홍보물이 이번 방문의 대표이고 모든 슬롯이 대표를 쓴다. 좌우에는 같은 배너가 선다.
// 대표에 해당 슬롯 이미지가 없을 때만 다음 홍보물로 채운다.
export function assignSlots(ordered: readonly BannerCampaign[]): Record<BannerSlot, SlotBanner | null> {
  const pick = (slot: BannerSlot): SlotBanner | null => {
    const kind = kindOf[slot];
    const campaign = ordered.find(candidate => candidate.placements[kind]);
    const placement = campaign?.placements[kind];
    return campaign && placement ? { campaignId: campaign.id, href: campaign.href, placement } : null;
  };
  return { bottom: pick("bottom"), left: pick("left"), right: pick("right") };
}
