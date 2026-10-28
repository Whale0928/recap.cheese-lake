import assert from "node:assert/strict";
import { test } from "node:test";
import { CARD_W, DOT_PX, daysSince, elapsed, fanFit, fanPoses, invertOrder, orbitLayout, orbitPoses, parseReceivedShare, parseShareView, shareInitial, shareName, shuffleOrder, skyPoses, thumb, tierOf, unit, viewerBadge, type ShareItem } from "../src/sharedViews.ts";

// 한국 시간 2026-10-28 15:00
const NOW = Date.parse("2026-10-28T06:00:00.000Z");
const item = (n: number, consentedAt: string): ShareItem => ({ id: n.toString(16).padStart(32, "0"), consentedAt });
const many = (count: number): ShareItem[] => Array.from({ length: count }, (_, i) => item(i + 1, new Date(NOW - i * 1.3 * 86_400_000).toISOString()));

test("저장된 보기 방식이 올바르지 않으면 별자리로 돌아간다", () => {
  assert.equal(parseShareView("orbit"), "orbit");
  assert.equal(parseShareView("list"), "list");
  for (const bad of [null, undefined, "grid", "", 3, {}]) assert.equal(parseShareView(bad), "sky");
});

test("경과 일수는 한국 날짜 기준으로 센다", () => {
  assert.equal(daysSince("2026-10-28T00:10:00.000Z", NOW), 0);
  // UTC 로는 전날이지만 한국에서는 같은 날 아침이다.
  assert.equal(daysSince("2026-10-27T16:00:00.000Z", NOW), 0);
  assert.equal(daysSince("2026-10-27T14:59:00.000Z", NOW), 1);
  assert.equal(daysSince("2026-10-21T01:00:00.000Z", NOW), 7);
  assert.equal(daysSince("2026-11-05T00:00:00.000Z", NOW), 0);
});

test("가까운 경과일일수록 안쪽 단계다", () => {
  assert.deepEqual([0, 7, 8, 30, 31, 90, 91, 400].map(tierOf), [0, 0, 1, 1, 2, 2, 3, 3]);
  assert.deepEqual(elapsed(0), { big: "오늘", unit: "", label: "방금 보여 주기 시작했어요" });
  assert.deepEqual(elapsed(14), { big: "14", unit: "일째", label: "보여 준 지" });
});

test("같은 id 는 항상 같은 값이고 0 이상 1 미만이다", () => {
  const id = "a".repeat(32);
  assert.equal(unit(id), unit(id));
  assert.notEqual(unit(id), unit(id, 1));
  for (let i = 0; i < 200; i++) { const v = unit(item(i, "").id); assert.ok(v >= 0 && v < 1); }
});

test("별자리는 오래된 시청자를 왼쪽에, 최근 시청자를 오른쪽에 둔다", () => {
  const poses = skyPoses([item(1, "2026-10-28T00:00:00.000Z"), item(2, "2026-07-01T00:00:00.000Z"), item(3, "2026-09-01T00:00:00.000Z")], NOW, 1000, 500);
  assert.ok(poses[1].x < poses[2].x && poses[2].x < poses[0].x);
  assert.ok(poses[0].dot > poses[1].dot, "최근 별이 더 크다");
  for (const p of poses) { assert.ok(Math.abs(p.x) <= 500 && Math.abs(p.y) <= 250); assert.equal(p.card, 0); }
});

test("별자리는 시청자가 많아도 서로 겹치지 않게 밀어낸다", () => {
  const list = many(60), poses = skyPoses(list, NOW, 1000, 480);
  let nearest = Infinity;
  for (let i = 0; i < poses.length; i++) for (let j = i + 1; j < poses.length; j++) nearest = Math.min(nearest, Math.hypot(poses[i].x - poses[j].x, poses[i].y - poses[j].y));
  assert.ok(nearest > 6, `가장 가까운 두 별 사이가 ${nearest.toFixed(1)}px 이다`);
  assert.deepEqual(skyPoses(list, NOW, 1000, 480), poses, "같은 입력은 같은 배치다");
});

