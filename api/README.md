# Recap API

NestJS와 기본 Express 어댑터로 구현한 인증 BFF다.
일반 네이버 로그인 대신 **치지직 공식 OAuth**로 본인을 확인한다.
Lab 조회, 리캡 가공, DB 접근은 아직 구현하지 않았다.

## 실행

Node.js 24 이상과 pnpm 10을 사용한다. 저장소 루트에서:

```sh
task api:install
cp api/.env.example api/.env
openssl rand -hex 32
```

`api/.env`에 발급받은 `RECAP_CHZZK_CLIENT_ID`, `RECAP_CHZZK_CLIENT_SECRET`과
생성한 `RECAP_SESSION_KEY`를 설정한다. 키 원문은 커밋하지 않는다.
개발자 센터에 등록한 로그인 리디렉션 URL과 `RECAP_CHZZK_REDIRECT_URI`가 일치해야 한다.
앱 권한은 사용자 조회만 필요하다.

```sh
task api:dev
```

UI를 빌드한 뒤 `http://localhost:8180`에서 UI와 API를 함께 제공한다.
이후 API 소스 변경은 다시 빌드하고 서버를 재시작한다. 기존 비공개 서브모듈의
`project/cheese-lake/recap/local/.env`도 개발 실행에서 읽으며, `api/.env`를 우선한다.

UI를 Vite로 개발할 때는 별도 터미널에서 `task ui:dev`를 실행하고
`RECAP_LOGIN_SUCCESS_URL=http://localhost:5273/`로 설정한다.
기존 Vite proxy가 `/auth`와 `/api`를 API의 8180 포트로 전달한다.
기존 `RECAP_SERVER_ADDR`, `RECAP_DEBUG_TOKENS`, `RECAP_VERIFY_REVOKE`는 제거했다.
API 포트는 `PORT`, 정적 UI 위치는 `RECAP_UI_DIR`로 설정한다.

## 경로

| 경로 | 동작 |
|---|---|
| `GET /auth/login` | state를 발급하고 치지직 로그인 화면으로 이동한다. |
| `GET /auth/callback` | state 검증, 토큰 교환, 사용자 조회·토큰 폐기 후 세션을 발급한다. |
| `GET /api/me` | 로그인한 본인의 치지직 프로필 5개 항목을 Client 인증으로 조회한다. 비로그인은 401이다. |
| `GET /api/session` | 로그인 여부와 채널 ID·이름·만료 시각을 반환한다. |
| `POST /auth/logout` | Recap 서버 세션을 제거한다. |

callback 성공 시 설정한 UI 주소로 이동한다. 잘못된 state는 401, 동의 거부·code
누락은 400, 치지직 호출·응답 실패는 502를 반환한다. 오류에 토큰이나 upstream 본문을 싣지 않는다.
세션은 마지막 페이지 접속부터 30일, 최초 로그인부터 최대 90일 유효하다. 공통 `GET /api/session` 확인 시 쿠키와 서버 TTL을 갱신하고, 세션 ID는 7일마다 교체한다. OAuth state는 10분 유효하다. 토큰이나 전역 마지막 로그인 결과를 조회하는
기존 디버그 API와 `/api/lives`, 로그인 검증 HTML은 제거했다.

## 검증과 범위

```sh
task api:lint
task api:test
task api:build
```

Jest·Supertest로 실제 Nest HTTP 처리를 검증하며, 치지직 HTTP 응답만 대체한다.
실제 OAuth 왕복은 브라우저에서 로그인해 별도로 확인해야 한다.

로컬 개발에서 Redis 설정을 생략하면 메모리 세션을 사용하며 재시작 시 로그인이 풀린다.
운영에서는 `RECAP_REDIS_HOST`·`RECAP_REDIS_PORT`·`RECAP_REDIS_PASSWORD`로 인증된 Redis를 설정한다.
`NODE_ENV=production`은 Redis와 HTTPS callback·성공 URL이 없으면 시작하지 않는다.
세션과 OAuth state 일회성 소비를 Redis에서 공유하며 세션 TTL은 30일 이내이며 최초 로그인부터 90일 상한을 지킨다. OAuth state TTL은 10분 이내다. API Docker 이미지는 API만 포함하므로 UI는 별도로 제공하거나
`RECAP_UI_DIR`에 빌드 디렉터리를 연결해야 한다. 기존 `ui/Dockerfile`은 로그인 없이
보는 화면 미리보기 전용 이미지이며, Nest 인증 서버로 교체되지 않는다.

