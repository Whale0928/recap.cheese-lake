# ui

React와 Vite로 구성한 프론트엔드다. 디자인 시스템은 기존 결정대로
**shadcn/ui 토큰 규격**을 따른다.

기존 정적 갤러리의 토큰과 컴포넌트 CSS를 React에서도 그대로 사용한다.

```
ui/
├── src/                  React 애플리케이션
├── styles/
│   ├── tokens.css       색·모서리·서체 토큰 (shadcn/ui 변수 이름 그대로, oklch)
│   └── components.css   컴포넌트 층 (shadcn/ui 어휘 + recap 전용 블록)
├── gallery.html         살아 있는 스타일 참조. 토큰과 컴포넌트 전부를 한 화면에
├── index.html           메인 페이지 진입점
└── recap/               빈 리캡 페이지
```

## 보는 방법

```
task ui:dev                   # http://localhost:5273
task api:dev                  # UI를 빌드하고 http://localhost:8180에서 함께 제공
```

- `/` — 메인 페이지
- `/gallery.html` — 스타일 갤러리. 우상단 「테마 전환」으로 라이트·다크를 오간다
- `/recap/` — 로그인 후 「내 리캡 보기」가 여는 빈 페이지
- `/me/` — 치지직 프로필 이미지·닉네임·정보 확인 시각을 표시한다. Lab은 연동 전 레이아웃만 제공한다.

## 규칙

화면에 불필요한 문장형 설명을 넣지 않는다. 짧은 항목명·상태·동작 이름으로 표현한다. 프로필에는 이미지·닉네임·정보 확인 시각만 표시하고, 채널 ID·팔로워 수·인증 마크·이미지 등록 여부는 노출하지 않는다.

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
NestJS API와 OAuth는 포함하지 않는다. 이 이미지에서 「내 리캡 보기」는
로그인 없이 빈 `/recap/` 페이지를 연다.
`/api/`는 404를 반환하며 로그인 상태를 만들지 않는다.

```sh
docker build -t docker-registry.dead-whale.org/recap-ui:0.0.2 ui
docker run --rm -p 18180:8080 docker-registry.dead-whale.org/recap-ui:0.0.2
```

배포 선언은 `deploy.cheese-lake` 저장소의 `base/recap-ui.yaml`과
`base/recap-route.yaml`에 있다. 공개 주소는 `https://recap.cheese-lake.com`이다.
이미지 push와 deploy 저장소의 main 반영 후에만 실제 배포가 진행된다.

## 같이보기 배너

랜딩 양쪽 배너는 [치지직 공식 공지](https://game.naver.com/lounge/chzzk/board/detail/8298140)를 수동 반영한다. `assets/images/kindaichi_notice.png`는 해당 공지의 원본 이미지이며, 배너에서는 상단 작품 이미지 부분만 CSS로 표시한다. 권리 표기는 원본에 포함되어 있다. 기간은 2026.10.21 확인 기준이며, 공지가 바뀌면 `src/SideBanners.tsx`도 함께 갱신한다.

## API 연결 배포 이미지

`docker build --build-arg RECAP_API_PROXY=true -t recap-ui:local ui`로 API 프록시 템플릿을 포함한다.
`RECAP_API_UPSTREAM=http://recap-api:8180`을 주입하면 `/auth/`·`/api/`를 내부 API로 전달한다.
기본 빌드는 계속 nginx 전용 미리보기다. API 프록시 빌드에서는 접속 IP와 OAuth code가
nginx 요청 로그에 남지 않도록 access log를 끄고 인증 경로의 오류 로그도 제외한다.
