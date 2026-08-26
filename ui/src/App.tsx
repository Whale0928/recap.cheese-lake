import { useEffect, useMemo, useState } from "react";

type Theme = "light" | "dark";

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

function YearTexture() {
  const cells = useMemo(
    () => Array.from({ length: 371 }, (_, index) => activityPattern[index % activityPattern.length]),
    []
  );

  return (
    <div className="year-texture" aria-label="한 해 동안 날짜별 채팅 수를 나타내는 예시 히트맵">
      <div className="year-spine" aria-hidden="true">
        <span>CHZZK RECAP</span>
        <strong>2026</strong>
      </div>
      <div className="year-content">
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
          <span>1월</span><span>4월</span><span>7월</span><span>10월</span><span>12월</span>
        </div>
        <p className="texture-caption">일별 채팅 수를 보여줍니다.</p>
      </div>
    </div>
  );
}

function App() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(theme);
    try {
      window.localStorage.setItem("recap.theme", theme);
    } catch {
      // 저장소가 차단되어도 현재 화면의 테마 전환은 유지한다.
    }
  }, [theme]);

  return (
    <>
      <a className="skip-link" href="#main">본문으로 건너뛰기</a>

      <header className="site-header">
        <a className="wordmark" href="/" aria-label="recap 홈">
          <span className="wordmark-mark" aria-hidden="true">r</span>
          <span>recap</span>
        </a>
        <nav className="site-nav" aria-label="주요 메뉴">
          <a href="#preview">리캡 예시</a>
          <a className="btn btn-outline btn-sm" href="/auth/login">내 리캡 보기</a>
          <ThemeButton theme={theme} onToggle={() => setTheme(theme === "dark" ? "light" : "dark")} />
        </nav>
      </header>

      <main id="main">
        <section className="hero">
          <div className="hero-copy">
            <p className="hero-eyebrow">2026 CHZZK RECAP</p>
            <h1>올해, 어디서 제일 많이<br /><em>채팅했을까.</em></h1>
            <p className="hero-description">
              자주 찾은 채널부터 많이 채팅한 시간대까지.<br className="desktop-break" />
              올해 치지직 활동을 한 번에 봅니다.
            </p>
            <div className="hero-actions">
              <a className="btn btn-default btn-lg" href="/auth/login">
                내 리캡 보기 <span aria-hidden="true">→</span>
              </a>
              <a className="text-link" href="#preview">리캡 예시 보기</a>
            </div>
            <p className="hero-footnote">* 치지직 공개 채팅을 바탕으로 만든 채팅 리캡입니다. 시청 기록은 포함하지 않습니다.</p>
          </div>

          <YearTexture />
        </section>

        <section className="principles" id="how" aria-labelledby="principles-title">
          <div className="section-heading">
            <p className="section-kicker">이용 방법</p>
            <h2 id="principles-title">로그인 한 번,<br />바로 확인.</h2>
          </div>
          <div className="principle-list">
            <article>
              <span className="principle-mark" aria-hidden="true">↗</span>
              <div><h3>치지직 로그인</h3><p>새 계정 없이 치지직으로 로그인합니다.</p></div>
            </article>
            <article>
              <span className="principle-mark" aria-hidden="true">○</span>
              <div><h3>내 리캡</h3><p>채널별 채팅 기록은 로그인한 본인만 볼 수 있습니다.</p></div>
            </article>
            <article>
              <span className="principle-mark" aria-hidden="true">⌁</span>
              <div><h3>토큰 폐기</h3><p>본인 확인이 끝나면 접근 토큰을 바로 폐기합니다.</p></div>
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
          <p className="section-kicker">2026 RECAP</p>
          <h2>올해 채팅 기록을<br />한 번에 봅니다.</h2>
          <a className="btn btn-default btn-lg" href="/auth/login">내 리캡 보기 <span aria-hidden="true">→</span></a>
        </section>
      </main>

      <footer className="site-footer">
        <div className="wordmark footer-wordmark"><span className="wordmark-mark" aria-hidden="true">r</span><span>recap</span></div>
        <p>치지직 및 네이버와 제휴·후원·연계 관계가 없는 비공식 서비스입니다.</p>
        <p>© 2026 recap.cheese-lake</p>
      </footer>
    </>
  );
}

export { App };
