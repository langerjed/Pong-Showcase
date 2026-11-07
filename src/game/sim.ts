// ============================================================
//  Pong Showcase — tennis simulation
//  Pure game logic in metres and seconds: no DOM, no drawing.
//  x runs across the court, y along it (net at 0, near baseline
//  positive), z is height.
// ============================================================

import type { ShotTiming, ShotType } from './types';

export type End = 'near' | 'far';

export const COURT = {
  halfLength: 11.885,
  doublesHalf: 5.485,
  singlesHalf: 4.115,
  serviceLine: 6.4,
  netCentre: 0.914,
  netPost: 1.07,
  netHalf: 6.4,
};

/** Slows real time so a browser player has a human chance against realistic ball speeds. */
export const TIME_SCALE = 0.72;
export const STEP = 1 / 120;

const G = 9.81;
const DRAG = 0.016;
const MAGNUS = 6.5;
const BALL_R = 0.033;
const RUN_SPEED = 6.4;
const RUN_ACCEL = 26;
export const REACH = 2.1;
const SWEET_REACH = 1.3;
export const WINDOW = { perfect: 0.05, good: 0.11, poor: 0.2 };
export const TOSS_IDEAL = 0.55;
const FULL_LOAD = 0.45;
const DEG = Math.PI / 180;

export interface ShotSpec {
  speed: number;
  spin: number;
  bounceE: number;
  bounceF: number;
  curve: number;
  highArc: boolean;
  depth: number;
  depthRange: number;
  maxAimX: number;
}

/** Every stroke differs in pace, arc, spin and bounce; these numbers are the whole personality of a shot. */
export const SHOTS: Record<ShotType, ShotSpec> = {
  topspin: { speed: 27, spin: 1.0, bounceE: 0.62, bounceF: 0.72, curve: 0, highArc: false, depth: 9.3, depthRange: 1.5, maxAimX: 3.6 },
  flat: { speed: 34, spin: 0.15, bounceE: 0.6, bounceF: 0.76, curve: 0, highArc: false, depth: 9.6, depthRange: 1.4, maxAimX: 3.7 },
  slice: { speed: 21, spin: -0.7, bounceE: 0.52, bounceF: 0.74, curve: 1.4, highArc: false, depth: 8.8, depthRange: 2, maxAimX: 3.4 },
  lob: { speed: 18, spin: 0.5, bounceE: 0.5, bounceF: 0.62, curve: 0, highArc: true, depth: 9.8, depthRange: 1.2, maxAimX: 3 },
  drop: { speed: 12, spin: -1.3, bounceE: 0.55, bounceF: 0.32, curve: 0, highArc: false, depth: 2.6, depthRange: 0.8, maxAimX: 3 },
};

const SERVES: Partial<Record<ShotType, ShotSpec>> = {
  flat: { ...SHOTS.flat, speed: 41, spin: 0.2, bounceE: 0.55, bounceF: 0.68 },
  topspin: { ...SHOTS.topspin, speed: 32, spin: 1.1, bounceE: 0.68, bounceF: 0.66 },
  slice: { ...SHOTS.slice, speed: 35, spin: -0.6, bounceE: 0.52, bounceF: 0.66, curve: 2 },
};

export interface BallState {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  spin: number; curve: number;
  e: number; f: number;
  bounces: number;
  netted: boolean;
}

export type BallEvent = 'bounce' | 'net' | null;

export function netHeightAt(x: number) {
  return COURT.netCentre + (Math.min(Math.abs(x), COURT.netHalf) / COURT.netHalf) * (COURT.netPost - COURT.netCentre);
}

export function stepBall(b: BallState, h: number): BallEvent {
  const speed = Math.hypot(b.vx, b.vy, b.vz);
  const lift = Math.min(1.4, speed / 25);
  b.vx += (-DRAG * speed * b.vx + b.curve * lift) * h;
  b.vy += -DRAG * speed * b.vy * h;
  b.vz += (-G - DRAG * speed * b.vz - b.spin * MAGNUS * lift) * h;
  const prevY = b.y;
  b.x += b.vx * h;
  b.y += b.vy * h;
  b.z += b.vz * h;
  if (!b.netted && prevY !== 0 && prevY * b.y <= 0 && b.z < netHeightAt(b.x) && Math.abs(b.x) <= COURT.netHalf) {
    b.netted = true;
    b.y = Math.sign(prevY) * 0.03;
    b.vy *= -0.1;
    b.vx *= 0.3;
    b.vz = Math.min(b.vz, 0) * 0.3;
    return 'net';
  }
  if (b.z <= BALL_R && b.vz < 0) {
    b.z = BALL_R;
    b.vz = -b.vz * b.e;
    if (b.vz < 0.35) b.vz = 0;
    b.vx *= b.f;
    b.vy *= b.f;
    b.spin *= 0.4;
    b.curve = 0;
    b.bounces++;
    return 'bounce';
  }
  return null;
}

export interface Launch { vx: number; vy: number; vz: number; speed: number }

