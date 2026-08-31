package main

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
)

const (
	stateCookie   = "recap_oauth_state"
	sessionCookie = "recap_session"

	stateTTL   = 10 * time.Minute
	sessionTTL = 12 * time.Hour
)

var b64 = base64.RawURLEncoding

// sign 은 payload 에 서명을 붙인다. 형식은 "<payload>.<sig>" 다.
func sign(key []byte, payload string) string {
	m := hmac.New(sha256.New, key)
	m.Write([]byte(payload))
	return payload + "." + b64.EncodeToString(m.Sum(nil))
}

// unsign 은 서명을 검증하고 payload 를 돌려준다.
func unsign(key []byte, token string) (string, error) {
	i := strings.LastIndex(token, ".")
	if i < 0 {
		return "", errors.New("서명이 없습니다")
	}
	payload, got := token[:i], token[i+1:]

	m := hmac.New(sha256.New, key)
	m.Write([]byte(payload))
	want := b64.EncodeToString(m.Sum(nil))

	if !hmac.Equal([]byte(got), []byte(want)) {
		return "", errors.New("서명이 맞지 않습니다")
	}
	return payload, nil
}

// ── state ────────────────────────────────────────────────────
//
// PKCE 가 없으므로 state 가 CSRF 방어의 전부다.
// 서버에 저장하지 않고 쿠키에 같은 값을 심어 콜백에서 대조한다(double submit).
// 한 번 쓰면 쿠키를 지워 재사용을 막는다.

func newState(key []byte) (string, error) {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	payload := fmt.Sprintf("%s:%d", hex.EncodeToString(buf), time.Now().Add(stateTTL).Unix())
	return sign(key, payload), nil
}

func verifyState(key []byte, fromCookie, fromQuery string) error {
	if fromCookie == "" {
		return errors.New("state 쿠키가 없습니다 — 인가 요청을 다시 시작하십시오")
	}
	if fromQuery == "" {
		return errors.New("콜백에 state 가 없습니다")
	}
	if !hmac.Equal([]byte(fromCookie), []byte(fromQuery)) {
		return errors.New("state 가 일치하지 않습니다")
	}

	payload, err := unsign(key, fromQuery)
	if err != nil {
		return fmt.Errorf("state %w", err)
	}
	_, expStr, ok := strings.Cut(payload, ":")
	if !ok {
		return errors.New("state 형식이 잘못되었습니다")
	}
	exp, err := strconv.ParseInt(expStr, 10, 64)
	if err != nil {
		return errors.New("state 만료 시각을 읽을 수 없습니다")
	}
	if time.Now().Unix() > exp {
		return errors.New("state 가 만료되었습니다")
	}
	return nil
}

// ── 세션 ─────────────────────────────────────────────────────
//
// 담는 것은 channelId 와 표시용 channelName 뿐이다. 토큰은 넣지 않는다.

type Session struct {
	ChannelID   string
	ChannelName string
	ExpiresAt   time.Time
}

func issueSession(key []byte, u *User) string {
	exp := time.Now().Add(sessionTTL).Unix()
	payload := fmt.Sprintf("%s|%s|%d",
		b64.EncodeToString([]byte(u.ChannelID)),
		b64.EncodeToString([]byte(u.ChannelName)),
		exp)
	return sign(key, payload)
}

func readSession(key []byte, token string) (*Session, error) {
	payload, err := unsign(key, token)
	if err != nil {
		return nil, err
	}
	parts := strings.Split(payload, "|")
	if len(parts) != 3 {
		return nil, errors.New("세션 형식이 잘못되었습니다")
	}
	id, err := b64.DecodeString(parts[0])
	if err != nil {
		return nil, err
	}
	name, err := b64.DecodeString(parts[1])
	if err != nil {
		return nil, err
	}
	exp, err := strconv.ParseInt(parts[2], 10, 64)
	if err != nil {
		return nil, err
	}
	if time.Now().Unix() > exp {
		return nil, errors.New("세션이 만료되었습니다")
	}
	return &Session{
		ChannelID:   string(id),
		ChannelName: string(name),
		ExpiresAt:   time.Unix(exp, 0),
	}, nil
}

// ── 쿠키 ─────────────────────────────────────────────────────

// setCookie 는 Secure 를 붙이지 않는다. 로컬이 http 라 붙이면 저장되지 않는다.
// 배포 시에는 반드시 켜야 한다.
func setCookie(w http.ResponseWriter, name, value string, ttl time.Duration) {
	//nolint:gosec // G124: Secure 는 배포 환경에서 켠다 (위 주석). 변수로 넣어도 gosec 은 리터럴만 인정한다.
	http.SetCookie(w, &http.Cookie{
		Name:     name,
		Value:    value,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   int(ttl.Seconds()),
	})
}

func clearCookie(w http.ResponseWriter, name string) {
	//nolint:gosec // G124: 같은 이유. 삭제용 쿠키라 값도 비어 있다.
	http.SetCookie(w, &http.Cookie{
		Name:     name,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
	})
}

func cookieValue(r *http.Request, name string) string {
	c, err := r.Cookie(name)
	if err != nil {
		return ""
	}
	return c.Value
}
