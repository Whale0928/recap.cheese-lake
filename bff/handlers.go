package main

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

type Server struct {
	cfg   *Config
	chzzk *Chzzk
	uiDir string

	mu   sync.Mutex
	last *LoginResult // 마지막 로그인 결과. 로컬 확인용이라 하나만 들고 있는다.
}

// LoginResult 는 화면에 그대로 뿌리기 위한 것이다.
// ADR-0003 대로 토큰은 폐기하지만, 무엇을 받았는지는 보여 준다.
type LoginResult struct {
	At    time.Time `json:"at"`
	OK    bool      `json:"ok"`
	Error string    `json:"error,omitempty"`

	User *User `json:"user,omitempty"`

	TokenType string `json:"tokenType,omitempty"`
	ExpiresIn int64  `json:"expiresIn,omitempty"`
	Scope     string `json:"scope,omitempty"`

	AccessTokenPreview  string `json:"accessTokenPreview,omitempty"`
	RefreshTokenPreview string `json:"refreshTokenPreview,omitempty"`

	// RECAP_DEBUG_TOKENS 가 켜졌을 때만 채운다.
	AccessToken  string `json:"accessToken,omitempty"`
	RefreshToken string `json:"refreshToken,omitempty"`

	Revoked        bool   `json:"revoked"`
	RevokeVerified bool   `json:"revokeVerified"`
	RevokeSettleMS int64  `json:"revokeSettleMs,omitempty"`
	RevokeError    string `json:"revokeError,omitempty"`

	Trace *Trace `json:"trace,omitempty"`
}

func NewServer(cfg *Config, uiDir string) *Server {
	return &Server{cfg: cfg, chzzk: NewChzzk(cfg), uiDir: uiDir}
}

func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /auth/login", s.login)
	mux.HandleFunc("GET /auth/callback", s.callback)
	mux.HandleFunc("POST /auth/logout", s.logout)
	mux.HandleFunc("GET /api/session", s.session)
	mux.HandleFunc("GET /api/lives", s.lives)
	mux.HandleFunc("GET /robots.txt", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/plain")
		_, _ = w.Write([]byte("User-agent: *\nDisallow: /\n"))
	})
	mux.Handle("GET /", http.FileServer(http.Dir(s.uiDir)))
	return logging(mux)
}

// ── 1~2단계: state 를 만들고 치지직으로 보낸다 ──────────────────

func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	state, err := newState(s.cfg.SessionKey)
	if err != nil {
		http.Error(w, "state 생성 실패: "+err.Error(), http.StatusInternalServerError)
		return
	}
	setCookie(w, stateCookie, state, stateTTL)

	dest := s.chzzk.AuthorizeURL(state)
	slog.Info("인가 요청으로 보냅니다", "url", dest)
	http.Redirect(w, r, dest, http.StatusFound)
}

// ── 4~8단계: 콜백에서 나머지를 전부 수행한다 ────────────────────

func (s *Server) callback(w http.ResponseWriter, r *http.Request) {
	tr := NewTrace()
	res := &LoginResult{At: time.Now(), Trace: tr}

	defer func() {
		s.mu.Lock()
		s.last = res
		s.mu.Unlock()
		http.Redirect(w, r, "/", http.StatusFound)
	}()

	// state 는 한 번 쓰면 버린다.
	stateFromCookie := cookieValue(r, stateCookie)
	clearCookie(w, stateCookie)

	q := r.URL.Query()

	// 동의 거부 시 무엇이 오는지 문서에 없다. 있는 그대로 남긴다.
	if code := q.Get("code"); code == "" {
		res.Error = "콜백에 code 가 없습니다. 쿼리: " + r.URL.RawQuery
		tr.Fail("콜백 수신", "GET", r.URL.Path, 0, 0, res.Error)
		return
	}
	tr.OK("콜백 수신", "GET", r.URL.Path+"?"+r.URL.RawQuery, 200, 0)

	if err := verifyState(s.cfg.SessionKey, stateFromCookie, q.Get("state")); err != nil {
		res.Error = err.Error()
		tr.Fail("state 검증", "", "", 0, 0, err.Error())
		return
	}
	tr.Note("state 검증 통과 — 쿠키와 일치하고 만료되지 않았습니다")

	ctx := r.Context()

	tok, err := s.chzzk.ExchangeCode(ctx, tr, q.Get("code"), q.Get("state"))
	if err != nil {
		res.Error = "토큰 교환 실패: " + err.Error()
		return
	}

	res.TokenType = tok.TokenType
	res.ExpiresIn = int64(tok.ExpiresIn)
	res.Scope = tok.Scope
	res.AccessTokenPreview = preview(tok.AccessToken)
	res.RefreshTokenPreview = preview(tok.RefreshToken)
	if s.cfg.DebugTokens {
		res.AccessToken = tok.AccessToken
		res.RefreshToken = tok.RefreshToken
	}

	user, err := s.chzzk.Me(ctx, tr, tok.AccessToken)
	if err != nil {
		res.Error = "본인 확인 실패: " + err.Error()
		s.revoke(ctx, tr, res, tok)
		return
	}
	res.User = user

	// 확인이 끝났으므로 즉시 폐기한다 (ADR-0003).
	s.revoke(ctx, tr, res, tok)

	setCookie(w, sessionCookie, issueSession(s.cfg.SessionKey, user), sessionTTL)
	tr.Note("세션 쿠키 발급 — channelId 와 channelName 만 담았습니다")
	res.OK = true
}

