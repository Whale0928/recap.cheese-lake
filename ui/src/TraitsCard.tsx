import { useEffect, useRef, useState } from "react";
import { useActivity } from "./ActivityView";
import { TRAIT_ICONS } from "./traits.icons";
import { TRAIT_LABELS } from "./traits.labels";
import { fact, memeName, percent, persona, signature, stars } from "./traits.persona";
import type { TraitsResponse, ViewerTraits } from "./traits.types";
import "./traits.css";

// 습관 카드는 다른 활동 정보와 따로 불러온다. 랩이 몰리면 늦게 오거나 잠시 거절되므로,
// 나머지 화면을 붙잡지 않고 같은 모양의 자리만 잡아 둔 뒤 도착하면 채운다. 거절은 Retry-After 만큼 기다려 세 번까지 다시 부른다.
const MAX_RETRY = 3;
export function TraitsCard() {
  const [attempt, setAttempt] = useState(0);
  const state = useActivity<TraitsResponse>("/api/me/traits", attempt);
  const result = state.status === "ready" ? state.data.traits : undefined;
  const waitSeconds = result?.status === "unavailable" && result.reason === "rate_limited" && attempt < MAX_RETRY ? result.retryAfterSeconds ?? 1 : 0;
  useEffect(() => {
    if (!waitSeconds) return;
    const timer = window.setTimeout(() => setAttempt(n => n + 1), waitSeconds * 1000);
    return () => window.clearTimeout(timer);
  }, [waitSeconds, state]);
  if (state.status === "guest") return null;
  const loading = state.status === "loading" || waitSeconds > 0;
  return <section className="me-section traits-section" aria-labelledby="traits-heading" aria-busy={loading}>
    <h2 id="traits-heading" className="traits-sr-only">나는 어떤 시청자일까</h2>
    {result?.status === "ready" ? <TraitsBody data={result.data} />
      : loading ? <TraitsSkeleton />
      : <div className="traits-retry"><p className="activity-notice" role="status">{result?.status === "unavailable" && result.reason === "not_configured" ? "습관 분석 준비 중" : "지금은 습관 분석을 불러오지 못했어요"}</p>
        <button type="button" className="btn btn-outline" onClick={() => setAttempt(n => n + 1)}>다시 불러오기</button></div>}
  </section>;
}

function TraitsSkeleton() {
  return <div className="trait-card is-skeleton" role="status">
    <span className="traits-sr-only">습관 분석 불러오는 중</span>
    <div className="trait-card-inner" aria-hidden="true">
      <div className="trait-art"><i className="sk sk-icon" /></div>
      <div className="trait-main"><i className="sk sk-title" /><i className="sk sk-line" /><i className="sk sk-chip" /></div>
      <div className="trait-skills">{[0, 1, 2].map(i => <div key={i}><i className="sk sk-line" /><i className="sk sk-bar" /></div>)}</div>
      <i className="sk sk-sig" />
    </div>
  </div>;
}

