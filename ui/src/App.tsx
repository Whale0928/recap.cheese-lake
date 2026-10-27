import { RecapPage } from "./RecapPage";
import { RelationshipPage } from "./RelationshipPage";
import { SharedRecordPage } from "./SharedRecordPage";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import privacyPolicy from "../legal/개인정보 처리방침.md?raw";
import termsOfService from "../legal/이용약관.md?raw";
import { LegalDocument } from "./LegalDocument";
import { MePage } from "./MePage";
import { BottomBanner, SideBanners } from "./Banners";
import { ContactDialog } from "./ContactDialog";
import { AccessBlocked, PrivacyDialog, type AccessRestriction } from "./PrivacyControls";
import { CollectionOverview } from "./CollectionOverview";

type Theme = "light" | "dark";
type AuthState = "loading" | "guest" | "authenticated";

type SessionResponse = {
  loggedIn?: boolean;
  localLoginAvailable?: boolean;
  restriction?: AccessRestriction;
};

const activityPattern = [
  0, 0, 1, 2, 1, 0, 0, 0, 1, 3, 2, 1, 0, 0, 2, 3, 4, 2, 1, 0, 0, 1, 2, 4, 3, 2, 0, 0,
  0, 1, 2, 1, 0, 0, 0, 2, 4, 3, 2, 1, 0, 0, 1, 3, 4, 4, 2, 1, 0, 0, 2, 3, 2, 1, 0, 0
];