function flightOf(from: { x: number; y: number; z: number }, dirX: number, dirY: number, speed: number, elevation: number, spec: ShotSpec) {
  const b: BallState = {
    x: from.x, y: from.y, z: from.z,
    vx: dirX * Math.cos(elevation) * speed, vy: dirY * Math.cos(elevation) * speed, vz: Math.sin(elevation) * speed,
    spin: spec.spin, curve: 0, e: spec.bounceE, f: spec.bounceF, bounces: 0, netted: true,
  };
  let netClear = Infinity;
  for (let i = 0; i < 1200; i++) {
    const prevY = b.y;
    stepBall(b, STEP);
    if (prevY * b.y <= 0) netClear = b.z - netHeightAt(b.x);
    if (b.bounces > 0) break;
  }
  return { distance: Math.hypot(b.x - from.x, b.y - from.y), netClear };
}

/** Finds the launch that lands a clean strike on the target, taking pace off rather than aiming into the net. */
export function solveLaunch(from: { x: number; y: number; z: number }, tx: number, ty: number, speed: number, spec: ShotSpec, minElevation = -6 * DEG): Launch {
  const dist = Math.hypot(tx - from.x, ty - from.y) || 1;
  const dirX = (tx - from.x) / dist;
  const dirY = (ty - from.y) / dist;
  let current = speed;
  let elevation = 10 * DEG;
  for (let attempt = 0; attempt < 10; attempt++) {
    let lo = spec.highArc ? 34 * DEG : minElevation;
    let hi = spec.highArc ? 70 * DEG : 32 * DEG;
    const nearAngle = spec.highArc ? hi : lo;
    const farAngle = spec.highArc ? lo : hi;
    if (flightOf(from, dirX, dirY, current, nearAngle, spec).distance > dist) {
      current *= 0.92;
      continue;
    }
    if (flightOf(from, dirX, dirY, current, farAngle, spec).distance < dist) {
      elevation = farAngle;
      break;
    }
    for (let i = 0; i < 16; i++) {
      elevation = (lo + hi) / 2;
      const long = flightOf(from, dirX, dirY, current, elevation, spec).distance > dist;
      if (long === spec.highArc) lo = elevation; else hi = elevation;
    }
    if (flightOf(from, dirX, dirY, current, elevation, spec).netClear >= 0.12) break;
    current *= 0.93;
  }
  return {
    vx: dirX * Math.cos(elevation) * current,
    vy: dirY * Math.cos(elevation) * current,
    vz: Math.sin(elevation) * current,
    speed: current,
  };
}

export interface TimingResult {
  grade: ShotTiming;
  pace: number;
  spin: number;
  /** Sideways error in degrees, positive when pulled across the body. */
  pull: number;
  /** Launch-angle error in degrees: early sails long, late drops into the net. */
  lift: number;
}

export function gradeTiming(err: number): TimingResult {
  const size = Math.abs(err);
  if (size <= WINDOW.perfect) return { grade: 'perfect', pace: 1.07, spin: 1.2, pull: 0, lift: 0 };
  const direction = err < 0 ? 1 : -1;
  if (size <= WINDOW.good) return { grade: 'good', pace: 0.97, spin: 1, pull: direction * 1.1, lift: direction * 0.35 };
  const severity = Math.min(1, (size - WINDOW.good) / (WINDOW.poor - WINDOW.good));
  return {
    grade: err < 0 ? 'early' : 'late',
    pace: 0.86,
    spin: 0.8,
    pull: direction * (4 + severity * 5),
    // Late contact catches the ball on its way down and behind the body, so it dumps hard into the net.
    lift: err < 0 ? 1.5 + severity * 2.5 : -(3.5 + severity * 6.5),
  };
}

export const toMph = (metresPerSecond: number) => Math.round(metresPerSecond * 2.237);
export const toRpm = (spin: number) => Math.round((Math.abs(spin) * 2800) / 50) * 50;

export interface PathSample { t: number; x: number; y: number; z: number; vz: number; bounces: number }

type SwingPhase = 'idle' | 'load' | 'forward' | 'follow';

export interface Swing {
  phase: SwingPhase;
  shot: ShotType;
  hand: 'fh' | 'bh';
  serve: boolean;
  pressedAt: number;
  startedAt: number;
  contactAt: number;
  endsAt: number;
  err: number;
  power: number;
  whiff: '' | 'TOO EARLY' | 'TOO LATE';
  aimX: number;
  aimY: number;
  contact: { x: number; y: number; z: number } | null;
}

export interface Player {
  end: End;
  x: number; y: number;
  vx: number; vy: number;
  inputX: number; inputY: number;
  runPhase: number;
  splitAt: number;
  swing: Swing;
}

export type SimEvent =
  | { type: 'hit'; end: End; shot: ShotType; timing: ShotTiming; mph: number; rpm: number; serve: boolean; x: number; y: number; z: number; stretched: boolean }
  | { type: 'bounce'; x: number; y: number; z: number }
  | { type: 'net'; x: number }
  | { type: 'call'; text: string; x: number; y: number; end: End }
  | { type: 'point'; winner: End; reason: string; rally: number }
  | { type: 'game'; winner: End }
  | { type: 'match'; winner: End };

