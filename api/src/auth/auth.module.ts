import { Module } from "@nestjs/common";
import { AuthConfig } from "./auth.config.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { ChzzkClient } from "./chzzk.client.js";

@Module({
  controllers: [AuthController],
  providers: [AuthConfig, AuthService, ChzzkClient],
  exports: [AuthConfig, ChzzkClient],
})
export class AuthModule {}
