// ============================================================
//  JEDAI Space Pong — Type Definitions
// ============================================================

export enum GameState {
  TITLE = 'title',
  MODE_SELECT = 'mode_select',
  DIFFICULTY = 'difficulty',
  COUNTDOWN = 'countdown',
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
}

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed: number;
  trail: { x: number; y: number }[];
  lastHitBy: 'left' | 'right' | null;
  frozen: boolean;
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
