package main

import (
	"log/slog"
	"sync"
	"time"
)

// Trace 는 한 번의 로그인에서 오간 호출을 순서대로 기록한다.
// 화면에 그대로 뿌리는 것이 이 스파이크의 목적이다.
type Trace struct {
	mu    sync.Mutex
	Steps []Step `json:"steps"`
}

type Step struct {
	Seq    int    `json:"seq"`
	Label  string `json:"label"`
	Method string `json:"method,omitempty"`
	URL    string `json:"url,omitempty"`
	Status int    `json:"status,omitempty"`
	TookMS int64  `json:"tookMs,omitempty"`
	OK     bool   `json:"ok"`
	Detail string `json:"detail,omitempty"`
}

func NewTrace() *Trace { return &Trace{} }

func (t *Trace) add(s Step) {
	t.mu.Lock()
	defer t.mu.Unlock()
	s.Seq = len(t.Steps) + 1
	t.Steps = append(t.Steps, s)

	if s.OK {
		slog.Info("치지직 호출", "단계", s.Label, "상태", s.Status, "소요ms", s.TookMS)
	} else {
		slog.Error("치지직 호출 실패", "단계", s.Label, "상태", s.Status, "상세", s.Detail)
	}
}

func (t *Trace) OK(label, method, url string, status int, took time.Duration) {
	t.add(Step{Label: label, Method: method, URL: url, Status: status, TookMS: took.Milliseconds(), OK: true})
}

func (t *Trace) Fail(label, method, url string, status int, took time.Duration, detail string) {
	t.add(Step{Label: label, Method: method, URL: url, Status: status, TookMS: took.Milliseconds(), Detail: detail})
}

// Note 는 호출이 아닌 사실을 남긴다.
func (t *Trace) Note(detail string) {
	t.add(Step{Label: "메모", OK: true, Detail: detail})
}
