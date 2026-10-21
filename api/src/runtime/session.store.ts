import { Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";
import { RedisStore } from "connect-redis";
import { createClient } from "redis";
import session, { type Store } from "express-session";
import { AuthConfig } from "../auth/auth.config.js";

@Injectable()
export class SessionStore implements OnModuleDestroy {
  private client: ReturnType<typeof createClient> | undefined;
  store: Store = new session.MemoryStore();
  private readonly revoked = new Map<string, number>();
  private readonly rotations = new Map<string, number>();

  constructor(private readonly config: AuthConfig) {}

  async initialize(): Promise<void> {
    if (!this.config.redisHost) return;
    this.client = createClient({
      socket: { host: this.config.redisHost, port: this.config.redisPort, connectTimeout: 5000 },
      password: this.config.redisPassword,
      disableOfflineQueue: true,
    });
    this.client.on("error", () => Logger.warn("Redis session connection unavailable", "SessionStore"));
    await this.client.connect();
    this.store = new RedisStore({ client: this.client, prefix: "recap:session:", disableTouch: true });
  }

  get ready(): boolean { return !this.config.redisHost || this.client?.isReady === true; }

  async consume(value: string, expiresAt: number): Promise<boolean> {
    if (!this.client) return true;
    const ttl = expiresAt - Date.now();
    if (ttl <= 0) return false;
    // state는 프로세스가 겹치는 롤아웃 중에도 한 번만 소비한다.
    return await this.client.set(`recap:oauth:${value}`, "used", { NX: true, PX: ttl }) === "OK";
  }

  async isRevoked(group: string): Promise<boolean> {
    if (this.client) return await this.client.exists(`recap:revoked:${group}`) !== 0;
    for (const [id, expiry] of this.revoked) if (expiry <= Date.now()) this.revoked.delete(id);
    return this.revoked.has(group);
  }

  async revoke(group: string, expiresAt: number): Promise<void> {
    const ttl = expiresAt - Date.now();
    if (ttl <= 0) return;
    if (this.client) { await this.client.set(`recap:revoked:${group}`, "revoked", { PX: ttl }); return; }
    this.revoked.set(group, expiresAt);
  }

  async claimRotation(sessionId: string): Promise<boolean> {
    const ttl = 60_000;
    if (this.client) return await this.client.set(`recap:rotation:${sessionId}`, "claimed", { NX: true, PX: ttl }) === "OK";
    const now = Date.now();
    for (const [id, expiry] of this.rotations) if (expiry <= now) this.rotations.delete(id);
    if (this.rotations.has(sessionId)) return false;
    this.rotations.set(sessionId, now + ttl);
    return true;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client?.isOpen) this.client.destroy();
  }
}
