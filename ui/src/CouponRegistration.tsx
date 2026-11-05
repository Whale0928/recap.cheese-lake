import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { couponError, redeemCoupon, TICKETS_CHANGED } from "./coupon";
import "./couponRegistration.css";

export function CouponRegistration() {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const resultPanel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const submitting = useRef(false);
  const alive = useRef(true);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [granted, setGranted] = useState(0);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { if (granted || error) resultPanel.current?.focus(); }, [granted, error]);
  const close = () => { if (!submitting.current) dialog.current?.close(); };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting.current || granted > 0 || error || !code.trim()) return;
    submitting.current = true;
    setBusy(true); setError("");
    const result = await redeemCoupon(code);
    submitting.current = false;
    if (!alive.current) return;
    setBusy(false);
    if (result.ok) {
      window.dispatchEvent(new Event(TICKETS_CHANGED));
      setGranted(result.granted);
    } else {
      setError(result.code);
    }
  };
  return <>
    <button ref={trigger} type="button" className="btn btn-outline btn-sm" aria-haspopup="dialog" onClick={() => {
      setCode(""); setError(""); setGranted(0); dialog.current?.showModal(); input.current?.focus();
    }}>쿠폰 등록</button>
    {createPortal(<>
      <dialog ref={dialog} className="coupon-dialog" aria-labelledby="coupon-title" aria-describedby="coupon-description"
        onCancel={event => { if (submitting.current) event.preventDefault(); }}
        onClose={() => trigger.current?.focus()}
        onClick={event => {
          if (event.target !== dialog.current) return;
          const rect = event.currentTarget.getBoundingClientRect();
          if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
        }}>
        <div className="coupon-heading">
          <h2 id="coupon-title">쿠폰 등록</h2>
          <button className="btn btn-ghost btn-icon" type="button" aria-label="쿠폰 등록 닫기" disabled={busy} onClick={close}>×</button>
        </div>
        <p id="coupon-description">받은 쿠폰 코드를 입력해 주세요.</p>
        <form onSubmit={submit} aria-busy={busy} noValidate>
          <label htmlFor="coupon-code">쿠폰 코드</label>
          <input ref={input} id="coupon-code" value={code} onChange={event => { setCode(event.target.value); setError(""); }}
            readOnly={busy || granted > 0 || !!error} placeholder="쿠폰 코드를 입력하세요" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={32}
            aria-invalid={!!error} aria-describedby="coupon-message" />
          {granted > 0 || error ? <div ref={resultPanel} className={`coupon-result${error ? " is-error" : ""}`} tabIndex={-1}>
            <div id="coupon-message" role="status">
              <strong>{error ? "쿠폰을 등록하지 못했어요" : "쿠폰을 등록했어요"}</strong>
              <p>{error ? couponError(error) : `AI 분석 티켓 ${granted}장을 받았어요.`}</p>
            </div>
            {granted > 0
              ? <a className="btn btn-default coupon-submit" href="/recap/#period-heading" onClick={close}>리캡 바로 가기</a>
              : <button className="btn btn-outline coupon-submit" type="button" onClick={close}>닫기</button>}
          </div> : <>
            <p id="coupon-message" role="status">{busy ? "쿠폰을 확인하고 있어요…" : ""}</p>
            <p id="coupon-help">같은 쿠폰은 계정당 한 번 등록할 수 있어요.</p>
            <button className="btn btn-default coupon-submit" type="submit" disabled={busy || !code.trim()}>{busy ? "확인 중…" : "등록하기"}</button>
          </>}
        </form>
      </dialog>

    </>, document.body)}
  </>;
}