test("별자리는 시청자가 한 명이어도 가운데에 놓인다", () => {
  const [only] = skyPoses([item(1, "2026-10-28T00:00:00.000Z")], NOW, 800, 400);
  assert.equal(only.x, 0);
});

// 최근 7일 안, 8~30일, 그 이후가 고르게 섞인 시청자 목록.
const spread = (count: number): ShareItem[] => Array.from({ length: count }, (_, i) => item(i + 1, new Date(NOW - Math.floor(Math.pow(i / count, 1.6) * 230) * 86_400_000).toISOString()));
const meanRadius = (layout: ReturnType<typeof orbitLayout>, pick: (i: number) => boolean) => {
  const rs = layout.dots.filter((_, i) => pick(i)).map(d => d.r);
  return rs.reduce((a, b) => a + b, 0) / rs.length;
};

test("원판은 최근 시청자일수록 중심에 가깝게 놓는다", () => {
  const list = spread(150), layout = orbitLayout(list, NOW, 894, 544);
  const days = list.map(i => daysSince(i.consentedAt, NOW));
  const recent = meanRadius(layout, i => days[i] <= 7), old = meanRadius(layout, i => days[i] > 90);
  assert.ok(recent < old - 40, `최근 평균 ${recent.toFixed(0)}px, 오래된 평균 ${old.toFixed(0)}px`);
  for (const d of layout.dots) assert.ok(d.r >= layout.inner - 1e-6 && d.r <= layout.outer + 1e-6);
  assert.ok(layout.guideRadii[0] < layout.guideRadii[1] && layout.guideRadii[1] < layout.guideRadii[2]);
  assert.equal(layout.counts.reduce((a, b) => a + b, 0), 150);
});

test("원판은 시청자마다 정해진 무작위 가중치로 흩어지되 매번 같은 자리다", () => {
  const list = spread(80), a = orbitLayout(list, NOW, 894, 544), b = orbitLayout(list, NOW, 894, 544);
  assert.deepEqual(a, b);
  assert.ok(new Set(a.dots.map(d => d.dot.toFixed(2))).size > 10, "점 크기가 다양하다");
  const first = a.dots.slice(0, 40).map(d => d.angle);
  assert.ok(new Set(first.map(x => x.toFixed(1))).size > 20, "각도가 고르게 퍼져 있다");
});

test("원판은 시청자가 많아도 겹침을 풀어 점이 서로 떨어져 있다", () => {
  const layout = orbitLayout(spread(150), NOW, 894, 544), pts = layout.dots.map(d => ({ x: Math.cos(d.angle) * d.r, y: Math.sin(d.angle) * d.r, rad: d.dot * DOT_PX / 2 }));
  let worst = Infinity;
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) worst = Math.min(worst, Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) - (pts[i].rad + pts[j].rad));
  assert.ok(worst > -4, `가장 심한 겹침이 ${worst.toFixed(1)}px 이다`);
});

test("좁은 판에서는 점이 작아지고 범위를 벗어나지 않는다", () => {
  const wide = orbitLayout(spread(150), NOW, 894, 544), narrow = orbitLayout(spread(150), NOW, 316, 416);
  const mean = (layout: ReturnType<typeof orbitLayout>) => layout.dots.reduce((a, d) => a + d.dot, 0) / layout.dots.length;
  assert.ok(mean(narrow) < mean(wide));
  assert.ok(narrow.dots.every(d => d.dot >= .3 && d.dot <= 1));
  assert.equal(orbitLayout(many(1), NOW, 800, 560).dots.length, 1);
});

test("원판은 시간이 흐르면 각도만 바뀌고 반지름은 그대로이며, 손으로 돌리면 통째로 돈다", () => {
  const layout = orbitLayout(spread(30), NOW, 800, 560);
  const a = orbitPoses(layout, 0, 0), b = orbitPoses(layout, 10, 0), c = orbitPoses(layout, 0, Math.PI / 2);
  assert.notEqual(a[0].x, b[0].x);
  for (let i = 0; i < a.length; i++) assert.ok(Math.abs(Math.hypot(a[i].x, a[i].y) - Math.hypot(b[i].x, b[i].y)) < 1e-6);
  // 90도 돌리면 (x, y) 가 (-y, x) 가 된다.
  for (let i = 0; i < a.length; i++) { assert.ok(Math.abs(c[i].x + a[i].y) < 1e-6 && Math.abs(c[i].y - a[i].x) < 1e-6); }
});