export interface SimConfig {
  /** Skill from 0 (easy) to 2 (hard) for each computer-controlled end. */
  cpu?: Partial<Record<End, number>>;
  practice?: boolean;
  rng?: () => number;
  gamesToWin?: number;
  firstServer?: End;
}

const CPU_LEVELS = [
  { sigma: 0.11, react: 0.22, speed: 0.84, aim: 1.8, risk: 0.05 },
  { sigma: 0.08, react: 0.13, speed: 0.93, aim: 2.7, risk: 0.14 },
  { sigma: 0.058, react: 0.07, speed: 1, aim: 3.3, risk: 0.24 },
];

const newSwing = (): Swing => ({
  phase: 'idle', shot: 'topspin', hand: 'fh', serve: false, pressedAt: 0, startedAt: 0, contactAt: 0, endsAt: 0,
  err: 0, power: 0, whiff: '', aimX: 0, aimY: 0, contact: null,
});

const newPlayer = (end: End): Player => ({
  end, x: 0, y: end === 'near' ? 12.6 : -12.6, vx: 0, vy: 0, inputX: 0, inputY: 0, runPhase: 0, splitAt: -9, swing: newSwing(),
});

const other = (end: End): End => (end === 'near' ? 'far' : 'near');
const endSign = (end: End) => (end === 'near' ? 1 : -1);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const POINT_NAMES = ['0', '15', '30', '40'];

export class TennisSim {
  t = 0;
  phase: 'serve' | 'rally' | 'dead' = 'serve';
  players: Record<End, Player> = { near: newPlayer('near'), far: newPlayer('far') };
  ball: BallState = { x: 0, y: 0, z: 1, vx: 0, vy: 0, vz: 0, spin: 0, curve: 0, e: 0.7, f: 0.7, bounces: 0, netted: false };
  ballShot: ShotType = 'topspin';
  ballHeld = true;
  lastHitter: End | null = null;
  isServeBall = false;
  rally = 0;
  path: PathSample[] = [];
  plans: Partial<Record<End, PathSample>> = {};
  landing: { x: number; y: number } | null = null;
  server: End;
  faults = 0;
  points: Record<End, number> = { near: 0, far: 0 };
  games: Record<End, number> = { near: 0, far: 0 };
  matchWinner: End | null = null;
  tossAt: number | null = null;
  practice = { perfects: 0, tries: 0, inCourt: 0, streak: 0, best: 0 };
  events: SimEvent[] = [];
  readonly isPractice: boolean;

  private cfg: SimConfig;
  private rng: () => number;
  private acc = 0;
  private deadUntil = 0;
  private serveReadyAt = 0;
  private ai: Record<End, { reactAt: number; err: number; aimX: number; aimY: number; shot: ShotType; pressed: boolean; released: boolean }>;

  constructor(cfg: SimConfig = {}) {
    this.cfg = cfg;
    this.rng = cfg.rng ?? Math.random;
    this.isPractice = Boolean(cfg.practice);
    this.server = cfg.firstServer ?? 'near';
    const blankAi = () => ({ reactAt: 0, err: 0, aimX: 0, aimY: 0, shot: 'topspin' as ShotType, pressed: false, released: false });
    this.ai = { near: blankAi(), far: blankAi() };
    if (this.isPractice) this.feedPractice();
    else this.setupPoint();
  }

  isCpu(end: End) { return this.cfg.cpu?.[end] !== undefined; }

  /** "30", "AD" and so on for the scoreboard. */
  pointLabel(end: End) {
    const mine = this.points[end], theirs = this.points[other(end)];
    if (mine >= 3 && theirs >= 3) return mine > theirs ? 'AD' : '40';
    return POINT_NAMES[Math.min(mine, 3)];
  }

  isDeuceCourt() { return (this.points.near + this.points.far) % 2 === 0; }

  private serveX() {
    const right = this.isDeuceCourt() ? 1 : -1;
    return (this.server === 'near' ? right : -right) * 1.4;
  }

  private setupPoint() {
    this.phase = 'serve';
    this.tossAt = null;
    this.ballHeld = true;
    this.isServeBall = false;
    this.lastHitter = null;
    this.landing = null;
    this.rally = 0;
    this.path = [];
    this.plans = {};
    const serverX = this.serveX();
    const receiver = other(this.server);
    const s = this.players[this.server], r = this.players[receiver];
    s.x = serverX; s.y = endSign(this.server) * (COURT.halfLength + 0.4);
    r.x = -serverX * 1.5; r.y = endSign(receiver) * (COURT.halfLength + 0.4);
    for (const p of [s, r]) { p.vx = 0; p.vy = 0; p.swing = newSwing(); }
    this.holdBall();
    this.serveReadyAt = this.t + 0.7;
    this.ai[this.server].pressed = false;
    this.ai[this.server].released = false;
  }

  private holdBall() {
    const s = this.players[this.server];
    this.ball = { ...this.ball, x: s.x - endSign(this.server) * 0.3, y: s.y - endSign(this.server) * 0.25, z: 1.05, vx: 0, vy: 0, vz: 0, bounces: 0, netted: false, spin: 0, curve: 0 };
  }

