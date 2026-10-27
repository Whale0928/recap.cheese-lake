import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import satori from "satori";
import { initWasm, Resvg } from "@resvg/resvg-wasm";
import type { ChannelRelationship } from "./activity.types.js";

// 화면의 채널 기록(카드와 상세 수치)을 고정 크기 PNG 한 장으로 그린다. 브라우저 캡처 대신 서버에서 그리는 이유는
// 치지직 프로필 CDN이 CORS 헤더를 주지 않고, Pretendard 동적 서브셋을 캔버스에 담기 어렵기 때문이다.
export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1350;
export type CardTheme = "light" | "dark";
export interface CardInput {
  channelName: string | null;
  /** 서버가 받아 둔 프로필 이미지의 data URI. 없으면 이름 첫 글자를 보여 준다. */
  avatar: string | null;
  today: string;
  relationship: ChannelRelationship["relationship"];
}

// tokens.css 의 oklch 값을 sRGB 로 옮긴 것이다. satori 는 oklch 를 해석하지 못한다.
const palettes = {
  light: { background: "#fbfcfa", card: "#ffffff", foreground: "#131e17", muted: "#5b6c62", accent: "#dcece4", accentForeground: "#0a5238", border: "#dce3dd", primary: "#12805a" },
  dark: { background: "#0d1310", card: "#151c17", foreground: "#e5ece6", muted: "#8ea095", accent: "#152d23", accentForeground: "#7fe9bd", border: "#2a352d", primary: "#48d69e" },
} as const;

type Style = Record<string, string | number>;
type Node = { type: string; props: Record<string, unknown> & { style?: Style; children?: unknown } };
const el = (type: string, style: Style, children?: unknown, extra: Record<string, unknown> = {}): Node => ({ type, props: { style: { display: "flex", ...style }, children, ...extra } });

const require = createRequire(import.meta.url);
let fonts: Promise<{ name: string; data: ArrayBuffer; weight: 400 | 600; style: "normal" }[]> | undefined;
let wasm: Promise<void> | undefined;
let logo: Promise<string> | undefined;
const toArrayBuffer = (buffer: Buffer): ArrayBuffer => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
function loadFonts() {
  // 폰트는 OFL 이라 저장소에 함께 둔다. 실패한 로드는 다음 요청에서 다시 시도한다.
  fonts ??= Promise.all(([["Pretendard-Regular.otf", 400], ["Pretendard-SemiBold.otf", 600]] as const).map(async ([file, weight]) =>
    ({ name: "Pretendard", data: toArrayBuffer(await readFile(new URL(`../../assets/fonts/${file}`, import.meta.url))), weight, style: "normal" as const })))
    .catch(error => { fonts = undefined; throw error; });
  return fonts;
}
function loadLogo() {
  // ui/assets/favicon.svg 의 사본이다. API 이미지에는 UI 자산이 없으므로 assets 에 함께 둔다.
  logo ??= readFile(new URL("../../assets/favicon.svg", import.meta.url))
    .then(data => `data:image/svg+xml;base64,${data.toString("base64")}`)
    .catch(error => { logo = undefined; throw error; });
  return logo;
}
function loadWasm() {
  wasm ??= readFile(require.resolve("@resvg/resvg-wasm/index_bg.wasm")).then(data => initWasm(data))
    .catch(error => { wasm = undefined; throw error; });
  return wasm;
}