결정 기록은 [adr](adr)에 있다.

## 내 정보 화면

`/me/`는 치지직 프로필과 Lab 활동 영역을 구분한다. Lab은 레이아웃만 있으며 호출하지 않는다. `GET /api/me`는 세션의 본인 ID만 조회하며 요청의 다른 사용자 ID를 사용하지 않는다. 치지직 조회 실패는 `chzzk.status=unavailable`로 반환하고, 로그인 때 확인한 기본 식별 정보는 유지한다. 사용자 토큰을 다시 보관하지 않으며 Client Secret은 서버에서만 사용한다.

## 배포 네트워크

API Service는 ClusterIP만 사용하고 외부 HTTPRoute는 UI에만 연결한다. 배포용 UI는
`docker build --build-arg RECAP_API_PROXY=true -t recap-ui:local ui`로 만들며, nginx가
`RECAP_API_UPSTREAM`의 `/auth/`와 `/api/`로 전달한다. 기존 기본 빌드는 정적 미리보기를 유지한다.

`RECAP_ALLOWED_CIDRS`는 TCP 접속자 주소로 검사한다. 로컬은 loopback, 클러스터는 확인한
Node Pod CIDR을 지정한다. 외부 요청의 X-Forwarded-For로 접근을 허용하지 않는다.
허용된 프록시에서 온 HTTPS 전달 정보만 세션 Secure 쿠키 처리에 반영한다.
`RECAP_CORS_ORIGINS`는 쉼표로 나열한 정확한 origin만 허용한다. 와일드카드는 거부한다.
허용되지 않은 Origin은 세션 처리 전에 403이다. CORS는 CIDR 검사와 별개다.

`GET /healthz`는 프로세스, `GET /readyz`는 세션 저장소 준비 상태를 확인하며 세션을 만들지 않는다.
Kubernetes 배포 선언은 별도 deploy 저장소의 `base/recap-api.yaml`·`recap-redis.yaml`·`recap-secret.yaml`에 있다.
운영 Redis는 AOF(`appendfsync always`)와 전용 PVC로 세션 및 로그아웃 무효화 기록을 복구한다. 세션·쿠키는 로컬 스토리지에 저장하지 않는다. 로그아웃 무효화 기록은 해당 로그인에서 발급할 수 있는 모든 세션이 만료되는 시점까지 유지한다. 기존 12시간 세션은 새 만료 정보가 없어 한 번 다시 로그인해야 한다. 로컬 Redis 미설정 시에는 메모리 저장소이므로 API 재시작 시 로그인 상태가 사라진다.

## Lab 개인 활동 조회

`RECAP_LAB_BASE_URL`과 `RECAP_LAB_API_KEY`를 서버 환경에 설정한다. 로컬 기본 주소는 `http://127.0.0.1:8081`, 클러스터 주소는 `http://serve-internal:8081`이다. 키는 계정에서 발급한 `clk_` 형식이며 브라우저 환경변수나 응답에는 포함하지 않는다. 키가 없으면 로그인은 유지하고 활동 영역만 연결 준비 상태로 표시한다.

