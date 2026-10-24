import { readFile, writeFile } from "node:fs/promises";
import { createServer } from "vite";

const server = await createServer({
  server: { middlewareMode: true, watch: null },
  appType: "custom"
});

try {
  const { renderHome } = await server.ssrLoadModule("/src/prerender.tsx");
  const path = new URL("../dist/index.html", import.meta.url);
  const html = await readFile(path, "utf8");
  const placeholder = '<div id="root"></div>';
  if (!html.includes(placeholder)) throw new Error("홈페이지 렌더링 위치를 찾지 못했습니다.");
  await writeFile(path, html.replace(placeholder, () => `<div id="root">${renderHome()}</div>`));
  console.log("홈페이지 정적 HTML 생성 완료");
} finally {
  await server.close();
}
