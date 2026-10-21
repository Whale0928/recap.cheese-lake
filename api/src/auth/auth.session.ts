import { Injectable } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import type { Request } from "express";
import { AuthConfig } from "./auth.config.js";
import type { ChzzkUser } from "./auth.types.js";
@Injectable()
export class AuthSession {
  constructor(private readonly config: AuthConfig) {}
  async login(req: Request, user: ChzzkUser, source: "chzzk" | "local" = "chzzk"): Promise<void> {
    await new Promise<void>((resolve, reject) => req.session.regenerate((error: unknown) => error ? reject(error) : resolve()));
    const now = Date.now();
    req.session.user = user;
    req.session.authSource = source;
    req.session.sessionGroup = randomBytes(32).toString("hex");
    req.session.authenticatedAt = now;
    req.session.rotatedAt = now;
    req.session.expiresAt = now + this.config.sessionTtlMs;
    req.session.cookie.maxAge = this.config.sessionTtlMs;
    await new Promise<void>((resolve, reject) => req.session.save((error: unknown) => error ? reject(error) : resolve()));
  }
}
