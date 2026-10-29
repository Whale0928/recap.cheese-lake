// Lab 의 GET /internal/v1/channels/{channelId}/traits 응답 중 리캡이 쓰는 필드다.
// 라벨 키·근거 수치만 오고 이름·문구는 리캡이 정한다. 모르는 키는 그대로 전달하고 화면이 무시한다.
export interface ViewerTrait {
  key: string;
  axis: string | null;
  prevalence: number;
  score: number;
  evidence: Record<string, number>;
}
export interface ViewerMeme { key: string; count: number; native: boolean }
export interface ViewerTraits {
  scope: { channelId: string; asOf: string; timeZone: "Asia/Seoul"; dataScope: "collected"; rulesetVersion: string };
  eligibility: { chatCount: number; evaluable: boolean; styleSampled: boolean; liveMetaAvailable: boolean };
  traits: ViewerTrait[];
  states: ViewerTrait[];
  memes: ViewerMeme[];
  gaps: string[];
}