  setMove(end: End, x: number, y: number) {
    const p = this.players[end];
    const size = Math.hypot(x, y);
    p.inputX = size > 1 ? x / size : x;
    p.inputY = size > 1 ? y / size : y;
  }

  press(end: End, shot: ShotType) {
    const p = this.players[end];
    if (p.swing.phase !== 'idle' && p.swing.phase !== 'follow') return;
    if (this.phase === 'serve') {
      if (end !== this.server || this.tossAt !== null || this.t < this.serveReadyAt) return;
      this.tossAt = this.t;
      this.ballHeld = false;
      p.swing = { ...newSwing(), phase: 'load', shot: SERVES[shot] ? shot : 'flat', serve: true, pressedAt: this.t };
      return;
    }
    if (this.phase === 'dead') return;
    const plan = this.plans[end];
    p.swing = {
      ...newSwing(), phase: 'load', shot, pressedAt: this.t,
      hand: plan ? this.handFor(p, plan.x) : 'fh',
    };
  }

  release(end: End) {
    const p = this.players[end];
    const sw = p.swing;
    if (sw.phase !== 'load') return;
    sw.power = clamp((this.t - sw.pressedAt) / FULL_LOAD, 0, 1);
    sw.aimX = p.inputX;
    sw.aimY = p.inputY;
    sw.startedAt = this.t;

    if (sw.serve) {
      const err = this.t - (this.tossAt ?? this.t) - TOSS_IDEAL;
      if (Math.abs(err) > WINDOW.poor + 0.02) {
        this.events.push({ type: 'call', text: 'RE-TOSS', x: p.x, y: p.y, end });
        this.catchToss();
        return;
      }
      sw.err = err;
      sw.phase = 'forward';
      sw.contactAt = this.t + 0.05;
      return;
    }

    sw.phase = 'forward';
    const plan = this.plans[end];
    const incoming = this.phase === 'rally' && this.lastHitter === other(end) && !this.ball.netted && plan;
    if (!incoming) {
      sw.contactAt = this.t + 0.14;
      return;
    }
    sw.err = this.t - plan.t;
    sw.hand = this.handFor(p, plan.x);
    if (sw.err < -WINDOW.poor) {
      sw.whiff = 'TOO EARLY';
      sw.contactAt = this.t + 0.14;
    } else if (sw.err > WINDOW.poor) {
      sw.whiff = 'TOO LATE';
      sw.contactAt = this.t + 0.05;
    } else {
      sw.contactAt = Math.max(this.t + 0.01, plan.t);
      sw.contact = { x: plan.x, y: plan.y, z: plan.z };
    }
  }

  private handFor(p: Player, ballX: number): 'fh' | 'bh' {
    return (ballX - p.x) * endSign(p.end) >= -0.1 ? 'fh' : 'bh';
  }

  private catchToss() {
    const s = this.players[this.server];
    this.tossAt = null;
    this.ballHeld = true;
    s.swing = newSwing();
    this.holdBall();
    this.serveReadyAt = this.t + 0.3;
    this.ai[this.server].pressed = false;
    this.ai[this.server].released = false;
  }

  /** Advances the game by real elapsed seconds. */
  step(realDt: number) {
    this.acc += realDt * TIME_SCALE;
    while (this.acc >= STEP) {
      this.acc -= STEP;
      this.tick(STEP);
    }
  }

  tick(h: number) {
    this.t += h;
    this.updateCpu('near');
    this.updateCpu('far');
    this.movePlayer(this.players.near, h);
    this.movePlayer(this.players.far, h);
    this.updatePlan('near');
    this.updatePlan('far');
    this.updateSwing(this.players.near);
    this.updateSwing(this.players.far);
    this.updateBall(h);

    if (this.phase === 'dead' && this.t >= this.deadUntil && !this.matchWinner) {
      if (this.isPractice) this.feedPractice();
      else this.setupPoint();
    }
  }

  private movePlayer(p: Player, h: number) {
    const sw = p.swing;
    const scale = sw.phase === 'forward' ? 0.3 : sw.phase === 'load' ? 0.82 : sw.phase === 'follow' ? 0.55 : 1;
    let inputX = p.inputX, inputY = p.inputY;
    if (this.phase === 'serve') {
      if (p.end === this.server) {
        inputY = 0;
        if (this.tossAt !== null) inputX = 0;
      }
    }
    const targetVx = inputX * RUN_SPEED * scale;
    const targetVy = inputY * RUN_SPEED * scale;
    const maxChange = RUN_ACCEL * h;
    p.vx += clamp(targetVx - p.vx, -maxChange, maxChange);
    p.vy += clamp(targetVy - p.vy, -maxChange, maxChange);
    p.x = clamp(p.x + p.vx * h, -8.5, 8.5);
    const sign = endSign(p.end);
    p.y = sign * clamp(sign * (p.y + p.vy * h), 0.7, p.end === 'near' ? 14.2 : 16.5);
    if (this.phase === 'serve' && p.end === this.server) {
      const side = Math.sign(this.serveX());
      p.x = side * clamp(side * p.x, 0.25, 3.6);
    }
    p.runPhase += Math.hypot(p.vx, p.vy) * h * 2.3;
  }

