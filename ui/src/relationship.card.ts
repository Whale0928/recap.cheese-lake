// 채널 기록 카드를 브라우저 캔버스에 그리는 순수 도우미. 글꼴·이미지 로드와 canvas 생성은 relationship.card.render.ts 가 맡는다.
import type { RelationshipView } from "./relationship.data";

export type CardTheme = "light" | "dark";
export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1350;
export const CARD_FONT = '"Pretendard Variable"';
export const avatarHref = (channelId: string) => `/api/me/channels/${channelId}/avatar`;

/** 화면에 적용된 테마를 따른다. 직접 고른 테마가 없으면 시스템 설정을 본다. */
export function cardTheme(root: { classList: Pick<DOMTokenList, "contains"> }, prefersDark: boolean): CardTheme {
  if (root.classList.contains("dark")) return "dark";
  if (root.classList.contains("light")) return "light";
  return prefersDark ? "dark" : "light";
}

/** 내려받는 파일 이름. 파일 시스템이 거부하는 문자와 제어 문자는 공백으로 바꾸고 길이를 제한한다. */
export function cardFileName(channelName: string | null, today: string): string {
  const name = (channelName ?? "").replace(/[\\/:*?"<>|\p{Cc}]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 40) || "채널";
  return `${name} 리캡 ${today.replaceAll("-", ".")}.png`;
}

export const dateLabel = (date: string | null): string => date ? date.replaceAll("-", ".") : "기록 없음";
export const number = (value: number): string => value.toLocaleString("ko-KR");
export const shareLabel = (share: number): string => (share * 100).toLocaleString("ko-KR", { maximumFractionDigits: 2 });
export function elapsedDays(firstActiveDate: string | null, today: string): number | null {
  if (!firstActiveDate) return null;
  return Math.max(0, Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${firstActiveDate}T00:00:00Z`)) / 86_400_000));
}

// tokens.css 의 oklch 값을 sRGB 로 옮긴 것이다. 캔버스는 CSS 변수를 읽지 못한다.
const palettes = {
  light: { background: "#fbfcfa", card: "#ffffff", foreground: "#131e17", muted: "#5b6c62", accent: "#dcece4", accentForeground: "#0a5238", border: "#dce3dd" },
  dark: { background: "#0d1310", card: "#151c17", foreground: "#e5ece6", muted: "#8ea095", accent: "#152d23", accentForeground: "#7fe9bd", border: "#2a352d" },
} as const;

export interface CardImage { source: CanvasImageSource; width: number; height: number }
export interface CardInput {
  channelName: string | null;
  today: string;
  relationship: RelationshipView["relationship"];
}
/** 그리기에 쓰는 2D 컨텍스트의 부분집합. 테스트에서 가짜 컨텍스트로 대체한다. */
export interface CardCanvas {
  font: string; fillStyle: string | CanvasGradient | CanvasPattern; strokeStyle: string | CanvasGradient | CanvasPattern; lineWidth: number; textAlign: CanvasTextAlign; textBaseline: CanvasTextBaseline; letterSpacing?: string;
  save(): void; restore(): void; beginPath(): void; closePath(): void; moveTo(x: number, y: number): void; arcTo(x1: number, y1: number, x2: number, y2: number, radius: number): void;
  arc(x: number, y: number, radius: number, start: number, end: number): void; clip(): void; fill(): void; stroke(): void; fillRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void; measureText(text: string): { width: number };
  drawImage(image: CanvasImageSource, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number): void;
}

/** 카드에 들어가는 모든 문자열. 글꼴 서브셋을 미리 받을 때 쓴다. */
export function cardText(input: CardInput): string {
  const r = input.relationship;
  const elapsed = elapsedDays(r.firstActiveDate, input.today);
  return [
    "나의 채널 기록", input.today, input.channelName || "선택한 채널", "나의 본진", "첫 채팅 이후", "기록 없음", elapsed === null ? "" : number(elapsed), "일",
    dateLabel(r.firstActiveDate), dateLabel(input.today), "나눈 채팅", "채팅한 날", "최장 연속 활동", number(r.chatCount), number(r.activeDays), number(r.longestConsecutiveActiveDays), "개",
    "가장 활발했던 날", "가장 활발했던 달", "년 · 채팅", "월", r.mostActiveDay ? `${dateLabel(r.mostActiveDay.date)} ${number(r.mostActiveDay.chatCount)}` : "", r.mostActiveMonth ? `${r.mostActiveMonth.month} ${number(r.mostActiveMonth.chatCount)}` : "",
    "recap.cheese lake", "최근 채팅", dateLabel(r.lastActiveDate), "전체 채팅", "전체 채팅 중", r.totalUserChatCount === undefined ? "" : number(r.totalUserChatCount), r.share === undefined ? "" : `${shareLabel(r.share)}%`,
    "0123456789.,%",
  ].join(" ");
}

// Pretendard 의 ascender 0.931·descender 0.231 기준으로 CSS 줄 상자 안의 baseline 위치를 구한다.
const baseline = (top: number, fontSize: number, lineHeight: number) => top + ((lineHeight - 1.162) / 2 + 0.931) * fontSize;
const font = (size: number, weight: 400 | 600 = 400) => `${weight} ${size}px ${CARD_FONT}`;

/** word-break: break-all 과 같이 글자 단위로 줄을 나누고, 최대 줄 수를 넘기면 마지막 줄 끝을 말줄임한다. */
export function wrapChars(text: string, maxWidth: number, measure: (text: string) => number, maxLines: number): string[] {
  const chars = Array.from(text.trim());
  const lines: string[] = [];
  let line = "";
  for (const char of chars) {
    if (line && measure(line + char) > maxWidth) {
      if (lines.length === maxLines - 1) {
        while (line && measure(line + "…") > maxWidth) line = Array.from(line).slice(0, -1).join("");
        lines.push(line + "…");
        return lines;
      }
      lines.push(line); line = "";
    }
    line += char;
  }
  if (line) lines.push(line);
  return lines;
}

function roundedRect(ctx: CardCanvas, x: number, y: number, w: number, h: number, radius: number): void {
  const r = Math.min(radius, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function text(ctx: CardCanvas, value: string, x: number, y: number, size: number, options: { weight?: 400 | 600; color: string; align?: CanvasTextAlign; letterSpacing?: string } ): number {
  ctx.font = font(size, options.weight);
  ctx.fillStyle = options.color;
  ctx.textAlign = options.align ?? "left";
  ctx.textBaseline = "alphabetic";
  if ("letterSpacing" in ctx) ctx.letterSpacing = options.letterSpacing ?? "0px";
  ctx.fillText(value, x, y);
  return ctx.measureText(value).width;
}

/** 캔버스는 CARD_WIDTH×CARD_HEIGHT 로 준비되어 있어야 한다. 글꼴은 호출 전에 로드되어 있어야 한다. */
export function drawCard(ctx: CardCanvas, input: CardInput, theme: CardTheme, images: { avatar: CardImage | null; logo: CardImage | null }): void {
  const color = palettes[theme];
  const r = input.relationship;
  const name = input.channelName || "선택한 채널";
  const elapsed = elapsedDays(r.firstActiveDate, input.today);
  const padding = 48;
  const left = padding, width = CARD_WIDTH - padding * 2, top = padding, height = CARD_HEIGHT - padding * 2;
  const inner = 48;
  const x1 = left + inner, x2 = left + width - inner;

  ctx.fillStyle = color.background;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  ctx.save();
  roundedRect(ctx, left, top, width, height, 36);
  ctx.clip();
  ctx.fillStyle = color.card;
  ctx.fillRect(left, top, width, height);

  // 머리글
  let y = top + 2;
  const headHeight = 28 * 2 + 24 * 1.2;
  text(ctx, "나의 채널 기록", x1, baseline(y + 28, 24, 1.2), 24, { color: color.muted });
  text(ctx, input.today.slice(0, 4), x2, baseline(y + 28, 24, 1.2), 24, { color: color.muted, align: "right" });
  y += headHeight;
  ctx.fillStyle = color.border; ctx.fillRect(left, y, width, 2); y += 2;

  // 채널 구역
  ctx.font = font(54, 600);
  if ("letterSpacing" in ctx) ctx.letterSpacing = "-0.045em";
  const nameLines = wrapChars(name, width - 100, value => ctx.measureText(value).width, 2);
  const badge = r.share !== undefined && r.share >= .5;
  const nameHeight = nameLines.length * 54 * 1.2;
  const badgeHeight = 22 * 1.2 + 16;
  const sectionHeight = 36 + 216 + 18 + nameHeight + (badge ? 18 + badgeHeight : 0) + 32;
  ctx.fillStyle = color.accent; ctx.fillRect(left, y, width, sectionHeight);
  const cx = CARD_WIDTH / 2;
  const avatarTop = y + 36;
  ctx.fillStyle = color.card; ctx.beginPath(); ctx.arc(cx, avatarTop + 108, 108, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = color.border; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, avatarTop + 108, 107, 0, Math.PI * 2); ctx.stroke();
  if (images.avatar) {
    const { source, width: w, height: h } = images.avatar;
    const side = Math.min(w, h);
    ctx.save(); ctx.beginPath(); ctx.arc(cx, avatarTop + 108, 98, 0, Math.PI * 2); ctx.clip();
    ctx.drawImage(source, (w - side) / 2, (h - side) / 2, side, side, cx - 98, avatarTop + 10, 196, 196);
    ctx.restore();
  } else {
    text(ctx, Array.from(name)[0] ?? "?", cx, baseline(avatarTop + 10 + (196 - 84 * 1.2) / 2, 84, 1.2), 84, { weight: 600, color: color.accentForeground, align: "center" });
  }
  let lineTop = avatarTop + 216 + 18;
  for (const line of nameLines) {
    text(ctx, line, cx, baseline(lineTop, 54, 1.2), 54, { weight: 600, color: color.foreground, align: "center", letterSpacing: "-0.045em" });
    lineTop += 54 * 1.2;
  }
  if (badge) {
    const badgeTop = lineTop + 18;
    ctx.font = font(22); if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
    const badgeWidth = ctx.measureText("나의 본진").width + 44;
    ctx.fillStyle = color.card; roundedRect(ctx, cx - badgeWidth / 2, badgeTop, badgeWidth, badgeHeight, badgeHeight / 2); ctx.fill();
    text(ctx, "나의 본진", cx, baseline(badgeTop + 8, 22, 1.2), 22, { color: color.accentForeground, align: "center" });
  }
  y += sectionHeight;

  // 아래쪽 고정 구역의 높이를 먼저 빼고, 남는 공간 가운데에 첫 채팅 이후 일수를 둔다.
  const statsHeight = 28 + 22 * 1.2 + 10 + 44 * 1.2 + 28;
  const momentsHeight = 28 + 22 * 1.2 + 8 + 44 * 1.2 + 8 + 22 * 1.2 + 32;
  const footerHeight = 26 * 2 + 36;
  const fixed = 2 + statsHeight + 2 + momentsHeight + 2 + footerHeight;
  const elapsedHeight = top + height - 2 - fixed - y;
  const elapsedContent = 24 * 1.2 + 8 + (elapsed === null ? 88 * 1.15 : 112 * 1.1) + 8 + 24 * 1.2;
  let ey = y + (elapsedHeight - elapsedContent) / 2;
  text(ctx, "첫 채팅 이후", cx, baseline(ey, 24, 1.2), 24, { color: color.muted, align: "center" });
  ey += 24 * 1.2 + 8;
  if (elapsed === null) {
    text(ctx, "기록 없음", cx, baseline(ey, 88, 1.15), 88, { weight: 600, color: color.foreground, align: "center", letterSpacing: "-0.05em" });
    ey += 88 * 1.15;
  } else {
    ctx.font = font(112, 600); if ("letterSpacing" in ctx) ctx.letterSpacing = "-0.065em";
    const numberWidth = ctx.measureText(number(elapsed)).width;
    ctx.font = font(36); if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
    const unitWidth = ctx.measureText("일").width;
    const start = cx - (numberWidth + 12 + unitWidth) / 2;
    const base = baseline(ey, 112, 1.1);
    text(ctx, number(elapsed), start, base, 112, { weight: 600, color: color.foreground, letterSpacing: "-0.065em" });
    text(ctx, "일", start + numberWidth + 12, base, 36, { color: color.foreground });
    ey += 112 * 1.1;
  }
  ey += 8;
  text(ctx, `${dateLabel(r.firstActiveDate)} ~ ${dateLabel(input.today)}`, cx, baseline(ey, 24, 1.2), 24, { color: color.muted, align: "center" });
  y += elapsedHeight;

  const divider = () => { ctx.fillStyle = color.border; ctx.fillRect(x1, y, x2 - x1, 2); y += 2; };
  divider();

  // 통계 세 칸
  const stat = (column: number, title: string, value: string, unit: string) => {
    const colWidth = (x2 - x1 - 24 * 2) / 3;
    const x = x1 + column * (colWidth + 24);
    text(ctx, title, x, baseline(y + 28, 22, 1.2), 22, { color: color.muted });
    const valueTop = y + 28 + 22 * 1.2 + 10;
    const base = baseline(valueTop, 44, 1.2);
    const w = text(ctx, value, x, base, 44, { weight: 600, color: color.foreground, letterSpacing: "-0.045em" });
    text(ctx, unit, x + w + 6, base, 20, { color: color.muted });
  };
  stat(0, "나눈 채팅", number(r.chatCount), "개"); stat(1, "채팅한 날", number(r.activeDays), "일"); stat(2, "최장 연속 활동", number(r.longestConsecutiveActiveDays), "일");
  y += statsHeight;
  divider();

  // 기억할 순간 두 칸
  const moment = (column: number, title: string, value: string, detail: string | null) => {
    const colWidth = (x2 - x1 - 24) / 2;
    const x = x1 + column * (colWidth + 24);
    text(ctx, title, x, baseline(y + 28, 22, 1.2), 22, { color: color.muted });
    const valueTop = y + 28 + 22 * 1.2 + 8;
    text(ctx, value, x, baseline(valueTop, 44, 1.2), 44, { weight: 600, color: color.foreground, letterSpacing: "-0.04em" });
    if (detail) text(ctx, detail, x, baseline(valueTop + 44 * 1.2 + 8, 22, 1.2), 22, { color: color.muted });
  };
  moment(0, "가장 활발했던 날", r.mostActiveDay ? dateLabel(r.mostActiveDay.date.slice(5)) : "기록 없음", r.mostActiveDay ? `${r.mostActiveDay.date.slice(0, 4)}년 · 채팅 ${number(r.mostActiveDay.chatCount)}개` : null);
  moment(1, "가장 활발했던 달", r.mostActiveMonth ? `${Number(r.mostActiveMonth.month.slice(5))}월` : "기록 없음", r.mostActiveMonth ? `${r.mostActiveMonth.month.slice(0, 4)}년 · 채팅 ${number(r.mostActiveMonth.chatCount)}개` : null);
  y += momentsHeight;

  // 바닥글
  ctx.fillStyle = color.border; ctx.fillRect(left, y, width, 2); y += 2;
  const footerTop = y + 26;
  if (images.logo) ctx.drawImage(images.logo.source, 0, 0, images.logo.width, images.logo.height, x1, footerTop, 36, 36);
  const base = baseline(footerTop + (36 - 22 * 1.2) / 2, 22, 1.2);
  text(ctx, "recap.cheese lake", x1 + (images.logo ? 48 : 0), base, 22, { weight: 600, color: color.foreground, letterSpacing: "-0.02em" });
  const pairs: [string, string, 400 | 600][] = [["최근 채팅", dateLabel(r.lastActiveDate), 400]];
  if (r.totalUserChatCount !== undefined) pairs.push(["전체 채팅", `${number(r.totalUserChatCount)}개`, 400]);
  if (r.share !== undefined) pairs.push(["전체 채팅 중", `${shareLabel(r.share)}%`, 600]);
  let fx = x2;
  for (const [label, value, weight] of [...pairs].reverse()) {
    fx -= text(ctx, value, fx, base, 22, { weight, color: color.foreground, align: "right" }) + 8;
    fx -= text(ctx, label, fx, base, 22, { color: color.muted, align: "right" }) + 18;
  }
  ctx.restore();
  ctx.strokeStyle = color.border; ctx.lineWidth = 2; roundedRect(ctx, left + 1, top + 1, width - 2, height - 2, 35); ctx.stroke();
}