- `GET /api/me/activity/summary`: Lab summary만 조회한다.
- `GET /api/recap`: Lab summary와 activities(방송별·추이·패턴 묶음)를 병렬 조회한다. 일부 실패는 해당 항목에만 표시한다.
- 호출 대상 ID는 유효한 서버 세션에서만 가져온다. 두 경로에 사용자 ID 입력은 없으며 허용하지 않은 쿼리는 400이다.
- 선택 가능한 쿼리는 `from`, `to`(YYYY-MM-DD, KST, 양 끝 날짜 포함)와 리캡의 `interval=day|week|month`뿐이다. 기본은 오늘을 포함한 최근 30일, 최대 366일이다. Lab에는 분 경계의 `[from, to)`로 변환해 전달한다.
- 같은 사용자·기간·API의 정상 응답은 5분 캐시한다. Redis 설정 시 API Pod끼리 결과를 공유하며, 동일 프로세스의 동시 요청은 합친다.
- 이미지가 null인 정상 응답에는 캐시 만료를 연장하지 않는 재검증 일정을 기록한다. 2·4·8초 대기 후 최대 3회이며, 이미지가 보충되면 일반 5분 캐시로 돌아간다. null을 오류나 pending으로 단정하지 않는다.
- 이미지 보충은 `GET /api/me/activity/profiles`와 `GET /api/me/channels/:broadcastId/profile`로 수행한다. 두 경로는 기존 Lab API와 같은 캐시를 공유하고 프로필 필드만 반환하며, 사용자 활동 로그를 추가하지 않는다. Lab의 전용 메타데이터 API가 없으므로 캐시 재검증 시 기존 activities 또는 relationship 집계는 다시 실행될 수 있다.
- 브라우저는 재확인 횟수·다음 시각·15분 제한 시각만 불투명한 캐시 키별로 sessionStorage에 최대 128개 보관한다. 활동 값·인증정보는 저장하지 않는다. 새로고침으로 한도를 초기화하지 않으며 429 대기 시간을 지키고 화면 이동·로그아웃 시 취소한다. 확인 후에도 null이면 대체 이미지를 유지하고 자동 확인을 종료한다.
- 응답의 대상 ID·기간·숫자·시간을 검증하고 선언한 필드만 반환한다. Lab 오류 본문·API Key는 응답이나 로그에 기록하지 않는다.

내 정보 활동 달력은 인증된 본인 전용 `GET /api/me/activity/trend?from=YYYY-MM-DD&to=YYYY-MM-DD`로 일별 채팅 수를 조회한다. 기간은 최대 366일이며, 사용자 ID와 추이 단위는 입력받지 않는다. 기존 사용자별 캐시와 중복 요청 병합을 적용하고 자동 재시도는 하지 않는다.

리캡 화면은 `GET /api/recap?period=all` 또는 `?month=YYYY-MM`을 사용한다. 전체는 확인된 모든 과거 기록부터 오늘까지, 월별은 한국 시간 달력 월로 조회하며 현재 월은 오늘까지 조회한다. 두 방식 모두 추이는 일별로 고정한다. 기존 from/to/interval 조회 계약은 유지한다.

## 로컬 개발 로그인

`NODE_ENV=development`와 `RECAP_LOCAL_AUTH_ENABLED=true`를 함께 설정한 로컬 서버에서만 `http://localhost:8180/_dev/login`을 직접 열 수 있다. 로그아웃 상태에서는 상단의 내 리캡 보기 옆에 채널 ID로 로그인 버튼을 표시한다. 로그인 상태나 비활성 환경에서는 표시하지 않는다. 채널 ID는 환경변수에 저장하지 않고 이 화면에서 입력한다. 치지직 공식 채널 조회로 ID와 닉네임을 확인한 뒤 OAuth를 거치지 않고 기존 쿠키 세션을 발급한다. 이후 활동 API는 기존처럼 세션의 ID만 사용한다.

루프백 TCP 접속과 로컬 호스트·Origin만 허용한다. 운영·테스트 환경 또는 활성화 옵션이 꺼진 경우 개발 화면과 POST 경로를 등록하지 않는다. JWT나 외부 OAuth 토큰은 생성하지 않는다.

개발용 세션에는 발급 경로를 기록하며, 개발 로그인 옵션을 끄거나 운영 환경에서 해당 세션을 읽으면 인증을 무효화한다. 이 표시는 세션 교체 후에도 유지한다.

내 정보의 활동 요약은 `GET /api/me/activity/summary?period=all`로 전체 수집 기간을 조회한다. 잔디의 일별 조회 기간은 최근 365일로 유지한다.

