// Synthesised sound effects. Everything is generated with Web Audio so there are no
// sample files to load and every sound can be pitched to the game state.

type Wave = OscillatorType;

interface ToneOpts {
  type?: Wave;
  freq: number;
  to?: number; // glide target frequency
  glide?: number; // glide time (s)
  attack?: number;
  decay: number;
  gain: number;
  when?: number; // seconds from now
  reverb?: number; // send level
  pan?: number;
}

// Major pentatonic: any sequence of these sounds pleasant together.
const PENTATONIC = [0, 2, 4, 7, 9];
const BASE_HZ = 392; // G4

export const noteHz = (step: number) => {
  const octave = Math.floor(step / PENTATONIC.length);
  const semis = octave * 12 + PENTATONIC[((step % 5) + 5) % 5];
  return BASE_HZ * 2 ** (semis / 12);
};

const MUTE_KEY = "pictureslide.muted";

class SoundEngine {
  private ctx?: AudioContext;
  private out!: GainNode;
  private reverbIn!: GainNode;
  private noise?: AudioBuffer;
  muted = localStorage.getItem(MUTE_KEY) === "1";

  /** Must be called from a user gesture before anything is audible (iOS/Chrome autoplay rules). */
  unlock() {
    if (!this.ctx) {
      // Play through the iOS silent switch like a media app rather than a ringer sound.
      const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
      if (session) session.type = "playback";

      const ctx = new AudioContext({ latencyHint: "interactive" });
      this.ctx = ctx;

      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      this.out = ctx.createGain();
      this.out.gain.value = this.muted ? 0 : 0.9;
      this.out.connect(comp).connect(ctx.destination);

      const convolver = ctx.createConvolver();
      convolver.buffer = this.impulse(1.8);
      this.reverbIn = ctx.createGain();
      this.reverbIn.gain.value = 0.35;
      this.reverbIn.connect(convolver).connect(this.out);

      this.noise = this.makeNoise();
    }
    if (this.ctx.state !== "running") this.ctx.resume().catch(() => {});
  }

