import { Injectable } from "@nestjs/common";
import { ChzzkClient } from "./chzzk.client.js";
import type { ChzzkUser } from "./auth.types.js";

@Injectable()
export class AuthService {
  private readonly consumedStates = new Map<string, number>();

  constructor(private readonly chzzk: ChzzkClient) {}

  consumeState(state: { value: string; expiresAt: number } | undefined): boolean {
    const now = Date.now();
    for (const [value, expiresAt] of this.consumedStates) {
      if (expiresAt <= now) this.consumedStates.delete(value);
    }
    if (!state || state.expiresAt <= now || this.consumedStates.has(state.value)) return false;
    // 세션 저장소의 비동기 save 이전에 소비하여 동시 콜백도 한 번만 처리한다.
    this.consumedStates.set(state.value, state.expiresAt);
    return true;
  }

  async authenticate(code: string, state: string): Promise<ChzzkUser> {
    const token = await this.chzzk.exchangeCode(code, state);
    try {
      return await this.chzzk.getUser(token);
    } finally {
      // 본인 확인 후 토큰을 보관하지 않으며, 폐기 실패 시 세션도 발급하지 않는다.
      await this.chzzk.revoke(token);
    }
  }
}