test("카드 섞기는 모든 시청자를 한 번씩만 담은 순서를 만들고 되돌릴 수 있다", () => {
  let seed = 7;
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const order = shuffleOrder(150, random), inverse = invertOrder(order);
  assert.deepEqual([...order].sort((a, b) => a - b), Array.from({ length: 150 }, (_, i) => i));
  order.forEach((pos, i) => assert.equal(inverse[pos], i));
  assert.notDeepEqual(order, Array.from({ length: 150 }, (_, i) => i), "순서가 실제로 바뀐다");
  assert.deepEqual(shuffleOrder(1), [0]);
});

test("섞은 덱에서는 덱 위치가 맨 앞인 시청자가 가운데에 온다", () => {
  const order = [2, 0, 1, 3], poses = fanPoses(4, 0, 1000, 500, order);
  assert.equal(poses[1].x, 0, "덱 위치 0 인 시청자가 가운데");
  assert.ok(poses[1].z > poses[2].z && poses[2].z > poses[0].z, "덱 위치 순으로 겹친다");
});

test("셔플 연출은 카드를 두 더미로 가르고 한 더미로 겹친다", () => {
  const order = Array.from({ length: 10 }, (_, i) => i);
  const split = fanPoses(10, 0, 1000, 500, order, 1), merged = fanPoses(10, 0, 1000, 500, order, 2);
  assert.ok(split.some(p => p.x < -10) && split.some(p => p.x > 10), "좌우로 갈라진다");
  assert.ok(merged.every(p => p.x === 0), "한 더미로 겹친다");
  assert.ok(merged[0].z > merged[1].z, "맨 위 카드가 앞에 있다");
});

test("카드 보기는 고른 카드를 가운데 맨 앞에 두고 멀수록 흐려진다", () => {
  const poses = fanPoses(9, 4, 1000, 500);
  const front = poses[4];
  assert.equal(front.x, 0);
  assert.equal(front.rot, 0);
  assert.equal(front.card, 1);
  assert.ok(poses.every((p, i) => i === 4 || p.z < front.z));
  assert.ok(poses[5].x > 0 && poses[3].x < 0);
  assert.ok(Math.abs(poses[5].x + poses[3].x) < 1e-6, "좌우가 대칭이다");
  assert.equal(poses[0].opacity, 0);
  assert.equal(poses[8].opacity, 0);
  assert.equal(poses[6].opacity, 1);
});

test("카드를 끄는 도중의 소수 위치는 두 카드 사이를 이어서 움직인다", () => {
  const at = (focus: number) => fanPoses(5, focus, 1000, 500)[2].x;
  // 초점이 오른쪽으로 갈수록 카드는 왼쪽으로 밀리고, 한 칸 안에서는 비례해서 움직인다.
  assert.ok(at(2) === 0 && at(2.5) < 0 && at(3) < at(2.5));
  assert.ok(Math.abs(at(2.5) * 2 - at(3)) < 1e-6);
});

test("카드는 좁은 화면에서도 무대 안에 들어오도록 줄어든다", () => {
  assert.equal(fanFit(1000, 600), 1);
  const narrow = fanFit(360, 420);
  assert.ok(narrow < 1);
  assert.ok(CARD_W * narrow <= 360 - 24 + 1e-6);
  assert.ok(DOT_PX > 0);
});

test("이름이 없는 시청자는 안내 문구와 물음표 이니셜로 보여 준다", () => {
  assert.equal(shareName({ ownerChannelName: null }), "이름 없는 시청자");
  assert.equal(shareInitial({ ownerChannelName: null }), "?");
  assert.equal(shareName({ ownerChannelName: "" }), "이름 없는 시청자");
  assert.equal(shareInitial({ ownerChannelName: "🐳고래" }), "🐳");
  assert.equal(shareInitial({ ownerChannelName: "날아다니는 고래" }), "날");
});

