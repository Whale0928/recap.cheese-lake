import { BadRequestException, Controller, Get, Header, Logger, Param, Query, Req, Res, ServiceUnavailableException, StreamableFile, UseGuards } from "@nestjs/common";
import type { Request, Response } from "express";
import { SessionAuthGuard } from "./activity.controller.js";
import { recapPeriod } from "./activity.query.js";
import { LabClient } from "./lab.client.js";
import { renderCard, type CardTheme } from "./card.renderer.js";

const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const AVATAR_TYPES = new Set(["image/png", "image/jpeg"]);

/**
 * Lab이 전달한 프로필 주소에서 이미지를 받아 data URI로 만든다.
 * 치지직 CDN만 허용하고, 크기·형식·시간을 제한하며, 실패하면 이니셜로 대체하도록 null을 준다.
 */
export async function fetchAvatar(url: string | null, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  if (!url) return null;
  let target: URL;
  try { target = new URL(url); } catch { return null; }
  if (target.protocol !== "https:" || target.username || target.password || !/(^|\.)pstatic\.net$/.test(target.hostname)) return null;
  try {
    const response = await fetchImpl(target, { signal: AbortSignal.timeout(5_000), redirect: "error", headers: { Accept: "image/png, image/jpeg" } });
    const type = (response.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
    const length = Number(response.headers.get("content-length"));
    if (!response.ok || !AVATAR_TYPES.has(type) || length > AVATAR_MAX_BYTES) return null;
    const data = Buffer.from(await response.arrayBuffer());
    if (data.byteLength === 0 || data.byteLength > AVATAR_MAX_BYTES) return null;
    return `data:${type};base64,${data.toString("base64")}`;
  } catch { return null; }
}

export function cardTheme(query: Record<string, unknown>): CardTheme {
  const keys = Object.keys(query);
  if (keys.some(key => key !== "theme")) throw new BadRequestException("Unsupported query parameter");
  if (query.theme === undefined || query.theme === "light") return "light";
  if (query.theme === "dark") return "dark";
  throw new BadRequestException("Invalid theme");
}

@Controller("api")
@UseGuards(SessionAuthGuard)
export class CardController {
  constructor(private readonly lab: LabClient) {}

  // 로그인한 본인의 채널 기록 카드만 그린다. 카드 생성은 화면 조회와 별개의 활동으로 기록하지 않는다.
  @Get("me/channels/:broadcastId/card.png")
  @Header("Cache-Control", "no-store")
  async card(@Req() req: Request, @Param("broadcastId") broadcastId: string, @Query() query: Record<string, unknown>, @Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    if (!/^[0-9a-f]{32}$/.test(broadcastId)) throw new BadRequestException("Invalid channel card request");
    const theme = cardTheme(query);
    const result = await this.lab.get("relationship", req.session.user!.channelId, recapPeriod({ period: "all" }), [broadcastId]);
    if (result.status !== "ready") {
      if (result.reason === "rate_limited") res.setHeader("Retry-After", String(result.retryAfterSeconds ?? 1));
      throw new ServiceUnavailableException("Channel record unavailable");
    }
    const { channel, relationship } = result.data;
    const today = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
    let png: Buffer;
    try {
      const avatar = await fetchAvatar(channel.channelImageUrl);
      png = await renderCard({ channelName: channel.channelName, avatar, today, relationship }, theme);
    } catch (error) {
      Logger.warn(`Channel card render failed: ${error instanceof Error ? error.message : "unknown"}`, "CardController");
      throw new ServiceUnavailableException("Channel card unavailable");
    }
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Content-Disposition", 'attachment; filename="recap-card.png"');
    res.setHeader("X-Content-Type-Options", "nosniff");
    return new StreamableFile(png);
  }
}