export const dateLabel = (date: string | null): string => date ? date.replaceAll("-", ".") : "기록 없음";
export const number = (value: number): string => value.toLocaleString("ko-KR");
export function elapsedDays(firstActiveDate: string | null, today: string): number | null {
  if (!firstActiveDate) return null;
  return Math.max(0, Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${firstActiveDate}T00:00:00Z`)) / 86_400_000));
}
export const shareLabel = (share: number): string => (share * 100).toLocaleString("ko-KR", { maximumFractionDigits: 2 });

function cardTree(input: CardInput, theme: CardTheme, logoSrc: string): Node {
  const color = palettes[theme];
  const r = input.relationship;
  const name = input.channelName || "선택한 채널";
  const elapsed = elapsedDays(r.firstActiveDate, input.today);
  const label = { fontSize: 22, color: color.muted };
  const divider = el("div", { margin: "0 48px", borderTop: `2px solid ${color.border}` });
  const stat = (title: string, value: string, unit: string) => el("div", { flex: 1, flexDirection: "column", gap: 10 }, [
    el("span", label, title),
    el("div", { alignItems: "baseline", gap: 6 }, [el("span", { fontSize: 44, fontWeight: 600, letterSpacing: "-0.045em", lineHeight: 1.2 }, value), el("span", { fontSize: 20, color: color.muted }, unit)]),
  ]);
  const moment = (title: string, value: string, detail: string | null) => el("div", { flex: 1, flexDirection: "column", gap: 8 }, [
    el("span", label, title),
    el("span", { fontSize: 44, fontWeight: 600, letterSpacing: "-0.04em", lineHeight: 1.2 }, value),
    ...(detail ? [el("span", label, detail)] : []),
  ]);
  const avatar = input.avatar
    ? el("img", { width: 196, height: 196, borderRadius: 98, objectFit: "cover" }, undefined, { src: input.avatar })
    : el("div", { width: 196, height: 196, borderRadius: 98, alignItems: "center", justifyContent: "center", background: color.card, color: color.accentForeground, fontSize: 84, fontWeight: 600 }, Array.from(name)[0]);
  // yoga 는 내용 크기만큼 상자를 넓히므로 카드와 안쪽 구역의 크기를 명시해 캔버스 밖으로 밀리지 않게 한다.
  const padding = 48;
  const cardWidth = CARD_WIDTH - padding * 2;
  return el("div", { width: CARD_WIDTH, height: CARD_HEIGHT, padding, background: color.background, fontFamily: "Pretendard", color: color.foreground },
    el("div", { width: cardWidth, height: CARD_HEIGHT - padding * 2, flexDirection: "column", border: `2px solid ${color.border}`, borderRadius: 36, background: color.card, overflow: "hidden" }, [
      el("div", { justifyContent: "space-between", alignItems: "center", padding: "28px 48px", borderBottom: `2px solid ${color.border}`, fontSize: 24, color: color.muted }, [el("span", {}, "나의 채널 기록"), el("span", {}, input.today.slice(0, 4))]),
      el("div", { flexDirection: "column", alignItems: "center", gap: 18, padding: "36px 48px 32px", background: color.accent }, [
        el("div", { width: 216, height: 216, borderRadius: 108, alignItems: "center", justifyContent: "center", background: color.card, border: `2px solid ${color.border}` }, avatar),
        el("div", { maxWidth: cardWidth - 100, fontSize: 54, fontWeight: 600, lineHeight: 1.2, letterSpacing: "-0.045em", textAlign: "center", wordBreak: "break-all", lineClamp: 2 }, name),
        ...(r.share >= .5 ? [el("div", { padding: "8px 22px", borderRadius: 40, fontSize: 22, background: color.card, color: color.accentForeground }, "나의 본진")] : []),
      ]),
      el("div", { flex: 1, flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, padding: "24px 32px 20px" }, [
        el("span", { fontSize: 24, color: color.muted }, "첫 채팅 이후"),
        elapsed === null
          ? el("span", { fontSize: 88, fontWeight: 600, letterSpacing: "-0.05em", lineHeight: 1.15 }, "기록 없음")
          : el("div", { alignItems: "baseline", gap: 12 }, [el("span", { fontSize: 112, fontWeight: 600, letterSpacing: "-0.065em", lineHeight: 1.1 }, number(elapsed)), el("span", { fontSize: 36 }, "일")]),
        el("span", { fontSize: 24, color: color.muted }, `${dateLabel(r.firstActiveDate)} ~ ${dateLabel(input.today)}`),
      ]),
      divider,
      el("div", { gap: 24, padding: "28px 48px" }, [stat("나눈 채팅", number(r.chatCount), "개"), stat("채팅한 날", number(r.activeDays), "일"), stat("최장 연속 활동", number(r.longestConsecutiveActiveDays), "일")]),
      divider,
      el("div", { gap: 24, padding: "28px 48px 32px" }, [
        moment("가장 활발했던 날", r.mostActiveDay ? dateLabel(r.mostActiveDay.date.slice(5)) : "기록 없음", r.mostActiveDay ? `${r.mostActiveDay.date.slice(0, 4)}년 · 채팅 ${number(r.mostActiveDay.chatCount)}개` : null),
        moment("가장 활발했던 달", r.mostActiveMonth ? `${Number(r.mostActiveMonth.month.slice(5))}월` : "기록 없음", r.mostActiveMonth ? `${r.mostActiveMonth.month.slice(0, 4)}년 · 채팅 ${number(r.mostActiveMonth.chatCount)}개` : null),
      ]),
      el("div", { justifyContent: "space-between", alignItems: "center", gap: 24, padding: "26px 48px", borderTop: `2px solid ${color.border}`, fontSize: 22, color: color.muted }, [
        el("div", { alignItems: "center", gap: 12 }, [el("img", { width: 36, height: 36, borderRadius: 9 }, undefined, { src: logoSrc }), el("span", { color: color.foreground, fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em" }, "recap.cheese lake")]),
        el("div", { gap: 18 }, [
          el("div", { gap: 8 }, [el("span", {}, "최근 채팅"), el("span", { color: color.foreground }, dateLabel(r.lastActiveDate))]),
          el("div", { gap: 8 }, [el("span", {}, "전체 채팅"), el("span", { color: color.foreground }, `${number(r.totalUserChatCount)}개`)]),
          el("div", { gap: 8 }, [el("span", {}, "전체 채팅 중"), el("span", { color: color.foreground, fontWeight: 600 }, `${shareLabel(r.share)}%`)]),
        ]),
      ]),
    ]));
}

export async function renderCard(input: CardInput, theme: CardTheme): Promise<Buffer> {
  const [loadedFonts, logoSrc] = await Promise.all([loadFonts(), loadLogo(), loadWasm()]);
  const svg = await satori(cardTree(input, theme, logoSrc) as never, { width: CARD_WIDTH, height: CARD_HEIGHT, fonts: loadedFonts });
  const image = new Resvg(svg, { fitTo: { mode: "original" } });
  const rendered = image.render();
  try { return Buffer.from(rendered.asPng()); }
  finally { rendered.free(); image.free(); }
}