  private updatePlan(end: End) {
    if (this.phase !== 'rally' || this.lastHitter !== other(end) || this.ball.netted) {
      delete this.plans[end];
      return;
    }
    if (this.isCpu(end)) return;
    const plan = this.plans[end];
    if (plan && plan.t <= this.t) return;
    const best = this.bestStrike(end);
    if (best) this.plans[end] = best;
    else delete this.plans[end];
  }

  private validSample(s: PathSample, end: End) {
    if (s.y * endSign(end) <= 0.3) return false;
    if (s.bounces === 1) return s.z >= 0.16 && s.z <= 2.2;
    return s.bounces === 0 && s.z >= 0.7 && s.z <= 2.4 && Math.abs(s.y) < 8.5;
  }

  /** The spot where this player, from where they stand now, meets the ball most naturally. */
  bestStrike(end: End) {
    const p = this.players[end];
    let best: PathSample | null = null;
    let bestCost = Infinity;
    for (const s of this.path) {
      if (s.t < this.t || !this.validSample(s, end)) continue;
      const cost = Math.hypot(s.x - p.x, s.y - p.y) + (s.bounces === 0 ? 0.9 : 0);
      if (cost < bestCost) { bestCost = cost; best = s; }
    }
    return best;
  }

  private updateSwing(p: Player) {
    const sw = p.swing;
    if (sw.phase === 'forward' && this.t >= sw.contactAt) {
      if (sw.serve) {
        this.launchServe(p);
      } else if (sw.whiff) {
        this.events.push({ type: 'call', text: sw.whiff, x: p.x, y: p.y, end: p.end });
        if (this.isPractice && p.end === 'near') this.scorePractice(null);
      } else if (this.phase === 'rally' && this.lastHitter === other(p.end) && !this.ball.netted) {
        this.tryContact(p);
      }
      sw.phase = 'follow';
      sw.endsAt = this.t + 0.38;
    } else if (sw.phase === 'follow' && this.t >= sw.endsAt) {
      p.swing = newSwing();
    } else if (sw.phase === 'load' && sw.serve && this.tossAt !== null && this.t - this.tossAt > TOSS_IDEAL + 0.45) {
      this.catchToss();
    }
  }

  private tryContact(p: Player) {
    const b = this.ball;
    const dist = Math.hypot(b.x - p.x, b.y - p.y);
    if (dist > REACH || b.z > 2.9 || b.z < 0.08 || b.bounces >= 2) {
      this.events.push({ type: 'call', text: dist > REACH ? 'OUT OF REACH' : 'MISSED IT', x: p.x, y: p.y, end: p.end });
      if (this.isPractice && p.end === 'near') this.scorePractice(null);
      return;
    }
    this.hitBall(p, dist);
  }

  private hitBall(p: Player, reach: number) {
    const sw = p.swing;
    const spec = SHOTS[sw.shot];
    const timing = gradeTiming(sw.err);
    const sign = endSign(p.end);
    const b = this.ball;

    const stretch = clamp((reach - SWEET_REACH) / (REACH - SWEET_REACH), 0, 1);
    const lowBall = b.z < 0.6 ? 0.88 : 1;
    const speed = spec.speed * (0.74 + 0.26 * sw.power) * timing.pace * (1 - stretch * 0.25) * (sw.shot === 'flat' ? lowBall : 1);

    // The direction held at the swing picks the target.
    const aimX = sw.aimX;
    const tx = aimX !== 0 ? aimX * spec.maxAimX : clamp(-p.x * 0.25, -1.5, 1.5);
    // Up-screen goes deeper for the near player, down-screen for the far player.
    const depthInput = p.end === 'near' ? -sw.aimY : sw.aimY;
    const ty = -sign * clamp(spec.depth + depthInput * spec.depthRange, 1.6, COURT.halfLength - 0.5);

    const launch = solveLaunch(b, tx, ty, speed, spec);
    const handSign = sw.hand === 'fh' ? 1 : -1;
    const scatter = (this.rng() - 0.5) * stretch * 5;
    const azimuth = (timing.pull * handSign * sign + scatter) * DEG;
    const liftError = timing.lift * (spec.highArc ? 1.6 : 1) * DEG;

    const horizontal = Math.hypot(launch.vx, launch.vy);
    const heading = Math.atan2(launch.vy, launch.vx) + azimuth;
    const elevation = Math.atan2(launch.vz, horizontal) + liftError;
    const total = launch.speed;

    b.vx = Math.cos(elevation) * Math.cos(heading) * total;
    b.vy = Math.cos(elevation) * Math.sin(heading) * total;
    b.vz = Math.sin(elevation) * total;
    b.spin = spec.spin * timing.spin;
    b.curve = spec.curve * (tx >= b.x ? 1 : -1);
    b.e = spec.bounceE;
    b.f = spec.bounceF;
    b.bounces = 0;
    b.netted = false;

    this.ballShot = sw.shot;
    this.lastHitter = p.end;
    this.isServeBall = false;
    this.rally++;
    this.afterLaunch(p.end);
    this.events.push({
      type: 'hit', end: p.end, shot: sw.shot, timing: timing.grade, mph: toMph(total), rpm: toRpm(b.spin), serve: false,
      x: b.x, y: b.y, z: b.z, stretched: stretch > 0.5,
    });
    if (this.isPractice && p.end === 'near') this.scorePractice(timing.grade);
  }

