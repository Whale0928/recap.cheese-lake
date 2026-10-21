# 0002. 치지직 공식 OAuth 인증

## Status

Accepted, 2026.10.21.

## Context

사용자는 일반 네이버 로그인 API 대신 기존과 같은 치지직 OAuth API를 사용하기로
확정했다. 이 API에서 얻은 채널 ID로 사용자를 식별한다. 현재 필요한 것은 본인
확인이며, 방송 관리나 사용자 권한으로 채팅 데이터를 수집하는 기능은 필요하지 않다.

## Decision

치지직 공식 OAuth와 공식 사용자 조회 API만 사용한다. 일반 네이버 로그인,
비공식 쿠키 인증, 자체 ID·비밀번호, 개발용 가짜 로그인은 구현하지 않는다.

1. `GET /auth/login`에서 서버 세션을 재발급하고 임의 state와 10분 만료 시각을 저장한다.
2. 브라우저를 `https://chzzk.naver.com/account-interlock`으로 이동시킨다.
   `clientId`, `redirectUri`, `state`만 전달한다. 권한은 개발자 센터에서 설정하며
   본인 확인에 필요한 사용자 조회 권한만 사용한다.
3. `GET /auth/callback`에서 state를 동기적으로 소비하고 세션에서 제거·저장한 뒤 일치 여부와 만료를 검증한다.
   검증 실패, 동의 거부, code 누락 시 토큰 교환을 수행하지 않는다.
4. `POST https://openapi.chzzk.naver.com/auth/v1/token`으로 code를 교환한다.
5. Bearer 토큰으로 `GET /open/v1/users/me`를 호출한다.
6. 프로필 조회 성공 여부와 관계없이 발급받은 토큰의 폐기를 공식 revoke API로 요청한다.
7. 사용자 조회와 폐기 요청이 성공한 경우에만 세션 ID를 재발급하고 채널 ID·이름을 저장한다.

서비스 세션은 마지막 페이지 접속부터 30일, 최초 로그인부터 최대 90일 유효하다. 세션 ID는 공통 세션 확인 시 7일마다 교체하고, 로그아웃은 해당 로그인 전체를 무효화한다. 배포 환경에서는 인증된 Redis에 세션을 저장하며,
OAuth state 소비도 Redis의 원자적 NX 연산으로 판정한다. 로컬 Redis 미설정 시에만 메모리 세션을 사용한다. 브라우저에는 서명된 세션 ID만 전달하며 쿠키는
HttpOnly, SameSite=Lax, Path=/를 사용한다. HTTPS callback 설정에서는 Secure를
사용한다. 쿠키 수명과 별도로 서버에서 세션의 절대 만료 시각을 검사한다.

`GET /api/session`은 해당 브라우저의 로그인 여부와 최소 사용자 정보만 반환한다.
`POST /auth/logout`은 서버 세션과 쿠키를 제거한다. 명시적인 다른 Origin과
cross-site 로그아웃 요청은 거부한다. 로그아웃은 치지직 계정 자체의 로그아웃이 아니다.

Access Token·Refresh Token은 저장소, 세션, 쿠키, 로그, 브라우저 응답에 보관하거나
노출하지 않는다. 토큰 갱신도 구현하지 않는다. API 오류 응답에는 upstream 본문이나
인증 파라미터를 포함하지 않는다. 인증 관련 응답은 캐시하지 않는다.

## Consequences

인증 기능과 처리하는 개인정보가 제한된다. 치지직의 토큰 교환·사용자 조회·폐기 중
하나라도 실패하면 로그인은 실패한다. 폐기 성공 응답은 폐기 요청 수락의 증거이며,
모든 치지직 서버에서 즉시 무효화되었다는 보장은 아니다. 반영 확인을 위한 polling은 하지 않는다.

공식 명세에 따르면 revoke는 같은 clientId·사용자의 인증 토큰들에 영향을 준다.
따라서 이 앱의 토큰을 장기간 사용하는 다른 기능을 추가하기 전에 정책을 재검토한다.
state는 서버 세션에 묶이며 사용 후 제거된다. 같은 프로세스에서는 소비한 state를
만료까지 기억하여 동시 콜백을 한 번만 처리한다. 현재 메모리 저장 방식은 여러
인스턴스에 걸친 원자적인 state 소비와 세션 공유를 보장하는 운영용 설계가 아니다.

callback URL은 개발자 센터 등록값과 일치해야 한다. 실제 사용자 로그인은 등록된
앱·scope·브라우저를 통해 별도로 검증해야 하며, 자동 테스트는 치지직 응답을 대체한다.

## References

- [공식 Authorization 명세](https://chzzk.gitbook.io/chzzk/chzzk-api/authorization)
- [공식 User 명세](https://chzzk.gitbook.io/chzzk/chzzk-api/user)
- [공식 공통 응답·인증 규격](https://chzzk.gitbook.io/chzzk/chzzk-api/tips)
- 구현: `src/auth/auth.controller.ts`, `src/auth/auth.service.ts`, `src/auth/chzzk.client.ts`
- 검증: `test/auth.spec.ts`
