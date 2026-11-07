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

export type ShotType = 'topspin' | 'flat' | 'slice' | 'lob' | 'drop';
export type ShotTiming = 'perfect' | 'good' | 'early' | 'late' | 'none';

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