  private launchServe(p: Player) {
    const sw = p.swing;
    const spec = SERVES[sw.shot] ?? SERVES.flat!;
    const timing = gradeTiming(sw.err);
    const sign = endSign(p.end);
    const b = this.ball;
    b.x = p.x + sign * 0.15;
    b.y = p.y - sign * 0.3;

    const boxSide = -Math.sign(this.serveX());
    const aim = p.inputX || sw.aimX;
    const tx = boxSide * clamp(2.1 + aim * boxSide * 1.5, 0.5, 3.75);
    const ty = -sign * (COURT.serviceLine - 0.9);
    const second = this.faults === 1 ? 0.84 : 1;
    const launch = solveLaunch(b, tx, ty, spec.speed * timing.pace * second, spec, -14 * DEG);
    const heading = Math.atan2(launch.vy, launch.vx) + timing.pull * sign * 0.8 * DEG;
    const horizontal = Math.hypot(launch.vx, launch.vy);
    const elevation = Math.atan2(launch.vz, horizontal) + timing.lift * 0.8 * DEG;

    b.vx = Math.cos(elevation) * Math.cos(heading) * launch.speed;
    b.vy = Math.cos(elevation) * Math.sin(heading) * launch.speed;
    b.vz = Math.sin(elevation) * launch.speed;
    b.spin = spec.spin * timing.spin;
    b.curve = spec.curve * boxSide * 0.5;
    b.e = spec.bounceE;
    b.f = spec.bounceF;
    b.bounces = 0;
    b.netted = false;

    this.ballShot = sw.shot;
    this.lastHitter = p.end;
    this.isServeBall = true;
    this.tossAt = null;
    this.phase = 'rally';
    this.afterLaunch(p.end);
    this.events.push({
      type: 'hit', end: p.end, shot: sw.shot, timing: timing.grade, mph: toMph(launch.speed), rpm: toRpm(b.spin), serve: true,
      x: b.x, y: b.y, z: b.z, stretched: false,
    });
  }

  private afterLaunch(hitter: End) {
    const receiver = other(hitter);
    this.path = this.buildPath();
    delete this.plans[hitter];
    delete this.plans[receiver];
    const first = this.path.find(s => s.bounces === 1);
    this.landing = first ? { x: first.x, y: first.y } : null;
    this.players[receiver].splitAt = this.t;
    if (this.isCpu(receiver)) this.prepareCpu(receiver);
  }

  buildPath() {
    const b = { ...this.ball };
    const samples: PathSample[] = [];
    let t = this.t;
    for (let i = 0; i < 960; i++) {
      stepBall(b, STEP);
      t += STEP;
      if (i % 2 === 0) samples.push({ t, x: b.x, y: b.y, z: b.z, vz: b.vz, bounces: b.bounces });
      if (b.bounces >= 2 || b.netted) break;
    }
    return samples;
  }

  private updateBall(h: number) {
    if (this.tossAt !== null && this.phase === 'serve') {
      const elapsed = this.t - this.tossAt;
      const s = this.players[this.server];
      const sign = endSign(this.server);
      this.ball.x = s.x - sign * 0.1;
      this.ball.y = s.y - sign * 0.3;
      this.ball.z = 1.25 + 5.5 * elapsed - 0.5 * G * elapsed * elapsed;
      return;
    }
    if (this.ballHeld) {
      if (this.phase === 'serve') this.holdBall();
      return;
    }
    if (this.phase === 'serve') return;
    if (this.ball.z <= BALL_R + 0.001 && this.ball.vz === 0 && Math.hypot(this.ball.vx, this.ball.vy) < 0.05) return;
    const event = stepBall(this.ball, h);
    if (event === 'net') {
      this.events.push({ type: 'net', x: this.ball.x });
      this.onNet();
    } else if (event === 'bounce') {
      this.events.push({ type: 'bounce', x: this.ball.x, y: this.ball.y, z: this.ball.z });
      this.onBounce();
    }
  }

  private onNet() {
    if (this.phase !== 'rally' || !this.lastHitter) return;
    const hitter = this.lastHitter;
    if (this.isPractice) { this.endPracticeBall('NET', hitter); return; }
    if (this.isServeBall) { this.onFault('NET'); return; }
    this.events.push({ type: 'call', text: 'NET', x: this.ball.x, y: 0, end: hitter });
    this.awardPoint(other(hitter), 'net');
  }

