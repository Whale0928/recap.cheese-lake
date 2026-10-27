// 채널 기록 카드를 이미지로 내려받을 때 쓰는 순수 도우미. DOM 접근은 호출하는 쪽이 맡는다.
export type CardTheme = "light" | "dark";

export const cardHref = (channelId: string, theme: CardTheme) => `/api/me/channels/${channelId}/card.png?${new URLSearchParams({ theme })}`;

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