`GET /api/session`은 실제 로컬 로그인 접근 조건을 충족할 때만 `localLoginAvailable: true`를 포함한다. UI는 이 응답으로 개발 로그인 버튼의 노출 여부를 결정하며, 운영 응답에는 이 항목을 포함하지 않는다.

## 활동 Redis 캐시

`RECAP_CACHE_REDIS_HOST`, `RECAP_CACHE_REDIS_PORT`(기본 6379), `RECAP_CACHE_REDIS_PASSWORD`는 활동 조회 캐시 전용 설정이다. 로그인 세션의 `RECAP_REDIS_*`와 별도 연결이며 세션 저장소는 바꾸지 않는다. 운영에서 캐시 host를 설정하면 비밀번호도 필수다. 브라우저에는 연결 정보나 비밀번호를 전달하지 않는다.

배포 환경은 기존 `lab-redis:6379`를 공유하도록 준비한다. 비밀번호는 기존 `cheese-lake-secrets`의 `REDIS_PASSWORD`를 `RECAP_CACHE_REDIS_PASSWORD`로 주입하며, 새 평문 시크릿이나 1Password 필드를 만들지 않는다. 현재 단일 Redis endpoint를 사용하고 Redis Cluster·Sentinel 전환은 포함하지 않는다.

- 키 형식은 `recap:cache:{activity:v1}:entry:<SHA-256>`이다. 원문 사용자 ID 대신 upstream·종류·인증된 사용자·기간·추이 단위를 해시한다. 스키마가 호환되지 않게 바뀌면 이름 공간의 버전도 변경한다.
- 정상 응답만 Redis에 300초 저장하고, 읽어도 만료 시각을 연장하지 않는다. Redis에서 읽은 데이터도 본인 ID·기간·응답 계약을 다시 검증한다. 손상된 값은 무시하고 재조회한다. 현재 stale-while-revalidate는 적용하지 않는다.
- 공유 Redis에는 응답당 JSON UTF-8 256KiB, 전역 128개를 상한으로 둔다. 캐시 본문은 최대 32MiB이며 Redis의 키·인덱스·할당 오버헤드는 별도다. 초과 크기의 결과는 정상 반환하되 캐시하지 않는다.
- 짧은 Lua 연산이 값·만료 인덱스·개수 제한을 원자적으로 갱신한다. 상한에 도달하면 Recap 활동 캐시 중 만료가 가장 가까운 항목을 제거한다. Lab 키와 세션 키를 제거하거나 전체 DB를 비우지 않는다. 저장 명령의 실행 기한도 확인해 Redis 지연 후 늦은 저장을 막는다.
- Redis 명령 대기는 250ms로 제한하고, 장애 후 1초간 접근을 쉬면서 같은 상한의 5분 메모리 캐시로 대체한다. 메모리에도 결과가 없으면 기존 upstream 조회 경로로 진행한다. 정상 캐시 실패로 로그인이나 `/readyz`를 실패시키지 않는다.
- upstream 실패 응답은 정상 캐시에 저장하지 않는다. 429의 `Retry-After` 대기는 기존처럼 프로세스 내에서만 유지하며 자동 재시도하지 않는다. 여러 Pod 사이의 cold miss 합치기와 분산 동시 호출 제한은 별도 작업이다.

`recap:` 접두사는 키 충돌을 막지만 메모리·CPU·장애를 격리하지 않는다. Lab Redis는 락·리스·레이트리밋을 함께 처리하고 `noeviction`이므로 이 정책은 유지한다. 공유 후 메모리와 지연을 관찰하고, 상한을 늘리기 전에는 Lab 영향부터 검토한다.

전용 테스트 Redis에서 다음 검증을 실행한다. 운영 Redis를 테스트 대상으로 사용하지 않는다.

```sh
RECAP_TEST_REDIS_URL=redis://127.0.0.1:6379 task api:test:cache
```

