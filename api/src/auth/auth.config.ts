import { Injectable } from "@nestjs/common";

@Injectable()
export class AuthConfig {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly redirectUri: string;
  readonly sessionKey: string;
  readonly successUrl: string;
  readonly secureCookie: boolean;
  readonly stateTtlMs = 10 * 60 * 1000;
  readonly sessionTtlMs = 12 * 60 * 60 * 1000;

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
    // 기본 MemoryStore는 로컬 검증용이며 운영에서는 공유 저장소가 필요하다.
    if (process.env.NODE_ENV === "production") {
      throw new Error("Production requires a shared session store; the local MemoryStore is disabled");
    }
  }
}
