import { Injectable } from "@nestjs/common";
import type { ConditionContext, ConditionDecision, EventCondition } from "./event.types.js";

export class InsightTrialCondition implements EventCondition {
  async evaluate(_params: unknown, context: ConditionContext): Promise<ConditionDecision> {
    const recheck = (viewer: ConditionContext["viewer"]) => !viewer.receivedEvent && viewer.balance === 0;
    return !context.hasSummary && recheck(context.viewer) ? { status: "match", recheck } : { status: "skip" };
  }
}

@Injectable()
export class EventConditionFactory {
  // 저장된 운영 설정 키는 유지한다. 첫 로그인·활동 로그와 condition_params는 판정에 쓰지 않는다.
  private readonly conditions: ReadonlyMap<string, EventCondition> = new Map([
    ["newcomer", new InsightTrialCondition()],
  ]);
  get(type: string): EventCondition | undefined { return this.conditions.get(type); }
}
