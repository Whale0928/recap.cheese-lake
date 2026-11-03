# AGENTS.md

리캡(recap.cheese-lake)에서 에이전트가 따르는 프로젝트 규칙이다. 전역 지침(공통 워크플로우)을
전제로 하고, 여기에는 이 프로젝트에서만 성립하는 것과 실측으로 배운 것만 적는다. 코드에서 유도할
수 있는 내용(구조·의존성·경로 목록)은 넣지 않는다 — 그건 `README.md`와 `api/README.md`가 말한다.

## 문서 지도

- `README.md` — 구조, 실행 명령, Git 계정·서명 검사
- `api/README.md` — API 경로, 활동 로그, 배포 네트워크. 경로를 더하면 여기도 고친다
- `api/adr/` — 설계 결정의 근거. 아키텍처를 바꾸기 전에 관련 ADR 을 먼저 읽는다
- `module.secrets/project/cheese-lake/recap/db/migrations/` — recap 스키마 마이그레이션(TypeORM).
  표·열마다 COMMENT 를 달고, CHECK 대신 애플리케이션에서 검증한다. 계정 삭제 시 같이 지울 것만
  `chzzk_accounts` 에 FK CASCADE 를 건다

## 활동 로그는 한 관문으로 남긴다

사용자 활동 기록은 `ActivityLogService.track()` 하나로만 남긴다 (`api/src/database/activity-log.service.ts`).
컨트롤러가 직접 `activity_logs` 에 INSERT 하지 않는다. 시작·종료 시각, 처리 시간, 결과, 실패 단계와
오류 코드, 활동 종류의 이름·설명을 `track()` 이 한 번에 적고, development 에서 저장을 끄는 것도
여기서만 판정한다. 그래서 기록 규칙을 바꿀 일이 생기면 이 한 곳만 고친다.

**사람이 한 활동이면 기록 대상이다.** 경로를 새로 만들거나 고칠 때 다음 기준으로 가른다.

- 기록한다: 화면 하나를 여는 조회(리캡·채널 기록·공유받은 목록·이용 설정), 상태를 바꾸는 동작(동의·해제·
  요청·취소·문의·티켓 받기·분석 요청), 그 동작의 결과로 시스템이 사람 대신 한 일(티켓 환불)
- 기록하지 않는다: 한 화면이 뜰 때 딸려 오는 보조 호출(요약·추이·프로필·아바타·습관 카드), 버튼 상태를
  정하는 존재 여부 조회, 로그인 없이 보는 공개 자료(배너·일간 관측), 몇 초마다 되풀이하는 상태 폴링
- 폴링으로 보는 결과를 사람이 "열어 본" 활동은 폴링 경로가 아니라 화면이 따로 보내는 요청에 남긴다

기록을 더할 때 할 일은 셋이다. 마이그레이션은 필요 없다 — 이름·설명을 행마다 함께 저장한다.

1. `activity-log.types.ts` 의 `ActivityType` 에 종류를 더하고 `ActivityDescriptions` 에 화면 이름(`codeName`)과
   한 문장 설명(`reason`)을 적는다. 실패 코드가 새로 필요하면 `ActivityErrorCode` 에 더한다
2. 핸들러 본문을 `this.logs.track({ channelId, activityType }, work, classify)` 로 감싼다. 결과가 부분 성공일 수
   있으면 `classify` 로 첫 실패 단계와 오류 코드를 정한다 (`ActivityController.outcome` 이 본보기)
3. 테스트에서 `INSERT INTO recap.activity_logs` 호출을 세어 종류·결과·오류 코드를 확인한다
   (`test/share.spec.ts` 의 `activityLogs` 도우미)

로컬(`NODE_ENV=development`)에서는 DB 가 붙어 있어도 저장하지 않는다. 저장 동작을 보려면
`RECAP_ACTIVITY_LOG_ENABLED=true` 를 같이 준다. 2026.11.03 에 플래그 끄고/켜고 같은 동작을 돌려
0건 / 3건으로 실측했다. `/_dev/login` 은 로컬 전용이라 일부러 안 남긴다.

## 랩과의 경계

- 리캡은 세션의 본인 `channelId` 로만 랩 내부 API 를 부른다. 요청에 든 다른 ID 는 쓰지 않는다
- AI 분석 티켓(쿠폰 · 차감 · 환불)은 리캡이 다 맡고 랩은 분석만 한다. 티켓 검사·차감은 BFF 에서 하고
  화면(FE)은 판단하지 않는다 — 콘솔에서 바로 우회되기 때문이다
- 랩 응답은 아는 칸만 옮긴다(`*.validation.ts`). 대상 `channelId` 가 세션과 다르면 거절한다

## 로컬 실행

- API: `task api:dev` (UI 빌드 + 8180). 10분 넘게 두려면 터미널과 분리해 `nohup pnpm dev &` 로 띄운다
- 로그인: `localhost:8180/_dev/login` 에 채널 ID. 메모리 세션이라 API 를 재시작하면 풀린다
- 컴포즈의 로컬 PG(`task up`)는 `pgdata` 볼륨이 예전 버전 데이터면 postgres 18 이미지가 거부한다.
  마이그레이션만 검증할 때는 볼륨 없는 일회용 컨테이너를 다른 포트에 띄워 API 를 한 번 기동한다
  (기동 시 마이그레이션을 적용한다)

## 검증

- API: `cd api && pnpm lint && pnpm test`. UI: `cd ui && pnpm lint && pnpm build`
- 화면 변경은 브라우저에서 실제 렌더를 보고, 데스크톱 해상도(1280 · 1440 · 1920 · 2560) 기준으로 본다