test("프로필 사진은 치지직 CDN 주소에만 크기 지정을 붙이고 화면 픽셀의 두 배를 요청한다", () => {
  const url = "https://nng-phinf.pstatic.net/MjAy/abc/image.png";
  assert.equal(thumb(url, 36), `${url}?type=f120_120_na`);
  assert.equal(thumb(url, 72), `${url}?type=f240_240_na`);
  assert.equal(thumb(url, 20), `${url}?type=f60_60_na`);
  assert.equal(thumb(url, 900), `${url}?type=f480_480_na`);
  for (const other of ["https://example.com/a.png", "http://nng-phinf.pstatic.net/a.png", `${url}?type=f60_60_na`, "not a url"]) assert.equal(thumb(other, 36), other);
});

test("아바타 유형은 랭킹 상위가 랭커, 구독 중이 구독자, 그 밖이 기본이다", () => {
  assert.deepEqual(viewerBadge({}), { kind: "default", tier: 0, medal: null, months: 0, rank: null });
  assert.equal(viewerBadge({ subscriptionMonths: 3 }).kind, "subscriber");
  assert.equal(viewerBadge({ rank: 10 }).kind, "ranker");
  assert.equal(viewerBadge({ rank: 11, subscriptionMonths: 1 }).kind, "subscriber", "랭킹 밖은 구독 여부를 따른다");
  assert.equal(viewerBadge({ rank: 2, subscriptionMonths: 30 }).kind, "ranker", "랭커가 구독자보다 우선한다");
  assert.deepEqual([1, 2, 3, 4, 10].map(rank => viewerBadge({ rank }).medal), [1, 2, 3, null, null]);
});

test("구독 개월 수가 길수록 효과 단계가 올라가고 잘못된 값은 효과 없음이다", () => {
  assert.deepEqual([0, 1, 5, 6, 11, 12, 23, 24, 120].map(m => viewerBadge({ subscriptionMonths: m }).tier), [0, 1, 1, 2, 2, 3, 3, 4, 4]);
  for (const bad of [null, undefined, -3, Number.NaN, Infinity]) assert.equal(viewerBadge({ subscriptionMonths: bad as number | null | undefined }).tier, 0, String(bad));
  assert.equal(viewerBadge({ subscriptionMonths: 7.9 }).months, 7);
  assert.equal(viewerBadge({ rank: 0 }).rank, null);
});

test("공유 목록 응답은 모양이 틀린 건을 버리고 https 사진 주소만 받는다", () => {
  const id = "a".repeat(32), base = { ownerChannelId: id, ownerChannelName: "시청자", ownerChannelImageUrl: "https://nng-phinf.pstatic.net/a.png", consentedAt: "2026-10-27T03:00:00.000Z" };
  assert.deepEqual(parseReceivedShare(base), { ...base, subscriptionMonths: undefined, rank: undefined });
  assert.equal(parseReceivedShare({ ...base, ownerChannelImageUrl: "http://x.test/a.png" })?.ownerChannelImageUrl, null);
  assert.equal(parseReceivedShare({ ...base, ownerChannelImageUrl: "javascript:alert(1)" })?.ownerChannelImageUrl, null);
  assert.equal(parseReceivedShare({ ...base, ownerChannelImageUrl: undefined })?.ownerChannelImageUrl, null);
  assert.equal(parseReceivedShare({ ...base, ownerChannelName: "  " })?.ownerChannelName, null);
  assert.deepEqual([parseReceivedShare({ ...base, subscriptionMonths: 14, rank: 3 })].map(s => [s?.subscriptionMonths, s?.rank])[0], [14, 3]);
  for (const bad of [null, 3, "x", { ...base, ownerChannelId: "nope" }, { ...base, consentedAt: "어제" }, { ...base, consentedAt: 5 }]) assert.equal(parseReceivedShare(bad), null);
});
