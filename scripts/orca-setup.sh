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
# 기존 PostgreSQL 개발 설정의 포트 할당은 보존한다.
# 현재 인증 API는 데이터베이스 없이 동작한다.

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
SECRET_FILES=(.env .env.local api/.env)

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
for pair in ".env.example:.env" "api/.env.example:api/.env"; do
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

# ── 4. API 의존성 ─────────────────────────────────────────────
step "API 의존성"
if [[ -f api/package.json ]] && command -v pnpm >/dev/null 2>&1; then
  ( cd api && pnpm install --frozen-lockfile ) \
    && ok "API 의존성 설치 완료" || warn "API 의존성 설치 실패"
else
  skip "api/package.json 또는 pnpm 없음"
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
    task api:dev                         # 기본 http://localhost:8180

  주의
    · API의 api/.env에 치지직 설정과 RECAP_SESSION_KEY를 지정한다.
    · 등록된 redirectUri와 RECAP_CHZZK_REDIRECT_URI를 일치시킨다.
    · 포트를 바꾸면 PORT와 redirectUri를 함께 맞춘다.
    · 현재 인증 서버는 로컬 단일 프로세스용이다. PostgreSQL은 필요하지 않다.
    · clientSecret은 .env 계열에만 두고 커밋하지 않는다.

SUMMARY
exit 0