CI는 Redis 7.4.2 서비스에서 같은 통합 테스트를 실행한다. Pod 간 공유, 300초 TTL, 조회 시 TTL 유지, 동시 쓰기 상한, 사용자 격리, 손상 응답, Redis 지연 시 대체 동작과 늦은 저장 거부를 확인한다.

## 공개 일간 관측 통계와 캐시

`GET /api/observations/daily`는 로그인 없이 KST 어제의 관측 통계를 반환한다.
공개 경로에는 검색조건을 받지 않으며 Lab의 기존 Internal API Key는 서버에서만 사용한다.
응답 필드를 검증한 뒤 요약·하루 채팅 최다·순간 최대·시간대 최고값만 전달한다.
홈의 A 형태 관측 카드는 이 경로를 조회하고 5분 및 KST 날짜 전환 시 갱신한다. 조회 실패 시 샘플로 대체하지 않고 카드를 숨긴다.

기존 `ActivityCache`의 Redis와 메모리 대체 경로를 공유한다. 키는 종류 버전·Lab 주소·KST 날짜로
구분하며 개인 활동 캐시와 충돌하지 않는다. 동일 프로세스에서 같은 날짜의 동시 요청은 합친다.
검증한 완성본 한 개는 프로세스 메모리에도 두어 반복 요청마다 Redis를 왕복하지 않는다.
Redis 쓰기의 지연 거부 기준은 연결 시 읽은 서버 시각으로 보정하여 호스트 간 시차에도 동작한다.
TTL은 최대 5분이고 Lab의 `generatedAt + 1시간`과 다음 KST 자정보다 길게 저장하지 않는다.
저장된 절대 만료 시각도 검사하므로 Redis 저장 지연이나 조회로 TTL이 연장되지 않는다.
Lab 응답의 `generatedAt`은 그대로 보존한다. 실패·잘못된 응답은 캐시하지 않고 503으로 반환한다.
Redis가 없거나 연결되지 않으면 기존의 개수 제한이 있는 메모리 캐시로 동작한다.

세션을 읽거나 쿠키를 갱신하지 않으며 브라우저·CDN 캐시는 `Cache-Control: no-store`로 막는다.
`X-Recap-Cache`는 `MISS`, `HIT`, `COALESCED` 중 하나로 서버 캐시 경로를 표시한다.
날짜 전환은 새 키를 사용하므로 수동 무효화가 필요 없다. 백필·원본 병합·채널 메타데이터 변경은
Lab의 한 시간 갱신을 따른다. 즉시 수정이 필요한 경우에는 Lab과 Recap 양쪽의 캐시를 함께
갱신해야 한다. 이번 작업에는 공개 강제 갱신 파라미터나 관리용 무효화 API를 추가하지 않는다.

## PostgreSQL 연결

`RECAP_DATABASE_URL`에 PostgreSQL 접속 URL을 설정하면 API 기동 시 TypeORM이 `recap` 스키마의 미적용 마이그레이션을 실행한다. `production`에서는 필수이며, DB 연결이나 마이그레이션 실패 시 서버를 시작하지 않는다. `synchronize`는 사용하지 않는다. 연결 풀은 Pod당 최대 5개다.

배포에서는 기존 `cheese-lake-secrets.CHEESE_POSTGRES_DSN`을 참조한다. 1Password `cheese-lake` 볼트의 `development-postgres` 항목을 재사용하며 접속 정보를 별도로 복제하지 않는다. Lab의 `public` 스키마와 Recap의 `recap` 스키마는 같은 DB에 있다.

마이그레이션 원본은 `module.secrets/project/cheese-lake/recap/db/migrations/`의 TypeScript 파일이다. `pnpm build`는 원본이 있으면 타입 검사 후 JavaScript로 컴파일한다. private 서브모듈이 없는 일반 코드 CI에서도 API 빌드는 가능하지만, DB를 사용하는 실행에는 컴파일된 마이그레이션이 반드시 있어야 한다. 이미지 빌드는 `task api:image`로 실행하며 마이그레이션 폴더만 별도 빌드 컨텍스트로 전달한다. `.env`나 서브모듈 전체를 이미지에 복사하지 않는다.

