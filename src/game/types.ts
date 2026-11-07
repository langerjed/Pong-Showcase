// ============================================================
//  Pong Showcase — Type Definitions
// ============================================================

export enum GameState {
  TITLE = 'title',
  MODE_SELECT = 'mode_select',
  DIFFICULTY = 'difficulty',
  COUNTDOWN = 'countdown',
  SERVE = 'serve',
  PLAYING = 'playing',
  GOAL = 'goal',
  GAME_OVER = 'game_over',
  PAUSED = 'paused',
}

export interface Paddle {
  x: number;
  y: number;
  vy: number;
  color1: string;
  color2: string;
  glowColor: string;
  name: string;
  swingShot: ShotType;
  swingTimer: number;
}

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed: number;
  spin: number;
  trail: { x: number; y: number }[];
  lastHitBy: 'left' | 'right' | null;
  frozen: boolean;
  /** Stroke that last sent the ball, used for colour and the bounce kick. */
  shot: ShotType;
  bounced: boolean;
}

export type ShotType = 'normal' | 'topspin' | 'slice' | 'stopspin' | 'power';
export type ShotTiming = 'perfect' | 'early' | 'late' | 'none';

export interface AnnouncerEvent {
  kind: 'point' | 'shot' | 'long-rally';
  shooter: 'PLAYER' | 'CPU' | 'P1' | 'P2';
  shot: ShotType;
  timing?: ShotTiming;
  scoreLeft: number;
  scoreRight: number;
  rallyHits: number;
  playerRead: string;
  /** Practice calls stay on the device and never reach the optional AI announcer. */
  localOnly?: boolean;
}

export interface GoldBall {
  x: number;
  y: number;
}

export interface PowerUpDef {
  type: string;
  label: string;
  color: string;
  desc: string;
  duration: number;
}

export interface PowerUpInstance {
  x: number;
  y: number;
  typeDef: PowerUpDef;
}

export interface ActivePowerUp {
  type: string;
  owner: 'left' | 'right';
  target: 'left' | 'right';
  endTime: number;
  label: string;
  color: string;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  life: number;
  maxLife: number;
  size: number;
}

export interface Star {
  x: number;
  y: number;
  size: number;
  speed: number;
  brightness: number;
}
