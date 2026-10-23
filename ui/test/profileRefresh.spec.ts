import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { setImmediate } from "node:timers/promises";
import { refreshProfiles } from "../src/profileRefresh.ts";

const body = (key: string, retryAt?: number) => ({ profiles: { status: "ready", data: [{ channelId: "a".repeat(32), channelName: "방송", channelImageUrl: null as string | null, channelUrl: "https://chzzk.naver.com/" + "a".repeat(32) }] }, ...(retryAt === undefined ? {} : { profileRefresh: { key, retryAt } }) });
function setup(t: TestContext, key: string) {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000_000 });
  let stored: string | null = null;
  const old = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: { getItem: () => stored, setItem: (_key: string, value: string) => { stored = value; } } });
  t.after(() => { if (old) Object.defineProperty(globalThis, "sessionStorage", old); else Reflect.deleteProperty(globalThis, "sessionStorage"); });
  return { key, retryAt: Date.now() + 2000 };
}

test("2·4·8초 후 재확인하고 null이어도 세 번을 넘지 않는다", async t => {
  const initial = setup(t, "1".repeat(64));
  const fetch = t.mock.method(globalThis, "fetch", async () => Response.json(body(initial.key, Date.now() + 1)));
  const updates: unknown[] = [];
  const task = refreshProfiles("/profiles", initial, new AbortController().signal, profiles => updates.push(profiles));
  for (const [delay, count] of [[2000, 1], [4000, 2], [8000, 3]]) {
    t.mock.timers.tick(delay - 1); await setImmediate();
    assert.equal(fetch.mock.callCount(), count - 1);
    t.mock.timers.tick(1); await setImmediate();
    assert.equal(fetch.mock.callCount(), count);
  }
  await task;
  assert.equal(updates.length, 3);
  const reloaded = await import("../src/profileRefresh.ts?budget-reload");
  await reloaded.refreshProfiles("/profiles", initial, new AbortController().signal, () => assert.fail("새로고침으로 예산이 초기화되면 안 됨"));
  assert.equal(fetch.mock.callCount(), 3);
});

test("응답에서 재확인 일정이 없어지면 즉시 종료한다", async t => {
  const initial = setup(t, "2".repeat(64));
  const response = body(initial.key);
  response.profiles.data[0]!.channelImageUrl = "https://example.test/profile.png";
  const fetch = t.mock.method(globalThis, "fetch", async () => Response.json(response));
  let image: string | null = null;
  const task = refreshProfiles("/profiles", initial, new AbortController().signal, profiles => { image = profiles[0]!.channelImageUrl; });
  t.mock.timers.tick(2000); await task;
  t.mock.timers.tick(60_000); await setImmediate();
  assert.equal(fetch.mock.callCount(), 1);
  assert.equal(image, "https://example.test/profile.png");
});

test("화면 이동으로 대기를 취소하면 요청하지 않는다", async t => {
  const initial = setup(t, "3".repeat(64));
  const fetch = t.mock.method(globalThis, "fetch", async () => Response.json(body(initial.key)));
  const controller = new AbortController();
  const task = refreshProfiles("/profiles", initial, controller.signal, () => assert.fail("취소된 화면 갱신"));
  controller.abort(); await task;
  t.mock.timers.tick(20_000);
  assert.equal(fetch.mock.callCount(), 0);
});

test("429 Retry-After를 지키고 권한 오류는 재시도하지 않는다", async t => {
  const initial = setup(t, "4".repeat(64));
  const fetch = t.mock.method(globalThis, "fetch", async () => new Response(null, { status: 429, headers: { "Retry-After": "30" } }));
  const task = refreshProfiles("/profiles", initial, new AbortController().signal, () => assert.fail("오류 응답으로 갱신"));
  t.mock.timers.tick(2000); await setImmediate();
  t.mock.timers.tick(29_999); await setImmediate();
  assert.equal(fetch.mock.callCount(), 1);
  fetch.mock.mockImplementation(async () => new Response(null, { status: 401 }));
  t.mock.timers.tick(1); await task;
  await refreshProfiles("/profiles", initial, new AbortController().signal, () => assert.fail());
  assert.equal(fetch.mock.callCount(), 2);
});

test("네트워크 실패도 횟수를 소모하고 예산이 만료되기 전에는 다시 시작하지 않는다", async t => {
  const initial = setup(t, "5".repeat(64));
  const fetch = t.mock.method(globalThis, "fetch", async () => { throw new Error("Network unavailable"); });
  const task = refreshProfiles("/profiles", initial, new AbortController().signal, () => assert.fail());
  for (const delay of [2000, 4000, 8000]) { t.mock.timers.tick(delay); await setImmediate(); }
  await task;
  await refreshProfiles("/profiles", initial, new AbortController().signal, () => assert.fail());
  assert.equal(fetch.mock.callCount(), 3);
});
