import { Injectable } from "@nestjs/common";

@Injectable()
export class ActivityCacheConfig {
  readonly host = process.env.RECAP_CACHE_REDIS_HOST;
  readonly port = Number(process.env.RECAP_CACHE_REDIS_PORT ?? 6379);
  readonly password = process.env.RECAP_CACHE_REDIS_PASSWORD;

  constructor() {
    if (!Number.isInteger(this.port) || this.port < 1 || this.port > 65535) throw new Error("Invalid RECAP_CACHE_REDIS_PORT");
    if (this.host !== undefined && !this.host.trim()) throw new Error("Invalid RECAP_CACHE_REDIS_HOST");
    if (this.host && process.env.NODE_ENV === "production" && !this.password) throw new Error("RECAP_CACHE_REDIS_PASSWORD is required");
  }
}
