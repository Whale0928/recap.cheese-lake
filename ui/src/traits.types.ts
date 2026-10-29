import type { ActivityResult } from "./activity.types";
export interface ViewerTrait { key: string; axis: string | null; prevalence: number; score: number; evidence: Record<string, number> }
export interface ViewerMeme { key: string; count: number; native: boolean }
export interface ViewerTraits {
  scope: { channelId: string; asOf: string; timeZone: "Asia/Seoul"; dataScope: "collected"; rulesetVersion: string };
  eligibility: { chatCount: number; evaluable: boolean; styleSampled: boolean; liveMetaAvailable: boolean };
  traits: ViewerTrait[];
  states: ViewerTrait[];
  memes: ViewerMeme[];
  gaps: string[];
}
export interface TraitsResponse { fetchedAt: string; traits: ActivityResult<ViewerTraits> }
