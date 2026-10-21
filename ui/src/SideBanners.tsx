const noticeUrl = 'https://game.naver.com/lounge/chzzk/board/detail/8298140';

export function SideBanners() {
  return (
    <>
      {(['left', 'right'] as const).map((side) => (
        <aside
          key={side}
          className={`side-banner side-banner-${side}`}
          aria-label={`${side === 'left' ? '왼쪽' : '오른쪽'} 치지직 같이보기 안내`}
        >
          <a className="notice-banner" href={noticeUrl} target="_blank" rel="noopener noreferrer" aria-label="소년탐정 김전일 2기 같이보기 공식 공지 (새 창)">
            <span className="notice-source">치지직 같이보기</span>
            <div className="notice-art" aria-hidden="true">
              <img src="/images/kindaichi_notice.png" alt="" width="1500" height="5223" />
            </div>
            <div className="notice-copy">
              <h2>소년탐정 김전일 <span>2기</span></h2>
              <p>이번엔 치지직에서<br />같이 추리해 볼까요.</p>
            </div>
            <div className="notice-schedule">
              <span>같이보기 기간</span>
              <p><time dateTime="2026-10-16T19:00:00+09:00">10.16</time> ~ <time dateTime="2026-11-07T19:00:00+09:00">11.07</time></p>
              <span>시작일·종료일 모두 19시 기준</span>
            </div>
            <span className="notice-link">공식 공지 보기</span>
          </a>
        </aside>
      ))}
    </>
  );
}
