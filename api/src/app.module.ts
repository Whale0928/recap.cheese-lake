import { EventModule } from "./events/event.controller.js";
import { localAuthEnabled } from "./local/local.auth.config.js";
import { LocalAuthModule } from "./local/local.auth.module.js";
import { ActivityModule } from "./activity/activity.module.js";
import { Module, type DynamicModule } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module.js";
import { MeController } from "./me/me.controller.js";
import { DatabaseModule } from "./database/database.module.js";
import { BannerModule } from "./banners/banner.controller.js";
import { PrivacyModule } from "./privacy/privacy.controller.js";
import { ObservationsModule } from "./observations/observations.controller.js";
import { ShareModule } from "./shares/share.controller.js";
import { TraitsModule } from "./traits/traits.controller.js";
import { InsightModule } from "./insight/insight.controller.js";

@Module({ imports: [DatabaseModule, PrivacyModule, AuthModule, ActivityModule, ShareModule, BannerModule, ObservationsModule, TraitsModule, InsightModule, EventModule], controllers: [MeController] })
export class AppModule {
  static register(): DynamicModule { return { module: AppModule, imports: localAuthEnabled() ? [LocalAuthModule] : [] }; }
}
