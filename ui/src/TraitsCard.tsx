import { useEffect, useId, useRef, useState } from "react";
import { useActivity } from "./ActivityView";
import { TRAIT_ICONS } from "./traits.icons";
import { TRAIT_LABELS } from "./traits.labels";
import { evidenceOrder, fact, keepOrder, memeName, percent, persona, signature, stars, stateName, swapLead } from "./traits.persona";
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
      <div className="trait-others"><div className="trait-chips">{[0, 1, 2].map(i => <i key={i} className="sk sk-chip" />)}</div></div>
      <i className="sk sk-sig" />
    </div>
  </div>;
}

function Stars({ count }: { count: number }) {
  return <span className="trait-stars" role="img" aria-label={`희귀도 별 ${count}개`}>
    {Array.from({ length: 5 }, (_, i) => <svg key={i} viewBox="0 0 24 24" aria-hidden="true" className={i < count ? "on" : ""}><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" /></svg>)}
  </span>;
}

// 수치가 둘이면 「구독 3곳 · 구독한 방송 채팅 85%」에서 숫자만 다음 줄로 떨어지지 않게 수치 단위로 묶고,
// 「·」를 앞 수치에 붙여 혼자 한 줄에 남지 않게 한다.
function FactText({ text }: { text: string }) {
  const parts = text.split(" · ");
  return <>{parts.flatMap((part, j) => [...(j ? [" "] : []), <span key={j}>{part}{j < parts.length - 1 ? " ·" : ""}</span>])}</>;
}

function TraitsBody({ data }: { data: ViewerTraits }) {
  // 다른 배지를 누르면 그 라벨이 카드 이름으로 올라가고 원래 이름은 그 자리로 내려간다.
  // 고른 순서는 저장하지 않아 새로고침하면 처음 순서(가장 드문 라벨이 이름)로 돌아간다.
  const [saved, setSaved] = useState<string[]>([]);
  const othersId = useId();
  const first = persona(data);
  // 라벨이 없을 때도 같은 카드 틀에 빈 자리를 그려 두고, 전체 배지는 구경할 수 있게 한다.
  // 틀 없이 문장만 두면 빈 칸처럼 보였다. 불러오는 중으로 읽히지 않게 빈 자리는 깜빡이지 않는다.
  if (first.kind === "record") return <article className="trait-card is-empty">
    <div className="trait-card-inner">
      <div className="trait-art" aria-hidden="true">
        <span className="trait-icon"><svg viewBox="0 0 24 24"><path d="M9.6 9.2a2.5 2.5 0 1 1 3.4 2.4c-.8.4-1.1.9-1.1 1.7v.4" /><circle cx="12" cy="16.6" r="1" className="fill" /></svg></span>
      </div>
      <div className="trait-main">
        <p className="trait-title">아직 수집된 배지가 없어요</p>
        <p className="trait-headline">{first.headline}. 채팅이 더 쌓이면 배지가 붙어요.</p>
        <div><LabelInfo labels={[]} trigger="text" /></div>
      </div>
      <div className="trait-others" aria-hidden="true"><div className="trait-chips">{[0, 1, 2, 3].map(i => <i key={i} className="trait-chip-empty" />)}</div></div>
    </div>
  </article>;
  const order = keepOrder(saved, evidenceOrder(data.traits, first).map(l => l.key));
  const p = persona(data, order[0]);
  const byKey = new Map(data.traits.map(l => [l.key, l]));
  // 수치는 정보 팝업과 같은 문장(「1위 방송 비중 85%」)으로 보여 준다. 퍼센트만 두면 무엇의 비율인지 알 수 없다.
  // 카드 이름이 된 라벨은 제목 바로 아래에 조건과 수치를 쓰고, 아래 근거 칸에는 다시 넣지 않는다.
  // 같은 이름이 위아래에 두 번 나오면 배지가 하나 더 있는 것처럼 읽힌다.
  const lead = byKey.get(order[0] ?? "");
  const leadFact = lead ? fact(lead) : undefined;
  // 나머지 라벨은 아이콘과 이름만 있는 작은 배지로 둔다. 조건과 수치는 위로 올렸을 때 보인다.
  const others = order.slice(1).map(key => {
    const label = TRAIT_LABELS[key]!;
    return { key, name: label.noun ?? label.name, canLead: !!label.noun, description: label.description };
  });
  const states = data.states.filter(l => TRAIT_LABELS[l.key]);
  const sig = signature(data.memes);
  const natives = data.memes.filter(m => m.native);
  const all = [...data.traits, ...data.states].filter(l => TRAIT_LABELS[l.key]);
  return <article className="trait-card">
    <div className="trait-card-inner">
      <LabelInfo labels={all} />
      <div className="trait-art">
        <span className="trait-icon"><svg viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML={{ __html: TRAIT_ICONS[p.icon ?? ""] ?? "" }} /></span>
        {p.rate !== undefined && <><Stars count={stars(p.rate)} /><span className="trait-rate" title={`이 습관은 시청자 중 ${percent(p.rate)}가 가지고 있어요`}>시청자 중 {percent(p.rate)}</span></>}
      </div>
      <div className="trait-main">
        <p className="trait-title" aria-live="polite">{p.title}</p>
        <p className="trait-headline">{p.headline}</p>
        {lead && <div className="trait-lead">
          <p>{TRAIT_LABELS[lead.key]!.description}</p>
          {leadFact && <b><FactText text={leadFact.text} /></b>}
          {leadFact?.ratio !== undefined && <div className="trait-bar" aria-hidden="true"><i className="c1" style={{ width: `${leadFact.ratio * 100}%` }} /></div>}
        </div>}
        {natives.length > 0 && <ul className="trait-badges" aria-label="칭호">
          {natives.map(m => <li key={m.key} className="native">{memeName(m.key)} 원어민</li>)}
        </ul>}
        {states.length > 0 && <ul className="trait-states" aria-label="요즘 상태">
          {states.map(l => {
            const f = fact(l);
            return <li key={l.key}>
              <span className="trait-state-chip"><svg viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML={{ __html: TRAIT_ICONS[l.key] ?? "" }} />{stateName(l.key)}</span>
              <span className="trait-state-note">{TRAIT_LABELS[l.key]!.description}{f ? ` · ${f.text}` : ""}</span>
            </li>;
          })}
        </ul>}
      </div>
      {others.length > 0 && <div className="trait-others">
        <p className="trait-others-label" id={othersId}>다른 배지 {others.length}개 · 누르면 위로 올라가요</p>
        <ul className="trait-chips" aria-labelledby={othersId}>
          {others.map((o, i) => <li key={o.key}>
            <button type="button" className="trait-chip" disabled={!o.canLead} title={o.description} onClick={() => setSaved(swapLead(order, i + 1))}>
              <span className="trait-chip-icon"><svg viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML={{ __html: TRAIT_ICONS[o.key] ?? "" }} /></span>
              {o.name}
              {o.canLead && <span className="traits-sr-only">, 카드 이름으로 올리기</span>}
            </button>
          </li>)}
        </ul>
      </div>}
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
// trigger 가 text 면 아이콘 대신 「전체 배지 N개 보기」 버튼으로 연다. 배지가 하나도 없는 카드에서 쓴다.
function LabelInfo({ labels, trigger = "icon" }: { labels: ViewerTraits["traits"]; trigger?: "icon" | "text" }) {
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
    {trigger === "text"
      ? <button type="button" className="btn btn-outline btn-sm trait-empty-browse" aria-haspopup="dialog" onClick={() => setOpen(true)}>전체 배지 {total}개 보기</button>
      : <button type="button" className="trait-info-button" aria-haspopup="dialog" aria-label="전체 라벨 보기" onClick={() => setOpen(true)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><circle cx="12" cy="7.8" r="1" className="dot" /></svg>
      </button>}
    <dialog ref={dialog} className="label-dialog" aria-labelledby="label-dialog-title" onClose={() => setOpen(false)} onClick={e => { if (e.target === dialog.current) setOpen(false); }}>
      <div className="label-panel">
        <header className="label-head">
          <div><h2 id="label-dialog-title">전체 라벨 {total}개</h2><p>나한테 붙은 라벨 {mine.size}개</p></div>
          <button className="btn btn-ghost btn-sm btn-icon" type="button" onClick={() => setOpen(false)} aria-label="닫기">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </header>
        {/* 수치가 무엇을 기준으로 셌는지 한곳에 밝힌다. 카드 칸은 좁아서 문장마다 다 적지 않는다. */}
        <ul className="label-basis" aria-label="수치 기준">
          <li>날짜와 「처음」은 수집된 채팅 기록 기준이에요.</li>
          <li>말투 라벨은 최근에 채팅한 회차에서 뽑은 최대 300개 표본 기준이에요.</li>
          <li>취향 라벨의 비율은 카테고리가 확인된 채팅만 셌어요.</li>
          <li>방송 시작·종료는 수집기가 관측한 시각이에요. 채팅 구간은 첫 채팅부터 마지막 채팅이 든 1분 구간까지이며, 계속 채팅하거나 시청한 시간은 아니에요.</li>
        </ul>
        {LABEL_GROUPS.map(([group, keys]) => <section key={group} className="label-group" aria-label={group}>
          <h3 className="label-sub">{group}</h3>
          <ul className="label-list">
            {keys.filter(k => TRAIT_LABELS[k]).map(k => {
              const label = TRAIT_LABELS[k]!;
              const hit = mine.get(k);
              const f = hit ? fact(hit) : undefined;
              return <li key={k} className={`label-item${hit ? " is-mine" : ""}`}>
                <span className="label-item-icon"><svg viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML={{ __html: TRAIT_ICONS[k] ?? "" }} /></span>
                <div className="label-item-body">
                  <p className="label-item-name"><b>{label.noun ?? label.name}</b>{hit && <span className="label-item-role">내 라벨</span>}</p>
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
