export const ActivityType = {
  LOGIN: "login",
  LOGOUT: "logout",
  PRIVACY_POLICY_VIEW: "privacy_policy_view",
  TERMS_VIEW: "terms_view",
  PRIVACY_REQUEST: "privacy_request",
  PRIVACY_REQUEST_CANCEL: "privacy_request_cancel",
  INQUIRY_CREATE: "inquiry_create",
  INQUIRY_LIST_VIEW: "inquiry_list_view",
  RECAP_VIEW: "recap_view",
  SHARE_GRANT: "share_grant",
  SHARE_REVOKE: "share_revoke",
  SHARED_RECORD_VIEW: "shared_record_view",
  INSIGHT_TICKET_REDEEM: "insight_ticket_redeem",
  INSIGHT_REQUEST: "insight_request",
  INSIGHT_TICKET_REFUND: "insight_ticket_refund",
  INSIGHT_VIEW: "insight_view",
  CHANNEL_RECORD_VIEW: "channel_record_view",
  RECEIVED_SHARES_VIEW: "received_shares_view",
  PRIVACY_SETTINGS_VIEW: "privacy_settings_view",
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
  recap_view: { codeName: "리캡 조회", reason: "리캡 화면에서 활동 요약과 채널별 기록을 조회했다." },
  share_grant: { codeName: "기록 공유 동의", reason: "채널 기록 화면에서 해당 스트리머에게 이 채널에서의 내 기록을 보여 주는 데 동의했다." },
  share_revoke: { codeName: "기록 공유 해제", reason: "스트리머에게 보여 주던 채널 기록 공유를 해제했다." },
  shared_record_view: { codeName: "공유받은 기록 조회", reason: "시청자가 보여 주기로 한 채널 기록 화면을 조회했다." },
  insight_ticket_redeem: { codeName: "분석 티켓 받기", reason: "쿠폰 코드로 AI 분석 티켓을 받았다. 같은 쿠폰은 한 번만 받는다." },
  insight_request: { codeName: "AI 분석 요청", reason: "티켓 한 장을 쓰고 내 채팅의 AI 분석을 랩 대기열에 넣었다. 채팅 원문이 외부 AI 서비스로 전송된다." },
  insight_ticket_refund: { codeName: "분석 티켓 환불", reason: "AI 분석이 실패로 끝나 쓴 티켓을 한 장 돌려줬다." },
  insight_view: { codeName: "AI 분석 카드 열람", reason: "내 리캡에서 AI 분석 카드 창을 열어 전체 결과를 봤다." },
  channel_record_view: { codeName: "채널 기록 조회", reason: "채널 기록 화면에서 특정 방송에서의 내 기록을 조회했다." },
  received_shares_view: { codeName: "공유받은 리캡 목록 조회", reason: "공유받은 리캡 보기 화면에서 나에게 기록을 보여 준 시청자 목록을 조회했다." },
  privacy_settings_view: { codeName: "이용 설정 조회", reason: "이용 설정 화면에서 수집 거부 요청 상태를 조회했다." },
};

export type ActivityErrorCode = "ACTIVITY_NOT_CONFIGURED" | "ACTIVITY_RATE_LIMITED" | "ACTIVITY_UPSTREAM" | "REQUEST_REJECTED" | "PROCESSING_FAILED" | "NO_TICKET" | "COUPON_UNUSABLE";
export type ActivityOutcome = { result: "success" } | {
  result: "partial_success" | "failure";
  failureStage: "summary" | "channels" | "trend" | "patterns" | "request";
  errorCode: ActivityErrorCode;
};
