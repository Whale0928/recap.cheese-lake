import { BadRequestException, Controller, Get, Header, HttpCode, Post, Query, Req, Res, UnauthorizedException } from "@nestjs/common";
import { randomBytes, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { AuthConfig } from "./auth.config.js";
import { AuthService } from "./auth.service.js";
import { ChzzkClient } from "./chzzk.client.js";
import "./auth.types.js";

const COOKIE_NAME = "recap_session";

@Controller()
export class AuthController {
  constructor(
    private readonly config: AuthConfig,
    private readonly auth: AuthService,
    private readonly chzzk: ChzzkClient,
  ) {}

  @Get("auth/login")
  @Header("Cache-Control", "no-store")
  async login(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.regenerate(req);
    const state = randomBytes(32).toString("hex");
    req.session.oauthState = { value: state, expiresAt: Date.now() + this.config.stateTtlMs };
    req.session.cookie.maxAge = this.config.stateTtlMs;
    await this.save(req);
    res.redirect(this.chzzk.authorizeUrl(state));
  }

  @Get("auth/callback")
  @Header("Cache-Control", "no-store")
  @Header("Referrer-Policy", "no-referrer")
  async callback(@Req() req: Request, @Res() res: Response, @Query() query: Record<string, unknown>): Promise<void> {
    const expected = req.session.oauthState;
    delete req.session.oauthState;
    const freshState = await this.auth.consumeState(expected);
    // 외부 API 호출 전에 저장하여 재시도에서 같은 state를 사용하지 못하게 한다.
    await this.save(req);
    const state = query.state;
    if (!freshState || !expected || typeof state !== "string" ||
      Buffer.byteLength(state) !== Buffer.byteLength(expected.value) ||
      !timingSafeEqual(Buffer.from(state), Buffer.from(expected.value))) {
      throw new UnauthorizedException("Invalid or expired OAuth state");
    }
    if (query.error !== undefined) throw new BadRequestException("CHZZK login was declined");
    if (typeof query.code !== "string" || !query.code.trim()) {
      throw new BadRequestException("Missing OAuth authorization code");
    }
    const user = await this.auth.authenticate(query.code, state);
    await this.regenerate(req);
    req.session.user = user;
    req.session.expiresAt = Date.now() + this.config.sessionTtlMs;
    req.session.cookie.maxAge = this.config.sessionTtlMs;
    await this.save(req);
    res.redirect(this.config.successUrl);
  }

  @Get("api/session")
  @Header("Cache-Control", "no-store")
  session(@Req() req: Request) {
    const { user, expiresAt } = req.session;
    if (!user || !expiresAt || expiresAt <= Date.now()) return { loggedIn: false };
    return { loggedIn: true, session: { ...user, expiresAt: new Date(expiresAt).toISOString() } };
  }

  @Post("auth/logout")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    // 브라우저가 다른 사이트를 통해 세션을 종료하도록 유도되는 것을 막는다.
    if (req.headers["sec-fetch-site"] === "cross-site" ||
      (req.headers.origin && req.headers.origin !== new URL(this.config.successUrl).origin)) {
      throw new UnauthorizedException("Cross-origin logout is not allowed");
    }
    await new Promise<void>((resolve, reject) => req.session.destroy((error: unknown) => error ? reject(error) : resolve()));
    res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: "lax", secure: this.config.secureCookie, path: "/" });
    return { loggedIn: false };
  }

  private save(req: Request): Promise<void> {
    return new Promise((resolve, reject) => req.session.save((error: unknown) => error ? reject(error) : resolve()));
  }

  private regenerate(req: Request): Promise<void> {
    return new Promise((resolve, reject) => req.session.regenerate((error: unknown) => error ? reject(error) : resolve()));
  }
}
