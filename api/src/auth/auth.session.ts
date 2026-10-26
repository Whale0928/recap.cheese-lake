import { Injectable } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import type { Request } from "express";
import { AuthConfig } from "./auth.config.js";
import type { ChzzkUser } from "./auth.types.js";
import { ChzzkAccountStore } from "../database/chzzk-account.store.js";
import { ActivityLogService } from "../database/activity-log.service.js";
import { ActivityType } from "../database/activity-log.types.js";
@Injectable()
export class AuthSession {
  constructor(private readonly config: AuthConfig, private readonly accounts: ChzzkAccountStore, private readonly logs: ActivityLogService) {}
  async login(req: Request, user: ChzzkUser, source: "chzzk" | "local" = "chzzk"): Promise<void> {
    const work = async () => {
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
      await this.accounts.upsert(user);
    };
    // 로그인 시각은 처리방침 제1조⑦의 접속·활동 기록 항목이며, 개발용 로컬 로그인은 이용 기록에 섞지 않는다.
    if (source === "local") return work();
    await this.logs.track({ channelId: user.channelId, activityType: ActivityType.LOGIN }, work);
  }
}
