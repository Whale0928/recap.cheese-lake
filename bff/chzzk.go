package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// 인가 요청만 도메인이 다르다. 나머지는 모두 Open API 도메인이다.
const (
	authorizeBase = "https://chzzk.naver.com/account-interlock"
	apiBase       = "https://openapi.chzzk.naver.com"
)

type Chzzk struct {
	cfg  *Config
	http *http.Client
}

func NewChzzk(cfg *Config) *Chzzk {
	return &Chzzk{cfg: cfg, http: &http.Client{Timeout: 10 * time.Second}}
}

// AuthorizeURL 은 사용자를 보낼 주소를 만든다.
// scope 파라미터가 없는 것은 실수가 아니다 — 권한은 앱 등록 때 정해진다.
func (c *Chzzk) AuthorizeURL(state string) string {
	q := url.Values{}
	q.Set("clientId", c.cfg.ClientID)
	q.Set("redirectUri", c.cfg.RedirectURI)
	q.Set("state", state)
	return authorizeBase + "?" + q.Encode()
}

type Token struct {
	AccessToken  string  `json:"accessToken"`
	RefreshToken string  `json:"refreshToken"`
	TokenType    string  `json:"tokenType"`
	ExpiresIn    flexInt `json:"expiresIn"`
	Scope        string  `json:"scope,omitempty"`
}

type User struct {
	ChannelID   string `json:"channelId"`
	ChannelName string `json:"channelName"`
}

// flexInt 는 숫자로도 문자열로도 오는 값을 받는다.
// 문서상 expiresIn 의 타입이 String("86400") 이라 int 로 선언하면 깨진다.
type flexInt int64

func (f *flexInt) UnmarshalJSON(b []byte) error {
	s := strings.Trim(string(b), `"`)
	if s == "" || s == "null" {
		return nil
	}
	n, err := strconv.ParseInt(s, 10, 64)
	if err != nil {
		return fmt.Errorf("정수로 읽을 수 없습니다: %s", s)
	}
	*f = flexInt(n)
	return nil
}

// envelope 는 공통 응답 구조다. HTTP 가 200 이어도 code 가 200 이 아닐 수 있다.
type envelope struct {
	Code    json.Number     `json:"code"`
	Message *string         `json:"message"`
	Content json.RawMessage `json:"content"`
}

// ExchangeCode 는 인가 코드를 토큰으로 바꾼다.
//
// 문서에 Content-Type 이 없어 둘 다 찔러 본 결과 JSON 이 맞다 —
// JSON 은 본문을 읽고 코드를 거절했고(403 "잘못된 인증 코드 입니다"),
// form 은 본문을 읽지 못해 400 "잘못된 값을 입력했습니다" 가 났다.
// form 은 만약을 위한 대비로 남겨 둔다. 어느 쪽이 통했는지는 trace 에 남는다.
func (c *Chzzk) ExchangeCode(ctx context.Context, tr *Trace, code, state string) (*Token, error) {
	body := map[string]string{
		"grantType":    "authorization_code",
		"clientId":     c.cfg.ClientID,
		"clientSecret": c.cfg.ClientSecret,
		"code":         code,
		"state":        state,
	}

	var tok Token
	err := c.post(ctx, tr, "토큰 교환 (JSON)", "/auth/v1/token", body, encJSON, &tok)
	if err == nil {
		return &tok, nil
	}
	jsonErr := err

	tr.Note("JSON 이 거절당해 form 으로 재시도합니다")
	if err := c.post(ctx, tr, "토큰 교환 (form)", "/auth/v1/token", body, encForm, &tok); err != nil {
		return nil, fmt.Errorf("JSON: %w / form: %w", jsonErr, err)
	}
	return &tok, nil
}

// Me 는 본인 확인이다. 응답은 channelId 와 channelName 둘뿐이다.
func (c *Chzzk) Me(ctx context.Context, tr *Trace, accessToken string) (*User, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, apiBase+"/open/v1/users/me", nil)
	if err != nil {
		return nil, err
	}
	// Bearer 와 토큰 사이 공백을 빠뜨리면 실패한다고 문서가 따로 경고한다.
	req.Header.Set("Authorization", "Bearer "+accessToken)

	var u User
	if err := c.do(ctx, tr, "본인 확인", req, &u); err != nil {
		return nil, err
	}
	return &u, nil
}

