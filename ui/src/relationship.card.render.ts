// 브라우저에서 채널 기록 카드 PNG 를 만든다. 서버는 프로필 사진 바이트만 중계하고 그리기와 인코딩은 이 기기가 맡는다.
import { avatarHref, CARD_FONT, CARD_HEIGHT, CARD_WIDTH, cardText, drawCard, type CardImage, type CardInput, type CardTheme } from "./relationship.card";

function loadImage(src: string): Promise<CardImage | null> {
  return new Promise(resolve => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve({ source: image, width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

async function loadFonts(input: CardInput): Promise<void> {
  if (!("fonts" in document)) return;
  const sample = cardText(input);
  // 동적 서브셋 글꼴은 글자 범위마다 파일이 다르므로, 카드에 들어갈 글자를 기준으로 필요한 파일을 미리 받는다.
  await Promise.all([400, 600].map(weight => document.fonts.load(`${weight} 24px ${CARD_FONT}`, sample)));
}

export async function renderCardImage(channelId: string, hasAvatar: boolean, input: CardInput, theme: CardTheme): Promise<Blob> {
  const [avatar, logo] = await Promise.all([
    hasAvatar ? loadImage(avatarHref(channelId)) : Promise.resolve(null),
    loadImage("/favicon.svg"),
    loadFonts(input).catch(() => undefined),
  ]);
  const canvas = document.createElement("canvas");
  canvas.width = CARD_WIDTH; canvas.height = CARD_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas unavailable");
  drawCard(context, input, theme, { avatar, logo });
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("png encoding failed");
  return blob;
}
