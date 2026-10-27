import { useEffect, useId, useRef, useState } from "react";
import { ChannelAvatar } from "./ChannelLink";
import type { RelationshipChannel } from "./relationship.data";
import { grantShare, SHARE_EXCLUDED, SHARE_FINE_PRINT, SHARE_INCLUDED, SHARE_UNTIL, subjectParticle, type ShareGrant } from "./relationship.share";

// 공유는 상대가 로그인하면 이 화면을 그대로 보는 것이다. 처리방침 제5조의 안내 항목은 모두 담되
// 표 대신 짧은 문장으로 쓴다. 동의 체크는 꺼진 채 시작하고 취소는 승인과 같은 무게로 둔다.
export function RelationshipShareDialog({ open, channel, onClose, onGranted }: { open: boolean; channel: RelationshipChannel; onClose: () => void; onGranted: (share: ShareGrant) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  const [consented, setConsented] = useState(false);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) { setConsented(false); setNotice(null); setPending(false); element.showModal(); }
    if (!open && element.open) element.close();
  }, [open]);
  const name = channel.channelName || "이 채널";
  const submit = () => {
    if (!consented || pending) return;
    setPending(true); setNotice(null);
    grantShare(channel.channelId)
      .then(share => { setPending(false); onGranted(share); })
      .catch(() => { setPending(false); setNotice("지금은 설정하지 못했어요. 잠시 뒤에 다시 시도해 주세요."); });
  };
  return <dialog ref={dialog} className="relationship-share-dialog" aria-labelledby={`${id}-title`} onClose={onClose} onClick={event => { if (event.target === dialog.current) onClose(); }}>
    <form className="relationship-share-panel" method="dialog" aria-busy={pending} onSubmit={event => { event.preventDefault(); submit(); }}>
      <header className="relationship-share-head">
        <div className="relationship-share-recipient">
          <ChannelAvatar channel={channel} />
          <div><h2 id={`${id}-title`}>{name}에게 내 기록 보여 주기</h2><p>{name}{subjectParticle(name)} 리캡에 로그인하면 지금 보고 있는 이 화면을 그대로 볼 수 있어요.</p></div>
        </div>
        <button className="btn btn-ghost btn-sm btn-icon" type="button" onClick={onClose} aria-label="닫기">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
      </header>
      <div className="relationship-share-body">
        <div className="relationship-share-note">
          <h3>전해지는 것</h3>
          <ul>{SHARE_INCLUDED.map(item => <li key={item}>{item}</li>)}</ul>
          <p>{SHARE_EXCLUDED}</p>
        </div>
        <div className="relationship-share-note">
          <h3>언제까지</h3>
          <p>{SHARE_UNTIL} 주소만으로는 열리지 않고, {name}도 치지직 로그인을 거쳐야 해요.</p>
        </div>
        <p className="relationship-share-fine">{SHARE_FINE_PRINT}</p>
        <label className="check-row relationship-share-consent">
          <input className="checkbox" type="checkbox" checked={consented} disabled={pending} onChange={event => setConsented(event.target.checked)} />
          <span>{name}에게 위 내용을 보여 주는 데 동의해요 <span className="hint">(선택)</span></span>
        </label>
      </div>
      {notice && <p className="relationship-share-notice" role="alert">{notice}</p>}
      <div className="relationship-share-actions">
        <button className="btn btn-default" type="submit" disabled={!consented || pending}>{pending ? "설정하는 중" : "보여 주기"}</button>
        <button className="btn btn-outline" type="button" disabled={pending} onClick={onClose}>다음에</button>
      </div>
    </form>
  </dialog>;
}
