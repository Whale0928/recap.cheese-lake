import { downloadElementImage } from "./image.download";

function screenCSS(rules: CSSRuleList): string {
  return Array.from(rules, rule => {
    if (rule instanceof CSSFontFaceRule) return "";
    // 이미지 폭이 본문 폭으로 바뀌어도 현재 화면의 반응형 배치를 유지한다.
    if (rule instanceof CSSMediaRule) return matchMedia(rule.conditionText).matches ? screenCSS(rule.cssRules) : "";
    return rule.cssText;
  }).join("\n");
}

async function imageData(url: string): Promise<string> {
  const response = await fetch(url, { credentials: "same-origin" });
  if (!response.ok) throw new Error("Recap image unavailable");
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Recap image decoding failed"));
    reader.readAsDataURL(blob);
  });
}

export async function downloadRecapPage(page: HTMLElement): Promise<void> {
  await document.fonts.ready;
  const search = page.dataset.imagePeriod;
  if (!search) throw new Error("Recap period is unavailable");
  const css = Array.from(document.styleSheets, sheet => screenCSS(sheet.cssRules)).join("\n");
  const copy = page.cloneNode(true) as HTMLElement;
  const original = [page, ...page.querySelectorAll("*")];
  const cloned = [copy, ...copy.querySelectorAll("*")];
  const images = new Map<string, Promise<string>>(), ready: Promise<void>[] = [];
  const channels = new Map<string, string>();
  for (const link of page.querySelectorAll<HTMLAnchorElement>('a[href^="/recap/channel/"]')) {
    const channel = new URL(link.href).searchParams.get("channel"), image = link.querySelector("img");
    if (channel && image) channels.set(image.src, channel);
  }
  original.forEach((node, index) => {
    const target = cloned[index];
    if (!(target instanceof HTMLElement || target instanceof SVGElement)) return;
    // vw/cqi 글자 크기도 지금 보이는 크기로 보존한다.
    target.style.fontSize = getComputedStyle(node).fontSize;
    if (node instanceof HTMLImageElement && target instanceof HTMLImageElement) {
      const channel = node.closest(".recap-profile-avatar") ? "me" : channels.get(node.src);
      if (!channel) throw new Error("Unknown recap image");
      const url = `/api/recap/avatars/${channel}?${search}`;
      let image = images.get(url);
      if (!image) { image = imageData(url); images.set(url, image); }
      ready.push(image.then(data => { target.src = data; }));
      target.srcset = "";
      target.loading = "eager";
    }
    if (node instanceof HTMLInputElement && target instanceof HTMLInputElement) target.value = node.value;
    if (!(node instanceof HTMLElement) || (!node.scrollLeft && !node.scrollTop)) return;
    // 복사본의 스크롤은 0에서 시작하므로, 내부 내용만 같은 만큼 옮긴다.
    for (const child of target.children) {
      if (child instanceof HTMLElement || child instanceof SVGElement) child.style.translate = `${-node.scrollLeft}px ${-node.scrollTop}px`;
    }
  });
  copy.style.width = `${page.getBoundingClientRect().width}px`;
  copy.style.margin = "0";
  await Promise.all(ready);
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true"); host.inert = true;
  host.style.cssText = "position:fixed;left:-20000px;top:0;pointer-events:none";
  host.append(copy); document.body.append(host);
  try {
    await downloadElementImage(copy, `${css}\n[data-image-download-control] { visibility: hidden !important; }`, "내 리캡.png", {
      backgroundColor: getComputedStyle(document.body).backgroundColor,
      // 분석 미리 보기는 권유 문구라 저장 이미지에서는 자리째 뺀다.
      filter: node => node.tagName !== "DIALOG" && !node.hasAttribute?.("data-image-download-exclude"),
    });
  } finally { host.remove(); }
}
