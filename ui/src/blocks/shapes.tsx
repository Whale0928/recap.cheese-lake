/* 조각들이 나눠 쓰는 표현.
 *
 * 스타일은 styles/components.css 에 있다. 여기서는 색을 직접 쓰지 않는다 —
 * 토큰 밖의 색이 들어가는 순간 다크 모드가 조용히 깨진다.
 */
import { Fragment, type CSSProperties, type ReactNode } from "react";

const nf = new Intl.NumberFormat("ko-KR");
export const num = (n: number) => nf.format(n);
export const pct = (ratio: number, digits = 0) => `${(ratio * 100).toFixed(digits)}%`;

/** 값을 0~4 단계로 접는다. 0 은 「없음」이라 따로 둔다. */
export function levels(values: number[]): number[] {
  const positive = values.filter((v) => v > 0).sort((a, b) => a - b);
  if (positive.length === 0) return values.map(() => 0);
  const at = (q: number) => positive[Math.min(positive.length - 1, Math.floor(positive.length * q))];
  const [q1, q2, q3] = [at(0.4), at(0.67), at(0.87)];
  return values.map((v) => (v <= 0 ? 0 : v <= q1 ? 1 : v <= q2 ? 2 : v <= q3 ? 3 : 4));
}

export function Figure({ value, unit, children }: { value: string; unit?: string; children?: ReactNode }) {
  return (
    <>
      <p className="figure">
        {value}
        {unit ? <small>{unit}</small> : null}
      </p>
      {children}
    </>
  );
}

export function Lead({ children }: { children: ReactNode }) {
  return <p className="recap-lead">{children}</p>;
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="recap-note">{children}</p>;
}

