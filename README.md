<div align="center">

# recap.cheese-lake

치지직 채팅 기록을 개인별 리캡으로 만드는 프로젝트

![api](https://img.shields.io/badge/API-NestJS_·_TypeScript-E0234E)
![frontend](https://img.shields.io/badge/frontend-React_·_Vite-646CFF)

</div>

## Architecture

![Recap과 Lab의 통합 시스템 아키텍처](docs/images/Recap%20Lab%20시스템%20구성도.png)

## 설계 포인트

- Browser는 Lab에 직접 접근하지 않고 Recap API를 경유합니다.
- OAuth API는 본인 확인과 서비스 세션만 담당합니다.
- Lab은 채널별 Worker Pool을 구성하고 Supervisor가 Worker의 생명주기를 관리합니다.
- 운영 메타데이터, 분산 조정 상태, 분석 데이터를 PostgreSQL·Redis Sentinel·ClickHouse로 분리합니다.
- Grok·Claude·Codex 연결 지점을 하나의 LLM Service 계층으로 묶습니다.

## Stack

| 영역 | 기술 및 구조 |
|---|---|
| UI | React · Vite |
| API | NestJS · TypeScript · 치지직 OAuth · 서버 세션 |
| 수집 | Supervisor · 채널별 Worker Pool · 공통 Pipeline |
| 데이터 | PostgreSQL · Redis Sentinel · ClickHouse |
| LLM Service | Grok · Claude · Codex |

---

<sub>치지직·네이버와 제휴 또는 후원 관계가 없는 비공식 프로젝트입니다.</sub>

## 로컬 API

현재 API는 치지직 공식 OAuth를 통한 본인 확인만 구현합니다.
실행 방법과 설정은 [api/README.md](api/README.md), 결정 기록은 [api/adr](api/adr)에 있습니다.
기존 Go 프로토타입은 제거했으며 Lab 조회와 리캡 가공은 아직 구현하지 않았습니다.

## Git 계정 및 서명 검사

이 저장소는 작성자와 커미터 모두 `Whale0928 <rlagusrl928@gmail.com>`을 사용합니다.
저장소별 설정을 적용하고 Lefthook을 설치합니다.

```sh
git config --local user.name Whale0928
git config --local user.email rlagusrl928@gmail.com
git config --local user.signingkey 08A84E718115A7F90C8508AFB1C60F25CF3EE0F3
git config --local commit.gpgsign true
git config --local gpg.format openpgp
lefthook install pre-commit pre-push
```

커밋 전에는 실제 작성자·커미터와 서명 설정을 검사합니다.
푸시 전에는 전송할 브랜치·태그의 전체 커밋 이력에서 계정과 실제 GPG 서명을 검사합니다.
검증용 공개키가 로컬 GPG 키링에 있어야 합니다.
수동으로 검사하려면 다음 명령을 사용합니다.

```sh
node scripts/check-git-identity.mjs pre-commit
node scripts/check-git-identity.mjs history
```

로컬 훅은 `--no-verify`로 우회할 수 있으므로 서버 측 강제 정책은 아닙니다.
