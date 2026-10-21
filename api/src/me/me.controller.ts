import { Controller, Get, Header, Req, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import { ChzzkClient } from "../auth/chzzk.client.js";
import type { MeResponse } from "./me.types.js";

@Controller()
export class MeController {
  constructor(private readonly chzzk: ChzzkClient) {}

  @Get("api/me")
  @Header("Cache-Control", "no-store")
  async me(@Req() req: Request): Promise<MeResponse> {
    const { user, expiresAt } = req.session;
    if (!user || !expiresAt || expiresAt <= Date.now()) throw new UnauthorizedException("Login required");
    let chzzk: MeResponse["chzzk"];
    try { chzzk = { status: "ready", data: await this.chzzk.getChannel(user.channelId) }; }
    catch { chzzk = { status: "unavailable", message: "치지직 프로필 조회 실패" }; }
    return { fetchedAt: new Date().toISOString(), identity: user, chzzk };
  }
}
