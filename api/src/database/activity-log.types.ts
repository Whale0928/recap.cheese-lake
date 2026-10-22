export const ActivityType = {
  PROFILE_VIEW: "profile_view",
  RECAP_VIEW: "recap_view",
} as const;
export type ActivityType = (typeof ActivityType)[keyof typeof ActivityType];

export type ActivityErrorCode = "PROFILE_UNAVAILABLE" | "ACTIVITY_NOT_CONFIGURED" | "ACTIVITY_RATE_LIMITED" | "ACTIVITY_UPSTREAM" | "REQUEST_REJECTED" | "PROCESSING_FAILED";
export type ActivityOutcome = { result: "success" } | {
  result: "partial_success" | "failure";
  failureStage: "profile" | "summary" | "channels" | "trend" | "patterns" | "request";
  errorCode: ActivityErrorCode;
};
