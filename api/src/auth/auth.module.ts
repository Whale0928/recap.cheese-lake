import { AuthSession } from "./auth.session.js";
import { SessionLifecycle } from "../runtime/session.lifecycle.js";
import { SessionStore } from "../runtime/session.store.js";
import { Module } from "@nestjs/common";
import { AuthConfig } from "./auth.config.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { ChzzkClient } from "./chzzk.client.js";

@Module({
  controllers: [AuthController],
  providers: [AuthSession, AuthConfig, AuthService, ChzzkClient, SessionStore, SessionLifecycle],
  exports: [AuthSession, AuthConfig, ChzzkClient, SessionStore, SessionLifecycle],
})
export class AuthModule {}
