# 0001. NestJS 기반 BFF

## Status

Accepted, 2026.10.21.

## Context

기존 Go API는 치지직 로그인 동작을 확인하는 프로토타입이었다. 데이터 수집과 집계는
별도 Lab 서버가 담당하며, Recap 서버는 인증과 UI에 필요한 응답 가공을 맡는다.
이번 전환에는 TypeScript 서버 개발과 NestJS의 모듈, Controller, Service, DI를
실제 기능으로 경험하려는 목적이 있다.

## Decision

Go 프로토타입을 폐기하고 Node.js 24 이상, TypeScript, NestJS 12와 기본 Express
어댑터로 API를 구현한다. 현재 React·Vite UI는 유지하고 빌드된 정적 파일을 제공한다.
SSR과 UI 프레임워크 변경은 이번 범위에 포함하지 않는다.

현재 기능은 치지직 OAuth 로그인, 콜백, 세션 조회, 로그아웃으로 제한한다.
Lab API 호출, 데이터베이스, ORM, 리캡 가공, 큐와 워커는 추가하지 않는다.
API의 새 결정 기록은 이 `api/adr` 디렉터리에서 관리한다. 기존 비공개 문서의
Go·Echo·Cobra·Go 코드 생성에 관한 결정은 이 API 구현에 적용하지 않는다.

## Consequences

프론트엔드와 API를 TypeScript로 개발하면서 NestJS의 책임 분리를 경험할 수 있다.
Go 기반 빌드, CI, 훅, 개발 명령은 Node.js 기준으로 교체한다. 기존 로그인 디버그
화면과 라이브 목록 확인 기능은 제거한다.

현재 API는 로컬 단일 프로세스 인증 검증용이다. `express-session`의 MemoryStore를
사용하므로 재시작하면 로그인이 해제되며 여러 인스턴스에서 세션을 공유하지 못한다.
`NODE_ENV=production`에서는 시작을 거부한다. 운영에 앞서 공유 세션 저장소와
HTTPS·프록시 구성을 별도 결정하고 구현해야 한다. 이번 구현은 배포 완료를 뜻하지 않는다.

## References

- [NestJS 시작하기](https://docs.nestjs.com/first-steps)
- [NestJS 세션](https://docs.nestjs.com/techniques/session)
- 구현: `src/app.module.ts`, `src/app.ts`, `src/auth/auth.module.ts`
