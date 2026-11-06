import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { entryReward, type EntryReward } from "./eventReward";
import { TICKETS_CHANGED } from "./coupon";
import "./eventReward.css";
const shown = new Set<string>();
export function EventRewardNotice({ subject }: { subject: string | null }) {
  const [notice, setNotice] = useState<{ subject: string; reward: EntryReward } | null>(null);
  useEffect(() => {
    if (!subject || new URLSearchParams(window.location.search).has("ticket")) return;
    let alive = true;
    void entryReward(subject).then(reward => {
      if (!alive || !reward) return;
      const key = `${subject}:${reward.eventId}`;
      if (shown.has(key)) return;
      shown.add(key);
      window.dispatchEvent(new Event(TICKETS_CHANGED));
      setNotice({ subject, reward });
    });
    return () => { alive = false; };
  }, [subject]);
  if (!notice || notice.subject !== subject) return null;
  // 유효기간은 이벤트 쿠폰의 ticket_valid_days(2026.11.07 기준 모두 30일)에 맞춘 고정 문구다. 쿠폰 설정을 바꾸면 같이 고친다.
  return createPortal(<aside className="event-reward-notice" aria-label="이벤트 선물 안내">
    <div role="status"><span className="event-reward-label">{notice.reward.title}</span><strong>AI 분석 티켓 {notice.reward.quantity}장을 받았어요</strong><p>내 채팅으로 AI 요약을 받아보세요.<br />티켓 유효기간은 받은 날부터 30일이에요.</p></div>
    <a className="btn btn-default btn-sm" href={notice.reward.href}>AI 요약하러 가기</a>
    <button className="btn btn-ghost btn-icon" type="button" aria-label="이벤트 선물 안내 닫기" onClick={() => setNotice(null)}>×</button>
  </aside>, document.body);
}
