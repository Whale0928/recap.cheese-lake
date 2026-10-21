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
- `GET /api/recap`: Lab summary·channels·trend·patterns를 병렬 조회한다. 일부 실패는 해당 항목에만 표시한다.
- 호출 대상 ID는 유효한 서버 세션에서만 가져온다. 두 경로에 사용자 ID 입력은 없으며 허용하지 않은 쿼리는 400이다.
- 선택 가능한 쿼리는 `from`, `to`(YYYY-MM-DD, KST, 양 끝 날짜 포함)와 리캡의 `interval=day|week|month`뿐이다. 기본은 오늘을 포함한 최근 30일, 최대 366일이다. Lab에는 분 경계의 `[from, to)`로 변환해 전달한다.
- 같은 사용자·기간·API의 정상 응답은 프로세스 내부에 30초 캐시하고 동시 요청을 합친다. 키별 분당 호출 한도를 공유하므로 인스턴스가 늘면 외부 공유 캐시를 검토한다.
- 응답의 대상 ID·기간·숫자·시간을 검증하고 선언한 필드만 반환한다. Lab 오류 본문·API Key는 응답이나 로그에 기록하지 않는다.

내 정보 활동 달력은 인증된 본인 전용 `GET /api/me/activity/trend?from=YYYY-MM-DD&to=YYYY-MM-DD`로 일별 채팅 수를 조회한다. 기간은 최대 366일이며, 사용자 ID와 추이 단위는 입력받지 않는다. 기존 사용자별 캐시와 중복 요청 병합을 적용하고 자동 재시도는 하지 않는다.

리캡 화면은 `GET /api/recap?period=all` 또는 `?month=YYYY-MM`을 사용한다. 전체는 확인된 모든 과거 기록부터 오늘까지, 월별은 한국 시간 달력 월로 조회하며 현재 월은 오늘까지 조회한다. 두 방식 모두 추이는 일별로 고정한다. 기존 from/to/interval 조회 계약은 유지한다.

## 로컬 개발 로그인

`NODE_ENV=development`와 `RECAP_LOCAL_AUTH_ENABLED=true`를 함께 설정한 로컬 서버에서만 `http://localhost:8180/_dev/login`을 직접 열 수 있다. 로그아웃 상태에서는 상단의 내 리캡 보기 옆에 채널 ID로 로그인 버튼을 표시한다. 로그인 상태나 비활성 환경에서는 표시하지 않는다. 채널 ID는 환경변수에 저장하지 않고 이 화면에서 입력한다. 치지직 공식 채널 조회로 ID와 닉네임을 확인한 뒤 OAuth를 거치지 않고 기존 쿠키 세션을 발급한다. 이후 활동 API는 기존처럼 세션의 ID만 사용한다.

루프백 TCP 접속과 로컬 호스트·Origin만 허용한다. 운영·테스트 환경 또는 활성화 옵션이 꺼진 경우 개발 화면과 POST 경로를 등록하지 않는다. JWT나 외부 OAuth 토큰은 생성하지 않는다.

개발용 세션에는 발급 경로를 기록하며, 개발 로그인 옵션을 끄거나 운영 환경에서 해당 세션을 읽으면 인증을 무효화한다. 이 표시는 세션 교체 후에도 유지한다.

내 정보의 활동 요약은 `GET /api/me/activity/summary?period=all`로 전체 수집 기간을 조회한다. 잔디의 일별 조회 기간은 최근 365일로 유지한다.

`GET /api/session`은 실제 로컬 로그인 접근 조건을 충족할 때만 `localLoginAvailable: true`를 포함한다. UI는 이 응답으로 개발 로그인 버튼의 노출 여부를 결정하며, 운영 응답에는 이 항목을 포함하지 않는다.
