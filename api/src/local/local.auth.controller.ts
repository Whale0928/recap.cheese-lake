import { BadGatewayException, Body, Controller, Get, NotFoundException, Post, Req, Res, UnauthorizedException } from "@nestjs/common";
import type { Request, Response } from "express";
import { AuthConfig } from "../auth/auth.config.js";
import { AuthSession } from "../auth/auth.session.js";
import { ChzzkClient } from "../auth/chzzk.client.js";
import { cidrMatcher } from "../runtime/network.config.js";
import { localAuthEnabled } from "./local.auth.config.js";
import { localAuthPage } from "./local.auth.page.js";
const loopback = cidrMatcher("127.0.0.1/32,::1/128");
const localHost = (hostname: string) => ["localhost", "127.0.0.1", "::1", "[::1]"].includes(hostname);
@Controller("_dev")
export class LocalAuthController {
  constructor(private readonly config: AuthConfig, private readonly sessions: AuthSession, private readonly chzzk: ChzzkClient) {}
  private check(req: Request, res: Response): void {
    res.set({ "Cache-Control": "no-store", "Referrer-Policy": "same-origin", "X-Robots-Tag": "noindex, nofollow", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'" });
    if (!localAuthEnabled() || !loopback(req.socket.remoteAddress) || !this.isLocalHost(req.headers.host) || !localHost(new URL(this.config.successUrl).hostname) || this.config.secureCookie) throw new NotFoundException();
  }
  private isLocalHost(host: string | undefined): boolean {
    try { return host !== undefined && localHost(new URL(`http://${host}`).hostname); }
    catch { return false; }
  }
  @Get("login")
  page(@Req() req: Request, @Res() res: Response): void {
    this.check(req, res);
    res.type("html").send(localAuthPage());
  }
  @Post("login")
  async login(@Req() req: Request, @Res() res: Response, @Body() body: unknown): Promise<void> {
    this.check(req, res);
    if (req.headers["sec-fetch-site"] === "cross-site" || !req.headers.origin || !this.config.allowedOrigins.includes(req.headers.origin) || !localHost(new URL(req.headers.origin).hostname)) throw new UnauthorizedException("Local same-origin request required");
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 1 || !("channelId" in body) || typeof body.channelId !== "string" || !/^[0-9a-f]{32}$/.test(body.channelId)) {
      res.status(400).type("html").send(localAuthPage("채널 ID는 소문자 영문·숫자 32자리로 입력해 주세요.")); return;
    }
    let channel;
    try { channel = await this.chzzk.getChannel(body.channelId); }
    catch (error) {
      if (!(error instanceof BadGatewayException)) throw error;
      res.status(502).type("html").send(localAuthPage("채널 정보를 확인하지 못했습니다.")); return;
    }
    await this.sessions.login(req, { channelId: channel.channelId, channelName: channel.channelName }, "local");
    res.redirect(303, "/me/");
  }
}
