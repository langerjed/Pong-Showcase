import type { ShotTiming, ShotType } from './types';

export const BALL_SPEED_MIN = 4.2;
export const BALL_SPEED_MAX = 7.4;
export const POWER_SHOT_SPEED_MAX = 9;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function reflectY(y: number, minY: number, maxY: number) {
  const span = maxY - minY;
  if (span <= 0) return minY;
  const period = span * 2;
  const offset = ((y - minY) % period + period) % period;
  return minY + (offset <= span ? offset : period - offset);
}

export function predictInterceptY(y: number, vy: number, vx: number, distanceX: number, minY: number, maxY: number) {
  if (Math.abs(vx) < 0.001) return reflectY(y, minY, maxY);
  return reflectY(y + vy * (distanceX / Math.abs(vx)), minY, maxY);
}

export interface ShotInput {
  side: 'left' | 'right';
  shot: ShotType;
  hitOffset: number;
  paddleVelocity: number;
  incomingVy: number;
  incomingSpeed: number;
  charge?: number;
  timing?: ShotTiming;
}

export interface ShotResult {
  vx: number;
  vy: number;
  speed: number;
  spin: number;
}

export function getTimingGrade(timeToContact: number | null): ShotTiming {
  if (timeToContact === null || timeToContact < 0 || timeToContact > 0.55) return 'none';
  if (timeToContact > 0.22) return 'early';
  if (timeToContact >= 0.08) return 'perfect';
  return 'late';
}

export function getTimingProgress(timeToContact: number | null, horizon = 0.55) {
  if (timeToContact === null || horizon <= 0) return null;
  return clamp(1 - timeToContact / horizon, 0, 1);
}

export function calculateShot(input: ShotInput): ShotResult {
  const direction = input.side === 'left' ? 1 : -1;
  const hitOffset = clamp(input.hitOffset, -1, 1);
  const paddleMotion = clamp(input.paddleVelocity / 480, -1, 1);
  const speed = clamp(input.incomingSpeed, BALL_SPEED_MIN, BALL_SPEED_MAX);
  let angle = hitOffset * 0.84 + paddleMotion * 0.14;
  let shotSpeed = speed;
  let spin = 0;

  if (input.shot === 'slice') {
    angle *= 0.55;
    shotSpeed *= 0.9;
    spin = -Math.sign(paddleMotion || hitOffset || 1) * 0.72;
  } else if (input.shot === 'topspin') {
    angle = angle * 0.9 + Math.sign(input.incomingVy || hitOffset || 1) * 0.06;
    shotSpeed *= 0.94;
    spin = direction * 1.15;
  } else if (input.shot === 'stopspin') {
    angle *= 0.25;
    shotSpeed *= 0.72;
    spin = -Math.sign(input.incomingVy || paddleMotion || 1) * 1.05;
  } else if (input.shot === 'power') {
    const charge = clamp((input.charge ?? 100) / 100, 0, 1);
    const isPerfect = input.timing === 'perfect';
    shotSpeed = Math.min(POWER_SHOT_SPEED_MAX, speed + 0.25 + charge * 0.7 + (isPerfect ? 0.65 : 0));
    angle *= isPerfect ? 0.68 : 1.16;
    if (input.timing === 'early') angle += 0.12;
    if (input.timing === 'late') angle -= 0.12;
    spin = direction * 0.62;
  }

  // Spin strokes are graded too: a well-timed stroke bites harder, a late one is rushed and sprays.
  if (input.shot === 'topspin' || input.shot === 'slice' || input.shot === 'stopspin') {
    if (input.timing === 'perfect') {
      shotSpeed *= 1.06;
      spin *= 1.2;
    } else if (input.timing === 'late') {
      shotSpeed *= 0.96;
      angle *= 1.12;
    }
  }

  const maxAngle = input.shot === 'slice' ? 0.52 : input.shot === 'stopspin' ? 0.3 : 0.85;
  angle = clamp(angle, -maxAngle, maxAngle);
  let vx = Math.cos(angle) * shotSpeed * direction;
  let vy = Math.sin(angle) * shotSpeed;

  // Keep every return moving across the court at a useful pace, even on a steep hit.
  const minHorizontal = shotSpeed * 0.5;
  if (Math.abs(vx) < minHorizontal) {
    vx = direction * minHorizontal;
    vy = Math.sign(vy || angle || 1) * Math.sqrt(Math.max(0, shotSpeed ** 2 - vx ** 2));
  }

  return { vx, vy, speed: shotSpeed, spin };
}

export function calculateServe(side: 'left' | 'right', aim: number, shot: ShotType): ShotResult {
  const direction = side === 'left' ? 1 : -1;
  const angle = clamp(aim, -1, 1) * (shot === 'slice' ? 0.38 : 0.48);
  const serveSpeed = shot === 'slice' ? 4.05 : shot === 'stopspin' ? 3.7 : shot === 'power' ? 5.45 : 4.55;
  const spin = shot === 'slice'
    ? -Math.sign(aim || 1) * 0.45
    : shot === 'stopspin' ? Math.sign(aim || 1) * 0.65
    : shot === 'topspin' ? direction * 0.85
    : shot === 'power' ? direction * 0.45
    : direction * 0.25;
  return {
    vx: Math.cos(angle) * serveSpeed * direction,
    vy: Math.sin(angle) * serveSpeed,
    speed: serveSpeed,
    spin,
  };
}

export function applySpin(vx: number, vy: number, spin: number, dt: number) {
  const speed = Math.hypot(vx, vy);
  if (speed === 0 || spin === 0) return { vx, vy, spin };
  const angle = Math.atan2(vy, vx) + spin * dt;
  return {
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    spin: spin * Math.pow(0.985, dt * 60),
  };
}

/** Arcade conversions for the post-contact readout; not used by the simulation. */
export function toMph(speed: number) {
  return Math.round(speed * 14);
}

export function toRpm(spin: number) {
  return Math.round(Math.abs(spin) * 50) * 50;
}

/**
 * What the first bounce off a sideline does to each stroke, so spin is felt as well as seen:
 * topspin kicks up in pace, slice skids flatter, and stop-spin dies.
 */
export function applyBounceKick(vx: number, vy: number, shot: ShotType) {
  const speed = Math.hypot(vx, vy);
  if (speed === 0) return { vx, vy };
  if (shot === 'topspin') {
    const scale = Math.max(speed, Math.min(speed * 1.12, BALL_SPEED_MAX)) / speed;
    return { vx: vx * scale, vy: vy * scale };
  }
  if (shot === 'slice') {
    const flatVy = vy * 0.68;
    return { vx: Math.sign(vx || 1) * Math.sqrt(speed ** 2 - flatVy ** 2), vy: flatVy };
  }
  if (shot === 'stopspin') {
    const scale = Math.max(speed * 0.84, Math.min(speed, 2.8)) / speed;
    return { vx: vx * scale, vy: vy * scale };
  }
  return { vx, vy };
}
