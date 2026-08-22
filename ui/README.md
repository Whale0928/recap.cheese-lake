# ui

프론트엔드. **프레임워크는 아직 정해지지 않았다** ([ADR-0004](../module.secrets/project/cheese-lake/recap/docs/adr/0004-stack.md)).
다만 **디자인 시스템은 shadcn/ui 규격을 따르기로 했다.**

두 결정은 별개다. shadcn/ui 의 토큰 층은 CSS 커스텀 프로퍼티일 뿐이라
React 든 Svelte 든 순수 HTML 이든 그대로 성립한다. 그래서 프레임워크 결정을
기다리지 않고 먼저 세워 두었고, 나중에 무엇을 고르든 화면을 다시 그리지 않는다.

```
ui/
├── styles/
│   ├── tokens.css       색·모서리·서체 토큰 (shadcn/ui 변수 이름 그대로, oklch)
│   └── components.css   컴포넌트 층 (shadcn/ui 어휘 + recap 전용 블록)
├── gallery.html         살아 있는 스타일 참조. 토큰과 컴포넌트 전부를 한 화면에
└── index.html           로그인 확인 화면 (이 시스템의 첫 소비자)
```

## 보는 방법

```
task backend:dev              # http://localhost:8180
```

- `/` — 로그인 확인 화면
- `/gallery.html` — 스타일 갤러리. 우상단 「테마 전환」으로 라이트·다크를 오간다

## 규칙

**토큰 밖의 색을 쓰지 않는다.** 새 색이 필요하면 `tokens.css` 에 토큰을 먼저 만든다.
컴포넌트 CSS 에 리터럴 색이 들어가는 순간 다크 모드가 조용히 깨진다.

**테마는 세 상태다.** 라이트, 시스템 다크, 이용자가 직접 고른 것.
색을 `@media` 안에서만 정의하면 첫 번째 상태에서 비어 버리므로
`:root` 에 전부 정의하고 나머지는 덮어쓰기만 한다.

**Tailwind 는 아직 쓰지 않는다.** 빌드를 요구하는데 프레임워크가 미정이라 이르다.
변수 이름을 규격에 맞춰 두었으므로 도입 시점에 `@theme inline` 으로 매핑하면 되고,
그때 `components.css` 는 같은 이름의 shadcn 컴포넌트로 갈아끼운다.

## 남은 요건

- 가벼울 것
- 대기 화면이 제대로 나올 것 — 첫 이용자는 반드시 기다린다 ([ADR-0006](../module.secrets/project/cheese-lake/recap/docs/adr/0006-async-generation.md))
- 선행 사례(htmx + Bootstrap)보다 화면 품질에서 벌릴 수 있을 것
- 공유 카드(OG 이미지) — ADR-0004 에 요건으로 적혀 있으나 **아직 판단하지 않았다.**
  하기로 하면 Satori 계열이 사실상 유일한 실용안이고, 그때 프레임워크가 따라 정해진다

프레임워크가 정해지면 이 디렉토리에 `Taskfile.yml` 을 두면 루트의 `ui:` 네임스페이스가 살아난다.
지금은 `optional: true` 로 걸려 있어 없어도 `task` 가 실패하지 않는다.