export function RankBars({ items }: { items: Array<{ key: string; label: string; value: string; ratio: number }> }) {
  return (
    <ol className="rank">
      {items.map((item, index) => (
        <li key={item.key}>
          <span className="rank-no">{String(index + 1).padStart(2, "0")}</span>
          <div>
            <div className="rank-head">
              <strong>{item.label}</strong>
              <span>{item.value}</span>
            </div>
            <div className="rank-bar">
              <i style={{ width: pct(item.ratio) }} />
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** 라벨 · 막대 · 값 세 칸. 카테고리·구독·토큰이 같이 쓴다. */
export function LabeledBars({
  items,
  variant = "inline"
}: {
  items: Array<{ key: string; label: string; value: string; ratio: number }>;
  variant?: "inline" | "row";
}) {
  if (variant === "row") {
    return (
      <ul className="bar-rows">
        {items.map((item) => (
          <li key={item.key}>
            <span className="bar-label">{item.label}</span>
            <span className="bar-track">
              <i style={{ width: pct(item.ratio) }} />
            </span>
            <span className="bar-value">{item.value}</span>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ul className="freq">
      {items.map((item) => (
        <li key={item.key} style={{ "--w": pct(item.ratio) } as CSSProperties}>
          <span>{item.label}</span>
          <span className="n">{item.value}</span>
        </li>
      ))}
    </ul>
  );
}

export function HeatGrid({ values, legend = true }: { values: number[]; legend?: boolean }) {
  const marks = levels(values);
  return (
    <div className="heat">
      <div className="heat-grid">
        {marks.map((level, index) => (
          <span className="heat-cell" data-level={level} key={index} />
        ))}
      </div>
      {legend ? (
        <div className="heat-legend">
          <span>적음</span>
          {[0, 1, 2, 3, 4].map((level) => (
            <span className="heat-cell" data-level={level} key={level} />
          ))}
          <span>많음</span>
        </div>
      ) : null}
    </div>
  );
}

const DAYS = ["월", "화", "수", "목", "금", "토", "일"];

/** 요일 x 시간대. 밤 봉우리가 자정에서 잘리지 않도록 6시에서 시작한다. */
export function RhythmGrid({ grid, startHour = 6 }: { grid: number[][]; startHour?: number }) {
  const flat = grid.flat();
  const marks = levels(flat);
  return (
    <div className="rhythm">
      {grid.map((row, day) => (
        <Fragment key={day}>
          <span className="rhythm-day">{DAYS[day]}</span>
          <div className="rhythm-row">
            {row.map((_, index) => {
              const hour = (index + startHour) % 24;
              return <span className="rhythm-cell" data-level={marks[day * 24 + hour]} key={index} />;
            })}
          </div>
        </Fragment>
      ))}
      <div className="rhythm-hours">
        {Array.from({ length: 24 }, (_, index) => {
          const hour = (index + startHour) % 24;
          return <span key={index}>{hour % 6 === 0 ? hour : ""}</span>;
        })}
      </div>
    </div>
  );
}

export function SpanTrack({
  segments,
  axis
}: {
  segments: Array<{ key: string; left: number; width: number; kind: "streak" | "gap" | "base" | "mine" }>;
  axis?: string[];
}) {
  return (
    <>
      <div className="span-track">
        {segments.map((s) => (
          <div
            className={`span-fill ${s.kind}`}
            key={s.key}
            style={{ left: pct(s.left, 1), width: pct(s.width, 1) }}
          />
        ))}
      </div>
      {axis ? (
        <div className="span-axis">
          {axis.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
      ) : null}
    </>
  );
}

export function Donut({ ratio, caption }: { ratio: number; caption: string }) {
  const circumference = 2 * Math.PI * 34;
  return (
    <div className="donut">
      <svg viewBox="0 0 80 80" role="img" aria-label={caption}>
        <circle cx="40" cy="40" r="34" className="donut-track" />
        <circle
          cx="40"
          cy="40"
          r="34"
          className="donut-value"
          strokeDasharray={`${(circumference * ratio).toFixed(1)} ${circumference.toFixed(1)}`}
          transform="rotate(-90 40 40)"
        />
      </svg>
      <div className="donut-center">
        <strong>{pct(ratio)}</strong>
        <span>{caption}</span>
      </div>
    </div>
  );
}

export function Sparkline({ values, labels }: { values: number[]; labels?: string[] }) {
  const max = Math.max(...values, 1);
  const points = values
    .map((v, i) => `${((i / Math.max(1, values.length - 1)) * 300).toFixed(1)},${(74 - (v / max) * 66).toFixed(1)}`)
    .join(" ");
  return (
    <div className="spark">
      <svg viewBox="0 0 300 80" preserveAspectRatio="none" aria-hidden="true">
        <polyline points={points} />
      </svg>
      {labels ? (
        <div className="spark-axis">
          {labels.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** 겹쳐 쌓은 면. 구간별 구성이 어떻게 바뀌는지 본다. */
export function StreamChart({
  buckets,
  series
}: {
  buckets: string[];
  series: Array<{ key: string; label: string; values: number[] }>;
}) {
  const width = 720;
  const height = 180;
  const totals = buckets.map((_, i) => series.reduce((sum, s) => sum + (s.values[i] ?? 0), 0));
  const max = Math.max(...totals, 1);
  const base = buckets.map(() => 0);
  const bands = series.map((s) => {
    const top: string[] = [];
    const bottom: string[] = [];
    buckets.forEach((_, i) => {
      const x = ((i / Math.max(1, buckets.length - 1)) * width).toFixed(1);
      const next = base[i] + (s.values[i] ?? 0);
      top.push(`${x},${(height - (next / max) * (height - 6)).toFixed(1)}`);
      bottom.push(`${x},${(height - (base[i] / max) * (height - 6)).toFixed(1)}`);
      base[i] = next;
    });
    return { key: s.key, label: s.label, points: [...top, ...bottom.reverse()].join(" ") };
  });

  return (
    <div className="stream">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
        {bands.map((band, index) => (
          <polygon key={band.key} points={band.points} data-series={index % 5} />
        ))}
      </svg>
      <div className="stream-axis">
        {buckets.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <div className="stream-key">
        {bands.map((band, index) => (
          <span key={band.key}>
            <i data-series={index % 5} />
            {band.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function Bubbles({ items }: { items: Array<{ key: string; label: string; weight: number }> }) {
  const max = Math.max(...items.map((i) => i.weight), 1);
  return (
    <ul className="bubbles">
      {items.map((item) => {
        const size = 24 + Math.round((item.weight / max) * 72);
        return (
          <li key={item.key}>
            <span className="bubble" style={{ width: size, height: size }} />
            <span className="bubble-label">{item.label}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** 점과 선. 함께 오간 방들의 관계를 본다. */
export function NetGraph({
  nodes,
  edges
}: {
  nodes: Array<{ id: string; label: string; weight: number }>;
  edges: Array<{ a: string; b: string; weight: number }>;
}) {
  const radius = 74;
  const positions = new Map(
    nodes.map((node, index) => {
      const angle = (index / nodes.length) * Math.PI * 2 - Math.PI / 2;
      return [node.id, { x: 100 + Math.cos(angle) * radius, y: 100 + Math.sin(angle) * radius }];
    })
  );
  const maxWeight = Math.max(...edges.map((e) => e.weight), 1);
  const maxNode = Math.max(...nodes.map((n) => n.weight), 1);

  return (
    <div className="net">
      <svg viewBox="0 0 200 200" aria-hidden="true">
        {edges.map((edge) => {
          const a = positions.get(edge.a);
          const b = positions.get(edge.b);
          if (!a || !b) return null;
          return (
            <line
              key={`${edge.a}-${edge.b}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              strokeWidth={0.6 + (edge.weight / maxWeight) * 2.4}
            />
          );
        })}
        {nodes.map((node) => {
          const point = positions.get(node.id);
          if (!point) return null;
          return <circle key={node.id} cx={point.x} cy={point.y} r={3 + (node.weight / maxNode) * 5} />;
        })}
      </svg>
      <ul className="net-key">
        {nodes.map((node) => (
          <li key={node.id}>{node.label}</li>
        ))}
      </ul>
    </div>
  );
}

export function Histogram({ items, unit }: { items: Array<{ label: string; count: number }>; unit?: string }) {
  const max = Math.max(...items.map((i) => i.count), 1);
  return (
    <div className="histogram" role="img" aria-label={`분포${unit ? ` (${unit})` : ""}`}>
      {items.map((item) => (
        <span className="histogram-bar" key={item.label} style={{ height: pct(item.count / max) }} title={item.label} />
      ))}
    </div>
  );
}
