// Full-screen canvas for sparkles and confetti, drawn above everything and ignoring input.

const COLORS = ["#ff5f8f", "#ffc93c", "#2ec4b6", "#8b5cf6", "#ff7a59", "#4fb8ff", "#7bd96a"];

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  size: number;
  life: number;
  maxLife: number;
  color: string;
  shape: "star" | "dot" | "ribbon";
  gravity: number;
  drag: number;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

class Fx {
  private canvas = document.createElement("canvas");
  private ctx = this.canvas.getContext("2d")!;
  private particles: Particle[] = [];
  private raf = 0;
  private last = 0;

  constructor() {
    this.canvas.className = "fx";
    document.body.appendChild(this.canvas);
    const resize = () => {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      this.canvas.width = innerWidth * dpr;
      this.canvas.height = innerHeight * dpr;
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    addEventListener("resize", resize);
    resize();
  }

  /** Small radial burst of stars, e.g. when a piece lands home. */
  sparkle(x: number, y: number, count = 16, spread = 1) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + rand(-0.2, 0.2);
      const speed = rand(180, 420) * spread;
      this.add({
        x, y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        size: rand(6, 13),
        maxLife: rand(0.5, 0.9),
        color: pick(["#fff7b0", "#ffc93c", "#ffffff", "#ff9ec0"]),
        shape: Math.random() < 0.7 ? "star" : "dot",
        gravity: 300,
        drag: 3.2,
      });
    }
  }

  /** Confetti cannons from both bottom corners plus a gentle rain from the top. */
  celebrate() {
    const w = innerWidth;
    const h = innerHeight;
    for (const side of [-1, 1]) {
      for (let i = 0; i < 90; i++) {
        const a = -Math.PI / 2 + side * rand(0.15, 0.6);
        const speed = rand(700, 1400) * Math.min(1, h / 800 + 0.3);
        this.add({
          x: side < 0 ? 0 : w,
          y: h,
          vx: Math.cos(a) * speed,
          vy: Math.sin(a) * speed,
          size: rand(8, 15),
          maxLife: rand(2.4, 3.6),
          color: pick(COLORS),
          shape: Math.random() < 0.75 ? "ribbon" : "star",
          gravity: 900,
          drag: 1.4,
        });
      }
    }
    for (let i = 0; i < 70; i++) {
      this.add({
        x: rand(0, w),
        y: rand(-h * 0.6, -10),
        vx: rand(-40, 40),
        vy: rand(60, 200),
        size: rand(8, 14),
        maxLife: rand(3, 4.5),
        color: pick(COLORS),
        shape: "ribbon",
        gravity: 120,
        drag: 0.6,
      });
    }
  }

  clear() {
    this.particles = [];
  }

  private add(p: Omit<Particle, "rot" | "vr" | "life">) {
    this.particles.push({ ...p, rot: rand(0, Math.PI * 2), vr: rand(-10, 10), life: 0 });
    if (!this.raf) {
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.frame);
    }
  }

  private frame = (now: number) => {
    const dt = Math.min(0.033, (now - this.last) / 1000);
    this.last = now;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, innerWidth, innerHeight);

    this.particles = this.particles.filter((p) => (p.life += dt) < p.maxLife && p.y < innerHeight + 60);
    for (const p of this.particles) {
      const k = Math.exp(-p.drag * dt);
      p.vx *= k;
      p.vy = p.vy * k + p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;

      const t = p.life / p.maxLife;
      ctx.globalAlpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
      ctx.fillStyle = p.color;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      if (p.shape === "ribbon") {
        // Fake 3D flutter by squashing one axis.
        ctx.scale(1, Math.cos(p.life * 9 + p.size));
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      } else if (p.shape === "star") {
        star(ctx, p.size * (1 - t * 0.5));
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    this.raf = this.particles.length ? requestAnimationFrame(this.frame) : 0;
  };
}

function star(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const rr = i % 2 ? r * 0.28 : r;
    const a = (i / 8) * Math.PI * 2;
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

export const fx = new Fx();
