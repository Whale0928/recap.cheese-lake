<div align="center">

# recap.cheese-lake

치지직 채팅 기록을 개인별 리캡으로 만드는 프로젝트

![api](https://img.shields.io/badge/API-Go-00ADD8)
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
| API | Go · OAuth 2.0 · 서명 세션 |
| 수집 | Supervisor · 채널별 Worker Pool · 공통 Pipeline |
| 데이터 | PostgreSQL · Redis Sentinel · ClickHouse |
| LLM Service | Grok · Claude · Codex |

---

<sub>치지직·네이버와 제휴 또는 후원 관계가 없는 비공식 프로젝트입니다.</sub>
