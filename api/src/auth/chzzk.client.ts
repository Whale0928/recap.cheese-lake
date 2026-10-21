import { BadGatewayException, Injectable } from "@nestjs/common";
import { AuthConfig } from "./auth.config.js";
import type { ChzzkUser } from "./auth.types.js";

const API_BASE = "https://openapi.chzzk.naver.com";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

@Injectable()
export class ChzzkClient {
  constructor(private readonly config: AuthConfig) {}

  authorizeUrl(state: string): string {
    const url = new URL("https://chzzk.naver.com/account-interlock");
    url.search = new URLSearchParams({
      clientId: this.config.clientId,
      redirectUri: this.config.redirectUri,
      state,
    }).toString();
    return url.href;
  }

  async exchangeCode(code: string, state: string): Promise<string> {
    const token = await this.request("/auth/v1/token", {
      method: "POST",
      body: JSON.stringify({
        grantType: "authorization_code",
        clientId: this.config.clientId,
        clientSecret: this.config.clientSecret,
        code,
        state,
      }),
    });
    if (!isObject(token) || typeof token.accessToken !== "string" || !token.accessToken || token.tokenType !== "Bearer") {
      throw new BadGatewayException("Invalid CHZZK token response");
    }
    return token.accessToken;
  }

  async getUser(accessToken: string): Promise<ChzzkUser> {
    const user = await this.request("/open/v1/users/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!isObject(user) || typeof user.channelId !== "string" || !/^[0-9a-f]{32}$/.test(user.channelId) ||
      typeof user.channelName !== "string" || !user.channelName.trim()) {
      throw new BadGatewayException("Invalid CHZZK user response");
    }
    return { channelId: user.channelId, channelName: user.channelName };
  }

  async revoke(accessToken: string): Promise<void> {
    await this.request("/auth/v1/token/revoke", {
      method: "POST",
      body: JSON.stringify({
        clientId: this.config.clientId,
        clientSecret: this.config.clientSecret,
        token: accessToken,
        tokenTypeHint: "access_token",
      }),
    }, true);
  }

  private async request(path: string, options: RequestInit, emptyContent = false): Promise<unknown> {
    try {
      const response = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: { "Content-Type": "application/json", ...options.headers },
        signal: AbortSignal.timeout(10_000),
        redirect: "error",
      });
      if (!response.ok) throw new Error("Upstream HTTP error");
      const body: unknown = await response.json();
      if (!isObject(body) || body.code !== 200 || (!emptyContent && !isObject(body.content))) {
        throw new Error("Upstream API error");
      }
      return body.content;
    } catch {
      // 치지직 응답 본문과 네트워크 오류에는 토큰 등이 포함될 수 있다.
      throw new BadGatewayException("CHZZK authentication request failed");
    }
  }
}
