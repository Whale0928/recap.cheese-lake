# ui

React와 Vite로 구성한 프론트엔드다. 디자인 시스템은 기존 결정대로
**shadcn/ui 토큰 규격**을 따른다.

기존 정적 갤러리의 토큰과 컴포넌트 CSS를 React에서도 그대로 사용한다.

```
ui/
├── src/                  React 애플리케이션
│   └── blocks/          리캡 조각 스물아홉 개. types.ts 가 곧 API 응답 스키마다
├── styles/
│   ├── tokens.css       색·모서리·서체 토큰 (shadcn/ui 변수 이름 그대로, oklch)
│   └── components.css   컴포넌트 층 (shadcn/ui 어휘 + recap 전용 블록)
├── gallery.html         살아 있는 스타일 참조. 토큰과 컴포넌트 전부를 한 화면에
├── catalog/             리캡 카탈로그 진입점
├── index.html           메인 페이지 진입점
├── chzzk-login-check.html  기존 치지직 로그인 검증 화면
└── prototype/           확정 전 시안. 결론이 나면 옮기거나 지운다
    └── recap.html       본문 열두 조각을 순서대로 조립한 것 (가짜 데이터)
```

## 보는 방법

```
task ui:dev                   # http://localhost:5273
task api:dev                  # UI를 빌드하고 http://localhost:8180에서 함께 제공
```

- `/` — 메인 페이지
- `/chzzk-login-check.html` — 기존 로그인 검증 화면
- `/gallery.html` — 스타일 갤러리. 우상단 「테마 전환」으로 라이트·다크를 오간다
- `/catalog/` — 리캡 카탈로그. 조각별 화면과 그 조각이 먹는 값을 나란히 본다
- `/prototype/recap.html` — 본문 조립 시안

## 프로토타입

`prototype/` 안의 것은 **확정된 화면이 아니다.** 판단을 돕기 위해 세워 본 것이고,
결론이 나면 밖으로 옮기거나 지운다. 실제 화면의 근거로 인용하지 않는다.

현재 `prototype/recap.html` 기준으로 **조각과 순서는 유지하기로 했고,
데이터 구성은 미정이다.** 화면이 요구하는 값과 아직 안 풀린 질문은
[prototype/README.md](prototype/README.md) 에 절별로 적어 두었다.
이게 풀려야 [ADR-0005](../module.secrets/project/cheese-lake/recap/docs/adr/0005-contract-first-api.md) 의 스펙을 쓸 수 있다.

## 규칙

**토큰 밖의 색을 쓰지 않는다.** 새 색이 필요하면 `tokens.css` 에 토큰을 먼저 만든다.
컴포넌트 CSS 에 리터럴 색이 들어가는 순간 다크 모드가 조용히 깨진다.

**테마는 세 상태다.** 라이트, 시스템 다크, 이용자가 직접 고른 것.
색을 `@media` 안에서만 정의하면 첫 번째 상태에서 비어 버리므로
`:root` 에 전부 정의하고 나머지는 덮어쓰기만 한다.

**Tailwind 는 쓰지 않는다.** 기존 토큰과 컴포넌트 CSS를 React가 직접 소비한다.

## 남은 요건

- 가벼울 것
- 대기 화면이 제대로 나올 것 — 첫 이용자는 반드시 기다린다 ([ADR-0006](../module.secrets/project/cheese-lake/recap/docs/adr/0006-async-generation.md))
- 선행 사례(htmx + Bootstrap)보다 화면 품질에서 벌릴 수 있을 것
- 공유 카드(OG 이미지) — ADR-0004 에 요건으로 적혀 있으나 **아직 판단하지 않았다.**
  하기로 하면 Satori 계열이 사실상 유일한 실용안이고, 그때 프레임워크가 따라 정해진다

개발·빌드·검증 명령은 `task ui:*` 네임스페이스로 제공한다.

## UI 미리보기 배포

`Dockerfile`은 UI만 빌드하고 nginx의 8080 포트로 제공한다.
Node와 nginx 베이스 이미지는 Lab Admin UI의 기존 구성을 따른다.
Go API와 OAuth는 포함하지 않는다. 이 이미지에서 「내 리캡 보기」는
로그인 없이 가짜 데이터로 만든 `/prototype/recap.html`을 연다.
`/api/`는 404를 반환하며 로그인 상태를 만들지 않는다.

```sh
docker build -t docker-registry.dead-whale.org/recap-ui:0.0.2 ui
docker run --rm -p 18180:8080 docker-registry.dead-whale.org/recap-ui:0.0.2
```

배포 선언은 `deploy.cheese-lake` 저장소의 `base/recap-ui.yaml`과
`base/recap-route.yaml`에 있다. 공개 주소는 `https://recap.cheese-lake.com`이다.
이미지 push와 deploy 저장소의 main 반영 후에만 실제 배포가 진행된다.
