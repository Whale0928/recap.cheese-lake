package main

import (
	"testing"
	"time"
)

func TestSafeURLForLogRemovesSensitiveParts(t *testing.T) {
	t.Parallel()

	got := safeURLForLog("https://user:password@chzzk.naver.com/account-interlock?clientId=client&state=secret#fragment")
	want := "https://chzzk.naver.com/account-interlock"
	if got != want {
		t.Fatalf("safeURLForLog() = %q, want %q", got, want)
	}
}

func TestTraceRemovesCallbackQuery(t *testing.T) {
	t.Parallel()

	trace := NewTrace()
	trace.OK("콜백 수신", "GET", "/auth/callback?code=secret-code&state=secret-state", 200, time.Millisecond)

	if len(trace.Steps) != 1 {
		t.Fatalf("trace steps = %d, want 1", len(trace.Steps))
	}
	if got, want := trace.Steps[0].URL, "/auth/callback"; got != want {
		t.Fatalf("trace URL = %q, want %q", got, want)
	}
}
