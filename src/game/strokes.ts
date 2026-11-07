// ============================================================
//  Pong Showcase — stroke mechanics
//  The racket head's path through the ball defines each shot.
//  Offsets are in the player's frame: [right, forward, up], in
//  metres, measured from the contact point unless marked absolute.
// ============================================================

import type { ShotType } from './types';

export type V3 = [number, number, number];
export type StrokeName = ShotType | 'serve';

interface Key {
  /** Position on the timeline: 0 is the backswing, 1 is contact, 2 is the end of the follow-through. */
  s: number;
  head: V3;
  /** Racket axis, butt towards tip. */
  dir: V3;
  /** Face angle in radians: positive is open (facing up), negative is closed (facing down). */
  tilt: number;
  /** Head position is relative to the player's feet instead of the contact point. */
  absolute?: boolean;
}

interface Stroke {
  keys: Key[];
  turn: number;
  /** Knee bend at the backswing and at the finish: leg drive is what lifts a topspin stroke. */
  crouchBack: number;
  crouchFinish: number;
}

const CONTACT_DIR: V3 = [0.92, 0.32, 0.12];

export const STROKES: Record<StrokeName, Stroke> = {
  // Low to high: the head drops under the ball, then brushes up the back of it and over the top.
  topspin: {
    turn: 1.1, crouchBack: 0.24, crouchFinish: 0.04,
    keys: [
      { s: 0, head: [0.25, -1.15, 0.3], dir: [0.3, -0.75, 0.55], tilt: -0.1 },
      { s: 0.6, head: [0.12, -0.7, -0.42], dir: [0.45, -0.7, -0.5], tilt: -0.22 },
      { s: 1, head: [0, 0, 0], dir: CONTACT_DIR, tilt: -0.22 },
      { s: 1.3, head: [-0.06, 0.42, 0.55], dir: [0.3, 0.4, 0.85], tilt: -0.2 },
      { s: 2, head: [-0.75, 0.05, 1.95], dir: [-0.55, -0.45, 0.65], tilt: -0.1, absolute: true },
    ],
  },
  // Level: a long, straight drive through the ball with a square face and extension towards the target.
  flat: {
    turn: 1.2, crouchBack: 0.16, crouchFinish: 0.1,
    keys: [
      { s: 0, head: [0.3, -1.25, 0.12], dir: [0.35, -0.9, 0.2], tilt: 0 },
      { s: 0.6, head: [0.18, -0.68, 0.01], dir: [0.75, -0.6, 0.05], tilt: 0 },
      { s: 1, head: [0, 0, 0], dir: CONTACT_DIR, tilt: 0 },
      { s: 1.3, head: [-0.05, 0.7, 0.02], dir: [0.35, 0.92, 0.08], tilt: 0 },
      { s: 2, head: [-0.9, 0.1, 1.5], dir: [-0.8, -0.35, 0.3], tilt: 0, absolute: true },
    ],
  },
  // High to low: an open face comes down and cuts under the ball, finishing out in front with no wrap.
  slice: {
    turn: 0.9, crouchBack: 0.1, crouchFinish: 0.16,
    keys: [
      { s: 0, head: [0.1, -0.8, 0.72], dir: [0.2, -0.5, 0.85], tilt: 0.75 },
      { s: 0.6, head: [0.06, -0.42, 0.34], dir: [0.7, -0.3, 0.55], tilt: 0.75 },
      { s: 1, head: [0, 0, 0], dir: CONTACT_DIR, tilt: 0.7 },
      { s: 1.3, head: [-0.04, 0.34, -0.3], dir: [0.65, 0.72, -0.12], tilt: 0.8 },
      { s: 2, head: [-0.1, 0.6, -0.48], dir: [0.38, 0.88, -0.08], tilt: 0.9 },
    ],
  },
  // Lifted steeply with an open face, so the ball climbs.
  lob: {
    turn: 0.85, crouchBack: 0.26, crouchFinish: 0.02,
    keys: [
      { s: 0, head: [0.2, -0.85, -0.05], dir: [0.3, -0.7, 0.3], tilt: 0.45 },
      { s: 0.6, head: [0.1, -0.5, -0.45], dir: [0.5, -0.55, -0.55], tilt: 0.55 },
      { s: 1, head: [0, 0, 0], dir: CONTACT_DIR, tilt: 0.65 },
      { s: 1.3, head: [-0.02, 0.28, 0.75], dir: [0.3, 0.3, 0.9], tilt: 0.6 },
      { s: 2, head: [-0.2, 0.2, 2.35], dir: [-0.15, 0.1, 0.98], tilt: 0.5, absolute: true },
    ],
  },
  // A short slice: compact backswing, a very open face sliding under the ball, and almost no follow-through.
  drop: {
    turn: 0.55, crouchBack: 0.14, crouchFinish: 0.16,
    keys: [
      { s: 0, head: [0.08, -0.38, 0.32], dir: [0.45, -0.3, 0.8], tilt: 0.95 },
      { s: 0.6, head: [0.05, -0.18, 0.13], dir: [0.8, -0.1, 0.55], tilt: 1 },
      { s: 1, head: [0, 0, 0], dir: CONTACT_DIR, tilt: 1 },
      { s: 1.3, head: [-0.02, 0.2, -0.08], dir: [0.8, 0.5, 0.2], tilt: 1.1 },
      { s: 2, head: [-0.03, 0.26, -0.1], dir: [0.72, 0.62, 0.28], tilt: 1.15 },
    ],
  },
  // Trophy pose, the racket dropping down the back, up to full reach, then pronating down across the body.
  serve: {
    turn: 1.05, crouchBack: 0.26, crouchFinish: 0.1,
    keys: [
      { s: 0, head: [0.35, -0.3, 2.15], dir: [0.1, -0.3, 0.95], tilt: 0, absolute: true },
      { s: 0.55, head: [0.33, -0.55, 1.3], dir: [0, -0.2, -0.97], tilt: 0, absolute: true },
      { s: 1, head: [0, 0, 0], dir: [0.1, 0.25, 0.96], tilt: -0.1 },
      { s: 1.3, head: [0.25, 0.75, 1.35], dir: [-0.1, 0.8, -0.55], tilt: -0.6, absolute: true },
      { s: 2, head: [-0.5, 0.35, 0.72], dir: [-0.6, 0.4, -0.7], tilt: -0.5, absolute: true },
    ],
  },
};

