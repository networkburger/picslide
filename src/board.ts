// The puzzle board: pieces are DOM elements showing a slice of one image, moved by
// little spring simulations so every lift, swap and snap has some bounce to it.

import { sound } from "./audio";
import { fx } from "./fx";
import { haptics } from "./haptics";

interface Spring {
  x: number; // current value
  v: number; // velocity (units/s)
  t: number; // target
}

interface SpringParams {
  k: number; // stiffness
  c: number; // damping
}

const spring = (x: number): Spring => ({ x, v: 0, t: x });
const params = (k: number, zeta: number): SpringParams => ({ k, c: 2 * zeta * Math.sqrt(k) });

const MOVE = params(340, 0.72);
const SCALE = params(520, 0.42);
const TILT = params(260, 0.38);

const DRAG_THRESHOLD = 8; // px of movement before a press becomes a drag
const ARRIVE_MS = 230; // roughly when a swapped piece has visually landed

interface Piece {
  home: number; // the slot this piece belongs in
  el: HTMLDivElement;
  x: Spring;
  y: Spring;
  s: Spring;
  r: Spring;
  locked: boolean;
}

interface Gesture {
  pointerId: number;
  piece: Piece;
  from: number; // slot the piece started in
  startX: number;
  startY: number;
  offX: number;
  offY: number;
  dragging: boolean;
  lastX: number;
  lastY: number;
  lastT: number;
  vx: number;
  vy: number;
  hover: number; // slot under the dragged piece that it would swap into, or -1
}

export interface BoardOptions {
  image: string; // URL of a square image
  grid: number;
  host: HTMLElement; // element the board sizes itself to fit
  onSolved: () => void;
}

export class Board {
  readonly el = document.createElement("div");
  private pieces: Piece[] = [];
  private at: number[] = []; // at[slot] = index of piece currently there (piece index === its home slot)
  private grid: number;
  private cell = 0;
  private busy = true;
  private solved = false;
  private placed = 0;
  private selected: Piece | null = null;
  private gesture: Gesture | null = null;
  private rect = new DOMRect();
  private z = 1;
  private raf = 0;
  private last = 0;
  private timers = new Set<number>();
  private resizeObserver: ResizeObserver;

  constructor(private opts: BoardOptions) {
    this.grid = opts.grid;
    const n = this.grid * this.grid;
    this.el.className = "board";
    this.el.style.setProperty("--grid", String(this.grid));
    this.el.style.setProperty("--img", `url("${opts.image}")`);

    for (let i = 0; i < n; i++) {
      const slot = document.createElement("div");
      slot.className = "slot";
      slot.style.setProperty("--col", String(i % this.grid));
      slot.style.setProperty("--row", String(Math.floor(i / this.grid)));
      this.el.appendChild(slot);
    }

    for (let i = 0; i < n; i++) {
      const el = document.createElement("div");
      el.className = "piece";
      const face = document.createElement("div");
      face.className = "face";
      face.style.setProperty("--col", String(i % this.grid));
      face.style.setProperty("--row", String(Math.floor(i / this.grid)));
      el.appendChild(face);
      this.el.appendChild(el);
      this.pieces.push({ home: i, el, x: spring(0), y: spring(0), s: spring(1), r: spring(0), locked: false });
      this.at.push(i);
    }

    const picture = document.createElement("div");
    picture.className = "solution";
    this.el.appendChild(picture);

    this.el.addEventListener("pointerdown", this.onDown);
    this.el.addEventListener("pointermove", this.onMove);
    this.el.addEventListener("pointerup", this.onUp);
    this.el.addEventListener("pointercancel", this.onCancel);
    this.el.addEventListener("lostpointercapture", this.onCancel);

    opts.host.appendChild(this.el);
    this.resizeObserver = new ResizeObserver(() => this.layout());
    this.resizeObserver.observe(opts.host);
    this.layout();
  }

