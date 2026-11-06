import type { ShotType } from './types';

export const BALL_SPEED_MIN = 4.2;
export const BALL_SPEED_MAX = 7.4;
export const POWER_SHOT_SPEED_MAX = 8.2;

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
}

export interface ShotResult {
  vx: number;
  vy: number;
  speed: number;
  spin: number;
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
  } else if (input.shot === 'stopspin') {
    angle *= 0.25;
    shotSpeed *= 0.72;
    spin = -Math.sign(input.incomingVy || paddleMotion || 1) * 1.05;
  } else if (input.shot === 'power') {
    shotSpeed = Math.min(POWER_SHOT_SPEED_MAX, speed + 1.45);
    angle *= 0.78;
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
  const spin = shot === 'slice' ? -Math.sign(aim || 1) * 0.45 : shot === 'stopspin' ? Math.sign(aim || 1) * 0.65 : 0;
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