function Stars({ count }: { count: number }) {
  return <span className="trait-stars" role="img" aria-label={`희귀도 별 ${count}개`}>
    {Array.from({ length: 5 }, (_, i) => <svg key={i} viewBox="0 0 24 24" aria-hidden="true" className={i < count ? "on" : ""}><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" /></svg>)}
  </span>;
}

function TraitsBody({ data }: { data: ViewerTraits }) {
  const p = persona(data);
  if (p.kind === "record") return <p className="traits-record">{p.headline}. 확인된 기록만 보여 드릴게요.</p>;
  // 근거 칸은 확정한 이름과 라벨의 실제 뜻을 함께 쓴다. 두 라벨의 수치가 같아도 뜻이 달라 숨기지 않는다.
  const picked = data.traits.filter(l => TRAIT_LABELS[l.key]).slice(0, 3);
  // 라벨이 하나뿐이면 근거 줄이 제목과 같은 말이라, 근거 칸 대신 수치만 한 줄 정체 아래에 둔다.
  const lone = picked.length === 1 ? fact(picked[0]!) : undefined;
  const skills = picked.length === 1 ? [] : picked.map(l => {
    const label = TRAIT_LABELS[l.key]!;
    return { key: l.key, name: label.noun ?? label.name, description: label.description, fact: fact(l) };
  });
  const states = data.states.filter(l => TRAIT_LABELS[l.key]);
  const sig = signature(data.memes);
  const natives = data.memes.filter(m => m.native);
  const all = [...data.traits, ...data.states].filter(l => TRAIT_LABELS[l.key]);
  return <article className="trait-card">
    <div className="trait-card-inner">
      <LabelInfo labels={all} nameKey={p.icon} modifierKey={p.modifierKey} />
      <div className="trait-art">
        <span className="trait-icon"><svg viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML={{ __html: TRAIT_ICONS[p.icon ?? ""] ?? "" }} /></span>
        {p.rate !== undefined && <><Stars count={stars(p.rate)} /><span className="trait-rate" title={`이 습관은 시청자 중 ${percent(p.rate)}가 가지고 있어요`}>시청자 중 {percent(p.rate)}</span></>}
      </div>
      <div className="trait-main">
        <p className="trait-title">{p.title}</p>
        <p className="trait-headline">{p.headline}</p>
        {lone && <p className="trait-lone-fact">{lone.text}</p>}
        {(natives.length > 0 || states.length > 0) && <ul className="trait-badges" aria-label="칭호와 요즘 상태">
          {natives.map(m => <li key={m.key} className="native">{memeName(m.key)} 원어민</li>)}
          {states.map(l => <li key={l.key} className="state"><svg viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML={{ __html: TRAIT_ICONS[l.key] ?? "" }} />요즘 {TRAIT_LABELS[l.key]!.name}</li>)}
        </ul>}
      </div>
      {skills.length > 0 && <ul className="trait-skills" aria-label="판정 근거" style={{ gridTemplateColumns: `repeat(${skills.length}, minmax(0, 1fr))` }}>
        {skills.map((s, i) => <li key={s.key}>
          <span className="trait-skill-icon"><svg viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML={{ __html: TRAIT_ICONS[s.key] ?? "" }} /></span>
          <div className="trait-skill-body">
            <div className="trait-skill-head"><span>{s.name}</span>{s.fact?.ratio !== undefined && <b>{percent(s.fact.ratio)}</b>}</div>
            <span className="trait-skill-note">{s.description}</span>
            {s.fact?.ratio !== undefined
              ? <div className="trait-bar" role="img" aria-label={s.fact.text}><i className={`c${i + 1}`} style={{ width: `${Math.max(2, s.fact.ratio * 100)}%` }} /></div>
              : s.fact && <span className="trait-skill-fact">{s.fact.text}</span>}
          </div>
        </li>)}
      </ul>}
      {sig && <p className="trait-signature"><span>필살기</span><b>{memeName(sig.key)}</b><em>× {sig.count.toLocaleString("ko-KR")}</em></p>}
    </div>
  </article>;
}

// 정보 버튼의 팝업은 라벨 45개 전부를 묶음별로 보여 주고, 이 사람에게 붙은 것만 근거와 함께 강조한다.
// 문의하기 창과 같은 네이티브 <dialog> 라 포커스 가두기·Esc 닫기·배경 막기를 브라우저가 맡는다.
const LABEL_GROUPS: [string, string[]][] = [
  ["시간대", ["late_night", "morning", "afternoon", "evening", "hour_even"]],
  ["요일", ["weekend", "weekday"]],
  ["방송 고르기", ["one_home", "few_regulars", "roaming", "same_day_multi", "first_still_top", "top1_volatile"]],
  ["방송 안에서", ["early_join", "late_join", "stays_to_end", "brief_visit", "main_streak", "small_room", "big_room", "channel_top"]],
  ["말투", ["length_short", "length_long", "varied_phrase", "repeats_phrase", "laugh_only", "question_ending", "exclaim_mark", "emoji_lines", "char_stretch"]],
  ["구독", ["stay_subscribed", "long_sub", "multi_sub"]],
  ["취향", ["one_game", "game_centric", "talk_centric", "sports_centric", "omnivore"]],
  ["요즘 상태", ["trend_surge", "trend_steady", "trend_decline", "returned", "new_finds", "tenure_veteran", "tenure_new"]],
];
function LabelInfo({ labels, nameKey, modifierKey }: { labels: ViewerTraits["traits"]; nameKey?: string; modifierKey?: string }) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);
  const mine = new Map(labels.map(l => [l.key, l]));
  const total = LABEL_GROUPS.reduce((n, [, keys]) => n + keys.length, 0);
  return <>
    <button type="button" className="trait-info-button" aria-haspopup="dialog" aria-label="전체 라벨 보기" onClick={() => setOpen(true)}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><circle cx="12" cy="7.8" r="1" className="dot" /></svg>
    </button>
    <dialog ref={dialog} className="label-dialog" aria-labelledby="label-dialog-title" onClose={() => setOpen(false)} onClick={e => { if (e.target === dialog.current) setOpen(false); }}>
      <div className="label-panel">
        <header className="label-head">
          <div><h2 id="label-dialog-title">전체 라벨 {total}개</h2><p>나한테 붙은 라벨 {mine.size}개</p></div>
          <button className="btn btn-ghost btn-sm btn-icon" type="button" onClick={() => setOpen(false)} aria-label="닫기">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </header>
        {LABEL_GROUPS.map(([group, keys]) => <section key={group} className="label-group" aria-label={group}>
          <h3 className="label-sub">{group}</h3>
          <ul className="label-list">
            {keys.filter(k => TRAIT_LABELS[k]).map(k => {
              const label = TRAIT_LABELS[k]!;
              const hit = mine.get(k);
              const f = hit ? fact(hit) : undefined;
              const role = k === nameKey ? "카드 이름" : k === modifierKey ? "꾸밈말" : undefined;
              return <li key={k} className={`label-item${hit ? " is-mine" : ""}`}>
                <span className="label-item-icon"><svg viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML={{ __html: TRAIT_ICONS[k] ?? "" }} /></span>
                <div className="label-item-body">
                  <p className="label-item-name"><b>{label.noun ?? label.name}</b>{hit && <span className="label-item-role">{role ?? "내 라벨"}</span>}</p>
                  <p className="label-item-desc">{label.description}</p>
                  {f && <p className="label-item-fact">{f.text}</p>}
                </div>
              </li>;
            })}
          </ul>
        </section>)}
      </div>
    </dialog>
  </>;
}