export const READY = { head: [-0.02, 0.72, 1.28] as V3, dir: [-0.27, 0.82, 0.5] as V3, tilt: 0 };

/** Default strike point when no ball is coming, such as a practice swing. */
export const DEFAULT_CONTACT: V3 = [0.62, 0.45, 1];

const normalize = (v: V3): V3 => {
  const size = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / size, v[1] / size, v[2] / size];
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerp3 = (a: V3, b: V3, t: number): V3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const ease = (t: number) => t * t * (3 - 2 * t);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function catmull(p0: V3, p1: V3, p2: V3, p3: V3, t: number): V3 {
  const at = (i: number) => 0.5 * (2 * p1[i] + (p2[i] - p0[i]) * t + (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * t * t + (3 * p1[i] - p0[i] - 3 * p2[i] + p3[i]) * t * t * t);
  return [at(0), at(1), at(2)];
}

export interface RacketPose {
  head: V3;
  dir: V3;
  tilt: number;
}

/** The racket at a point on a stroke's timeline. */
export function samplePose(name: StrokeName, s: number, contact: V3, backhand = false): RacketPose {
  const { keys } = STROKES[name];
  const flip = backhand ? -1 : 1;
  const place = (key: Key): V3 => key.absolute
    ? [key.head[0] * flip, key.head[1], key.head[2]]
    : [contact[0] + key.head[0] * flip, contact[1] + key.head[1], contact[2] + key.head[2]];
  const time = clamp(s, keys[0].s, keys[keys.length - 1].s);
  let i = 0;
  while (i < keys.length - 2 && time > keys[i + 1].s) i++;
  const a = keys[i], b = keys[i + 1];
  const t = (time - a.s) / (b.s - a.s);
  const head = catmull(place(keys[Math.max(0, i - 1)]), place(a), place(b), place(keys[Math.min(keys.length - 1, i + 2)]), t);
  head[2] = Math.max(0.12, head[2]);
  const dir = normalize(lerp3(a.dir, b.dir, t));
  dir[0] *= flip;
  return { head, dir, tilt: lerp(a.tilt, b.tilt, t) };
}

/** Seconds of game time from the start of the forward swing to contact. */
const SWING_LEAD = 0.17;
const SERVE_LEAD = 0.24;

export interface SwingTiming {
  phase: 'idle' | 'load' | 'forward' | 'follow';
  serve: boolean;
  pressedAt: number;
  contactAt: number;
  endsAt: number;
}

/**
 * Where the stroke is right now. While winding up, the swing starts by itself as the ball arrives, so
 * releasing on time joins a racket that is already moving rather than jumping to the ball. It stops
 * short of contact until the shot is actually released.
 */
export function swingTimeline(sw: SwingTiming, now: number, arrivalAt: number | null) {
  const lead = sw.serve ? SERVE_LEAD : SWING_LEAD;
  const prepared = ease(clamp((now - sw.pressedAt) / (sw.serve ? 0.3 : 0.18), 0, 1));
  if (sw.phase === 'load') {
    return { s: arrivalAt === null ? 0 : clamp(1 - (arrivalAt - now) / lead, 0, 0.85), ready: 1 - prepared };
  }
  if (sw.phase === 'forward') {
    return { s: clamp(1 - (sw.contactAt - now) / lead, 0, 1), ready: 1 - prepared };
  }
  if (sw.phase === 'follow') {
    const progress = clamp((now - sw.contactAt) / Math.max(0.05, sw.endsAt - sw.contactAt), 0, 1);
    const through = Math.min(1, progress / 0.72);
    return { s: 1 + (1 - (1 - through) * (1 - through)), ready: progress > 0.72 ? ease((progress - 0.72) / 0.28) : 0 };
  }
  return { s: 0, ready: 1 };
}

/** The full racket pose including the blend to and from the ready position. */
export function racketPose(name: StrokeName, s: number, ready: number, contact: V3, backhand: boolean): RacketPose {
  const pose = samplePose(name, s, contact, backhand);
  if (ready <= 0) return pose;
  return {
    head: lerp3(pose.head, READY.head, ready),
    dir: normalize(lerp3(pose.dir, READY.dir, ready)),
    tilt: lerp(pose.tilt, READY.tilt, ready),
  };
}

/** Body rotation and knee bend that go with the racket: coil on the backswing, uncoil through contact. */
export function bodyPose(name: StrokeName, s: number, ready: number, backhand: boolean) {
  const stroke = STROKES[name];
  const sign = backhand ? -1 : 1;
  const turn = s <= 1 ? stroke.turn * (1 - s * s) : -stroke.turn * 0.65 * Math.min(1, s - 1);
  const crouch = s <= 1 ? stroke.crouchBack : lerp(stroke.crouchBack, stroke.crouchFinish, Math.min(1, s - 1));
  return { yaw: turn * sign * (1 - ready), crouch: lerp(crouch, 0.09, ready) };
}
