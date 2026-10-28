import { BadRequestException, Controller, Get, Header, NotFoundException, Param, Query, Req, Res, ServiceUnavailableException, StreamableFile, UseGuards } from "@nestjs/common";
import type { Request, Response } from "express";
import { SessionAuthGuard } from "./activity.controller.js";
import { recapPeriod } from "./activity.query.js";
import { LabClient } from "./lab.client.js";

const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const AVATAR_TYPES = new Set(["image/png", "image/jpeg"]);
export interface AvatarImage { type: string; data: Buffer }

/**
 * Lab이 전달한 프로필 주소에서 이미지를 받아 그대로 돌려준다.
 * 치지직 CDN만 허용하고, 크기·형식·시간을 제한하며, 실패하면 null을 준다.
 */
export async function fetchAvatar(url: string | null, fetchImpl: typeof fetch = fetch): Promise<AvatarImage | null> {
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
    return { type, data };
  } catch { return null; }
}

@Controller("api")
@UseGuards(SessionAuthGuard)
export class AvatarController {
  constructor(private readonly lab: LabClient) {}

  // 치지직 CDN은 CORS 헤더를 주지 않아 브라우저가 프로필 사진을 캔버스에 담지 못한다. 카드를 그리는 쪽은 브라우저이고,
  // 서버는 로그인한 본인이 기록을 조회한 채널의 사진 바이트만 중계한다. 이미지 중계는 활동으로 기록하지 않는다.
  @Get("me/channels/:broadcastId/avatar")
  @Header("Cache-Control", "private, max-age=300")
  @Header("X-Content-Type-Options", "nosniff")
  async avatar(@Req() req: Request, @Param("broadcastId") broadcastId: string, @Query() query: Record<string, unknown>, @Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    if (!/^[0-9a-f]{32}$/.test(broadcastId) || Object.keys(query).length) throw new BadRequestException("Invalid channel avatar request");
    const result = await this.lab.get("relationship", req.session.user!.channelId, recapPeriod({ period: "all" }), [broadcastId]);
    if (result.status !== "ready") {
      if (result.reason === "rate_limited") res.setHeader("Retry-After", String(result.retryAfterSeconds ?? 1));
      throw new ServiceUnavailableException("Channel record unavailable");
    }
    const image = await fetchAvatar(result.data.channel.channelImageUrl);
    if (!image) throw new NotFoundException("Channel avatar unavailable");
    res.setHeader("Content-Type", image.type);
    res.setHeader("Content-Length", String(image.data.byteLength));
    return new StreamableFile(image.data);
  }
}
