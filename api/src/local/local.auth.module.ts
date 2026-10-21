import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { LocalAuthController } from "./local.auth.controller.js";
@Module({ imports: [AuthModule], controllers: [LocalAuthController] })
export class LocalAuthModule {}