  private onBounce() {
    if (this.phase !== 'rally' || !this.lastHitter) return;
    const b = this.ball;
    const hitter = this.lastHitter;
    const receiver = other(hitter);
    const onReceiverSide = b.y * endSign(receiver) > 0;
    if (b.bounces === 1) {
      const inCourt = onReceiverSide && Math.abs(b.x) <= COURT.singlesHalf + BALL_R && Math.abs(b.y) <= COURT.halfLength + BALL_R;
      if (this.isServeBall) {
        const inBox = onReceiverSide && Math.abs(b.y) <= COURT.serviceLine + BALL_R
          && Math.abs(b.x) <= COURT.singlesHalf + BALL_R && b.x * this.serveX() <= BALL_R;
        if (!inBox) this.onFault('FAULT');
        return;
      }
      if (this.isPractice) {
        if (hitter === 'near') {
          if (inCourt) {
            this.practice.inCourt++;
            this.endPracticeBall('IN', hitter);
          } else {
            this.endPracticeBall('OUT', hitter);
          }
        }
        return;
      }
      if (!inCourt) {
        this.events.push({ type: 'call', text: 'OUT', x: b.x, y: b.y, end: hitter });
        this.awardPoint(receiver, 'out');
      }
    } else if (b.bounces === 2) {
      if (this.isPractice) {
        if (hitter === 'far') { this.scorePractice(null); this.endPracticeBall('MISSED', 'far'); }
        return;
      }
      this.events.push({ type: 'call', text: this.isServeBall ? 'ACE' : 'WINNER', x: b.x, y: b.y, end: hitter });
      this.awardPoint(hitter, this.isServeBall ? 'ace' : 'winner');
    }
  }

  private onFault(text: string) {
    const server = this.server;
    this.events.push({ type: 'call', text: this.faults === 1 ? 'DOUBLE FAULT' : text === 'NET' ? 'NET - FAULT' : 'FAULT', x: this.ball.x, y: this.ball.y, end: server });
    if (this.faults === 1) {
      this.faults = 0;
      this.awardPoint(other(server), 'double fault');
      return;
    }
    this.faults = 1;
    this.phase = 'dead';
    this.deadUntil = this.t + 0.8;
  }

  private awardPoint(winner: End, reason: string) {
    this.phase = 'dead';
    this.deadUntil = this.t + 1.3;
    this.faults = 0;
    this.events.push({ type: 'point', winner, reason, rally: this.rally });
    const loser = other(winner);
    this.points[winner]++;
    if (this.points[winner] >= 4 && this.points[winner] - this.points[loser] >= 2) {
      this.games[winner]++;
      this.points = { near: 0, far: 0 };
      this.server = other(this.server);
      this.events.push({ type: 'game', winner });
      if (this.games[winner] >= (this.cfg.gamesToWin ?? 3)) {
        this.matchWinner = winner;
        this.events.push({ type: 'match', winner });
      }
    }
  }

  // ---- Practice ----
  private feedPractice() {
    const coach = this.players.far;
    coach.x = 0;
    coach.y = -11.5;
    coach.swing = { ...newSwing(), phase: 'follow', shot: 'topspin', endsAt: this.t + 0.38, contactAt: this.t };
    const near = this.players.near;
    near.swing = newSwing();
    const spec = SHOTS.topspin;
    this.ball = {
      ...this.ball, x: 0.4, y: -11.4, z: 1.1, spin: spec.spin * 0.8, curve: 0, e: spec.bounceE, f: spec.bounceF, bounces: 0, netted: false, vx: 0, vy: 0, vz: 0,
    };
    const tx = (this.rng() - 0.5) * 6;
    const ty = 7 + this.rng() * 3;
    const launch = solveLaunch(this.ball, tx, ty, spec.speed * 0.82, spec);
    this.ball.vx = launch.vx;
    this.ball.vy = launch.vy;
    this.ball.vz = launch.vz;
    this.ballShot = 'topspin';
    this.ballHeld = false;
    this.lastHitter = 'far';
    this.isServeBall = false;
    this.phase = 'rally';
    this.afterLaunch('far');
    this.events.push({ type: 'hit', end: 'far', shot: 'topspin', timing: 'none', mph: toMph(launch.speed), rpm: toRpm(this.ball.spin), serve: false, x: 0.4, y: -11.4, z: 1.1, stretched: false });
  }

  private endPracticeBall(text: string, end: End) {
    if (this.phase !== 'rally') return;
    this.events.push({ type: 'call', text, x: this.ball.x, y: this.ball.y, end });
    this.phase = 'dead';
    this.deadUntil = this.t + 0.7;
  }

  private scorePractice(grade: ShotTiming | null) {
    const stats = this.practice;
    stats.tries++;
    if (grade === 'perfect') {
      stats.perfects++;
      stats.streak++;
      stats.best = Math.max(stats.best, stats.streak);
    } else {
      stats.streak = 0;
    }
  }

