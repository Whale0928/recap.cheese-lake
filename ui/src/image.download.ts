import { getFontEmbedCSS, toBlob } from "html-to-image";

type ImageOptions = Pick<NonNullable<Parameters<typeof toBlob>[1]>, "filter" | "backgroundColor">;

export async function downloadElementImage(element: HTMLElement, css: string, fileName: string, options: ImageOptions = {}): Promise<void> {
  await document.fonts.ready;
  const bounds = element.getBoundingClientRect();
  const width = Math.ceil(bounds.width), height = Math.ceil(Math.max(bounds.height, element.scrollHeight));
  if (!width || !height) throw new Error("Image content is not visible");
  const style = getComputedStyle(element);
  const fonts = await getFontEmbedCSS(element);
  const blob = await toBlob(element, {
    ...options, width, height,
    pixelRatio: Math.min(2, 16384 / Math.max(width, height), Math.sqrt(16_000_000 / (width * height))),
    // 자식 너비를 계산값으로 고정하면 소수점 반올림으로 짧은 라벨도 꺾인다.
    includeStyleProperties: ["box-sizing", ...Array.from(style).filter(name => name.startsWith("--"))],
    fontEmbedCSS: `${fonts}\n${css}`,
    style: { font: style.font, color: style.color, lineHeight: String(parseFloat(style.lineHeight) / parseFloat(style.fontSize)), margin: "0", paddingTop: style.paddingTop },
  });
  if (!blob) throw new Error("PNG encoding failed");
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  // 다운로드가 URL을 읽기 전에 해제하지 않는다.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
