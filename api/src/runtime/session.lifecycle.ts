import { localAuthEnabled } from "../local/local.auth.config.js";
import { Injectable } from "@nestjs/common";
import type { Request, Response } from "express";
import { AuthConfig } from "../auth/auth.config.js";
import { SessionStore } from "./session.store.js";

@Injectable()
export class SessionLifecycle {
  constructor(private readonly config: AuthConfig, private readonly sessions: SessionStore) {}

  async maintain(req: Request, res: Response): Promise<void> {
    const { user, authSource, authenticatedAt, rotatedAt, expiresAt, sessionGroup } = req.session;
    if (!user) return;
    // 교체된 ID가 진행 중이던 요청의 save로 되살아나더라도 다시 인증하지 않는다.
    if (await this.sessions.isRevoked(`session:${req.sessionID}`)) {
      await new Promise<void>((resolve, reject) => req.session.regenerate((error: unknown) => error ? reject(error) : resolve()));
      return;
    }
    const now = Date.now();
    const absoluteExpiry = (authenticatedAt ?? 0) + this.config.sessionAbsoluteTtlMs;
    if (req.session.authSource === "local" && !localAuthEnabled() || !sessionGroup || await this.sessions.isRevoked(sessionGroup) || authenticatedAt === undefined || rotatedAt === undefined || expiresAt === undefined || expiresAt <= now || absoluteExpiry <= now) {
      await new Promise<void>((resolve, reject) => req.session.regenerate((error: unknown) => error ? reject(error) : resolve()));
      res.clearCookie("recap_session", { httpOnly: true, secure: this.config.secureCookie, sameSite: "lax", path: "/" });
      return;
    }
    // 페이지의 공통 세션 확인에서만 쿠키를 갱신하여 정적 자산·병렬 프로필 응답이 이전 쿠키를 덮어쓰지 않게 한다.
    if (req.method !== "GET" || req.path !== "/api/session") return;
    if (now - rotatedAt >= this.config.sessionRotationMs) {
      if (!await this.sessions.claimRotation(req.sessionID)) return;
      await this.sessions.revoke(`session:${req.sessionID}`, absoluteExpiry);
      await new Promise<void>((resolve, reject) => req.session.regenerate((error: unknown) => error ? reject(error) : resolve()));
      req.session.user = user;
      req.session.authSource = authSource;
      req.session.sessionGroup = sessionGroup;
      req.session.authenticatedAt = authenticatedAt;
      req.session.rotatedAt = now;
    }
    req.session.expiresAt = Math.min(now + this.config.sessionTtlMs, absoluteExpiry);
    req.session.cookie.maxAge = req.session.expiresAt - now;
    await new Promise<void>((resolve, reject) => req.session.save((error: unknown) => error ? reject(error) : resolve()));
  }
}