const previewRanks = [
  { label: "채널 A", value: "3,204", width: "100%" },
  { label: "채널 B", value: "2,118", width: "66%" },
  { label: "채널 C", value: "1,540", width: "48%" }
];

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  try {
    const saved = window.localStorage.getItem("recap.theme");
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // 저장소가 차단된 브라우저에서는 시스템 테마만 따른다.
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function ThemeButton({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  return (
    <button className="theme-button" type="button" onClick={onToggle} aria-label={`${theme === "dark" ? "라이트" : "다크"} 테마로 전환`}>
      <span aria-hidden="true">{theme === "dark" ? "☼" : "◐"}</span>
    </button>
  );
}

function Wordmark({ footer = false }: { footer?: boolean }) {
  return (
    <a className={`wordmark${footer ? " footer-wordmark" : ""}`} href="/" aria-label="recap 홈">
      <img className="wordmark-mark" src="/icon.svg?v=recap1" width="28" height="28" alt="" aria-hidden="true" />
      <span>recap</span>
    </a>
  );
}

function SiteFooter({ onContact, onPrivacy }: { onContact?: () => void; onPrivacy?: () => void }) {
  return (
    <footer className="site-footer">
      <Wordmark footer />
      <div className="footer-content">
        <nav className="footer-links" aria-label="법적 고지">
          <a href="/privacy/">개인정보 처리방침</a>
          <a href="/terms/">이용약관</a>
          {onPrivacy && <button type="button" onClick={onPrivacy} aria-haspopup="dialog">이용 설정</button>}
          {onContact && <button type="button" onClick={onContact} aria-haspopup="dialog">문의하기</button>}
        </nav>
        <p>치지직 및 네이버와 제휴·후원·연계 관계가 없는 비공식 서비스입니다.</p>
        <p>© 2026 recap.cheese-lake</p>
      </div>
    </footer>
  );
}

function AuthButtons({ authState, compact = false }: { authState: AuthState; compact?: boolean }) {
  const size = compact ? "btn-sm" : "btn-lg";
  const appearance = compact ? "btn-outline header-recap-button" : "btn-default";
  if (authState === "loading") return <button className={`btn ${appearance} ${size}`} type="button" disabled>내 리캡 보기</button>;
  return <a className={`btn ${appearance} ${size}`} href={authState === "authenticated" ? "/recap/" : "/auth/login"}>내 리캡 보기</a>;
}

function ActivityTexture() {
  const cells = useMemo(
    () => Array.from({ length: 112 }, (_, index) => activityPattern[index % activityPattern.length]),
    []
  );

  return (
    <div className="activity-texture" aria-label="최근 날짜별 채팅 수를 나타내는 예시 히트맵">
      <div className="activity-spine" aria-hidden="true">
        <span>CHAT RECAP</span>
        <strong>RECENT</strong>
      </div>
      <div className="activity-content">
        <div className="preview-label">
          <span className="badge badge-secondary">화면 예시</span>
          <span>날짜별 채팅 수</span>
        </div>
        <div className="heat" aria-hidden="true">
          <div className="heat-grid hero-heat">
            {cells.map((level, index) => (
              <span className="heat-cell" data-level={level} key={index} />
            ))}
          </div>
        </div>
        <div className="month-axis" aria-hidden="true">
          <span>5월</span><span>6월</span><span>7월</span><span>8월</span>
        </div>
        <p className="texture-caption">일별 채팅 수를 보여줍니다.</p>
      </div>
    </div>
  );
}

function App() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [authState, setAuthState] = useState<AuthState>("loading");
  const [localLoginAvailable, setLocalLoginAvailable] = useState(false);
  const [restriction, setRestriction] = useState<AccessRestriction | null>(null);
  const [logoutPending, setLogoutPending] = useState(false);
  const [authError, setAuthError] = useState("");
  // 주소의 #contact 로도 열어 로그인 후 복귀나 외부 안내 링크에서 바로 문의할 수 있게 한다.
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(() => typeof window !== "undefined" && window.location.hash === "#contact");
  const path = typeof window === "undefined" ? "/" : window.location.pathname.replace(/\/+$/, "") || "/";

  useEffect(() => {
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(theme);
    try {
      window.localStorage.setItem("recap.theme", theme);
    } catch {
      // 저장소가 차단되어도 현재 화면의 테마 전환은 유지한다.
    }
  }, [theme]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/session", {
      headers: { Accept: "application/json" },
      credentials: "same-origin",
      signal: controller.signal
    })
      .then((response) => {
        if (!response.ok) throw new Error(`세션 확인 실패: ${response.status}`);
        return response.json() as Promise<SessionResponse>;
      })
      .then((session) => { setLocalLoginAvailable(session.localLoginAvailable === true); setRestriction(session.restriction && (session.loggedIn || session.restriction.kind === "ip_blocked") ? session.restriction : null); setAuthState(session.loggedIn ? "authenticated" : "guest"); })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setLocalLoginAvailable(false);
        setRestriction(null);
        setAuthState("guest");
      });

    return () => controller.abort();
  }, [path]);

  // 법적 문서 열람은 로그인한 이용자에 한해 접속·활동 기록에 남긴다. 기록 실패는 화면에 영향을 주지 않는다.
  useEffect(() => {
    if (authState !== "authenticated" || (path !== "/privacy" && path !== "/terms")) return;
    void fetch("/api/activity/page-views", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ page: path.slice(1) }) }).catch(() => undefined);
  }, [authState, path]);

  const logout = () => {
    setAuthError("");
    setLogoutPending(true);
    fetch("/auth/logout", { method: "POST", credentials: "same-origin" })
      .then((response) => {
        if (!response.ok) throw new Error(`로그아웃 실패: ${response.status}`);
        setRestriction(null);
        setAuthState("guest");
      })
      .catch(() => setAuthError("로그아웃하지 못했습니다. 다시 시도해 주세요."))
      .finally(() => setLogoutPending(false));
  };

  const authenticated = authState === "authenticated";

  const siteHeader = (
    <>
      <a className="skip-link" href="#main">본문으로 건너뛰기</a>
      <header className="site-header-layer">
        <div className="site-header">
          <Wordmark />
          <nav className="site-nav" aria-label="주요 메뉴">
            {!restriction && <AuthButtons authState={authState} compact />}
            {authState === "guest" && localLoginAvailable && <a className="btn btn-outline btn-sm" href="/_dev/login">채널 ID로 로그인</a>}
            {authenticated && !restriction && <a className="btn btn-outline btn-sm nav-icon-button profile-button" href="/me/" aria-label="내 정보 보기" title="내 정보 보기" aria-current={path === "/me" ? "page" : undefined}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="8" r="3.5" /><path d="M5 21v-2a7 7 0 0 1 14 0v2" /></svg>
            </a>}
            {authenticated && <button className="btn btn-outline btn-sm nav-icon-button" type="button" disabled={logoutPending} onClick={logout} aria-label={logoutPending ? "로그아웃 중" : "로그아웃"} title={logoutPending ? "로그아웃 중" : "로그아웃"} aria-busy={logoutPending}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M10 4H5v16h5M10 12h11m-4-4 4 4-4 4" /></svg>
            </button>}
            <ThemeButton theme={theme} onToggle={() => setTheme(theme === "dark" ? "light" : "dark")} />
          </nav>
        </div>
      </header>
      {authError && <p className="auth-alert" role="alert">{authError}</p>}
    </>
  );

  let page: ReactNode;
  // 지우기·수집 거부를 요청했거나 이용이 제한된 계정은 법적 문서를 뺀 모든 화면을 차단 화면으로 대신한다.
  if (restriction && path !== "/privacy" && path !== "/terms") {
    page = <AccessBlocked restriction={restriction} onContact={restriction.kind === "ip_blocked" ? undefined : () => setContactOpen(true)} />;
  } else if (path === "/me") {
    page = <MePage key={authState === "guest" ? "guest" : "session"} />;
  } else if (path === "/privacy" || path === "/terms") {
    page = <LegalDocument markdown={path === "/privacy" ? privacyPolicy : termsOfService} />;
  } else if (path === "/recap") {
    page = <RecapPage key={authState === "guest" ? "guest" : "session"} />;
  } else if (path === "/recap/channel") {
    page = <RelationshipPage authenticated={authenticated} pending={authState === "loading"} />;
  } else if (path === "/recap/shared") {
    page = <SharedRecordPage authenticated={authenticated} pending={authState === "loading"} />;
  } else {
    page = (
      <main id="main" className="home-main--observations">
        <CollectionOverview />
        <section className="hero">
          <div className="hero-copy">
            <p className="hero-eyebrow">어디서 제일 많이 채팅했을까.</p>
            <h1>치지직<br /><em>채팅 리캡</em></h1>
            <p className="hero-description">
              자주 찾은 채널부터 많이 채팅한 시간대까지.<br className="desktop-break" />
              치지직 채팅 활동을 한 번에 봅니다.
            </p>
            <div className="hero-actions">
              <AuthButtons authState={authState} />
            </div>
            <p className="hero-footnote" aria-live="polite">
              * 치지직 공개 채팅을 바탕으로 만든 채팅 리캡입니다. 시청 기록은 포함하지 않습니다.
            </p>
          </div>

          <ActivityTexture />
        </section>

        <section className="principles" id="how" aria-labelledby="principles-title">
          <div className="section-heading">
            <p className="section-kicker">{authenticated ? "로그인 상태" : "이용 방법"}</p>
            <h2 id="principles-title">{authenticated ? <>본인 확인<br />완료.</> : <>로그인 한 번,<br />바로 확인.</>}</h2>
          </div>
          <div className="principle-list">
            <article>
              <span className="principle-mark" aria-hidden="true">{authenticated ? "✓" : "↗"}</span>
              <div><h3>치지직 로그인</h3><p>{authenticated ? "치지직 계정으로 본인 확인을 마쳤습니다." : "새 계정 없이 치지직으로 로그인합니다."}</p></div>
            </article>
            <article>
              <span className="principle-mark" aria-hidden="true">○</span>
              <div>
                <h3>내 리캡</h3>
                <p>{authenticated ? "리캡에는 이 계정의 기록만 표시됩니다." : "치지직 로그인 후 본인의 채팅 기록을 확인할 수 있습니다."}</p>
              </div>
            </article>
            <article>
              <span className="principle-mark" aria-hidden="true">{authenticated ? "✓" : "⌁"}</span>
              <div><h3>토큰 폐기</h3><p>{authenticated ? "본인 확인에 쓴 접근 토큰을 폐기했습니다." : "본인 확인이 끝나면 접근 토큰을 바로 폐기합니다."}</p></div>
            </article>
          </div>
        </section>

        <section className="preview-section" id="preview" aria-labelledby="preview-title">
          <div className="preview-intro">
            <span className="badge badge-outline">화면 예시</span>
            <h2 id="preview-title">자주 찾은 채널</h2>
            <p>채널별 채팅 수와 자주 채팅한 시간대를 확인합니다.</p>
          </div>

          <div className="preview-panel card">
            <div className="card-header preview-panel-header">
              <div>
                <p className="stat-label">TOP CHANNELS</p>
                <h3 className="card-title">채팅을 많이 남긴 채널</h3>
              </div>
              <span className="badge badge-secondary">상위 3개 · 55%</span>
            </div>
            <div className="card-content">
              <ol className="rank preview-rank">
                {previewRanks.map((item, index) => (
                  <li key={item.label}>
                    <span className="rank-no">0{index + 1}</span>
                    <div>
                      <div className="rank-head"><strong>{item.label}</strong><span>{item.value}</span></div>
                      <div className="rank-bar"><i style={{ width: item.width }} /></div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
            <div className="card-footer preview-footer">
              <p>실제 리캡에는 로그인한 본인의 활동만 표시됩니다.</p>
            </div>
          </div>
        </section>

        <section className="closing">
          <p className="section-kicker">CHAT RECAP</p>
          <h2>{authenticated ? <>본인 확인을<br />마쳤습니다.</> : <>채팅 기록을<br />한 번에 봅니다.</>}</h2>
          <AuthButtons authState={authState} />
        </section>
      </main>
    );
  }

  // 약관과 처리방침은 읽는 데 방해가 없도록 배너를 붙이지 않는다.
  const showBanners = !restriction && path !== "/privacy" && path !== "/terms";
  return <>
    {siteHeader}
    {showBanners && <SideBanners theme={theme} />}
    {page}
    {showBanners && <BottomBanner theme={theme} />}
    <SiteFooter onContact={restriction?.kind === "ip_blocked" ? undefined : () => setContactOpen(true)} onPrivacy={restriction ? undefined : () => setPrivacyOpen(true)} />
    <PrivacyDialog open={privacyOpen} authState={authState} onClose={() => setPrivacyOpen(false)} />
    <ContactDialog open={contactOpen} authState={authState} onClose={() => {
      setContactOpen(false);
      if (window.location.hash === "#contact") window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }} />
  </>;
}

export { App };
