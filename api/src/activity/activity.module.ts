import { ActivityCache } from "./activity.cache.js";
import { ActivityCacheConfig } from "./activity.cache.config.js";
import { Module } from "@nestjs/common";
import { ActivityController, SessionAuthGuard } from "./activity.controller.js";
import { AvatarController } from "./avatar.controller.js";
import { LabClient } from "./lab.client.js";
import { LabConfig } from "./lab.config.js";
@Module({ controllers: [ActivityController, AvatarController], providers: [LabClient, LabConfig, ActivityCache, ActivityCacheConfig, SessionAuthGuard], exports: [LabConfig, ActivityCache, LabClient] })
export class ActivityModule {}
