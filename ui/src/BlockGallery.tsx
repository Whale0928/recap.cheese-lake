/* 조각 갤러리.
 *
 * 조각 스물아홉 개를 표본 데이터로 전부 그려 놓고, 각각이 무엇을 먹는지
 * 옆에 붙여 둔다. 담기·순서는 아직 붙이지 않았다 — 지금은 조각 자체를
 * 눈으로 보고 API 를 뽑는 것이 목적이다.
 */
import { useMemo, useState } from "react";
import { BLOCKS, GROUPS, VERDICT_LABEL, type Verdict } from "./blocks/registry";

const COUNT_BY_VERDICT = BLOCKS.reduce<Record<string, number>>((acc, block) => {
  acc[block.verdict] = (acc[block.verdict] ?? 0) + 1;
  return acc;
}, {});

function VerdictChip({ verdict }: { verdict: Verdict }) {
  return (
    <span className="verdict" data-v={verdict}>
      {VERDICT_LABEL[verdict]}
    </span>
  );
}

export function BlockGallery() {
  const [group, setGroup] = useState<string>("all");
  const [onlyNow, setOnlyNow] = useState(false);
  const [openShape, setOpenShape] = useState<string | null>(null);

  const shown = useMemo(
    () =>
      BLOCKS.filter((block) => {
        if (group !== "all" && block.group !== group) return false;
        if (onlyNow && block.verdict !== "now") return false;
        return true;
      }),
    [group, onlyNow]
  );

  const groupsShown = GROUPS.filter((g) => shown.some((block) => block.group === g.id));

  return (
    <main id="main" className="gallery">
      <header className="gallery-head">
        <div>
          <p className="stat-label">CATALOG</p>
          <h1>리캡 카탈로그</h1>
          <p className="gallery-lead">
            조각 하나가 컴포넌트 하나다. 받는 props 가 곧 API 응답이고, 아래 「먹는 값」이 그 모양이다.
            데이터는 전부 가짜다.
          </p>
        </div>
        <dl className="gallery-counts">
          <div>
            <dt>지금 됨</dt>
            <dd>{COUNT_BY_VERDICT.now ?? 0}</dd>
          </div>
          <div>
            <dt>반쪽</dt>
            <dd>{COUNT_BY_VERDICT.partial ?? 0}</dd>
          </div>
          <div>
            <dt>기간 필요</dt>
            <dd>{COUNT_BY_VERDICT.soon ?? 0}</dd>
          </div>
        </dl>
      </header>

      <div className="gallery-filters">
        <div className="chip-row" role="group" aria-label="분류 고르기">
          <button
            type="button"
            className="chip-button"
            data-on={group === "all"}
            onClick={() => setGroup("all")}
          >
            전체 {BLOCKS.length}
          </button>
          {GROUPS.map((g) => (
            <button
              key={g.id}
              type="button"
              className="chip-button"
              data-on={group === g.id}
              onClick={() => setGroup(g.id)}
            >
              {g.name} {BLOCKS.filter((b) => b.group === g.id).length}
            </button>
          ))}
        </div>
        <label className="chip-toggle">
          <input type="checkbox" className="checkbox" checked={onlyNow} onChange={(e) => setOnlyNow(e.target.checked)} />
          <span>지금 실데이터로 되는 것만</span>
        </label>
      </div>

      {groupsShown.map((g) => (
        <section className="gallery-group" key={g.id} aria-labelledby={`group-${g.id}`}>
          <div className="gallery-group-head">
            <h2 id={`group-${g.id}`}>{g.name}</h2>
            <span className="mono">{g.source}</span>
          </div>

          <div className="gallery-grid">
            {shown
              .filter((block) => block.group === g.id)
              .map((block) => {
                const open = openShape === block.id;
                return (
                  <article className="block-card" key={block.id}>
                    <header className="block-head">
                      <div>
                        <h3>{block.name}</h3>
                        <p>{block.desc}</p>
                      </div>
                      <VerdictChip verdict={block.verdict} />
                    </header>

                    <div className="block-body">{block.render()}</div>

                    <footer className="block-foot">
                      <p className="block-evidence">{block.evidence}</p>
                      <dl className="block-contract">
                        <div>
                          <dt>API</dt>
                          <dd className="mono">{block.api}</dd>
                        </div>
                        <div>
                          <dt>묶는 기준</dt>
                          <dd className="mono">{block.groupBy}</dd>
                        </div>
                        <div>
                          <dt>원천</dt>
                          <dd className="mono">{block.source}</dd>
                        </div>
                      </dl>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        aria-expanded={open}
                        onClick={() => setOpenShape(open ? null : block.id)}
                      >
                        먹는 값 · {block.shape}
                      </button>
                      {open ? (
                        <pre className="block-shape">{JSON.stringify(block.sample, null, 2)}</pre>
                      ) : null}
                    </footer>
                  </article>
                );
              })}
          </div>
        </section>
      ))}

      {shown.length === 0 ? <p className="gallery-empty">고른 조건에 맞는 조각이 없습니다.</p> : null}
    </main>
  );
}