  /** Show the finished picture briefly, then scramble it. */
  start() {
    this.later(1100, () => {
      const order = derangement(this.at.length);
      this.pieces.forEach((p) => {
        p.s.t = 0.82;
        p.r.v += (Math.random() - 0.5) * 600;
      });
      sound.shuffle(this.at.length);
      haptics.lift();
      this.later(160, () => {
        this.at = order;
        this.at.forEach((pi, slot) => {
          const p = this.pieces[pi];
          this.later(slot * 22, () => {
            p.el.style.zIndex = String(++this.z);
            this.moveTo(p, slot);
            p.s.t = 1;
            p.r.v += (Math.random() - 0.5) * 500;
            this.kick();
          });
        });
        this.kick();
        this.later(this.at.length * 22 + 400, () => (this.busy = false));
      });
      this.kick();
    });
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.timers.forEach(clearTimeout);
    this.resizeObserver.disconnect();
    this.el.remove();
  }

  // ---- Layout & animation --------------------------------------------------

  private layout() {
    const { clientWidth: w, clientHeight: h } = this.opts.host;
    const size = Math.max(0, Math.floor(Math.min(w, h) / this.grid) * this.grid);
    if (!size) return;
    const old = this.cell;
    this.cell = size / this.grid;
    this.el.style.width = this.el.style.height = `${size}px`;
    this.el.style.setProperty("--cell", `${this.cell}px`);
    // Rescale spring state so a resize mid-animation doesn't jump.
    const k = old ? this.cell / old : 1;
    this.at.forEach((pi, slot) => {
      const p = this.pieces[pi];
      if (old) {
        p.x.x *= k; p.x.v *= k; p.y.x *= k; p.y.v *= k;
      }
      const [x, y] = this.slotXY(slot);
      p.x.t = x;
      p.y.t = y;
      if (!old) {
        p.x.x = x;
        p.y.x = y;
      }
    });
    this.kick();
  }

  private slotXY(slot: number): [number, number] {
    return [(slot % this.grid) * this.cell, Math.floor(slot / this.grid) * this.cell];
  }

  private moveTo(p: Piece, slot: number) {
    const [x, y] = this.slotXY(slot);
    p.x.t = x;
    p.y.t = y;
  }

