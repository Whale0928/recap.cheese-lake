import { SessionStore } from "../runtime/session.store.js";
import { Module } from "@nestjs/common";
import { AuthConfig } from "./auth.config.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { ChzzkClient } from "./chzzk.client.js";

@Module({
  controllers: [AuthController],
  providers: [AuthConfig, AuthService, ChzzkClient, SessionStore],
  exports: [AuthConfig, ChzzkClient, SessionStore],
})
export class AuthModule {}
