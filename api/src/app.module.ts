import { localAuthEnabled } from "./local/local.auth.config.js";
import { LocalAuthModule } from "./local/local.auth.module.js";
import { ActivityModule } from "./activity/activity.module.js";
import { Module, type DynamicModule } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module.js";
import { MeController } from "./me/me.controller.js";

@Module({ imports: [AuthModule, ActivityModule], controllers: [MeController] })
export class AppModule {
  static register(): DynamicModule { return { module: AppModule, imports: localAuthEnabled() ? [LocalAuthModule] : [] }; }
}