  private kick() {
    if (!this.raf) {
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.frame);
    }
  }

  private frame = (now: number) => {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    let moving = false;
    const dragged = this.gesture?.dragging ? this.gesture.piece : null;
    for (const p of this.pieces) {
      let active = false;
      if (p !== dragged) {
        active = step(p.x, MOVE, dt) || active;
        active = step(p.y, MOVE, dt) || active;
      }
      active = step(p.s, SCALE, dt) || active;
      active = step(p.r, TILT, dt) || active;
      p.el.style.transform = `translate3d(${p.x.x}px, ${p.y.x}px, 0) rotate(${p.r.x}deg) scale(${p.s.x})`;
      moving ||= active;
    }
    this.raf = moving || dragged ? requestAnimationFrame(this.frame) : 0;
  };

  // ---- Input -----------------------------------------------------------------

  private local(e: PointerEvent): [number, number] {
    return [e.clientX - this.rect.left, e.clientY - this.rect.top];
  }

  private slotAt(x: number, y: number): number {
    const col = Math.floor(x / this.cell);
    const row = Math.floor(y / this.cell);
    if (col < 0 || row < 0 || col >= this.grid || row >= this.grid) return -1;
    return row * this.grid + col;
  }

  private slotOf(p: Piece) {
    return this.at.indexOf(p.home);
  }

  private pan(p: Piece) {
    return ((p.x.x + this.cell / 2) / (this.cell * this.grid)) * 1.4 - 0.7;
  }

  private onDown = (e: PointerEvent) => {
    if (this.busy || this.solved || this.gesture) return;
    this.rect = this.el.getBoundingClientRect();
    const [x, y] = this.local(e);
    const slot = this.slotAt(x, y);
    if (slot < 0) return;
    const piece = this.pieces[this.at[slot]];
    e.preventDefault();

    if (piece.locked) {
      piece.r.v += 520 * (Math.random() < 0.5 ? -1 : 1);
      piece.s.v -= 1.2;
      sound.deny(this.pan(piece));
      haptics.tap();
      this.kick();
      return;
    }

    this.el.setPointerCapture(e.pointerId);
    this.gesture = {
      pointerId: e.pointerId,
      piece,
      from: slot,
      startX: x,
      startY: y,
      offX: x - piece.x.x,
      offY: y - piece.y.x,
      dragging: false,
      lastX: x,
      lastY: y,
      lastT: e.timeStamp,
      vx: 0,
      vy: 0,
      hover: -1,
    };
    // Squish under the finger.
    piece.s.t = this.selected === piece ? 1.04 : 0.93;
    this.kick();
  };

  private onMove = (e: PointerEvent) => {
    const g = this.gesture;
    if (!g || e.pointerId !== g.pointerId) return;
    const [x, y] = this.local(e);

    const dtMs = Math.max(1, e.timeStamp - g.lastT);
    g.vx = g.vx * 0.6 + ((x - g.lastX) / dtMs) * 1000 * 0.4;
    g.vy = g.vy * 0.6 + ((y - g.lastY) / dtMs) * 1000 * 0.4;
    g.lastX = x;
    g.lastY = y;
    g.lastT = e.timeStamp;

    if (!g.dragging) {
      if (Math.hypot(x - g.startX, y - g.startY) < DRAG_THRESHOLD) return;
      this.beginDrag(g);
    }

    const p = g.piece;
    p.x.x = p.x.t = x - g.offX;
    p.y.x = p.y.t = y - g.offY;
    p.x.v = p.y.v = 0;
    p.r.t = clamp(g.vx * 0.012, -14, 14);

    const over = this.slotAt(p.x.x + this.cell / 2, p.y.x + this.cell / 2);
    const valid = over >= 0 && over !== g.from && !this.pieces[this.at[over]].locked;
    this.setHover(g, valid ? over : -1);
    this.kick();
  };

  private onUp = (e: PointerEvent) => {
    const g = this.gesture;
    if (!g || e.pointerId !== g.pointerId) return;
    this.gesture = null;
    if (g.dragging) this.endDrag(g);
    else this.tap(g.piece);
  };

  private onCancel = (e: PointerEvent) => {
    const g = this.gesture;
    if (!g || e.pointerId !== g.pointerId) return;
    this.gesture = null;
    this.setHover(g, -1);
    const p = g.piece;
    p.el.classList.remove("lifted");
    this.moveTo(p, g.from);
    p.s.t = this.selected === p ? 1.1 : 1;
    p.r.t = 0;
    this.kick();
  };

  private beginDrag(g: Gesture) {
    g.dragging = true;
    const p = g.piece;
    if (this.selected && this.selected !== p) this.clearSelection(true);
    if (this.selected === p) this.clearSelection(false);
    p.el.classList.add("lifted");
    p.el.style.zIndex = String(++this.z);
    p.s.t = 1.14;
    p.s.v += 2;
    sound.lift(this.pan(p));
    haptics.lift();
  }

  private setHover(g: Gesture, slot: number) {
    if (slot === g.hover) return;
    if (g.hover >= 0) {
      const prev = this.pieces[this.at[g.hover]];
      prev.el.classList.remove("target");
      prev.s.t = 1;
    }
    g.hover = slot;
    if (slot >= 0) {
      const t = this.pieces[this.at[slot]];
      t.el.classList.add("target");
      t.s.t = 0.88;
      sound.hover(this.pan(t));
      haptics.tap();
    }
  }

  private endDrag(g: Gesture) {
    const p = g.piece;
    p.el.classList.remove("lifted");
    p.r.t = 0;
    p.s.t = 1;
    // Carry the fling into the spring so the release feels physical.
    p.x.v = clamp(g.vx, -3000, 3000);
    p.y.v = clamp(g.vy, -3000, 3000);
    const target = g.hover;
    this.setHover(g, -1);
    if (target >= 0) {
      this.swap(g.from, target);
    } else {
      const [hx, hy] = this.slotXY(g.from);
      const far = Math.hypot(p.x.x - hx, p.y.x - hy) > this.cell * 0.5;
      this.moveTo(p, g.from);
      if (far) sound.cancel(this.pan(p));
      else sound.drop(this.pan(p));
      haptics.tap();
    }
    this.kick();
  }

  private tap(p: Piece) {
    const sel = this.selected;
    if (!sel) {
      this.selected = p;
      p.el.classList.add("selected");
      p.el.style.zIndex = String(++this.z);
      p.s.t = 1.1;
      p.s.v += 3;
      sound.lift(this.pan(p));
      haptics.tap();
    } else if (sel === p) {
      this.clearSelection(true);
    } else {
      this.clearSelection(false);
      this.swap(this.slotOf(sel), this.slotOf(p));
    }
    this.kick();
  }

  private clearSelection(withSound: boolean) {
    const p = this.selected;
    if (!p) return;
    this.selected = null;
    p.el.classList.remove("selected");
    p.s.t = 1;
    if (withSound) {
      sound.deselect(this.pan(p));
      haptics.tap();
    }
  }

  // ---- Rules -------------------------------------------------------------------

  private swap(a: number, b: number) {
    const pa = this.pieces[this.at[a]];
    const pb = this.pieces[this.at[b]];
    this.at[a] = pb.home;
    this.at[b] = pa.home;
    pb.el.style.zIndex = String(++this.z);
    pa.el.style.zIndex = String(++this.z);
    this.moveTo(pa, b);
    this.moveTo(pb, a);
    pa.s.t = pb.s.t = 1;
    pa.r.t = pb.r.t = 0;
    pb.r.v += (Math.random() < 0.5 ? -1 : 1) * 260;
    sound.swap(this.pan(pa));
    haptics.drop();
    this.kick();

    this.later(ARRIVE_MS, () => {
      let n = 0;
      for (const p of [pa, pb]) {
        if (!p.locked && this.at[p.home] === p.home) this.lock(p, n++);
        else if (!p.locked) p.s.v -= 1.5; // little settle bounce
      }
      this.kick();
      if (this.placed === this.pieces.length) this.win();
    });
  }

  private lock(p: Piece, stagger: number) {
    p.locked = true;
    this.placed++;
    if (this.selected === p) this.clearSelection(false);
    p.el.classList.add("locked");
    p.el.style.zIndex = "0";
    p.s.v += 4;
    const progress = this.placed / this.pieces.length;
    this.later(stagger * 110, () => {
      sound.correct(progress, 0, this.pan(p));
      haptics.correct();
      const r = this.el.getBoundingClientRect();
      fx.sparkle(r.left + p.x.t + this.cell / 2, r.top + p.y.t + this.cell / 2, 14, Math.min(1, this.cell / 160));
    });
  }

  private win() {
    this.solved = true;
    this.later(350, () => {
      this.el.classList.add("solved");
      sound.win();
      haptics.win();
    });
    this.later(900, () => fx.celebrate());
    this.later(1500, () => this.opts.onSolved());
  }

  private later(ms: number, fn: () => void) {
    const id = window.setTimeout(() => {
      this.timers.delete(id);
      fn();
    }, ms);
    this.timers.add(id);
  }
}

/** Advance a damped spring. Returns whether it is still moving. */
function step(s: Spring, p: SpringParams, dt: number): boolean {
  const h = 1 / 240;
  for (let t = 0; t < dt; t += h) {
    const d = Math.min(h, dt - t);
    s.v += (p.k * (s.t - s.x) - p.c * s.v) * d;
    s.x += s.v * d;
  }
  if (Math.abs(s.t - s.x) < 0.005 && Math.abs(s.v) < 0.01) {
    s.x = s.t;
    s.v = 0;
    return false;
  }
  return true;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Random permutation where nothing starts in its home slot. */
function derangement(n: number): number[] {
  for (;;) {
    const a = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    if (a.every((v, i) => v !== i)) return a;
  }
}
