import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { setImmediate } from "node:timers/promises";
import { REFETCH_EVERY_MS, createBannerStore } from "../src/bannerStore.ts";
import type { BannerCampaign } from "../src/promotion.config.ts";

const START = Date.parse("2026-11-01T00:00:00+09:00");
const image = { light: { src: "/l.webp", width: 1, height: 1 }, dark: { src: "/d.webp", width: 1, height: 1 } };
const banner = (id: string, endsAt = "2026-11-02T00:00:00+09:00"): BannerCampaign => ({
  id, href: `https://example.com/${id}`, startsAt: "2026-10-01T00:00:00+09:00", endsAt,
  placements: { side: { alt: id, desktop: image }, bottom: { alt: id, desktop: image, mobile: image } },
});

function setup(t: TestContext, responses: (BannerCampaign[] | null)[]) {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"], now: START });
  const handlers = new Set<() => void>();
  const doc = {
    visibilityState: "visible" as DocumentVisibilityState,
    addEventListener: (_: string, h: () => void) => { handlers.add(h); },
    removeEventListener: (_: string, h: () => void) => { handlers.delete(h); },
  };
  let calls = 0;
  const store = createBannerStore({
    fetchList: async () => { const r = responses[Math.min(calls, responses.length - 1)]; calls++; return r; },
    now: () => Date.now(), random: () => 0.5, doc: doc as unknown as Document,
  });
  const shown = () => store.getSnapshot()?.bottom?.campaignId ?? null;
  return { store, doc, handlers, shown, calls: () => calls };
}
const settle = async () => { for (let i = 0; i < 3; i++) await setImmediate(); };

test("화면을 켜 둔 동안 주기적으로 다시 받아 관리자가 끈 배너를 내린다", async t => {
  const s = setup(t, [[banner("a")], []]);
  s.store.subscribe(() => {}); await settle();
  assert.equal(s.shown(), "a");
  t.mock.timers.tick(REFETCH_EVERY_MS); await settle();
  assert.equal(s.calls(), 2);
  assert.equal(s.shown(), null);
});

test("처음 받기가 실패해도 다음 주기에 다시 받아 배너를 보인다", async t => {
  const s = setup(t, [null, [banner("a")]]);
  s.store.subscribe(() => {}); await settle();
  assert.equal(s.shown(), null);
  t.mock.timers.tick(REFETCH_EVERY_MS); await settle();
  assert.equal(s.shown(), "a");
});

test("다시 받기에 실패하면 보이던 배너를 그대로 둔다", async t => {
  const s = setup(t, [[banner("a")], null]);
  s.store.subscribe(() => {}); await settle();
  t.mock.timers.tick(REFETCH_EVERY_MS); await settle();
  assert.equal(s.calls(), 2);
  assert.equal(s.shown(), "a");
});

test("종료 시각이 지나면 재조회 없이도 배너를 내린다", async t => {
  const s = setup(t, [[banner("a", "2026-11-01T00:01:00+09:00")]]);
  s.store.subscribe(() => {}); await settle();
  assert.equal(s.shown(), "a");
  t.mock.timers.tick(61_000); await settle();
  assert.equal(s.shown(), null);
  assert.equal(s.calls(), 1);
});

test("구독자가 모두 사라지면 타이머와 탭 복귀 처리를 멈추고, 다시 붙으면 이어 간다", async t => {
  const s = setup(t, [[banner("a")], [banner("b")]]);
  const off1 = s.store.subscribe(() => {});
  const off2 = s.store.subscribe(() => {}); await settle();
  assert.equal(s.calls(), 1, "구독자가 둘이어도 한 번만 받는다");
  off1(); off2();
  assert.equal(s.handlers.size, 0);
  t.mock.timers.tick(REFETCH_EVERY_MS * 3); await settle();
  assert.equal(s.calls(), 1, "구독자가 없으면 다시 받지 않는다");
  s.store.subscribe(() => {}); await settle();
  assert.equal(s.calls(), 2, "오래 지나 다시 붙으면 새로 받는다");
  assert.equal(s.handlers.size, 1);
});

test("빠르게 끊었다 다시 붙어도(StrictMode) 요청을 겹쳐 보내지 않는다", async t => {
  const s = setup(t, [[banner("a")]]);
  const off = s.store.subscribe(() => {}); off();
  s.store.subscribe(() => {}); await settle();
  assert.equal(s.calls(), 1);
  assert.equal(s.shown(), "a");
});

test("탭으로 돌아오면 1분이 지났을 때만 다시 받는다", async t => {
  const s = setup(t, [[banner("a")], []]);
  s.store.subscribe(() => {}); await settle();
  const [onVisible] = s.handlers;
  t.mock.timers.tick(30_000); onVisible(); await settle();
  assert.equal(s.calls(), 1);
  t.mock.timers.tick(31_000); onVisible(); await settle();
  assert.equal(s.calls(), 2);
  assert.equal(s.shown(), null);
});
