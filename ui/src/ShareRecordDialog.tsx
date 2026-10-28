import { useEffect, useRef } from "react";
import type { ReceivedShare } from "./relationship.share";
import { SharedRecord } from "./SharedRecordView";
import { ShareAvatar } from "./ShareAvatar";
import { shareName } from "./sharedViews";

// 시청자를 누르면 페이지를 옮기지 않고 그 시청자가 보여 준 기록을 모달로 띄운다. 닫으면 눌렀던 요소로 포커스가 돌아온다.
export function ShareRecordDialog({ share, onClose }: { share: ReceivedShare | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    if (share && !dialog.open) dialog.showModal();
    if (!share && dialog.open) dialog.close();
    if (!share) return;
    // 모달이 열린 동안 뒤 화면이 같이 스크롤되지 않게 한다.
    const root = document.documentElement, before = root.style.overflow;
    root.style.overflow = "hidden";
    return () => { root.style.overflow = before; };
  }, [share]);
  return <dialog ref={ref} className="share-record-dialog" aria-labelledby="share-record-title" onClose={onClose} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    {share && <>
      <div className="share-record-head">
        <div className="share-record-who"><span className="share-record-avatar"><ShareAvatar share={share} px={44} large /></span><div><span className="me-source">나에게 보여 준 기록</span><h2 id="share-record-title">{shareName(share)}</h2></div></div>
        <button className="btn btn-outline btn-icon" type="button" aria-label="닫기" onClick={onClose}>
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" /></svg>
        </button>
      </div>
      <div className="share-record-body"><SharedRecord key={share.ownerChannelId} owner={share.ownerChannelId} /></div>
    </>}
  </dialog>;
}