func (s *Server) revoke(ctx context.Context, tr *Trace, res *LoginResult, tok *Token) {
	if err := s.chzzk.Revoke(ctx, tr, tok.AccessToken, "access_token"); err != nil {
		res.RevokeError = err.Error()
		return
	}
	res.Revoked = true
	revokedAt := time.Now()

	// 폐기가 200 을 줘도 토큰이 그 순간 죽지는 않는다. 실측하면 반영이 1초 안일 때도,
	// 8초가 걸릴 때도 있다 — 노드별 캐시로 보인다. 그래서 로그인 응답을 여기에 묶지 않는다.
	// ADR-0003 이 보장하는 것은 "즉시 폐기를 요청한다" 까지이고, 읽는 쪽 반영은 치지직 사정이다.
	//
	// 정말 죽는지 보고 싶을 때만 RECAP_VERIFY_REVOKE=1 로 켠다. 최대 15초를 붙잡는다.
	if !s.cfg.VerifyRevoke {
		return
	}
	deadline := time.Now().Add(15 * time.Second)
	for attempt := 1; ; attempt++ {
		if _, err := s.chzzk.Me(ctx, tr, tok.AccessToken); err != nil {
			elapsed := time.Since(revokedAt).Round(100 * time.Millisecond)
			tr.Note("폐기 확인 — " + elapsed.String() + " 뒤 거절당했습니다 (시도 " +
				strconv.Itoa(attempt) + "회)")
			res.RevokeVerified = true
			res.RevokeSettleMS = elapsed.Milliseconds()
			return
		}
		if time.Now().After(deadline) {
			tr.Note("15초를 기다려도 같은 토큰이 먹힙니다")
			return
		}
		time.Sleep(500 * time.Millisecond)
	}
}

// ── 조회 ─────────────────────────────────────────────────────

func (s *Server) session(w http.ResponseWriter, r *http.Request) {
	out := map[string]any{"loggedIn": false}

	if v := cookieValue(r, sessionCookie); v != "" {
		if sess, err := readSession(s.cfg.SessionKey, v); err == nil {
			out["loggedIn"] = true
			out["session"] = map[string]any{
				"channelId":   sess.ChannelID,
				"channelName": sess.ChannelName,
				"expiresAt":   sess.ExpiresAt,
			}
		} else {
			out["sessionError"] = err.Error()
		}
	}

	s.mu.Lock()
	out["lastLogin"] = s.last
	s.mu.Unlock()

	out["config"] = map[string]any{
		"redirectUri": s.cfg.RedirectURI,
		"clientId":    preview(s.cfg.ClientID),
		"debugTokens": s.cfg.DebugTokens,
	}

	writeJSON(w, http.StatusOK, out)
}

func (s *Server) logout(w http.ResponseWriter, r *http.Request) {
	clearCookie(w, sessionCookie)
	s.mu.Lock()
	s.last = nil
	s.mu.Unlock()
	writeJSON(w, http.StatusOK, map[string]any{"loggedIn": false})
}

// lives 는 Client 인증만으로 되는지 확인하는 버튼이다.
// Scope 목록에 대응 항목이 없어 미검증으로 남아 있던 항목이다.
func (s *Server) lives(w http.ResponseWriter, r *http.Request) {
	tr := NewTrace()
	raw, err := s.chzzk.Lives(r.Context(), tr, 3)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{"ok": false, "error": err.Error(), "trace": tr})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "content": raw, "trace": tr})
}

// ── 거들기 ───────────────────────────────────────────────────

func preview(v string) string {
	if v == "" {
		return ""
	}
	if len(v) <= 8 {
		return "…"
	}
	return v[:8] + "…(" + strconv.Itoa(len(v)) + "자)"
}

// safeForLog 는 로그 한 줄을 위조할 수 있는 문자를 걷어낸다.
func safeForLog(v string) string {
	if len(v) > 256 {
		v = v[:256]
	}
	return strings.Map(func(r rune) rune {
		if r < 0x20 || r == 0x7f {
			return -1
		}
		return r
	}, v)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	_ = enc.Encode(v)
}

func logging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		started := time.Now()
		next.ServeHTTP(w, r)
		// 접속 IP 는 남기지 않는다 (ADR-0003).
		// 경로는 사용자가 정하므로 개행이 섞이면 로그 한 줄이 위조된다. 걸러서 넣는다.
		//nolint:gosec // G706: safeForLog 가 제어문자를 제거한다
		slog.Info("요청", "method", r.Method, "path", safeForLog(r.URL.Path), "소요ms", time.Since(started).Milliseconds())
	})
}