여러 Pod의 동시 기동은 PostgreSQL advisory lock으로 직렬화하며 락 대기는 5초로 제한한다. 적용 이력은 `recap.migrations`에 저장한다. 되돌리기는 업무 테이블만 삭제하며 이력 테이블이 있는 `recap` 스키마는 유지한다. 계정 매칭은 로그인 성공 시 채널 ID와 닉네임을 upsert한다.

### 공유·삭제 요청 스키마 초안

`recap.recap_shares`(공유 승인)와 `recap.privacy_requests`(기록 삭제 요청)는 아직 마이그레이션을 만들지 않았다.
테이블 정의 초안은 [공유 ADR](<adr/0003 수신자를 지정하는 리캡 공유.md>)과 module.secrets의 삭제 처리 ADR 0010에 있다.

운영 관리 화면은 Lab에 두고 Recap 내부 관리 API로 처리한다. Recap 스키마와 마이그레이션은
Recap이 관리하며 Lab은 테이블을 직접 수정하지 않는다. 예외로 홍보 배너(`recap.banners`·`banner_placements`·`banner_images`)는
Lab 관리 화면이 직접 쓰고 Recap은 `GET /api/banners`·`GET /api/banners/images/{hash}.webp`로 읽기만 한다. 공유·삭제 요청은 현재
[공유 ADR 초안](<adr/0003 수신자를 지정하는 리캡 공유.md>),
[삭제 ADR 초안](<adr/0004 기록 삭제 요청과 처리 제외.md>)만 추가한 상태다.
공유·차단·삭제 API, 화면, 만료 정리와 Lab 연동은 아직 구현하지 않았다.


## 활동 로그

`ActivityLogService.track()`이 활동 단위의 시작·종료 시각, 처리 시간과 결과를 한 번 기록한다. 종류는 `ActivityType.PROFILE_VIEW`(`/api/me`)와 `ActivityType.RECAP_VIEW`(`/api/recap`)다. 요약·잔디의 보조 요청은 기록하지 않는다. 리캡의 내부 호출·캐시 조회·재시도 횟수는 로그 행 수에 영향을 주지 않는다.

리캡은 네 항목 모두 정상일 때 성공, 일부만 정상이면 부분 성공, 모두 조회하지 못하면 실패다. 여러 항목에 문제가 있으면 summary → channels → trend → patterns 순서로 첫 실패 단계와 정의된 오류 코드를 기록한다. 처리 중 예외가 발생하면 원래 예외를 유지하고 실패를 기록한다. 응답 본문·원문 오류·토큰은 저장하지 않는다. 로그 저장은 요청 종료 시 기다리되, 저장 실패가 원래 응답이나 예외를 바꾸지는 않는다.

기존 세션으로 접근해도 계정 참조를 만든 뒤 로그를 저장한다. 기동 시와 이후 매시간 90일이 지난 활동 로그를 삭제한다. 계정·활동 로그 저장과 정리 실패는 민감한 값 없이 서버에 경고를 남긴다. 이 처리는 수신한 활동 요청 단위이므로 사용자가 리캡을 다시 조회하면 별도 활동으로 기록된다.

## 채널 기록과 활동 통합 조회

`GET /api/recap`은 기존 UI 응답 형식을 유지하면서 Lab의 요약과 통합 활동 API를 각각 한 번 호출한다. 방송 목록·추이·패턴의 개별 호출은 사용하지 않는다.

`GET /api/me/channels/:broadcastId/record`는 로그인한 사용자의 해당 방송 기록을 반환한다. 경로에는 대상 방송 ID만 받으며 사용자 ID나 기간을 덮어쓰는 query는 거절한다. 전체 기간의 채널 기록 요약, 해당 방송으로 필터링한 최근 365일 일별 추이와 전체 기간 월별 추이를 조회한다. 5분 캐시·동시 요청 병합·429 재호출 대기를 재사용하며 캐시 키는 사용자·방송·기간·집계 단위별로 분리한다. 브라우저 응답에는 `Cache-Control: no-store`를 사용한다.
