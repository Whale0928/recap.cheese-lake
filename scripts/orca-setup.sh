#!/usr/bin/env bash
# recap.cheese-lake — Orca 워크트리 생성 후 초기화
#
# Orca 설정 → 작업트리 후크 → 설정 스크립트에 아래 한 줄만 넣으면 된다.
#   bash "$ORCA_WORKTREE_PATH/scripts/orca-setup.sh"
#
# 제공되는 환경 변수
#   ORCA_ROOT_PATH       원본 저장소 경로 (워크트리가 아닌 본체)
#   ORCA_WORKTREE_PATH   새로 만들어진 워크트리 경로
#   ORCA_WORKSPACE_NAME  워크스페이스 이름
#
# 실패해도 워크트리 생성 자체를 막지 않도록 각 단계를 격리한다.
# 치명적이지 않은 실패는 경고만 남기고 계속 진행한다.
#
# recap 은 PostgreSQL 하나를 쓴다 (ADR-0006). 오프셋 대상은 서버·워커가 쓰는
# HTTP 포트, PostgreSQL, 프론트엔드 개발 서버다.

set -uo pipefail

ROOT="${ORCA_ROOT_PATH:-}"
TREE="${ORCA_WORKTREE_PATH:-$(pwd)}"
NAME="${ORCA_WORKSPACE_NAME:-worktree}"

cd "$TREE" || exit 1

