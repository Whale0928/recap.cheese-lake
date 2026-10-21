# Recap API

NestJS와 기본 Express 어댑터로 구현한 로컬 인증 서버다.
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
세션은 12시간, OAuth state는 10분 유효하다. 토큰이나 전역 마지막 로그인 결과를 조회하는
기존 디버그 API와 `/api/lives`, 로그인 검증 HTML은 제거했다.

## 검증과 범위

```sh
task api:lint
task api:test
task api:build
```

Jest·Supertest로 실제 Nest HTTP 처리를 검증하며, 치지직 HTTP 응답만 대체한다.
실제 OAuth 왕복은 브라우저에서 로그인해 별도로 확인해야 한다.

세션은 로컬 단일 프로세스의 메모리에 저장한다. 재시작하면 로그인이 풀린다.
운영·다중 인스턴스용 공유 세션 저장소는 미구현이며 `NODE_ENV=production`에서는
시작하지 않는다. API Docker 이미지는 API만 포함하므로 UI는 별도로 제공하거나
`RECAP_UI_DIR`에 빌드 디렉터리를 연결해야 한다. 기존 `ui/Dockerfile`은 로그인 없이
보는 화면 미리보기 전용 이미지이며, Nest 인증 서버로 교체되지 않는다.

결정 기록은 [adr](adr)에 있다.

## 내 정보 화면

`/me/`는 치지직 프로필과 Lab 활동 영역을 구분한다. Lab은 레이아웃만 있으며 호출하지 않는다. `GET /api/me`는 세션의 본인 ID만 조회하며 요청의 다른 사용자 ID를 사용하지 않는다. 치지직 조회 실패는 `chzzk.status=unavailable`로 반환하고, 로그인 때 확인한 기본 식별 정보는 유지한다. 사용자 토큰을 다시 보관하지 않으며 Client Secret은 서버에서만 사용한다.
