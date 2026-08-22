# recap — 단일 바이너리, 서브커맨드로 역할을 나눈다 (ADR-0004).
#
# serve 와 worker 가 같은 이미지를 쓰고 command 로만 갈린다.
# 역할별 이미지를 따로 굽지 않는 이유는 코드가 하나이기 때문이다 —
# 나누면 빌드가 두 배가 되고 버전이 어긋날 여지만 생긴다.

# ── 빌드 ──────────────────────────────────────────────────────
FROM golang:1.26-alpine AS build

WORKDIR /src

# 의존성 레이어를 먼저 굳혀 소스만 바뀔 때 다시 받지 않게 한다.
COPY go.mod go.sum ./
RUN go mod download

COPY . .

ARG VERSION=dev
# CGO 를 끄면 정적 링크가 되어 실행 이미지에 libc 가 필요 없다.
RUN CGO_ENABLED=0 GOOS=linux go build \
    -trimpath -ldflags "-s -w -X main.version=${VERSION}" \
    -o /out/recap .

# ── 실행 ──────────────────────────────────────────────────────
# distroless 대신 alpine 을 쓰는 이유는 로컬에서 헬스체크와 디버깅에
# 셸이 필요하기 때문이다. 크기 차이는 몇 MB 수준이다.
FROM alpine:3.21

# 치지직과 Anthropic 이 모두 HTTPS 라 루트 인증서가 있어야 한다.
RUN apk add --no-cache ca-certificates wget \
 && adduser -D -u 10001 recap

COPY --from=build /out/recap /usr/local/bin/recap

USER recap
ENTRYPOINT ["recap"]
CMD ["--help"]