warns=0
step() { printf '\n\033[1;36m▸ %s\033[0m\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
skip() { printf '  \033[90m·\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; warns=$((warns+1)); }

printf '\033[1mrecap.cheese-lake 워크트리 초기화\033[0m — %s\n' "$NAME"
printf '  root: %s\n  tree: %s\n' "${ROOT:-(없음)}" "$TREE"

# ── 1. 서브모듈 ───────────────────────────────────────────────
# git worktree는 서브모듈을 자동으로 체크아웃하지 않는다. 명시적으로 가져와야 한다.
# module.secrets는 private이라 자격 증명이 없으면 실패한다 — 경고만 남기고 넘어간다.
step "서브모듈"
if [[ -f .gitmodules ]]; then
  # 실패 출력을 버리지 않는다. 자격 증명 문제로 단정하면 네트워크 오류나
  # gitlink 불일치처럼 다른 원인일 때 진단이 엉뚱한 곳으로 샌다.
  if err=$(git submodule update --init --recursive 2>&1); then
    ok "$(git submodule status | wc -l | tr -d ' ')개 초기화"
  else
    warn "실패 — 아래 원인을 확인하십시오 (private 저장소면 gh auth 또는 SSH 키)"
    printf '%s\n' "$err" | sed 's/^/    /'
    git submodule status 2>&1 | sed 's/^/    /'
  fi
else
  skip ".gitmodules 없음"
fi

# ── 2. 로컬 설정 파일 ─────────────────────────────────────────
# git에 올리지 않는 파일들을 본체에서 복사한다. 없으면 example에서 만든다.
# SECRET_FILES: 본체에서 복사해 올 비밀 파일 목록.
# 이 배열이 복사와 git 제외 목록의 단일 소스다. 둘이 어긋나면
# 시크릿이 untracked로 남아 실수로 커밋될 수 있다.
#
# 치지직 clientSecret 이 여기 들어간다. 권한 600 을 유지할 것.
SECRET_FILES=(.env .env.local bff/config.local.yaml)

step "로컬 설정"
copied=0
if [[ -n "$ROOT" && -d "$ROOT" ]]; then
  for f in "${SECRET_FILES[@]}"; do
    if [[ -f "$ROOT/$f" ]]; then
      mkdir -p "$(dirname "$TREE/$f")"
      if cp "$ROOT/$f" "$TREE/$f"; then
        chmod 600 "$TREE/$f"   # 사본도 원본과 같은 수준으로 잠근다
        ok "$f 복사 (권한 600)"
        copied=$((copied+1))
      fi
    fi
  done
fi
for pair in ".env.example:.env" "bff/config.example.yaml:bff/config.local.yaml"; do
  src="${pair%%:*}"; dst="${pair##*:}"
  if [[ -f "$src" && ! -f "$dst" ]]; then
    cp "$src" "$dst" && chmod 600 "$dst" && ok "$dst 생성 ($src 기반)" && copied=$((copied+1))
  fi
done
[[ $copied -eq 0 ]] && skip "복사할 로컬 설정 없음"

# ── 3. 포트 오프셋 ────────────────────────────────────────────
# 워크트리를 여러 개 동시에 띄우면 포트가 충돌한다.
# 워크스페이스 이름을 해시해 0~39 범위의 고정 오프셋을 만든다.
step "포트 할당"
# 기준 포트를 같은 계열의 다른 저장소와 겹치지 않게 띄워 둔다.
# 그쪽이 8080·5432·5173 에서 +0~39 를 쓰므로, 여기서 같은 기준을 쓰면
# 두 저장소의 워크트리를 함께 띄웠을 때 우연히 같은 포트를 노린다.
OFFSET=$(( $(printf '%s' "$NAME" | cksum | cut -d' ' -f1) % 40 ))
SERVE_PORT=$(( 8180 + OFFSET ))
PG_PORT=$(( 5480 + OFFSET ))
UI_PORT=$(( 5273 + OFFSET ))
# 변수 이름은 docker-compose 가 읽는 것과 정확히 같아야 한다.
# 어긋나면 compose 는 오류 없이 기본값으로 떨어져 워크트리끼리 충돌한다.
cat > .env.ports <<PORTS
# orca-setup.sh 자동 생성 — 워크스페이스 '$NAME' 전용 포트
COMPOSE_PROJECT_NAME=recap-$NAME
SERVE_PORT=$SERVE_PORT
POSTGRES_PORT=$PG_PORT
UI_PORT=$UI_PORT
PORTS
ok "오프셋 +$OFFSET  serve=$SERVE_PORT pg=$PG_PORT ui=$UI_PORT"

# .gitignore가 아니라 .git/info/exclude에 넣는다.
# .gitignore를 고치면 워크트리가 커밋되지 않은 변경을 안은 채 시작한다.
# 이 파일은 본체와 공유된다 — 워크트리도 같은 common dir 을 보므로 한 번 추가하면
# 모든 워크트리에 적용되고, 같은 패턴이 다시 들어가지 않도록 grep 으로 거른다.
EXCLUDE="$(git rev-parse --git-path info/exclude 2>/dev/null)"
if [[ -n "$EXCLUDE" ]]; then
  mkdir -p "$(dirname "$EXCLUDE")"
  for pat in '.env.ports' "${SECRET_FILES[@]}"; do
    grep -qxF "$pat" "$EXCLUDE" 2>/dev/null || echo "$pat" >> "$EXCLUDE"
  done
  ok "로컬 제외 목록 갱신 ($(( ${#SECRET_FILES[@]} + 1 ))개 · 워크트리 clean 유지)"
fi

# ── 4. Go 의존성 ──────────────────────────────────────────────
# 모듈 캐시($GOPATH/pkg/mod)는 워크트리 간 공유되므로 대개 즉시 끝난다.
step "Go 의존성"
if [[ -f bff/go.mod ]]; then
  # 파이프를 물리면 종료 상태가 tail 의 것이 되어 실패가 늘 성공으로 보인다.
  if out=$(cd bff && go mod download 2>&1); then
    ok "go mod download 완료 ($(cd bff && go list -m 2>/dev/null || echo '?'))"
  else
    warn "go mod download 실패"
    printf '%s\n' "$out" | tail -5 | sed 's/^/    /'
  fi
else
  skip "bff/go.mod 없음 (스캐폴딩 전)"
fi

# ── 4b. 코드 생성 도구 ────────────────────────────────────────
# 생성물은 커밋되므로 재생성이 필수는 아니다. 도구만 준비해 두고
# 실제 생성은 필요할 때 task gen 으로 돌린다.
step "코드 생성 도구"
if [[ -f Taskfile.yml ]] && command -v task >/dev/null 2>&1; then
  # grep -q 는 첫 매치에서 파이프를 닫아 task 를 SIGPIPE(141) 로 죽인다.
  # pipefail 이 켜져 있으면 그 141 이 파이프라인의 종료 상태가 된다.
  tasklist=$(task --list-all 2>/dev/null)
  if printf '%s\n' "$tasklist" | grep -q 'bff:tools'; then
    task bff:tools >/dev/null 2>&1 && ok "task bff:tools 완료" || warn "task bff:tools 실패"
  else
    skip "bff:tools 태스크 없음"
  fi
else
  skip "Taskfile.yml 또는 task 명령 없음"
fi

# ── 5. 프론트엔드 의존성 ──────────────────────────────────────
# node_modules는 심볼릭 링크 구조라 워크트리마다 따로 설치해야 한다.
# 스택이 정해지지 않아 위치를 탐색한다. 확정되면 경로를 고정할 것.
step "프론트엔드 의존성"
FE_DIR=""
[[ -f ui/package.json ]] && FE_DIR="ui"
if [[ -n "$FE_DIR" ]]; then
  if command -v pnpm >/dev/null 2>&1; then
    ( cd "$FE_DIR" && pnpm install --frozen-lockfile --silent ) \
      && ok "pnpm install 완료 ($FE_DIR)" || warn "pnpm install 실패 ($FE_DIR)"
  else
    warn "pnpm 없음 — corepack enable 후 재시도"
  fi
else
  skip "package.json 없음 (스택 미정)"
fi

# ── 6. git 훅 ─────────────────────────────────────────────────
# 워크트리의 .git은 디렉토리가 아니라 본체를 가리키는 파일이다.
# lefthook이 이를 처리하지만 워크트리마다 install이 필요하다.
step "git 훅"
if [[ -f lefthook.yml ]]; then
  if command -v lefthook >/dev/null 2>&1; then
    lefthook install >/dev/null 2>&1 && ok "lefthook install 완료" || warn "lefthook install 실패"
  else
    warn "lefthook 없음 — brew install lefthook"
  fi
else
  skip "lefthook.yml 없음 (스캐폴딩 전)"
fi

# ── 7. 요약 ───────────────────────────────────────────────────
printf '\n\033[1m준비 완료\033[0m'
[[ $warns -gt 0 ]] && printf ' \033[33m(경고 %d건)\033[0m' "$warns"
printf '\n'
cat <<SUMMARY

  다음 단계
    task up                              # .env.ports 를 자동으로 넘긴다
    RECAP_SERVER_ADDR=":$SERVE_PORT" task bff:serve
    RECAP_SERVER_ADDR=":$SERVE_PORT" task bff:worker

  주의
    · docker compose 를 직접 부를 때는 --env-file .env.ports 를 붙인다.
    · 서버와 워커를 함께 띄워야 리캡 생성이 진행된다.
    · 리캡에 데이터를 채우려면 데이터 API 가 떠 있어야 한다.
    · 치지직 OAuth 는 애플리케이션당 리디렉션 URL 을 하나만 받는다.
      로컬 앱의 등록값은 http://localhost:8180/auth/callback 고정이다.
      이 오프셋이 OAuth 로그인을 깨뜨리는 지점이므로, 로그인 흐름을 태울 때는
      RECAP_SERVER_ADDR=":8180" 으로 띄우거나 8180 에서 이 워크트리로 넘긴다.
    · clientSecret 은 .env 계열에만 두고 커밋하지 않는다.

SUMMARY
exit 0