  // ---- Computer player ----
  private prepareCpu(end: End) {
    const level = CPU_LEVELS[this.cfg.cpu?.[end] ?? 1];
    const ai = this.ai[end];
    ai.reactAt = this.t + level.react;
    ai.pressed = false;
    ai.released = false;
    // Harder, wider balls rush the swing, so pressure wins points just as it does against a person.
    const pace = Math.hypot(this.ball.vx, this.ball.vy);
    const opponentX = this.landing ? Math.abs(this.landing.x - this.players[end].x) : 0;
    const pressure = 1 + clamp((pace - 18) / 30, 0, 0.5) + clamp(opponentX / 8, 0, 0.5);
    const noise = (this.rng() + this.rng() + this.rng() - 1.5) * 2 * level.sigma * pressure * 0.82;
    ai.err = clamp(noise, -WINDOW.poor + 0.01, WINDOW.poor - 0.01);
    this.players[end].swing = newSwing();
  }

  private chooseCpuStrike(end: End, speed: number) {
    const p = this.players[end];
    let fallback: PathSample | null = null;
    let early: PathSample | null = null;
    for (const s of this.path) {
      if (s.t < this.t || !this.validSample(s, end)) continue;
      fallback = s;
      const reachable = Math.max(0, Math.hypot(s.x - p.x, s.y - p.y) - 0.7) <= RUN_SPEED * speed * Math.max(0, s.t - this.t) * 0.85;
      if (!reachable) continue;
      if (s.bounces === 1 && s.vz <= 0) return s;
      early = early ?? s;
    }
    return early ?? fallback;
  }

  private updateCpu(end: End) {
    if (!this.isCpu(end)) return;
    const level = CPU_LEVELS[this.cfg.cpu?.[end] ?? 1];
    const ai = this.ai[end];
    const p = this.players[end];
    const sign = endSign(end);

    if (this.phase === 'serve') {
      if (this.server === end) {
        p.inputX = 0; p.inputY = 0;
        if (!ai.pressed && this.t >= this.serveReadyAt + 0.5) {
          ai.pressed = true;
          ai.shot = (['flat', 'topspin', 'slice'] as ShotType[])[Math.floor(this.rng() * 3)];
          ai.err = clamp((this.rng() - 0.5) * 2 * level.sigma * 0.9, -0.15, 0.15);
          this.press(end, ai.shot);
          p.inputX = (this.rng() - 0.5) * 1.6;
        }
        if (ai.pressed && !ai.released && this.tossAt !== null && this.t - this.tossAt >= TOSS_IDEAL + ai.err) {
          ai.released = true;
          this.release(end);
        }
      } else {
        p.inputX = 0; p.inputY = 0;
      }
      return;
    }

    const incoming = this.phase === 'rally' && this.lastHitter === other(end) && !this.ball.netted;
    if (!incoming) {
      this.steerTo(p, clamp(-this.ball.x * 0.15, -1.6, 1.6), sign * 12.6, 0.7);
      return;
    }
    if (this.t < ai.reactAt) { p.inputX = 0; p.inputY = 0; return; }

    let plan = this.plans[end];
    if (!plan || plan.t > this.t + 0.02) {
      const choice = this.chooseCpuStrike(end, level.speed);
      if (choice) { this.plans[end] = choice; plan = choice; }
    }
    if (!plan) { this.steerTo(p, this.ball.x, sign * 12, 1); return; }

    const standX = plan.x - sign * 0.55;
    this.steerTo(p, standX, plan.y + sign * 0.2, level.speed);

    if (!ai.pressed && this.t >= plan.t - 0.42) {
      ai.pressed = true;
      this.chooseCpuShot(end, plan, level);
      this.press(end, ai.shot);
    }
    if (ai.pressed && !ai.released && this.t >= plan.t + ai.err) {
      ai.released = true;
      p.inputX = ai.aimX;
      p.inputY = ai.aimY;
      this.release(end);
      p.inputX = 0; p.inputY = 0;
    }
  }

  private chooseCpuShot(end: End, plan: PathSample, level: typeof CPU_LEVELS[number]) {
    const ai = this.ai[end];
    const p = this.players[end];
    const opponent = this.players[other(end)];
    const stretched = Math.hypot(plan.x - p.x, plan.y - p.y) > 1.5;
    const roll = this.rng();
    if (stretched) ai.shot = roll < 0.6 ? 'slice' : 'lob';
    else if (Math.abs(opponent.y) < 6) ai.shot = roll < 0.45 ? 'lob' : 'flat';
    else if (Math.abs(plan.y) < 7) ai.shot = 'flat';
    else if (Math.abs(opponent.y) > 12.5 && roll < level.risk * 0.2) ai.shot = 'drop';
    else if (roll < level.risk) ai.shot = 'flat';
    else if (roll < level.risk + 0.14) ai.shot = 'slice';
    else ai.shot = 'topspin';
    const target = -Math.sign(opponent.x || (this.rng() - 0.5)) * level.aim * (0.65 + this.rng() * 0.35);
    ai.aimX = clamp(target / SHOTS[ai.shot].maxAimX, -1, 1);
    ai.aimY = 0;
  }

  private steerTo(p: Player, x: number, y: number, speed: number) {
    const dx = x - p.x, dy = y - p.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.12) { p.inputX = 0; p.inputY = 0; return; }
    const pace = Math.min(1, dist / 0.7) * speed;
    p.inputX = (dx / dist) * pace;
    p.inputY = (dy / dist) * pace;
  }
}
