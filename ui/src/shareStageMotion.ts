import type { Pose } from "./sharedViews";

// 시청자마다 위치·크기·투명도를 용수철로 따라가게 하는 브라우저 쪽 애니메이션 엔진이다.
// 목표 자세가 바뀌면 현재 값이 속도를 이어받은 채 부드럽게 따라가므로, 전환 도중에 다른 보기로 바꿔도 끊기지 않는다.
// 계산은 전부 브라우저에서 requestAnimationFrame 으로 하며, 움직임이 멈추면 루프도 멈춘다.

export interface NodeEls { root: HTMLElement; dot: HTMLElement; card: HTMLElement }

// 한 노드의 값 순서: x, y, rot, dot, card, cardScale, opacity
export const FIELDS = 7;
const STIFFNESS = [150, 150, 130, 140, 170, 140, 220];
const SETTLE = [.2, .2, .05, .004, .004, .001, .004];
// 1 미만이면 목표를 살짝 지나쳤다가 돌아와 통통 튀는 느낌이 난다.
const ZETA = .72;
const MAX_STAGGER = 420;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export class StageMotion {
  phase = 0;
  // 사용자가 손으로 돌린 판의 각도(라디안)와 놓은 뒤 이어지는 회전 속도(라디안/초).
  spin = 0;
  spinVel = 0;
  dragging = false;
  speedTarget = 1;
  selected = -1;
  reduced = false;
  paused = false;
  continuous = false;
  // 무대 폭의 절반. 가장자리 별의 이름표가 잘리지 않게 안쪽으로 밀어 준다.
  halfW = 0;
  onFrame?: (cur: Float64Array) => void;

  private els: NodeEls[] = [];
  private cur = new Float64Array(0);
  private vel = new Float64Array(0);
  private tgt = new Float64Array(0);
  private switchAt = new Float64Array(0);
  private raf = 0;
  private last = 0;
  private until = 0;
  private speed = 1;

  constructor(private source: (phase: number, spin: number) => Pose[]) {}

  // 새로 생긴 노드는 무대 중심에서 점 하나로 시작해 퍼져 나간다.
  setNodes(els: NodeEls[]) {
    const n = els.length, keep = Math.min(n, this.els.length);
    const cur = new Float64Array(n * FIELDS), vel = new Float64Array(n * FIELDS), tgt = new Float64Array(n * FIELDS);
    cur.set(this.cur.subarray(0, keep * FIELDS)); vel.set(this.vel.subarray(0, keep * FIELDS)); tgt.set(this.tgt.subarray(0, keep * FIELDS));
    for (let i = keep; i < n; i++) cur[i * FIELDS + 5] = .05;
    this.cur = cur; this.vel = vel; this.tgt = tgt;
    this.switchAt = new Float64Array(n);
    this.els = els;
    this.written = [];
  }

  // 목표가 크게 바뀔 때 부른다. 노드마다 출발을 조금씩 늦춰 물결처럼 이어지게 한다.
  retarget(staggerMs: number) {
    const now = performance.now();
    this.until = now;
    for (let i = 0; i < this.els.length; i++) {
      this.switchAt[i] = now + Math.min(i * staggerMs, MAX_STAGGER);
      this.until = Math.max(this.until, this.switchAt[i]);
    }
    this.kick();
  }

  kick() {
    if (this.raf || this.paused || !this.els.length) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private tick = (t: number) => {
    this.raf = 0;
    const dt = Math.min((t - this.last) / 1000, 1 / 40);
    this.last = t;
    // 마우스를 올리면 궤도가 급정지하지 않고 서서히 느려진다.
    this.speed += (this.speedTarget - this.speed) * (1 - Math.exp(-dt * 5));
    const auto = this.continuous && !this.reduced;
    if (!this.dragging) {
      if (auto) this.phase += dt * this.speed;
      // 놓은 뒤에는 마찰로 서서히 멈춘다.
      this.spin += this.spinVel * dt;
      this.spinVel *= Math.exp(-dt * 1.6);
      if (Math.abs(this.spinVel) < .01) this.spinVel = 0;
    }
    const animating = auto || this.dragging || this.spinVel !== 0;
    const poses = this.source(this.phase, this.spin);
    let moving = false;
    const { cur, vel, tgt } = this;
    for (let i = 0; i < this.els.length; i++) {
      const p = poses[i];
      if (!p) continue;
      const b = i * FIELDS;
      if (t >= this.switchAt[i]) {
        tgt[b] = p.x; tgt[b + 1] = p.y; tgt[b + 2] = p.rot; tgt[b + 3] = p.dot; tgt[b + 4] = p.card; tgt[b + 5] = p.cardScale; tgt[b + 6] = p.opacity;
      }
      for (let j = 0; j < FIELDS; j++) {
        const target = tgt[b + j];
        if (this.reduced) { cur[b + j] = target; vel[b + j] = 0; continue; }
        const k = STIFFNESS[j];
        let v = vel[b + j] + (k * (target - cur[b + j]) - 2 * ZETA * Math.sqrt(k) * vel[b + j]) * dt;
        const x = cur[b + j] + v * dt;
        if (Math.abs(target - x) < SETTLE[j] && Math.abs(v) < SETTLE[j] * 4) { cur[b + j] = target; v = 0; } else { cur[b + j] = x; moving = true; }
        vel[b + j] = v;
      }
      this.write(i, b, p.z);
    }
    this.onFrame?.(cur);
    if (moving || animating || t < this.until) this.kick();
  };

  // 바뀐 값만 DOM 에 쓴다. 궤도처럼 계속 도는 동안에도 점 하나당 transform 한 줄만 갱신되어 프레임 비용이 작다.
  private written: string[][] = [];

  private write(i: number, b: number, z: number) {
    const { cur } = this, { root, dot, card } = this.els[i];
    const opacity = Math.min(1, Math.max(0, cur[b + 6])), mix = clamp01(cur[b + 4]), dotScale = Math.max(0, cur[b + 3]);
    // 가장자리 별의 이름표가 무대 밖으로 잘리지 않도록 안쪽으로 민다.
    const edge = this.halfW - 88, tipShift = this.halfW ? Math.round(cur[b] > edge ? edge - cur[b] : cur[b] < -edge ? -edge - cur[b] : 0) : 0;
    const next = [
      `translate3d(${cur[b].toFixed(2)}px,${cur[b + 1].toFixed(2)}px,0) rotate(${cur[b + 2].toFixed(2)}deg)`,
      String(z + (i === this.selected ? 1000 : 0)),
      opacity < .02 ? "hidden" : "visible",
      dotScale.toFixed(3),
      `${tipShift}px`,
      (opacity * (1 - mix)).toFixed(3),
      Math.max(0, cur[b + 5]).toFixed(4),
      (opacity * mix).toFixed(3),
    ];
    const prev = this.written[i] ??= [];
    if (prev[0] !== next[0]) root.style.transform = next[0];
    if (prev[1] !== next[1]) root.style.zIndex = next[1];
    if (prev[2] !== next[2]) root.style.visibility = next[2];
    if (prev[3] !== next[3]) { root.style.setProperty("--dot-s", next[3]); dot.style.transform = `scale(${next[3]})`; }
    if (prev[4] !== next[4]) root.style.setProperty("--tip-dx", next[4]);
    if (prev[5] !== next[5]) dot.style.opacity = next[5];
    if (prev[6] !== next[6]) card.style.transform = `scale(${next[6]})`;
    if (prev[7] !== next[7]) card.style.opacity = next[7];
    this.written[i] = next;
  }
}
