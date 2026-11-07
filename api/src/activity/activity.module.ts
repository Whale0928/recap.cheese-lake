import { ActivityCache } from "./activity.cache.js";
import { ActivityCacheConfig } from "./activity.cache.config.js";
import { Module } from "@nestjs/common";
import { ActivityController, SessionAuthGuard } from "./activity.controller.js";
import { AvatarController } from "./avatar.controller.js";
import { AuthModule } from "../auth/auth.module.js";
import { LabClient } from "./lab.client.js";
import { LabConfig } from "./lab.config.js";
@Module({ imports: [AuthModule], controllers: [ActivityController, AvatarController], providers: [LabClient, LabConfig, ActivityCache, ActivityCacheConfig, SessionAuthGuard], exports: [LabConfig, ActivityCache, LabClient] })
export class ActivityModule {}
