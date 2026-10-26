export const ActivityType = {
  LOGIN: "login",
  LOGOUT: "logout",
  PRIVACY_POLICY_VIEW: "privacy_policy_view",
  TERMS_VIEW: "terms_view",
  PRIVACY_REQUEST: "privacy_request",
  PRIVACY_REQUEST_CANCEL: "privacy_request_cancel",
  INQUIRY_CREATE: "inquiry_create",
  INQUIRY_LIST_VIEW: "inquiry_list_view",
  PROFILE_VIEW: "profile_view",
  RECAP_VIEW: "recap_view",
} as const;
export type ActivityType = (typeof ActivityType)[keyof typeof ActivityType];

// 기록마다 이름과 설명을 함께 남겨, 읽는 쪽이 활동 종류를 따로 알지 않아도 되게 한다.
export const ActivityDescriptions: Record<ActivityType, { codeName: string; reason: string }> = {
  login: { codeName: "로그인", reason: "치지직 로그인으로 본인 확인을 마치고 세션을 시작했다." },
  logout: { codeName: "로그아웃", reason: "세션을 종료했다." },
  privacy_policy_view: { codeName: "개인정보 처리방침 조회", reason: "개인정보 처리방침 화면을 열람했다." },
  terms_view: { codeName: "이용약관 조회", reason: "이용약관 화면을 열람했다." },
  privacy_request: { codeName: "수집 거부 요청", reason: "이용 설정에서 수집 거부를 요청했다. 요청 즉시 서비스 이용을 차단한다." },
  privacy_request_cancel: { codeName: "수집 거부 취소 요청", reason: "수집 거부 취소를 요청했다. 운영자가 이용을 재개하기 전까지 차단을 유지한다." },
  inquiry_create: { codeName: "문의 등록", reason: "문의하기에서 문의를 등록했다." },
  inquiry_list_view: { codeName: "문의 목록 조회", reason: "문의하기에서 이전 문의 목록을 조회했다." },
  profile_view: { codeName: "프로필 조회", reason: "프로필 화면에서 치지직 프로필을 조회했다." },
  recap_view: { codeName: "리캡 조회", reason: "리캡 화면에서 활동 요약과 채널별 기록을 조회했다." },
};

export type ActivityErrorCode = "PROFILE_UNAVAILABLE" | "ACTIVITY_NOT_CONFIGURED" | "ACTIVITY_RATE_LIMITED" | "ACTIVITY_UPSTREAM" | "REQUEST_REJECTED" | "PROCESSING_FAILED";
export type ActivityOutcome = { result: "success" } | {
  result: "partial_success" | "failure";
  failureStage: "profile" | "summary" | "channels" | "trend" | "patterns" | "request";
  errorCode: ActivityErrorCode;
};