  setMuted(m: boolean) {
    this.muted = m;
    localStorage.setItem(MUTE_KEY, m ? "1" : "0");
    if (this.ctx) this.out.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.02);
  }

  private impulse(seconds: number) {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
    }
    return buf;
  }

  private makeNoise() {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  private ready() {
    return this.ctx && this.ctx.state === "running" && !this.muted;
  }

  private route(node: AudioNode, reverb = 0.2, pan = 0) {
    const ctx = this.ctx!;
    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    node.connect(panner).connect(this.out);
    if (reverb > 0) {
      const send = ctx.createGain();
      send.gain.value = reverb;
      panner.connect(send).connect(this.reverbIn);
    }
  }

  private tone(o: ToneOpts) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + (o.when ?? 0);
    const attack = o.attack ?? 0.004;
    const osc = ctx.createOscillator();
    osc.type = o.type ?? "sine";
    osc.frequency.setValueAtTime(o.freq, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + (o.glide ?? o.decay * 0.6));
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + o.decay);
    osc.connect(g);
    this.route(g, o.reverb ?? 0.2, o.pan ?? 0);
    osc.start(t);
    osc.stop(t + attack + o.decay + 0.05);
  }

  private noiseBurst(opts: { when?: number; dur: number; gain: number; from: number; to: number; q?: number; reverb?: number }) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + (opts.when ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noise!;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.value = opts.q ?? 1.2;
    filter.frequency.setValueAtTime(opts.from, t);
    filter.frequency.exponentialRampToValueAtTime(opts.to, t + opts.dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(opts.gain, t + opts.dur * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur);
    src.connect(filter).connect(g);
    this.route(g, opts.reverb ?? 0.3);
    src.start(t, Math.random() * 0.5);
    src.stop(t + opts.dur + 0.05);
  }

  /** Mallet-like note: fundamental plus a quickly-decaying bright overtone. */
  private marimba(freq: number, when = 0, gain = 0.32, pan = 0) {
    this.tone({ freq, decay: 0.9, gain, when, reverb: 0.35, pan });
    this.tone({ freq: freq * 4, decay: 0.12, gain: gain * 0.35, when, reverb: 0.2, pan });
    this.tone({ type: "triangle", freq: freq * 2, decay: 0.3, gain: gain * 0.25, when, reverb: 0.3, pan });
  }

  // ---- Game vocabulary ---------------------------------------------------

  button() {
    if (!this.ready()) return;
    this.tone({ freq: 600, to: 900, glide: 0.05, decay: 0.09, gain: 0.25 });
  }

  /** Piece picked up (drag start) or selected (tap). */
  lift(pan = 0) {
    if (!this.ready()) return;
    this.tone({ freq: 380, to: 720, glide: 0.07, decay: 0.12, gain: 0.3, pan });
    this.tone({ type: "triangle", freq: 1400, decay: 0.03, gain: 0.06, pan });
  }

  /** Dragged piece passes over a new cell. */
  hover(pan = 0) {
    if (!this.ready()) return;
    this.tone({ type: "triangle", freq: 1900 + Math.random() * 300, decay: 0.03, gain: 0.07, reverb: 0.05, pan });
  }

  /** Woody thock when pieces settle. */
  drop(pan = 0) {
    if (!this.ready()) return;
    this.tone({ type: "triangle", freq: 240, to: 110, glide: 0.08, decay: 0.12, gain: 0.45, reverb: 0.1, pan });
    this.noiseBurst({ dur: 0.05, gain: 0.12, from: 2500, to: 900, q: 0.8, reverb: 0.05 });
  }

  swap(pan = 0) {
    if (!this.ready()) return;
    this.noiseBurst({ dur: 0.18, gain: 0.08, from: 700, to: 2600, q: 1.5, reverb: 0.15 });
    this.tone({ type: "triangle", freq: 240, to: 110, glide: 0.08, decay: 0.12, gain: 0.4, when: 0.12, reverb: 0.1, pan });
  }

  /** Piece let go somewhere it can't go: goes back home. */
  cancel(pan = 0) {
    if (!this.ready()) return;
    this.tone({ freq: 520, to: 300, glide: 0.14, decay: 0.18, gain: 0.22, pan });
  }

  deselect(pan = 0) {
    if (!this.ready()) return;
    this.tone({ freq: 640, to: 400, glide: 0.08, decay: 0.12, gain: 0.2, pan });
  }

  /** Tapped a piece that's already locked in place. */
  deny(pan = 0) {
    if (!this.ready()) return;
    this.tone({ type: "triangle", freq: 220, decay: 0.07, gain: 0.25, reverb: 0.05, pan });
    this.tone({ type: "triangle", freq: 196, decay: 0.09, gain: 0.25, when: 0.09, reverb: 0.05, pan });
  }

  /** A piece landed home. `progress` 0..1 climbs the scale as the picture completes. */
  correct(progress: number, when = 0, pan = 0) {
    if (!this.ready()) return;
    const step = Math.round(progress * 9);
    this.marimba(noteHz(step), when, 0.34, pan);
    this.tone({ freq: noteHz(step + 10), decay: 0.25, gain: 0.05, when: when + 0.08, reverb: 0.6, pan });
    this.tone({ freq: noteHz(step + 12), decay: 0.25, gain: 0.04, when: when + 0.15, reverb: 0.6, pan });
  }

  shuffle(count: number) {
    if (!this.ready()) return;
    this.noiseBurst({ dur: 0.7, gain: 0.18, from: 300, to: 3500, q: 1.1, reverb: 0.4 });
    const n = Math.min(count, 12);
    for (let i = 0; i < n; i++) {
      const step = 5 + Math.floor(Math.random() * 8);
      this.tone({ freq: noteHz(step), decay: 0.15, gain: 0.08, when: 0.1 + i * 0.045, reverb: 0.5, pan: Math.random() * 1.6 - 0.8 });
    }
  }

  win() {
    if (!this.ready()) return;
    const run = [0, 2, 4, 5, 7, 9, 10];
    run.forEach((s, i) => this.marimba(noteHz(s), i * 0.09, 0.28, -0.6 + i * 0.2));
    const t = run.length * 0.09 + 0.05;
    for (const s of [0, 2, 5, 10]) {
      this.tone({ freq: noteHz(s), attack: 0.02, decay: 2.2, gain: 0.16, when: t, reverb: 0.6 });
      this.tone({ type: "triangle", freq: noteHz(s) * 2, attack: 0.02, decay: 1.4, gain: 0.05, when: t, reverb: 0.6 });
    }
    for (let i = 0; i < 14; i++) {
      this.tone({ freq: noteHz(12 + Math.floor(Math.random() * 6)), decay: 0.2, gain: 0.05, when: t + 0.1 + i * 0.07, reverb: 0.8, pan: Math.random() * 2 - 1 });
    }
  }
}

export const sound = new SoundEngine();
