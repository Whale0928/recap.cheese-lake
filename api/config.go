package main

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log/slog"
	"os"
	"strings"
)

// Config 는 이 스파이크가 필요로 하는 전부다.
// ADR-0004 는 Viper 를 쓰기로 했으나, 로그인 흐름을 확인하는 단계에서는
// 환경변수만으로 충분하다. 키 이름은 그때 그대로 쓸 수 있게 맞춰 둔다.
type Config struct {
	Addr         string
	ClientID     string
	ClientSecret string
	RedirectURI  string

	// SessionKey 는 state 와 세션 쿠키 서명에 쓴다.
	SessionKey []byte

	// DebugTokens 가 켜지면 토큰 원문을 응답에 싣는다. 로컬 확인용이다.
	DebugTokens bool

	// VerifyRevoke 가 켜지면 폐기 후 토큰이 정말 죽는지 확인할 때까지 기다린다.
	// 반영이 최대 8초까지 걸리는 것을 봤으므로 평소에는 꺼 둔다.
	VerifyRevoke bool
}

func LoadConfig() (*Config, error) {
	c := &Config{
		Addr:         env("RECAP_SERVER_ADDR", ":8180"),
		ClientID:     os.Getenv("RECAP_CHZZK_CLIENT_ID"),
		ClientSecret: os.Getenv("RECAP_CHZZK_CLIENT_SECRET"),
		RedirectURI:  env("RECAP_CHZZK_REDIRECT_URI", "http://localhost:8180/auth/callback"),
		DebugTokens:  truthy(os.Getenv("RECAP_DEBUG_TOKENS")),
		VerifyRevoke: truthy(os.Getenv("RECAP_VERIFY_REVOKE")),
	}

	var missing []string
	if c.ClientID == "" {
		missing = append(missing, "RECAP_CHZZK_CLIENT_ID")
	}
	if c.ClientSecret == "" {
		missing = append(missing, "RECAP_CHZZK_CLIENT_SECRET")
	}
	if len(missing) > 0 {
		return nil, fmt.Errorf(
			"환경변수가 없습니다: %s (set -a; . module.secrets/project/cheese-lake/recap/local/.env; set +a)",
			strings.Join(missing, ", "))
	}

	if k := os.Getenv("RECAP_SESSION_KEY"); k != "" {
		c.SessionKey = []byte(k)
	} else {
		// 없으면 매 기동마다 새로 만든다. 재시작하면 기존 세션이 끊긴다 —
		// 로컬 확인용으로는 그편이 오히려 낫다.
		buf := make([]byte, 32)
		if _, err := rand.Read(buf); err != nil {
			return nil, fmt.Errorf("세션 키 생성 실패: %w", err)
		}
		c.SessionKey = []byte(hex.EncodeToString(buf))
		slog.Warn("RECAP_SESSION_KEY 가 없어 임시 키를 만들었습니다. 재시작하면 로그인이 풀립니다.")
	}

	return c, nil
}

func env(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func truthy(v string) bool {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "1", "true", "yes", "on":
		return true
	}
	return false
}