// Revoke 는 토큰을 폐기한다.
// 같은 clientId 와 사용자로 발급된 모든 토큰이 함께 제거된다.
func (c *Chzzk) Revoke(ctx context.Context, tr *Trace, token, hint string) error {
	body := map[string]string{
		"clientId":      c.cfg.ClientID,
		"clientSecret":  c.cfg.ClientSecret,
		"token":         token,
		"tokenTypeHint": hint,
	}
	return c.post(ctx, tr, "토큰 폐기 ("+hint+")", "/auth/v1/token/revoke", body, encJSON, nil)
}

// Lives 는 Client 인증만으로 호출된다. Scope 없이 되는지 확인하는 용도다.
func (c *Chzzk) Lives(ctx context.Context, tr *Trace, size int) (json.RawMessage, error) {
	u := fmt.Sprintf("%s/open/v1/lives?size=%d", apiBase, size)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Client-Id", c.cfg.ClientID)
	req.Header.Set("Client-Secret", c.cfg.ClientSecret)

	var raw json.RawMessage
	if err := c.do(ctx, tr, "라이브 목록 (Client 인증)", req, &raw); err != nil {
		return nil, err
	}
	return raw, nil
}

// ── 전송 ──────────────────────────────────────────────────────

type encoding int

const (
	encJSON encoding = iota
	encForm
)

func (c *Chzzk) post(ctx context.Context, tr *Trace, label, path string, body map[string]string, enc encoding, out any) error {
	var (
		reader io.Reader
		ctype  string
	)
	switch enc {
	case encForm:
		form := url.Values{}
		for k, v := range body {
			form.Set(k, v)
		}
		reader, ctype = strings.NewReader(form.Encode()), "application/x-www-form-urlencoded"
	default:
		buf, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reader, ctype = bytes.NewReader(buf), "application/json"
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, apiBase+path, reader)
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", ctype)
	return c.do(ctx, tr, label, req, out)
}

// allowedHosts 는 이 클라이언트가 붙어도 되는 곳 전부다.
// URL 을 상수에서만 만들더라도, 나가는 문을 한 군데서 막아 두는 편이 안전하다.
var allowedHosts = map[string]bool{
	"openapi.chzzk.naver.com": true,
	"chzzk.naver.com":         true,
}

func (c *Chzzk) do(ctx context.Context, tr *Trace, label string, req *http.Request, out any) error {
	if !allowedHosts[req.URL.Hostname()] {
		err := fmt.Errorf("허용되지 않은 호스트입니다: %s", req.URL.Hostname())
		tr.Fail(label, req.Method, req.URL.String(), 0, 0, err.Error())
		return err
	}

	started := time.Now()
	// 나갈 수 있는 호스트를 위에서 이미 화이트리스트로 막았다.
	// gosec 의 taint 분석은 그 검사를 알아보지 못한다.
	resp, err := c.http.Do(req) //nolint:gosec // G704: allowedHosts 로 검증 완료
	if err != nil {
		tr.Fail(label, req.Method, req.URL.String(), 0, time.Since(started), err.Error())
		return err
	}
	defer func() { _ = resp.Body.Close() }()

	raw, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		tr.Fail(label, req.Method, req.URL.String(), resp.StatusCode, time.Since(started), err.Error())
		return err
	}
	took := time.Since(started)

	// 공통 봉투를 먼저 시도한다. 토큰 엔드포인트가 봉투를 쓰는지 문서에 없어서,
	// content 가 없으면 본문 자체를 결과로 본다.
	var env envelope
	payload := raw
	if json.Unmarshal(raw, &env) == nil && env.Code != "" {
		if env.Code.String() != "200" {
			msg := ""
			if env.Message != nil {
				msg = *env.Message
			}
			detail := fmt.Sprintf("code=%s message=%s", env.Code, msg)
			tr.Fail(label, req.Method, req.URL.String(), resp.StatusCode, took, detail)
			return fmt.Errorf("%s: %s", label, detail)
		}
		if len(env.Content) > 0 && string(env.Content) != "null" {
			payload = env.Content
		}
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		detail := strings.TrimSpace(string(raw))
		if len(detail) > 300 {
			detail = detail[:300] + "…"
		}
		tr.Fail(label, req.Method, req.URL.String(), resp.StatusCode, took, detail)
		return fmt.Errorf("%s: HTTP %d %s", label, resp.StatusCode, detail)
	}

	tr.OK(label, req.Method, req.URL.String(), resp.StatusCode, took)

	if out == nil {
		return nil
	}
	if err := json.Unmarshal(payload, out); err != nil {
		return fmt.Errorf("%s: 응답을 읽지 못했습니다: %w", label, err)
	}
	return nil
}
