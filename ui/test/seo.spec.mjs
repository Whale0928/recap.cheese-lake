import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const readBuilt = path => readFile(new URL(`../dist/${path}`, import.meta.url), "utf8");

test("JavaScript 실행 전에도 홈페이지 제목과 공개 본문을 읽을 수 있다", async () => {
  const html = await readBuilt("index.html");
  assert.match(html, /<title>치지직 리캡 \|/);
  assert.match(html, /<h1>치지직<br\s*\/>\s*<em>채팅 리캡<\/em><\/h1>/);
  assert.match(html, /치지직 공개 채팅을 바탕으로 만든 채팅 리캡/);
  assert.match(html, /시청 기록은 포함하지 않습니다/);
  assert.match(html, /href="\/privacy\/"/);
  assert.match(html, /href="\/terms\/"/);
  assert.match(html, /<script[^>]+type="module"[^>]+src="\/assets\//);
  assert.doesNotMatch(html, /name="robots"[^>]+noindex/);
});

test("대표 URL과 사이트맵은 공개 홈페이지를 가리킨다", async () => {
  const html = await readBuilt("index.html");
  assert.match(html, /rel="canonical" href="https:\/\/recap\.cheese-lake\.com\/"/);
  const sitemap = await readBuilt("sitemap.xml");
  assert.deepEqual([...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(match => match[1]), ["https://recap.cheese-lake.com/"]);
  for (const path of ["nginx.conf", "nginx/recap.conf.template"]) {
    const config = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
    assert.ok(config.includes("Sitemap: https://recap.cheese-lake.com/sitemap.xml"));
  }
});

test("개인 화면에는 정적 개인 기록을 생성하지 않고 noindex를 유지한다", async () => {
  for (const path of ["recap/index.html", "recap/channel/index.html", "me/index.html"]) {
    const html = await readBuilt(path);
    assert.match(html, /name="robots" content="noindex, nofollow"/);
    assert.match(html, /<div id="root"><\/div>/);
    assert.doesNotMatch(html, /rel="canonical"/);
  }
});
