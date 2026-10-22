import { Global, Inject, Module, type OnModuleDestroy } from "@nestjs/common";
import { DataSource } from "typeorm";
import { createDatabase, initializeDatabase } from "./database.js";
import { ActivityLogService } from "./activity-log.service.js";
import { ChzzkAccountStore } from "./chzzk-account.store.js";

@Global()
@Module({
  providers: [ActivityLogService, ChzzkAccountStore, {
    provide: DataSource,
    useFactory: async (): Promise<DataSource | null> => {
      const url = process.env.RECAP_DATABASE_URL;
      if (url === undefined) {
        if (process.env.NODE_ENV === "production") throw new Error("RECAP_DATABASE_URL is required");
        return null;
      }
      const source = createDatabase(url);
      await initializeDatabase(source);
      return source;
    },
  }],
  exports: [DataSource, ActivityLogService, ChzzkAccountStore],
})
export class DatabaseModule implements OnModuleDestroy {
  constructor(@Inject(DataSource) private readonly source: DataSource | null) {}
  async onModuleDestroy(): Promise<void> {
    if (this.source?.isInitialized) await this.source.destroy();
  }
}
