import { Module } from "@nestjs/common";
import { ActivityController, SessionAuthGuard } from "./activity.controller.js";
import { LabClient } from "./lab.client.js";
import { LabConfig } from "./lab.config.js";
@Module({ controllers: [ActivityController], providers: [LabClient, LabConfig, SessionAuthGuard] })
export class ActivityModule {}
