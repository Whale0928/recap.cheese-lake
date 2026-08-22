# ui

프론트엔드. **스택이 아직 정해지지 않았다** ([ADR-0004](../module.secrets/project/cheese-lake/recap/docs/adr/0004-stack.md)).

요건은 넷이다.

- 가벼울 것
- 공유 카드(OG 이미지)가 나올 것
- 대기 화면이 제대로 나올 것 — 첫 이용자는 반드시 기다린다 ([ADR-0006](../module.secrets/project/cheese-lake/recap/docs/adr/0006-async-generation.md))
- 선행 사례(htmx + Bootstrap)보다 화면 품질에서 벌릴 수 있을 것

스택이 정해지면 이 디렉토리에 `Taskfile.yml` 을 두면 루트의 `ui:` 네임스페이스가 살아난다.
지금은 `optional: true` 로 걸려 있어 없어도 `task` 가 실패하지 않는다.
