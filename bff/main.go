// recap 로그인 확인용 서버.
//
// 목적은 하나다 — 치지직 OAuth 가 실제로 도는지 눈으로 보는 것.
// ADR-0004 가 정한 Echo·Cobra·Viper 는 아직 붙이지 않았다. 지금 필요한 것이
// 표준 라이브러리로 되고, 여기서 확인한 흐름은 그대로 옮겨갈 수 있다.
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

var version = "dev"

func main() {
	slog.SetDefault(slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo})))

	cfg, err := LoadConfig()
	if err != nil {
		fmt.Fprintln(os.Stderr, "\n설정을 읽지 못했습니다.\n\n"+err.Error())
		os.Exit(1)
	}

	uiDir := env("RECAP_UI_DIR", "../ui/dist")
	if _, err := os.Stat(uiDir + "/index.html"); err != nil {
		slog.Warn("UI 를 찾지 못했습니다. RECAP_UI_DIR 을 확인하십시오.", "경로", uiDir)
	}

	srv := &http.Server{
		Addr:              cfg.Addr,
		Handler:           NewServer(cfg, uiDir).Routes(),
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		slog.Info("떴습니다", "버전", version, "주소", "http://localhost"+cfg.Addr, "콜백", cfg.RedirectURI, "UI", uiDir)
		if cfg.DebugTokens {
			slog.Warn("RECAP_DEBUG_TOKENS 가 켜져 있습니다 — 토큰 원문이 화면에 노출됩니다")
		}
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			slog.Error("서버가 죽었습니다", "오류", err)
			os.Exit(1)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		slog.Error("정리 중 오류", "오류", err)
	}
	slog.Info("내렸습니다")
}
