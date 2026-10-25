import { localAuthEnabled } from "./local/local.auth.config.js";
import { LocalAuthModule } from "./local/local.auth.module.js";
import { ActivityModule } from "./activity/activity.module.js";
import { Module, type DynamicModule } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module.js";
import { MeController } from "./me/me.controller.js";
import { DatabaseModule } from "./database/database.module.js";
import { BannerModule } from "./banners/banner.controller.js";

@Module({ imports: [DatabaseModule, AuthModule, ActivityModule, BannerModule], controllers: [MeController] })
export class AppModule {
  static register(): DynamicModule { return { module: AppModule, imports: localAuthEnabled() ? [LocalAuthModule] : [] }; }
}
