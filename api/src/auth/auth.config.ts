import { cidrMatcher, corsOrigins } from "../runtime/network.config.js";
import { Injectable } from "@nestjs/common";

@Injectable()
export class AuthConfig {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly redirectUri: string;
  readonly sessionKey: string;
  readonly successUrl: string;
  readonly secureCookie: boolean;
  readonly redisHost: string | undefined;
  readonly redisPort: number;
  readonly redisPassword: string | undefined;
  readonly allowedPeer: (address: string | undefined) => boolean;
  readonly allowedOrigins: string[];
  readonly stateTtlMs = 10 * 60 * 1000;
  readonly sessionTtlMs = 30 * 24 * 60 * 60 * 1000;
  readonly sessionAbsoluteTtlMs = 90 * 24 * 60 * 60 * 1000;
  readonly sessionRotationMs = 7 * 24 * 60 * 60 * 1000;

  constructor() {
    const required = (name: string): string => {
      const value = process.env[name];
      if (!value?.trim()) throw new Error(`Missing environment variable: ${name}`);
      return value;
    };
    this.clientId = required("RECAP_CHZZK_CLIENT_ID");
    this.clientSecret = required("RECAP_CHZZK_CLIENT_SECRET");
    this.sessionKey = required("RECAP_SESSION_KEY");
    if (Buffer.byteLength(this.sessionKey) < 32) {
      throw new Error("RECAP_SESSION_KEY must contain at least 32 bytes");
    }
    this.redirectUri = process.env.RECAP_CHZZK_REDIRECT_URI ?? "http://localhost:8180/auth/callback";
    this.successUrl = process.env.RECAP_LOGIN_SUCCESS_URL ?? new URL("/", this.redirectUri).href;
    for (const value of [this.redirectUri, this.successUrl]) {
      const url = new URL(value);
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.hash) {
        throw new Error("Auth URLs must be HTTP(S) URLs without credentials or fragments");
      }
    }
    this.secureCookie = new URL(this.redirectUri).protocol === "https:";
    this.redisHost = process.env.RECAP_REDIS_HOST;
    this.redisPort = Number(process.env.RECAP_REDIS_PORT ?? 6379);
    this.redisPassword = process.env.RECAP_REDIS_PASSWORD;
    if (!Number.isInteger(this.redisPort) || this.redisPort < 1 || this.redisPort > 65535) throw new Error("Invalid RECAP_REDIS_PORT");
    this.allowedPeer = cidrMatcher(process.env.RECAP_ALLOWED_CIDRS ?? "127.0.0.1/32,::1/128");
    this.allowedOrigins = corsOrigins(process.env.RECAP_CORS_ORIGINS ?? `${new URL(this.successUrl).origin},http://localhost:5273,http://127.0.0.1:5273`);
    if (process.env.NODE_ENV === "production" && (!this.redisHost || !this.redisPassword)) {
      throw new Error("Production requires a shared session store with authentication");
    }
    if (process.env.NODE_ENV === "production" && (!this.secureCookie || new URL(this.successUrl).protocol !== "https:")) {
      throw new Error("Production requires HTTPS auth URLs");
    }
  }
}
