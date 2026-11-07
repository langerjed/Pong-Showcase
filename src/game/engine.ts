// ============================================================
//  Pong Showcase — Space Tennis game engine
// ============================================================

import { AudioEngine } from './audio';
import {
  GameState, Paddle, Ball, GoldBall, PowerUpDef, ShotType, ShotTiming, AnnouncerEvent,
  PowerUpInstance, ActivePowerUp, Particle, Star,
} from './types';
import { applyBounceKick, applySpin, BALL_SPEED_MAX, calculateServe, calculateShot, getTimingGrade, getTimingProgress, predictInterceptY, toMph, toRpm } from './physics';
import { InputDevice, mapGamepads, padSide, Side } from './input';

// --- Constants ---
const W = 800, H = 600;
const PADDLE_W = 12, PADDLE_H = 80, BALL_R = 7;
const WIN_SCORE = 11;
const COUNTDOWN_SECS = 3;
const GOLD_SPAWN_DELAY = 8;
const POWERUP_SPAWN_DELAY = 15;
const AI_SPEEDS = [3.5, 5.2, 7.2];
const AI_NAMES = ['EASY', 'MEDIUM', 'HARD'];
const PADDLE_SPEED = 420;
const COURT = {
  runoff: '#2f7a58',
  surface: '#1f5f9e',
  line: 'rgba(255,255,255,0.94)',
  baselineX: 72,
  sidelineY: 20,
};
const MODE_OPTIONS = ['1 PLAYER  vs  CPU', '2 PLAYERS  LOCAL', 'TIMING PRACTICE'];
const PAUSE_OPTIONS = ['RESUME', 'QUIT TO MENU'];
const READOUT_X = 262;
const PRACTICE_BEST_KEY = 'pong_practice_best';
const PERFECT_COLOR = '#d7fa59';
const SHOT_COLORS: Record<ShotType, string> = {
  normal: '#CCFF00',
  topspin: '#ffb020',
  slice: '#38e1ff',
  stopspin: '#e3ccff',
  power: '#ffffff',
};
const SHOT_LABELS: Record<ShotType, string> = {
  normal: 'FLAT',
  topspin: 'TOPSPIN',
  slice: 'SLICE',
  stopspin: 'STOP-SPIN',
  power: 'POWER',
};
const SPIN_SHOT_KEYS: Record<string, { side: Side; shot: ShotType }> = {
  v: { side: 'right', shot: 'topspin' },
  z: { side: 'right', shot: 'slice' },
  x: { side: 'right', shot: 'stopspin' },
  e: { side: 'left', shot: 'topspin' },
  a: { side: 'left', shot: 'slice' },
  d: { side: 'left', shot: 'stopspin' },
};

const POWERUP_TYPES: PowerUpDef[] = [
  { type: 'big',   label: 'BIG', color: '#00ff88', desc: 'RACKET GROW', duration: 8 },
  { type: 'small', label: 'SML', color: '#ff4488', desc: 'FOE SHRINK',  duration: 8 },
  { type: 'fast',  label: 'FST', color: '#ffaa00', desc: 'SPEED BALL',  duration: 6 },
  { type: 'slow',  label: 'SLO', color: '#8844ff', desc: 'SLOW BALL',   duration: 6 },
  { type: 'multi', label: 'MUL', color: '#ff00ff', desc: 'MULTI BALL',  duration: 0 },
];

// Seven-segment digit maps:  a b c d e f g
const SEGMENTS: Record<number, number[]> = {
  0: [1,1,1,1,1,1,0], 1: [0,1,1,0,0,0,0], 2: [1,1,0,1,1,0,1],
  3: [1,1,1,1,0,0,1], 4: [0,1,1,0,0,1,1], 5: [1,0,1,1,0,1,1],
  6: [1,0,1,1,1,1,1], 7: [1,1,1,0,0,0,0], 8: [1,1,1,1,1,1,1],
  9: [1,1,1,1,0,1,1],
};

export class PongEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private audio: AudioEngine;
  private animId = 0;
  private lastTime = 0;
  private time = 0;

  // State
  state: GameState = GameState.TITLE;
  private countdownTimer = 0;
  private goalTimer = 0;
  private goalScorer: 'left' | 'right' = 'left';
  private serveSide: 'left' | 'right' = 'right';
  private serveWait = 0;

  // Mode
  twoPlayer = false;
  aiDifficulty = 1;
  menuSelection = 0;
  difficultySelection = 1;

  // Score
  scoreLeft = 0;
  scoreRight = 0;

  // History
  winStreak = 0;
  matchHistory: string[] = [];

  // Paddles
  private paddleLeft: Paddle = {
    x: 30, y: H / 2 - PADDLE_H / 2, vy: 0,
    color1: '#ef4444', color2: '#f87171', glowColor: '#ef4444', name: 'CPU',
    swingShot: 'normal', swingTimer: 0,
  };
  private paddleRight: Paddle = {
    x: W - 30 - PADDLE_W, y: H / 2 - PADDLE_H / 2, vy: 0,
    color1: '#3b82f6', color2: '#60a5fa', glowColor: '#3b82f6', name: 'P1',
    swingShot: 'normal', swingTimer: 0,
  };

  // Ball
  private ball: Ball = {
    x: W/2, y: H/2, vx: 0, vy: 0, speed: 4.55, spin: 0,
    trail: [], lastHitBy: null, frozen: true, shot: 'normal', bounced: false,
  };
  private extraBalls: Ball[] = [];

  // Power-ups
  private goldBall: GoldBall | null = null;
  private goldBallTimer = GOLD_SPAWN_DELAY;
  private powerUp: PowerUpInstance | null = null;
  private powerUpTimer = POWERUP_SPAWN_DELAY;
  private activePowerUps: ActivePowerUp[] = [];
  private chargeLeft = 0;
  private chargeRight = 0;
  private pendingPowerShots: Partial<Record<'left' | 'right', { charge: number; timing: ShotTiming; expiresAt: number }>> = {};
  private playerAimHistory: number[] = [];
  private rallyHits = 0;
  private longRallyAnnounced = false;

  // Particles & effects
  private courtLayer: HTMLCanvasElement | null = null;
  private particles: Particle[] = [];
  private floatTexts: { x: number; y: number; text: string; color: string; life: number }[] = [];
  private lastShot: { who: string; shot: ShotType; timing: ShotTiming; mph: number; rpm: number; at: number } | null = null;
  private hitStop = 0;
  private toast: { text: string; until: number } | null = null;
  private stars: Star[] = [];
  private shakeX = 0;
  private shakeY = 0;
  private shakeMag = 0;

  // Input
  private keys: Record<string, boolean> = {};
  private keydownHandler: (e: KeyboardEvent) => void;
  private keyupHandler: (e: KeyboardEvent) => void;
  private lastInput: InputDevice = 'keyboard';
  private heldPadKeys = new Set<string>();
  private padAxis: Record<Side, number> = { left: 0, right: 0 };
  private touchPointers = new Map<number, Side>();
  private touchTargets: Record<Side, number | null> = { left: null, right: null };
  private spinPress: Partial<Record<Side, { shot: ShotType; timing: ShotTiming }>> = {};
  private padConnectHandler = () => this.showToast('CONTROLLER CONNECTED');
  private padDisconnectHandler = () => {
    this.showToast('CONTROLLER DISCONNECTED');
    if (this.state === GameState.PLAYING) this.pauseGame();
  };

  // Practice
  practice = false;
  private practiceStats = { perfects: 0, tries: 0, streak: 0, best: 0 };
  private pauseSelection = 0;
  private resumeState: GameState = GameState.PLAYING;

  // Callback for React state sync
  onStateChange?: (state: GameState) => void;
  onAnnouncer?: (event: AnnouncerEvent) => void;
  onInputChange?: (device: InputDevice) => void;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.audio = new AudioEngine();

    // Stars
    for (let i = 0; i < 120; i++) {
      this.stars.push({
        x: Math.random() * W, y: Math.random() * H,
        size: Math.random() * 1.8 + 0.3,
        speed: Math.random() * 15 + 5,
        brightness: Math.random() * 0.5 + 0.2,
      });
    }

    // Load history
    try {
      this.winStreak = parseInt(localStorage.getItem('jedai_streak') || '0');
      this.matchHistory = JSON.parse(localStorage.getItem('jedai_history') || '[]');
      this.practiceStats.best = parseInt(localStorage.getItem(PRACTICE_BEST_KEY) || '0') || 0;
    } catch { /* ignore */ }

    // Input handlers
    this.keydownHandler = (e: KeyboardEvent) => this.onKeyDown(e);
    this.keyupHandler = (e: KeyboardEvent) => this.onKeyUp(e);
    document.addEventListener('keydown', this.keydownHandler);
    document.addEventListener('keyup', this.keyupHandler);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerEnd);
    canvas.addEventListener('pointercancel', this.onPointerEnd);
    window.addEventListener('gamepadconnected', this.padConnectHandler);
    window.addEventListener('gamepaddisconnected', this.padDisconnectHandler);
    if (window.matchMedia?.('(pointer: coarse)').matches) this.lastInput = 'touch';
  }

  destroy() {
    cancelAnimationFrame(this.animId);
    document.removeEventListener('keydown', this.keydownHandler);
    document.removeEventListener('keyup', this.keyupHandler);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerEnd);
    this.canvas.removeEventListener('pointercancel', this.onPointerEnd);
    window.removeEventListener('gamepadconnected', this.padConnectHandler);
    window.removeEventListener('gamepaddisconnected', this.padDisconnectHandler);
  }

  start() {
    this.lastTime = performance.now();
    this.loop(this.lastTime);
  }

  initAudio() {
    this.audio.init();
  }

  // ---- Input ----
  // Keyboard, controller and touch buttons all arrive here as key names.
  private onKeyDown(e: KeyboardEvent) {
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) {
      e.preventDefault();
    }
    this.setLastInput('keyboard');
    this.pressKey(e.key);
  }

  private onKeyUp(e: KeyboardEvent) {
    this.releaseKey(e.key);
  }

  pressKey(key: string) {
    this.recordSpinPress(key);
    this.keys[key] = true;
    this.audio.init();

    switch (this.state) {
      case GameState.TITLE:
        if (key === 'Enter' || key === ' ') {
          this.audio.menuSelect();
          this.state = GameState.MODE_SELECT;
          this.menuSelection = 0;
          this.onStateChange?.(this.state);
        }
        break;

      case GameState.MODE_SELECT:
        if (key === 'ArrowUp' || key === 'w' || key === 'W') {
          this.menuSelection = (this.menuSelection + MODE_OPTIONS.length - 1) % MODE_OPTIONS.length;
          this.audio.menuSelect();
        }
        if (key === 'ArrowDown' || key === 's' || key === 'S') {
          this.menuSelection = (this.menuSelection + 1) % MODE_OPTIONS.length;
          this.audio.menuSelect();
        }
        if (key === 'Enter' || key === ' ') {
          this.audio.menuSelect();
          this.twoPlayer = this.menuSelection === 1;
          this.practice = this.menuSelection === 2;
          if (this.practice) {
            this.startPractice();
          } else if (this.twoPlayer) {
            this.paddleLeft.name = 'P1';
            this.paddleRight.name = 'P2';
            this.startCountdown();
          } else {
            this.paddleLeft.name = 'CPU';
            this.paddleRight.name = 'P1';
            this.state = GameState.DIFFICULTY;
            this.difficultySelection = 1;
            this.onStateChange?.(this.state);
          }
        }
        if (key === 'Escape') {
          this.state = GameState.TITLE;
          this.audio.menuSelect();
          this.onStateChange?.(this.state);
        }
        break;

      case GameState.DIFFICULTY:
        if (key === 'ArrowUp' || key === 'w' || key === 'W') {
          this.difficultySelection = (this.difficultySelection + 2) % 3;
          this.audio.menuSelect();
        }
        if (key === 'ArrowDown' || key === 's' || key === 'S') {
          this.difficultySelection = (this.difficultySelection + 1) % 3;
          this.audio.menuSelect();
        }
        if (key === 'Enter' || key === ' ') {
          this.audio.menuSelect();
          this.aiDifficulty = this.difficultySelection;
          this.startCountdown();
        }
        if (key === 'Escape') {
          this.state = GameState.MODE_SELECT;
          this.audio.menuSelect();
          this.onStateChange?.(this.state);
        }
        break;

      case GameState.PLAYING:
        if (key === 'Escape' || key === 'p' || key === 'P') this.pauseGame();
        break;

      case GameState.SERVE:
        if (key === 'Escape' || key === 'p' || key === 'P') this.pauseGame();
        else if (key === ' ' && (this.twoPlayer || this.serveSide === 'right')) this.launchServe();
        break;

      case GameState.PAUSED:
        if (key === 'Escape' || key === 'p' || key === 'P') {
          this.resumeGame();
        } else if (key === 'ArrowUp' || key === 'ArrowDown' || key === 'w' || key === 'W' || key === 's' || key === 'S') {
          this.pauseSelection = (this.pauseSelection + 1) % PAUSE_OPTIONS.length;
          this.audio.menuSelect();
        } else if (key === 'Enter' || key === ' ') {
          this.audio.menuSelect();
          if (this.pauseSelection === 0) {
            this.resumeGame();
          } else {
            this.practice = false;
            this.menuSelection = 0;
            this.state = GameState.MODE_SELECT;
            this.onStateChange?.(this.state);
          }
        }
        break;

      case GameState.GAME_OVER:
        if (key === 'Enter' || key === ' ') {
          this.audio.menuSelect();
          this.state = GameState.MODE_SELECT;
          this.menuSelection = 0;
          this.onStateChange?.(this.state);
        }
        break;
    }
  }

  releaseKey(key: string) {
    const lower = key.toLowerCase();
    const side = lower === 'c' ? 'right' : lower === 'f' && this.twoPlayer ? 'left' : null;
    if (side && this.state === GameState.PLAYING) {
      const charge = side === 'left' ? this.chargeLeft : this.chargeRight;
      const timeToContact = this.getTimeToContact(side);
      const timing = getTimingGrade(timeToContact);
      if (charge >= 25 && timing !== 'none') {
        this.pendingPowerShots[side] = {
          charge,
          timing,
          expiresAt: Date.now() + (timeToContact ?? 0) * 1000 + 180,
        };
      }
      if (this.practice) this.coachPowerRelease(charge, timing);
    }
    this.keys[key] = false;
  }

  /** A spin stroke is graded by when its button goes down, measured against the same green window. */
  private recordSpinPress(key: string) {
    const lower = key.toLowerCase();
    const spinKey = Object.prototype.hasOwnProperty.call(SPIN_SHOT_KEYS, lower) ? SPIN_SHOT_KEYS[lower] : null;
    if (!spinKey || this.keys[key] || this.state !== GameState.PLAYING) return;
    this.spinPress[spinKey.side] = { shot: spinKey.shot, timing: getTimingGrade(this.getTimeToContact(spinKey.side)) };
  }

  private setLastInput(device: InputDevice) {
    if (this.lastInput === device) return;
    this.lastInput = device;
    this.onInputChange?.(device);
  }

  private prompt(keyboard: string, gamepad: string, touch: string) {
    return this.lastInput === 'gamepad' ? gamepad : this.lastInput === 'touch' ? touch : keyboard;
  }

  private showToast(text: string) {
    this.toast = { text, until: this.time + 2.5 };
  }

  private connectedPads() {
    if (typeof navigator.getGamepads !== 'function') return [];
    return Array.from(navigator.getGamepads()).filter((pad): pad is Gamepad => Boolean(pad?.connected));
  }

  private pollGamepads() {
    const frame = mapGamepads(this.connectedPads(), { state: this.state, twoPlayer: this.twoPlayer, serveSide: this.serveSide });
    if (frame.keys.size > 0 || frame.axis.left !== 0 || frame.axis.right !== 0) this.setLastInput('gamepad');
    this.padAxis = frame.axis;
    const held = this.heldPadKeys;
    this.heldPadKeys = frame.keys;
    held.forEach(key => { if (!frame.keys.has(key)) this.releaseKey(key); });
    frame.keys.forEach(key => { if (!held.has(key)) this.pressKey(key); });
  }

  private rumble(side: Side, strong: number, weak: number, duration: number) {
    if (this.lastInput !== 'gamepad') return;
    this.connectedPads().forEach((pad, index) => {
      if (padSide(index, this.twoPlayer) !== side) return;
      try {
        void pad.vibrationActuator?.playEffect('dual-rumble', { duration, strongMagnitude: strong, weakMagnitude: weak })?.catch(() => undefined);
      } catch { /* rumble is a bonus; not every controller supports it */ }
    });
  }

  private toCanvasPoint(clientX: number, clientY: number) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / (rect.width || 1)) * W,
      y: ((clientY - rect.top) / (rect.height || 1)) * H,
    };
  }

  private onPointerDown = (e: PointerEvent) => {
    if (e.pointerType !== 'touch') return;
    this.setLastInput('touch');
    this.audio.init();
    if (![GameState.COUNTDOWN, GameState.SERVE, GameState.PLAYING, GameState.GOAL].includes(this.state)) return;
    const point = this.toCanvasPoint(e.clientX, e.clientY);
    const side: Side = this.twoPlayer && point.x < W / 2 ? 'left' : 'right';
    this.touchPointers.set(e.pointerId, side);
    this.touchTargets[side] = point.y;
    this.canvas.setPointerCapture?.(e.pointerId);
  };

  private onPointerMove = (e: PointerEvent) => {
    const side = this.touchPointers.get(e.pointerId);
    if (side) this.touchTargets[side] = this.toCanvasPoint(e.clientX, e.clientY).y;
  };

  private onPointerEnd = (e: PointerEvent) => {
    const side = this.touchPointers.get(e.pointerId);
    if (!side) return;
    this.touchPointers.delete(e.pointerId);
    if (![...this.touchPointers.values()].includes(side)) this.touchTargets[side] = null;
  };

  handleClick(clientX: number, clientY: number) {
    this.audio.init();
    const { x, y } = this.toCanvasPoint(clientX, clientY);
    const inRow = (rowY: number, halfWidth: number, halfHeight: number) => Math.abs(x - W / 2) <= halfWidth && Math.abs(y - rowY) <= halfHeight;
    const goBack = y > H - 60;

    switch (this.state) {
      case GameState.TITLE:
      case GameState.GAME_OVER:
        this.pressKey('Enter');
        break;
      case GameState.MODE_SELECT: {
        if (goBack) { this.pressKey('Escape'); break; }
        const row = MODE_OPTIONS.findIndex((_, i) => inRow(this.modeRowY(i), 200, 25));
        if (row >= 0) { this.menuSelection = row; this.pressKey('Enter'); }
        break;
      }
      case GameState.DIFFICULTY: {
        if (goBack) { this.pressKey('Escape'); break; }
        const row = AI_NAMES.findIndex((_, i) => inRow(190 + i * 90, 200, 28));
        if (row >= 0) { this.difficultySelection = row; this.pressKey('Enter'); }
        break;
      }
      case GameState.PAUSED: {
        const row = PAUSE_OPTIONS.findIndex((_, i) => inRow(this.pauseRowY(i), 170, 19));
        if (row >= 0) { this.pauseSelection = row; this.pressKey('Enter'); }
        break;
      }
    }
  }

  private modeRowY(index: number) { return 190 + index * 70; }
  private pauseRowY(index: number) { return H / 2 + 30 + index * 44; }

  private pauseGame() {
    this.resumeState = this.state;
    this.pauseSelection = 0;
    this.state = GameState.PAUSED;
    this.onStateChange?.(this.state);
  }

  private resumeGame() {
    this.state = this.resumeState;
    this.onStateChange?.(this.state);
  }

  // ---- Game flow ----
  private startCountdown() {
    this.resetField();
    this.countdownTimer = COUNTDOWN_SECS;
    this.state = GameState.COUNTDOWN;
    this.onStateChange?.(this.state);
  }

  private startPractice() {
    this.twoPlayer = false;
    this.paddleLeft.name = 'COACH';
    this.paddleRight.name = 'YOU';
    this.resetField();
    this.practiceStats = { perfects: 0, tries: 0, streak: 0, best: this.practiceStats.best };
    this.feedPractice(0.5);
  }

  private feedPractice(wait: number) {
    this.resetBall();
    this.paddleLeft.y = 120 + Math.random() * (H - 240 - PADDLE_H);
    this.paddleLeft.vy = 0;
    this.serveSide = 'left';
    this.serveWait = wait;
    this.state = GameState.SERVE;
    this.onStateChange?.(this.state);
  }

  private coachPowerRelease(charge: number, timing: ShotTiming) {
    const paddle = this.paddleRight;
    const y = paddle.y - 14;
    if (charge < 25) {
      this.addFloatText(paddle.x, y, 'HOLD LONGER', 'rgba(255,255,255,0.75)');
    } else if (timing === 'none') {
      this.practiceStats.tries++;
      this.practiceStats.streak = 0;
      this.addFloatText(paddle.x, y, 'TOO EARLY', '#ff8a65');
    } else {
      this.addFloatText(paddle.x, y, timing.toUpperCase(), timing === 'perfect' ? PERFECT_COLOR : '#ffb020');
    }
  }

  private scorePracticeStroke(shot: ShotType, timing: ShotTiming) {
    if (shot === 'normal') return;
    const stats = this.practiceStats;
    stats.tries++;
    if (timing !== 'perfect') {
      stats.streak = 0;
      return;
    }
    stats.perfects++;
    stats.streak++;
    if (stats.streak > stats.best) {
      stats.best = stats.streak;
      try {
        localStorage.setItem(PRACTICE_BEST_KEY, String(stats.best));
      } catch { /* ignore */ }
    }
  }

  private addFloatText(x: number, y: number, text: string, color: string) {
    this.floatTexts.push({ x: Math.max(90, Math.min(W - 90, x)), y: Math.max(24, y), text, color, life: 1 });
  }

  private resetField() {
    this.scoreLeft = 0;
    this.scoreRight = 0;
    this.goldBall = null;
    this.goldBallTimer = GOLD_SPAWN_DELAY;
    this.powerUp = null;
    this.powerUpTimer = POWERUP_SPAWN_DELAY;
    this.activePowerUps = [];
    this.chargeLeft = 0;
    this.chargeRight = 0;
    this.pendingPowerShots = {};
    this.spinPress = {};
    this.lastShot = null;
    this.floatTexts = [];
    this.hitStop = 0;
    this.playerAimHistory = [];
    this.rallyHits = 0;
    this.longRallyAnnounced = false;
    this.extraBalls = [];
    this.paddleLeft.y = H / 2 - PADDLE_H / 2;
    this.paddleRight.y = H / 2 - PADDLE_H / 2;
    this.paddleLeft.vy = 0;
    this.paddleRight.vy = 0;
    this.resetBall();
  }

  private resetBall() {
    const angle = (Math.random() * 0.8 - 0.4);
    const dir = Math.random() > 0.5 ? 1 : -1;
    this.ball = {
      x: W / 2, y: H / 2,
      vx: Math.cos(angle) * 4.55 * dir,
      vy: Math.sin(angle) * 4.55,
      speed: 4.55, spin: 0, trail: [], lastHitBy: null, frozen: true,
      shot: 'normal', bounced: false,
    };
    this.extraBalls = [];
  }

  private getShotType(side: 'left' | 'right'): ShotType {
    // The CPU and the practice coach pick their own strokes; left-hand keys only apply to a human P1.
    if (side === 'left' && !this.twoPlayer) return 'normal';
    const keys = side === 'right'
      ? { topspin: this.keys['v'] || this.keys['V'], slice: this.keys['z'] || this.keys['Z'], stopspin: this.keys['x'] || this.keys['X'] }
      : { topspin: this.keys['e'] || this.keys['E'], slice: this.keys['a'] || this.keys['A'], stopspin: this.keys['d'] || this.keys['D'] };
    if (this.getPendingPowerShot(side)) return 'power';
    if (keys.stopspin) return 'stopspin';
    if (keys.slice) return 'slice';
    if (keys.topspin) return 'topspin';
    return 'normal';
  }

  private startSwing(paddle: Paddle, shot: ShotType) {
    paddle.swingShot = shot;
    paddle.swingTimer = 0.38;
  }

  private getPendingPowerShot(side: 'left' | 'right') {
    const pending = this.pendingPowerShots[side];
    if (pending && Date.now() >= pending.expiresAt) {
      delete this.pendingPowerShots[side];
      return null;
    }
    return pending ?? null;
  }

  private getBallSpeedMultiplier() {
    let speedMult = 1;
    for (const p of this.activePowerUps) {
      if (p.type === 'fast') speedMult = 1.25;
      if (p.type === 'slow') speedMult = 0.72;
    }
    return speedMult;
  }

  private getTimeToContact(side: 'left' | 'right') {
    const towardPaddle = side === 'right' ? this.ball.vx > 0 : this.ball.vx < 0;
    if (!towardPaddle || this.ball.frozen) return null;
    const paddle = side === 'right' ? this.paddleRight : this.paddleLeft;
    const distance = side === 'right'
      ? paddle.x - BALL_R - this.ball.x
      : this.ball.x - paddle.x - PADDLE_W - BALL_R;
    return Math.max(0, distance) / (Math.abs(this.ball.vx) * 60 * this.getBallSpeedMultiplier());
  }

  private updateShotCharge(dt: number) {
    if (this.keys['c'] || this.keys['C']) this.chargeRight = Math.min(100, this.chargeRight + dt * 145);
    if (this.twoPlayer && (this.keys['f'] || this.keys['F'])) this.chargeLeft = Math.min(100, this.chargeLeft + dt * 145);
  }

  private spendPower(side: 'left' | 'right', shot: ShotType) {
    if (shot !== 'power') return;
    delete this.pendingPowerShots[side];
    if (side === 'left') this.chargeLeft = 0;
    else this.chargeRight = 0;
  }

  private launchServe() {
    const side = this.serveSide;
    const paddle = side === 'left' ? this.paddleLeft : this.paddleRight;
    const paddleCenter = paddle.y + this.getPaddleH(side) / 2;
    const shot = this.getShotType(side);
    const serve = calculateServe(side, (paddleCenter - H / 2) / (H / 2), shot);
    this.startSwing(paddle, shot);
    this.spendPower(side, shot);
    this.ball = {
      x: side === 'left' ? paddle.x + PADDLE_W + BALL_R : paddle.x - BALL_R,
      y: paddleCenter,
      ...serve,
      trail: [],
      lastHitBy: side,
      frozen: false,
      shot,
      bounced: false,
    };
    if (this.twoPlayer || side === 'right') this.recordShot(side, shot, 'none', serve.speed, serve.spin);
    this.rallyHits = 0;
    this.longRallyAnnounced = false;
    this.state = GameState.PLAYING;
    this.onStateChange?.(this.state);
    if (shot !== 'normal') this.announce('shot', side === 'right' ? 'PLAYER' : this.twoPlayer ? 'P1' : 'CPU', shot);
  }

  private mostCommonAim() {
    if (this.playerAimHistory.length < 3) return null;
    const counts = [0, 0, 0];
    for (const y of this.playerAimHistory) counts[y < H / 3 ? 0 : y > H * 2 / 3 ? 2 : 1]++;
    const zone = counts.indexOf(Math.max(...counts));
    if (counts[zone] < 3) return null;
    return { zone, count: counts[zone], y: zone === 0 ? H / 6 : zone === 1 ? H / 2 : H * 5 / 6 };
  }

  private playerReadLabel() {
    const read = this.mostCommonAim();
    return read ? ['high', 'middle', 'low'][read.zone] : '';
  }

  private recordPlayerAim() {
    if (Math.abs(this.ball.vx) < 0.01) return;
    const target = predictInterceptY(this.ball.y, this.ball.vy, this.ball.vx, this.paddleLeft.x - this.ball.x, 30, H - 30);
    this.playerAimHistory.push(target);
    if (this.playerAimHistory.length > 12) this.playerAimHistory.shift();
  }

  private announce(kind: AnnouncerEvent['kind'], shooter: AnnouncerEvent['shooter'], shot: ShotType = 'normal', timing: ShotTiming = 'none') {
    this.onAnnouncer?.({
      kind, shooter, shot, timing,
      scoreLeft: this.scoreLeft,
      scoreRight: this.scoreRight,
      rallyHits: this.rallyHits,
      playerRead: this.playerReadLabel(),
      localOnly: this.practice,
    });
  }

  private getPaddleH(side: 'left' | 'right'): number {
    let h = PADDLE_H;
    for (const p of this.activePowerUps) {
      if (p.type === 'big' && p.owner === side) h = PADDLE_H * 1.5;
      if (p.type === 'small' && p.target === side) h = PADDLE_H * 0.6;
    }
    return h;
  }

  // ---- Physics ----
  private handlePaddleInput() {
    this.movePaddle('right', this.paddleRight, this.keys['ArrowUp'], this.keys['ArrowDown']);
    if (this.twoPlayer) {
      this.movePaddle('left', this.paddleLeft, this.keys['w'] || this.keys['W'], this.keys['s'] || this.keys['S']);
    }
  }

  private movePaddle(side: Side, paddle: Paddle, up: boolean, down: boolean) {
    const target = this.touchTargets[side];
    const axis = this.padAxis[side];
    if (target !== null) {
      const diff = target - (paddle.y + this.getPaddleH(side) / 2);
      paddle.vy = Math.abs(diff) < 2 ? 0 : Math.max(-PADDLE_SPEED, Math.min(PADDLE_SPEED, diff * 14));
    } else if (axis !== 0) {
      paddle.vy = axis * PADDLE_SPEED;
    } else if (up) {
      paddle.vy = -PADDLE_SPEED;
    } else if (down) {
      paddle.vy = PADDLE_SPEED;
    } else {
      paddle.vy *= 0.85;
    }
  }

  private updateAI(dt: number) {
    if (this.twoPlayer) return;
    if (this.practice) {
      // The coach never misses: it exists to give the player another ball.
      const diff = this.ball.y - (this.paddleLeft.y + this.getPaddleH('left') / 2);
      this.paddleLeft.vy = Math.max(-1400, Math.min(1400, diff * 16));
      return;
    }
    const aiSpd = AI_SPEEDS[this.aiDifficulty];
    const paddleCenter = this.paddleLeft.y + this.getPaddleH('left') / 2;
    let targetY = this.ball.y;

    if (this.aiDifficulty >= 1 && this.ball.vx < 0) {
      targetY = predictInterceptY(
        this.ball.y, this.ball.vy, this.ball.vx,
        this.ball.x - this.paddleLeft.x - PADDLE_W,
        30, H - 30,
      );
      const read = this.mostCommonAim();
      if (read) {
        const readStrength = [0.08, 0.15, 0.24][this.aiDifficulty];
        const confidence = Math.min(readStrength, (read.count - 2) * 0.04);
        targetY = targetY * (1 - confidence) + read.y * confidence;
      }
    }

    const baseImprecision = this.aiDifficulty === 0 ? 52 : this.aiDifficulty === 1 ? 34 : 20;
    targetY += Math.sin(Date.now() / 500) * baseImprecision;
    const diff = targetY - paddleCenter;
    const maxMove = aiSpd * 60 * dt;

    if (Math.abs(diff) > 5) {
      this.paddleLeft.vy = Math.sign(diff) * Math.min(Math.abs(diff) * 5, maxMove / dt);
    } else {
      this.paddleLeft.vy *= 0.9;
    }
  }

  private updatePaddles(dt: number) {
    for (const [side, paddle] of [['left', this.paddleLeft], ['right', this.paddleRight]] as const) {
      const ph = this.getPaddleH(side);
      paddle.y += paddle.vy * dt;
      paddle.y = Math.max(20, Math.min(H - 20 - ph, paddle.y));
      paddle.swingTimer = Math.max(0, paddle.swingTimer - dt);
    }
  }

  private ballPaddleCollision(b: Ball, paddle: Paddle, side: 'left' | 'right') {
    const ph = this.getPaddleH(side);
    let hit = false;
    if (side === 'left') {
      hit = b.x - BALL_R <= paddle.x + PADDLE_W && b.x + BALL_R >= paddle.x &&
            b.y >= paddle.y && b.y <= paddle.y + ph && b.vx < 0;
    } else {
      hit = b.x + BALL_R >= paddle.x && b.x - BALL_R <= paddle.x + PADDLE_W &&
            b.y >= paddle.y && b.y <= paddle.y + ph && b.vx > 0;
    }
    if (!hit) return null;

    if (side === 'left' && this.practice) {
      const pace = 4.6 + Math.min(this.practiceStats.streak, 10) * 0.12;
      const feed = calculateShot({
        side, shot: 'normal', hitOffset: (Math.random() - 0.5) * 1.4, paddleVelocity: 0, incomingVy: b.vy, incomingSpeed: pace,
      });
      this.startSwing(paddle, 'normal');
      return { ...feed, shot: 'normal' as ShotType, timing: 'none' as ShotTiming };
    }

    const hitOffset = ((b.y - (paddle.y + ph / 2)) / (ph / 2));
    const pendingPower = this.getPendingPowerShot(side);
    let shot = this.getShotType(side);
    let timing = pendingPower?.timing ?? 'none';
    const spinPress = this.spinPress[side];
    if (shot !== 'power' && spinPress?.shot === shot) timing = spinPress.timing;
    delete this.spinPress[side];
    if (side === 'left' && !this.twoPlayer && this.aiDifficulty === 2 && this.chargeLeft >= 100 && Math.abs(hitOffset) < 0.36) {
      shot = 'power';
      timing = 'none';
    }
    const result = calculateShot({
      side,
      shot,
      hitOffset,
      paddleVelocity: paddle.vy,
      incomingVy: b.vy,
      incomingSpeed: Math.hypot(b.vx, b.vy),
      charge: pendingPower?.charge ?? (side === 'left' ? this.chargeLeft : this.chargeRight),
      timing,
    });
    this.startSwing(paddle, shot);
    this.spendPower(side, shot);
    return { ...result, shot, timing };
  }

  private updateBall(b: Ball, dt: number, isExtra: boolean): boolean {
    if (b.frozen) return true;

    const speedMult = this.getBallSpeedMultiplier();

    const curved = applySpin(b.vx, b.vy, b.spin, dt);
    b.vx = curved.vx;
    b.vy = curved.vy;
    b.spin = curved.spin;
    b.x += b.vx * 60 * dt * speedMult;
    b.y += b.vy * 60 * dt * speedMult;

    // Wall bounce
    if (b.y - BALL_R < 20) {
      b.y = 20 + BALL_R;
      b.vy = Math.abs(b.vy);
      b.spin *= -0.78;
      this.onWallBounce(b);
      this.emitParticles(b.x, b.y, '#ffffff', 5, 80, 0.3, 2);
    }
    if (b.y + BALL_R > H - 20) {
      b.y = H - 20 - BALL_R;
      b.vy = -Math.abs(b.vy);
      b.spin *= -0.78;
      this.onWallBounce(b);
      this.emitParticles(b.x, b.y, '#ffffff', 5, 80, 0.3, 2);
    }

    // Paddle collisions
    const leftHit = this.ballPaddleCollision(b, this.paddleLeft, 'left');
    if (leftHit) {
      b.vx = leftHit.vx; b.vy = leftHit.vy; b.spin = leftHit.spin; b.speed = leftHit.speed;
      b.x = this.paddleLeft.x + PADDLE_W + BALL_R;
      b.lastHitBy = 'left';
      this.onRacketContact(b, 'left', leftHit);
      this.rallyHits++;
      this.chargeLeft = Math.min(100, this.chargeLeft + (leftHit.speed > 7.4 ? 0 : 18));
      if (this.rallyHits >= 8 && !this.longRallyAnnounced) {
        this.longRallyAnnounced = true;
        this.announce('long-rally', this.twoPlayer ? 'P1' : 'CPU');
      }
      if (leftHit.shot !== 'normal') this.announce('shot', this.twoPlayer ? 'P1' : 'CPU', leftHit.shot, leftHit.timing);
    }
    const rightHit = this.ballPaddleCollision(b, this.paddleRight, 'right');
    if (rightHit) {
      b.vx = rightHit.vx; b.vy = rightHit.vy; b.spin = rightHit.spin; b.speed = rightHit.speed;
      b.x = this.paddleRight.x - BALL_R;
      b.lastHitBy = 'right';
      this.onRacketContact(b, 'right', rightHit);
      this.rallyHits++;
      this.chargeRight = Math.min(100, this.chargeRight + 18);
      if (!this.twoPlayer) this.recordPlayerAim();
      if (this.rallyHits >= 8 && !this.longRallyAnnounced) {
        this.longRallyAnnounced = true;
        this.announce('long-rally', this.twoPlayer ? 'P2' : 'PLAYER');
      }
      if (rightHit.shot !== 'normal') this.announce('shot', this.twoPlayer ? 'P2' : 'PLAYER', rightHit.shot, rightHit.timing);
    }

    // Scoring
    if (b.x < -BALL_R * 2) {
      if (!isExtra && this.practice) {
        this.feedPractice(0.35);
        return false;
      }
      if (!isExtra) {
        this.scoreRight++;
        this.goalScorer = 'right';
        this.audio.score(-0.6);
        this.emitParticles(50, H/2, '#ef4444', 30, 200, 0.8, 4);
        this.triggerShake(8);
        this.onGoal();
      }
      return false;
    }
    if (b.x > W + BALL_R * 2) {
      if (!isExtra && this.practice) {
        this.practiceStats.streak = 0;
        this.audio.miss(0.6);
        this.addFloatText(this.paddleRight.x, this.paddleRight.y - 14, 'MISSED', '#ff8a65');
        this.feedPractice(0.35);
        return false;
      }
      if (!isExtra) {
        this.scoreLeft++;
        this.goalScorer = 'left';
        this.audio.score(0.6);
        this.emitParticles(W - 50, H/2, '#3b82f6', 30, 200, 0.8, 4);
        this.triggerShake(8);
        this.onGoal();
      }
      return false;
    }

    // Trail
    b.trail.push({ x: b.x, y: b.y });
    if (b.trail.length > 20) b.trail.shift();

    return true;
  }

  private onWallBounce(b: Ball) {
    this.audio.wallHit(this.panFor(b.x));
    if (b.bounced) return;
    b.bounced = true;
    const kicked = applyBounceKick(b.vx, b.vy, b.shot);
    b.vx = kicked.vx;
    b.vy = kicked.vy;
  }

  private panFor(x: number) {
    return (x / W - 0.5) * 1.4;
  }

  private onRacketContact(b: Ball, side: Side, hit: { speed: number; spin: number; shot: ShotType; timing: ShotTiming }) {
    const paddle = side === 'left' ? this.paddleLeft : this.paddleRight;
    const perfect = hit.timing === 'perfect' && hit.shot !== 'normal';
    b.shot = hit.shot;
    b.bounced = false;
    this.audio.shotHit(hit.shot, this.panFor(b.x), hit.speed / BALL_SPEED_MAX, perfect);

    const color = hit.shot === 'normal' ? paddle.glowColor : SHOT_COLORS[hit.shot];
    this.emitParticles(b.x, b.y, color, 12, 150, 0.4, 3);
    if (perfect) {
      this.emitParticles(b.x, b.y, PERFECT_COLOR, 22, 240, 0.55, 4);
      this.triggerShake(7);
      this.hitStop = 0.07;
      this.rumble(side, 0.9, 0.6, 180);
    } else {
      this.triggerShake(hit.shot === 'power' ? 5 : 3);
      this.rumble(side, hit.shot === 'power' ? 0.6 : 0.15, 0.3, 70);
    }

    if (!this.twoPlayer && side === 'left') return;
    this.recordShot(side, hit.shot, hit.timing, hit.speed, hit.spin);
    if (this.practice) this.scorePracticeStroke(hit.shot, hit.timing);
    if (perfect) this.addFloatText(b.x, b.y - 24, `PERFECT ${SHOT_LABELS[hit.shot]}`, PERFECT_COLOR);
    else if (hit.shot !== 'normal') this.addFloatText(b.x, b.y - 24, SHOT_LABELS[hit.shot], SHOT_COLORS[hit.shot]);
  }

  private recordShot(side: Side, shot: ShotType, timing: ShotTiming, speed: number, spin: number) {
    this.lastShot = {
      who: side === 'left' ? this.paddleLeft.name : this.paddleRight.name,
      shot,
      timing,
      mph: toMph(speed * this.getBallSpeedMultiplier()),
      rpm: toRpm(spin),
      at: this.time,
    };
  }

  private onGoal() {
    const scorer = this.goalScorer === 'right'
      ? (this.twoPlayer ? 'P2' : 'PLAYER')
      : (this.twoPlayer ? 'P1' : 'CPU');
    this.announce('point', scorer);
    if (this.scoreLeft >= WIN_SCORE || this.scoreRight >= WIN_SCORE) {
      const winner = this.scoreLeft >= WIN_SCORE ? 'left' : 'right';
      const playerWon = this.twoPlayer || winner === 'right';

      if (!this.twoPlayer) {
        if (playerWon) { this.winStreak++; this.audio.victory(); }
        else { this.winStreak = 0; this.audio.gameOver(); }
      } else {
        this.audio.victory();
      }

      try {
        localStorage.setItem('jedai_streak', String(this.winStreak));
      } catch { /* ignore */ }

      const result = this.twoPlayer
        ? `${this.paddleLeft.name} ${this.scoreLeft} - ${this.scoreRight} ${this.paddleRight.name}`
        : (winner === 'right' ? 'WIN' : 'LOSS') + ` (${this.scoreLeft}-${this.scoreRight})`;
      this.matchHistory.push(result);
      if (this.matchHistory.length > 10) this.matchHistory.shift();
      try {
        localStorage.setItem('jedai_history', JSON.stringify(this.matchHistory));
      } catch { /* ignore */ }

      this.goalTimer = 2;
      this.state = GameState.GOAL;
      this.onStateChange?.(this.state);
    } else {
      this.goalTimer = 1.05;
      this.state = GameState.GOAL;
      this.onStateChange?.(this.state);
    }
  }

  private checkGoldBall() {
    if (!this.goldBall) return;
    const dx = this.ball.x - this.goldBall.x;
    const dy = this.ball.y - this.goldBall.y;
    if (Math.sqrt(dx*dx + dy*dy) < BALL_R + 10) {
      if (this.ball.lastHitBy === 'left') this.scoreLeft += 3;
      else if (this.ball.lastHitBy === 'right') this.scoreRight += 3;
      else return;

      this.audio.goldPickup();
      this.emitParticles(this.goldBall.x, this.goldBall.y, '#FFD700', 25, 180, 0.6, 4);
      this.goldBall = null;
      this.goldBallTimer = GOLD_SPAWN_DELAY;

      if (this.scoreLeft >= WIN_SCORE || this.scoreRight >= WIN_SCORE) this.onGoal();
    }
  }

  private checkPowerUp() {
    if (!this.powerUp) return;
    const dx = this.ball.x - this.powerUp.x;
    const dy = this.ball.y - this.powerUp.y;
    if (Math.sqrt(dx*dx + dy*dy) < BALL_R + 12) {
      const typeDef = this.powerUp.typeDef;
      const ownerSide: 'left' | 'right' = this.ball.lastHitBy || 'right';
      const targetSide: 'left' | 'right' = ownerSide === 'left' ? 'right' : 'left';

      this.audio.powerUp();
      this.emitParticles(this.powerUp.x, this.powerUp.y, typeDef.color, 20, 150, 0.5, 3);

      if (typeDef.type === 'multi') {
        for (let i = 0; i < 2; i++) {
          const angle = (Math.random() - 0.5) * Math.PI * 0.6;
          const dir = this.ball.vx > 0 ? 1 : -1;
          const spd = Math.sqrt(this.ball.vx**2 + this.ball.vy**2);
          this.extraBalls.push({
            x: this.ball.x, y: this.ball.y,
            vx: Math.cos(angle) * spd * dir * (0.8 + Math.random()*0.4),
            vy: Math.sin(angle) * spd,
            speed: spd, spin: this.ball.spin, trail: [], lastHitBy: this.ball.lastHitBy, frozen: false,
            shot: 'normal', bounced: false,
          });
        }
      } else {
        this.activePowerUps.push({
          type: typeDef.type, owner: ownerSide, target: targetSide,
          endTime: Date.now() + typeDef.duration * 1000,
          label: typeDef.desc, color: typeDef.color,
        });
      }

      this.powerUp = null;
      this.powerUpTimer = POWERUP_SPAWN_DELAY;
    }
  }

  // ---- Particles ----
  private emitParticles(x: number, y: number, color: string, count: number, speed: number, life: number, size: number) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = speed * (0.3 + Math.random() * 0.7);
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        color, life: life * (0.5 + Math.random() * 0.5),
        maxLife: life, size: size * (0.5 + Math.random() * 0.5),
      });
    }
  }

  private triggerShake(mag: number) { this.shakeMag = mag; }

  // ---- Drawing helpers ----
  private drawStars() {
    const ctx = this.ctx;
    for (const s of this.stars) {
      ctx.globalAlpha = s.brightness;
      ctx.fillStyle = '#fff';
      ctx.fillRect(s.x, s.y, s.size, s.size);
    }
    ctx.globalAlpha = 1;
  }

  private drawBackground() {
    const ctx = this.ctx;
    const grad = ctx.createRadialGradient(W/2, H/2, 50, W/2, H/2, W * 0.7);
    grad.addColorStop(0, '#0a0020');
    grad.addColorStop(0.5, '#050015');
    grad.addColorStop(1, '#000008');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    this.drawStars();
  }

  private drawCourt() {
    if (!this.courtLayer) this.courtLayer = this.renderCourtLayer();
    if (this.courtLayer) this.ctx.drawImage(this.courtLayer, 0, 0);
  }

  /** The court never changes, so it is painted once and reused every frame. */
  private renderCourtLayer() {
    const layer = document.createElement('canvas');
    layer.width = W;
    layer.height = H;
    const ctx = layer.getContext('2d');
    if (!ctx) return null;

    // Run-off and playing surface, with a fine grain so it reads as acrylic hard court.
    ctx.fillStyle = COURT.runoff;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = COURT.surface;
    ctx.fillRect(COURT.baselineX, COURT.sidelineY, W - COURT.baselineX * 2, H - COURT.sidelineY * 2);
    for (let i = 0; i < 9000; i++) {
      ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.05)';
      ctx.fillRect(Math.random() * W, Math.random() * H, 1.5, 1.5);
    }

    const left = COURT.baselineX, right = W - COURT.baselineX;
    const top = COURT.sidelineY, bottom = H - COURT.sidelineY;
    const singlesTop = top + (bottom - top) * (4.5 / 36);
    const singlesBottom = bottom - (bottom - top) * (4.5 / 36);
    const serviceOffset = (W / 2 - left) * (21 / 39);
    const line = (x1: number, y1: number, x2: number, y2: number, width: number) => {
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    };

    ctx.strokeStyle = COURT.line;
    // Baselines, doubles sidelines and singles sidelines.
    line(left, top, left, bottom, 5);
    line(right, top, right, bottom, 5);
    line(left, top, right, top, 3);
    line(left, bottom, right, bottom, 3);
    line(left, singlesTop, right, singlesTop, 3);
    line(left, singlesBottom, right, singlesBottom, 3);
    // Service lines, centre service line and baseline centre marks.
    line(W / 2 - serviceOffset, singlesTop, W / 2 - serviceOffset, singlesBottom, 3);
    line(W / 2 + serviceOffset, singlesTop, W / 2 + serviceOffset, singlesBottom, 3);
    line(W / 2 - serviceOffset, H / 2, W / 2 + serviceOffset, H / 2, 3);
    line(left, H / 2, left + 12, H / 2, 3);
    line(right, H / 2, right - 12, H / 2, 3);

    // Net: cast shadow, mesh, white tape, and posts just outside the doubles lines.
    const netTop = top - 8, netBottom = bottom + 8;
    ctx.fillStyle = 'rgba(0,0,0,0.26)';
    ctx.fillRect(W / 2 + 3, netTop, 9, netBottom - netTop);
    ctx.fillStyle = 'rgba(8,14,22,0.55)';
    ctx.fillRect(W / 2 - 5, netTop, 10, netBottom - netTop);
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    for (let y = netTop; y < netBottom; y += 5) line(W / 2 - 5, y, W / 2 + 5, y, 0.7);
    for (let x = W / 2 - 5; x <= W / 2 + 5; x += 5) line(x, netTop, x, netBottom, 0.7);
    ctx.strokeStyle = '#ffffff';
    line(W / 2, netTop, W / 2, netBottom, 2.5);
    ctx.fillStyle = '#20262e';
    ctx.fillRect(W / 2 - 5, netTop - 6, 10, 8);
    ctx.fillRect(W / 2 - 5, netBottom - 2, 10, 8);
    ctx.fillStyle = '#e8edf2';
    ctx.fillRect(W / 2 - 3, netTop - 4, 6, 4);
    ctx.fillRect(W / 2 - 3, netBottom, 6, 4);

    return layer;
  }

  private dimCourt() {
    this.ctx.fillStyle = 'rgba(4, 8, 18, 0.68)';
    this.ctx.fillRect(0, 0, W, H);
  }

  /** Dark backing so HUD text stays legible on the bright court colours. */
  private drawPlate(x: number, y: number, width: number, height: number) {
    this.ctx.fillStyle = 'rgba(5, 10, 20, 0.78)';
    this.ctx.fillRect(x, y, width, height);
  }

  private drawTextPlate(text: string, centerX: number, baselineY: number, size: number) {
    const width = this.ctx.measureText(text).width + 16;
    this.drawPlate(centerX - width / 2, baselineY - size - 4, width, size + 9);
  }

  private drawPaddle(paddle: Paddle, h: number) {
    const ctx = this.ctx;
    const { x, y, color1, color2, glowColor } = paddle;
    const cx = x + PADDLE_W / 2;
    const cy = y + h / 2;
    const facing = x < W / 2 ? 1 : -1;
    const scale = 2;
    const phase = paddle.swingTimer > 0 ? 1 - paddle.swingTimer / 0.38 : 1;
    const eased = phase * phase * (3 - 2 * phase);
    const swingAngles: Record<ShotType, [number, number]> = {
      normal: [-0.85, 0.45],
      topspin: [0.9, -0.72],
      slice: [-1.05, 0.82],
      stopspin: [-0.2, 0.34],
      power: [-1.25, 1.02],
    };
    const [windup, followThrough] = swingAngles[paddle.swingShot];
    const racketAngle = paddle.swingTimer > 0
      ? windup + (followThrough - windup) * eased
      : -0.12;
    const footShift = Math.max(-1, Math.min(1, paddle.vy / 240));

    ctx.save();
    ctx.translate(cx, cy + 12);
    ctx.scale(facing * scale, scale);

    // Small court shadow and chunky pixel-art legs.
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#02030b';
    ctx.fillRect(-10, 14, 21, 3);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#15234a';
    ctx.fillRect(-6, 5, 5, 7);
    ctx.fillRect(1, 5, 5, 7);
    ctx.fillRect(-7 - footShift, 11, 7, 3);
    ctx.fillRect(1 + footShift, 11, 7, 3);
    ctx.fillStyle = '#d6e8ff';
    ctx.fillRect(-7 - footShift, 13, 7, 1);
    ctx.fillRect(1 + footShift, 13, 7, 1);

    // Jersey and shorts are drawn on a crisp pixel grid.
    ctx.shadowBlur = 10;
    ctx.shadowColor = glowColor;
    ctx.fillStyle = color1;
    ctx.fillRect(-7, -10, 14, 15);
    ctx.fillRect(-9, -8, 3, 8);
    ctx.fillRect(6, -8, 3, 7);
    ctx.shadowBlur = 0;
    ctx.fillStyle = color2;
    ctx.fillRect(-2, -9, 2, 12);
    ctx.fillStyle = '#182244';
    ctx.fillRect(-7, 4, 14, 4);
    ctx.fillRect(-1, 4, 2, 4);

    // Head, hair and sweatband.
    ctx.fillStyle = '#f3b18b';
    ctx.fillRect(-4, -21, 9, 9);
    ctx.fillRect(4, -18, 2, 3);
    ctx.fillStyle = '#17213d';
    ctx.fillRect(-5, -23, 10, 4);
    ctx.fillRect(-5, -20, 3, 3);
    ctx.fillStyle = '#fff4d6';
    ctx.fillRect(2, -18, 2, 1);

    // Back arm stays tucked in while the racket arm follows the chosen stroke.
    ctx.fillStyle = '#f3b18b';
    ctx.fillRect(-9, -8, 3, 8);
    ctx.fillRect(-10, -1, 4, 2);
    ctx.save();
    ctx.translate(5, -8);
    ctx.rotate(racketAngle);
    ctx.fillRect(0, -1.5, 10, 3);
    ctx.fillRect(8, -2, 4, 4);
    ctx.shadowBlur = paddle.swingTimer > 0 ? 8 : 3;
    ctx.shadowColor = glowColor;
    ctx.strokeStyle = '#e5fbff';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(12, -4.5, 6, 9);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = `${glowColor}cc`;
    ctx.lineWidth = 0.65;
    ctx.beginPath();
    ctx.moveTo(13, -2); ctx.lineTo(17, 2);
    ctx.moveTo(13, 2); ctx.lineTo(17, -2);
    ctx.stroke();
    ctx.restore();
    ctx.restore();
  }

  private drawBallTrail(b: Ball, color: string) {
    const ctx = this.ctx;
    for (let i = 0; i < b.trail.length; i++) {
      const t = b.trail[i];
      const alpha = (i / b.trail.length) * 0.3;
      const size = BALL_R * (i / b.trail.length) * 0.7;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(t.x, t.y, size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private drawBallObj(b: Ball, color: string, glow: string) {
    const ctx = this.ctx;
    // Tennis ball — bright yellow-green
    const tennisBallColor = color === '#fff' ? '#CCFF00' : color;
    const tennisGlow = glow === '#ffffff' ? '#AADD00' : glow;

    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(b.x + 3, b.y + 4, BALL_R, BALL_R * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 12;
    ctx.shadowColor = tennisGlow;
    ctx.fillStyle = tennisBallColor;
    ctx.beginPath();
    ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2);
    ctx.fill();

    // Rotate the felt seams with the flight and add extra roll for spin shots.
    const rolling = this.time * (5 + Math.hypot(b.vx, b.vy) * 0.75) * Math.sign(b.vx || 1);
    const seamRotation = rolling + this.time * b.spin * 4.5;
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(seamRotation);
    ctx.beginPath();
    ctx.arc(0, 0, BALL_R, 0, Math.PI * 2);
    ctx.clip();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,0.78)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-4, -7);
    ctx.bezierCurveTo(5, -5, 5, 5, -4, 7);
    ctx.moveTo(4, -7);
    ctx.bezierCurveTo(-5, -5, -5, 5, 4, 7);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(-3, -4, 2, 2);
    ctx.restore();

    // Motion arcs turn the way the ball is spinning and grow with the amount of spin.
    const spinAmount = Math.min(1, Math.abs(b.spin));
    if (spinAmount > 0.12) {
      const spinAngle = this.time * Math.sign(b.spin) * (4 + spinAmount * 10);
      ctx.save();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 0.25 + spinAmount * 0.6;
      ctx.strokeStyle = SHOT_COLORS[b.shot];
      ctx.lineWidth = 1.5;
      for (const offset of [0, Math.PI]) {
        ctx.beginPath();
        ctx.arc(b.x, b.y, BALL_R + 5, spinAngle + offset, spinAngle + offset + 0.5 + spinAmount * 1.3);
        ctx.stroke();
      }
      ctx.restore();
    }

    ctx.shadowBlur = 0;
  }

  /** Practice cue: the ball wears a lime ring for exactly as long as the green window is open. */
  private drawPracticeCue() {
    if (getTimingGrade(this.getTimeToContact('right')) !== 'perfect') return;
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = PERFECT_COLOR;
    ctx.lineWidth = 2.5;
    ctx.shadowBlur = 14;
    ctx.shadowColor = PERFECT_COLOR;
    ctx.beginPath();
    ctx.arc(this.ball.x, this.ball.y, BALL_R + 9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private drawShotReadout() {
    const shot = this.lastShot;
    if (!shot) return;
    const age = this.time - shot.at;
    if (age > 4) return;
    const ctx = this.ctx;
    const grade = shot.timing === 'none' || shot.shot === 'normal' ? '' : `  ${shot.timing.toUpperCase()}`;
    ctx.save();
    ctx.globalAlpha = Math.min(1, (4 - age) / 1.2);
    ctx.textAlign = 'center';
    ctx.font = '7px "Press Start 2P", monospace';
    const readout = `${shot.who} ${SHOT_LABELS[shot.shot]}  ${shot.mph} MPH  ${shot.rpm} RPM${grade}`;
    this.drawTextPlate(readout, READOUT_X, H - 34, 7);
    ctx.fillStyle = shot.timing === 'perfect' && shot.shot !== 'normal' ? PERFECT_COLOR : SHOT_COLORS[shot.shot];
    ctx.fillText(readout, READOUT_X, H - 34);
    ctx.restore();
  }

  private drawPracticeHud() {
    const ctx = this.ctx;
    const stats = this.practiceStats;
    this.drawScoreDisplay(stats.perfects, W / 2 - 92, 35, PERFECT_COLOR, PERFECT_COLOR);
    this.drawScoreDisplay(stats.tries, W / 2 + 50, 35, '#f5f5f0', '#9ca3af');
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText('PERFECT', W / 2 - 50, 28);
    ctx.fillText('TRIES', W / 2 + 82, 28);
    const streakText = `STREAK ${stats.streak}   BEST ${stats.best}`;
    this.drawTextPlate(streakText, W / 2, H - 6, 8);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText(streakText, W / 2, H - 6);
    ctx.font = '7px "Press Start 2P", monospace';
    const hint = this.prompt(
      'TAP V/Z/X INSIDE THE RING, OR HOLD C AND RELEASE',
      'TAP Y/B/X INSIDE THE RING, OR HOLD RT AND RELEASE',
      'TAP A SHOT INSIDE THE RING, OR HOLD POWER AND RELEASE',
    );
    this.drawTextPlate(hint, 330, 124, 7);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText(hint, 330, 124);
  }

  private drawOverlays() {
    const ctx = this.ctx;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = '10px "Press Start 2P", monospace';
    for (const text of this.floatTexts) {
      ctx.globalAlpha = Math.min(1, text.life * 1.6);
      ctx.fillStyle = text.color;
      ctx.fillText(text.text, text.x, text.y);
    }
    if (this.toast && this.time < this.toast.until) {
      ctx.globalAlpha = Math.min(1, (this.toast.until - this.time) * 2);
      ctx.fillStyle = PERFECT_COLOR;
      ctx.font = '9px "Press Start 2P", monospace';
      ctx.fillText(this.toast.text, W / 2, H - 84);
    }
    ctx.restore();
  }

  private drawDigit(x: number, y: number, digit: number, scale: number, color: string, glow: string) {
    const ctx = this.ctx;
    const segs = SEGMENTS[digit] || SEGMENTS[0];
    const sw = 4 * scale, sl = 22 * scale, gap = 2 * scale;

    ctx.fillStyle = color;
    ctx.shadowBlur = 15;
    ctx.shadowColor = glow;

    const hSeg = (sx: number, sy: number) => {
      ctx.beginPath();
      ctx.moveTo(sx + sw/2, sy);
      ctx.lineTo(sx + sl - sw/2, sy);
      ctx.lineTo(sx + sl, sy + sw/2);
      ctx.lineTo(sx + sl - sw/2, sy + sw);
      ctx.lineTo(sx + sw/2, sy + sw);
      ctx.lineTo(sx, sy + sw/2);
      ctx.closePath();
      ctx.fill();
    };

    const vSeg = (sx: number, sy: number) => {
      ctx.beginPath();
      ctx.moveTo(sx + sw/2, sy);
      ctx.lineTo(sx + sw, sy + sw/2);
      ctx.lineTo(sx + sw, sy + sl - sw/2);
      ctx.lineTo(sx + sw/2, sy + sl);
      ctx.lineTo(sx, sy + sl - sw/2);
      ctx.lineTo(sx, sy + sw/2);
      ctx.closePath();
      ctx.fill();
    };

    if (segs[0]) hSeg(x + gap, y);
    if (segs[1]) vSeg(x + sl - sw + gap, y + gap);
    if (segs[2]) vSeg(x + sl - sw + gap, y + sl + gap);
    if (segs[3]) hSeg(x + gap, y + sl * 2);
    if (segs[4]) vSeg(x, y + sl + gap);
    if (segs[5]) vSeg(x, y + gap);
    if (segs[6]) hSeg(x + gap, y + sl);

    ctx.shadowBlur = 0;
  }

  private drawScoreDisplay(score: number, x: number, y: number, color: string, glow: string) {
    const scale = 1.4;
    const digitW = 30 * scale;
    const str = String(Math.min(score, 99)).padStart(2, '0');
    for (let i = 0; i < str.length; i++) {
      this.drawDigit(x + i * digitW, y, parseInt(str[i]), scale, color, glow);
    }
  }

  private drawHUD() {
    const ctx = this.ctx;
    this.drawPlate(W / 2 - 96, 14, 240, 94);
    this.drawPlate(W - 356, H - 70, 248, 48);
    this.drawShotReadout();
    if (this.practice) {
      this.drawPracticeHud();
    } else {
    this.drawScoreDisplay(this.scoreLeft, W/2 - 92, 35, '#f87171', '#ef4444');
    this.drawScoreDisplay(this.scoreRight, W/2 + 50, 35, '#60a5fa', '#3b82f6');

    ctx.font = '10px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = this.paddleLeft.glowColor;
    ctx.globalAlpha = 0.6;
    ctx.fillText(this.paddleLeft.name, W/2 - 50, 28);
    ctx.fillStyle = this.paddleRight.glowColor;
    ctx.fillText(this.paddleRight.name, W/2 + 82, 28);
    ctx.globalAlpha = 1;

    ctx.font = '8px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    this.drawTextPlate(`FIRST TO ${WIN_SCORE}`, W / 2, H - 6, 8);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText(`FIRST TO ${WIN_SCORE}`, W/2, H - 6);
    }

    const timingSide = this.twoPlayer && this.ball.vx < 0 ? 'left' : 'right';
    const charge = timingSide === 'left' ? this.chargeLeft : this.chargeRight;
    const isHolding = timingSide === 'right'
      ? this.keys['c'] || this.keys['C']
      : this.keys['f'] || this.keys['F'];
    const timeToContact = this.getTimeToContact(timingSide);
    const timing = this.getPendingPowerShot(timingSide)?.timing ?? getTimingGrade(timeToContact);
    const timingProgress = getTimingProgress(timeToContact);
    const showTiming = isHolding || (timeToContact !== null && timeToContact <= 0.55) || Boolean(this.getPendingPowerShot(timingSide));
    const barX = W - 230;
    const barWidth = 112;

    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,255,255,0.52)';
    ctx.font = '7px "Press Start 2P", monospace';
    const timingPlayer = timingSide === 'right' ? (this.twoPlayer ? 'P2' : 'P1') : (this.twoPlayer ? 'P1' : 'CPU');
    ctx.fillText(`${timingPlayer} CHARGE`, W - 238, H - 47);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(barX, H - 56, barWidth, 7);
    ctx.fillStyle = charge >= 95 ? '#d7fa59' : '#60a5fa';
    ctx.shadowBlur = charge >= 95 ? 10 : 0;
    ctx.shadowColor = '#d7fa59';
    ctx.fillRect(barX, H - 56, barWidth * (charge / 100), 7);
    ctx.shadowBlur = 0;

    if (showTiming) {
      ctx.textAlign = 'right';
      ctx.fillStyle = timing === 'perfect' ? '#d7fa59' : 'rgba(255,255,255,0.52)';
      ctx.font = '6px "Press Start 2P", monospace';
      const timingLabel = this.getPendingPowerShot(timingSide)
        ? `${timing.toUpperCase()} LOCKED`
        : isHolding && timing === 'perfect' ? 'RELEASE NOW' : isHolding && timeToContact === null ? 'WAIT FOR BALL' : isHolding && timing === 'late' ? 'TOO LATE' : 'WATCH TIMING';
      ctx.fillText(timingLabel, W - 238, H - 32);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(barX, H - 35, barWidth, 6);
      ctx.fillStyle = 'rgba(215,250,89,0.55)';
      ctx.fillRect(barX + barWidth * (1 - 0.22 / 0.55), H - 35, barWidth * ((0.22 - 0.08) / 0.55), 6);
      if (timingProgress !== null) {
        const markerX = barX + barWidth * timingProgress;
        ctx.fillStyle = timing === 'perfect' ? '#d7fa59' : '#f5f5f0';
        ctx.shadowBlur = timing === 'perfect' ? 8 : 0;
        ctx.shadowColor = '#d7fa59';
        ctx.fillRect(markerX - 2, H - 38, 4, 12);
        ctx.shadowBlur = 0;
      }
    }
  }

  private drawGoldBall() {
    if (!this.goldBall) return;
    const ctx = this.ctx;
    const pulse = Math.sin(Date.now() / 200) * 0.3 + 0.7;
    const size = 8 + Math.sin(Date.now() / 300) * 2;

    ctx.strokeStyle = `rgba(255, 215, 0, ${pulse * 0.5})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(this.goldBall.x, this.goldBall.y, size + 6, Date.now()/500, Date.now()/500 + Math.PI * 1.2);
    ctx.stroke();

    ctx.shadowBlur = 20;
    ctx.shadowColor = '#FFD700';
    ctx.fillStyle = `rgba(255, 215, 0, ${pulse})`;
    ctx.beginPath();
    ctx.arc(this.goldBall.x, this.goldBall.y, size, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.fillStyle = '#FFD700';
    ctx.font = '10px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('+3', this.goldBall.x, this.goldBall.y - size - 8);
  }

  private drawPowerUp() {
    if (!this.powerUp) return;
    const ctx = this.ctx;
    const pu = this.powerUp;
    const pulse = Math.sin(Date.now() / 250) * 0.3 + 0.7;
    const size = 10 + Math.sin(Date.now() / 350) * 2;

    ctx.strokeStyle = pu.typeDef.color;
    ctx.globalAlpha = pulse * 0.4;
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(pu.x, pu.y, size + 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.shadowBlur = 15;
    ctx.shadowColor = pu.typeDef.color;
    ctx.fillStyle = pu.typeDef.color;
    ctx.globalAlpha = pulse;
    ctx.save();
    ctx.translate(pu.x, pu.y);
    ctx.rotate(Date.now() / 1000);
    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.lineTo(size * 0.7, 0);
    ctx.lineTo(0, size);
    ctx.lineTo(-size * 0.7, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;

    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff';
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(pu.typeDef.label, pu.x, pu.y + size + 16);
  }

  private drawActivePowerUps() {
    const ctx = this.ctx;
    let yOff = 0;
    for (const p of this.activePowerUps) {
      const remaining = Math.max(0, (p.endTime - Date.now()) / 1000);
      const x = p.owner === 'left' ? 50 : W - 180;
      ctx.fillStyle = p.color;
      ctx.globalAlpha = 0.8;
      ctx.font = '9px "Press Start 2P", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`${p.label} ${remaining.toFixed(1)}s`, x, H - 80 + yOff);
      ctx.globalAlpha = 1;
      yOff -= 14;
    }
  }

  private drawParticles() {
    const ctx = this.ctx;
    for (const p of this.particles) {
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.shadowBlur = 8;
      ctx.shadowColor = p.color;
      const s = p.size * (0.5 + 0.5 * alpha);
      ctx.fillRect(p.x - s/2, p.y - s/2, s, s);
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }

  // ---- Screen states ----
  private drawTitleScreen() {
    this.drawBackground();
    const t = this.time;
    const ctx = this.ctx;

    const pulse = Math.sin(t * 2) * 0.15 + 0.85;
    ctx.globalAlpha = pulse;

    // Acid-lime title treatment matches the refreshed showcase palette.
    ctx.fillStyle = '#d7fa59';
    ctx.shadowBlur = 35;
    ctx.shadowColor = '#d7fa59';
    ctx.font = '62px Orbitron, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PONG', W/2, H/2 - 80);

    ctx.font = '28px Orbitron, sans-serif';
    ctx.fillStyle = '#f5f5f0';
    ctx.shadowColor = '#d7fa59';
    ctx.shadowBlur = 20;
    ctx.fillText('SHOWCASE', W/2, H/2 - 35);
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;

    ctx.fillStyle = 'rgba(245, 245, 240, 0.48)';
    ctx.font = '9px "Press Start 2P", monospace';
    ctx.fillText('A GAME OF PERFECT TIMING', W/2, H/2 - 10);

    // Demo tennis ball (yellow-green)
    const dx = W/2 + Math.sin(t * 3) * 180;
    const dy = H/2 + 30 + Math.sin(t * 4.7) * 60;
    ctx.fillStyle = '#d7fa59';
    ctx.shadowBlur = 15; ctx.shadowColor = '#d7fa59';
    ctx.beginPath(); ctx.arc(dx, dy, 6, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;

    // Demo rackets
    const lpy = H/2 + 30 + Math.sin(t * 4.7) * 50 - 30;
    const rpy = H/2 + 30 + Math.sin(t * 4.7 + 0.3) * 50 - 30;
    ctx.strokeStyle = '#ff4466'; ctx.shadowBlur = 10; ctx.shadowColor = '#ff4466';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(W/2 - 196, lpy + 30, 6, 30, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#3b82f6'; ctx.shadowColor = '#3b82f6';
    ctx.beginPath(); ctx.ellipse(W/2 + 196, rpy + 30, 6, 30, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '10px "Press Start 2P", monospace';
    ctx.fillText('THE RALLY STARTS HERE', W/2, H/2 + 120);

    if (Math.sin(t * 3) > 0) {
      ctx.fillStyle = '#fff';
      ctx.font = '13px "Press Start 2P", monospace';
      ctx.fillText(this.prompt('PRESS ENTER OR CLICK TO START', 'PRESS A TO START', 'TAP TO START'), W/2, H/2 + 160);
    }

    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.fillText('INSPIRED BY ATARI 1972', W/2, H - 30);
    ctx.fillText('PONG SHOWCASE  /  SPACE TENNIS', W/2, H - 15);
  }

  private drawModeSelect() {
    this.drawBackground();
    this.drawCourt();
    this.dimCourt();
    const ctx = this.ctx;
    const t = this.time;

    ctx.fillStyle = '#3b82f6';
    ctx.shadowBlur = 20; ctx.shadowColor = '#3b82f6';
    ctx.font = '28px Orbitron, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SELECT MODE', W/2, 100);
    ctx.shadowBlur = 0;

    MODE_OPTIONS.forEach((opt, i) => {
      const selected = this.menuSelection === i;
      const y = this.modeRowY(i);

      if (selected) {
        ctx.fillStyle = 'rgba(59, 130, 246, 0.08)';
        ctx.fillRect(W/2 - 200, y - 25, 400, 50);
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 2;
        ctx.strokeRect(W/2 - 200, y - 25, 400, 50);
        const ap = Math.sin(t * 5) * 5;
        ctx.fillStyle = '#3b82f6';
        ctx.font = '16px "Press Start 2P", monospace';
        ctx.fillText('>', W/2 - 180 + ap, y + 6);
      }

      ctx.fillStyle = selected ? '#fff' : 'rgba(255,255,255,0.35)';
      ctx.font = `${selected ? 16 : 14}px "Press Start 2P", monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(opt, W/2, y + 6);
    });

    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.font = '9px "Press Start 2P", monospace';
    ctx.fillText(this.prompt('UP/DOWN TO SELECT  -  ENTER TO CONFIRM', 'STICK TO SELECT  -  A TO CONFIRM', 'TAP AN OPTION'), W/2, H - 50);
    ctx.fillText(this.prompt('ESC TO GO BACK', 'B TO GO BACK', 'TAP HERE TO GO BACK'), W/2, H - 30);

    if (this.winStreak > 0) {
      ctx.fillStyle = '#FFD700';
      ctx.font = '10px "Press Start 2P", monospace';
      ctx.fillText(`WIN STREAK: ${this.winStreak}`, W/2, H - 74);
    }
  }

  private drawDifficultySelect() {
    this.drawBackground();
    this.drawCourt();
    this.dimCourt();
    const ctx = this.ctx;
    const t = this.time;

    ctx.fillStyle = '#3b82f6';
    ctx.shadowBlur = 20; ctx.shadowColor = '#3b82f6';
    ctx.font = '24px Orbitron, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SELECT DIFFICULTY', W/2, 100);
    ctx.shadowBlur = 0;

    const colors = ['#00ff88', '#ffaa00', '#ff2244'];
    const descs = ['Slow AI - Good for learning', 'Balanced AI - A fair match', 'Fast AI - True arcade challenge'];

    AI_NAMES.forEach((name, i) => {
      const selected = this.difficultySelection === i;
      const y = 190 + i * 90;

      if (selected) {
        ctx.fillStyle = colors[i] + '10';
        ctx.fillRect(W/2 - 200, y - 28, 400, 56);
        ctx.strokeStyle = colors[i];
        ctx.lineWidth = 2;
        ctx.strokeRect(W/2 - 200, y - 28, 400, 56);
        const ap = Math.sin(t * 5) * 5;
        ctx.fillStyle = colors[i];
        ctx.font = '16px "Press Start 2P", monospace';
        ctx.fillText('>', W/2 - 180 + ap, y + 6);
      }

      ctx.fillStyle = selected ? colors[i] : 'rgba(255,255,255,0.3)';
      ctx.font = `${selected ? 18 : 14}px "Press Start 2P", monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(name, W/2, y + 6);

      if (selected) {
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.font = '9px "Press Start 2P", monospace';
        ctx.fillText(descs[i], W/2, y + 26);
      }
    });

    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.font = '9px "Press Start 2P", monospace';
    ctx.fillText(this.prompt('UP/DOWN TO SELECT  -  ENTER TO CONFIRM', 'STICK TO SELECT  -  A TO CONFIRM', 'TAP AN OPTION'), W/2, H - 50);
    ctx.fillText(this.prompt('ESC TO GO BACK', 'B TO GO BACK', 'TAP HERE TO GO BACK'), W/2, H - 30);
  }

  private drawCountdownScreen() {
    this.drawBackground();
    this.drawCourt();
    this.drawPaddle(this.paddleLeft, this.getPaddleH('left'));
    this.drawPaddle(this.paddleRight, this.getPaddleH('right'));
    this.drawHUD();

    const ctx = this.ctx;
    const num = Math.ceil(this.countdownTimer);
    const frac = this.countdownTimer - Math.floor(this.countdownTimer);
    const scale = 1 + (1 - frac) * 0.5;

    ctx.save();
    ctx.translate(W/2, H/2);
    ctx.scale(scale, scale);
    ctx.globalAlpha = frac;
    ctx.fillStyle = num > 0 ? '#fff' : '#00ff88';
    ctx.shadowBlur = 30;
    ctx.shadowColor = num > 0 ? '#fff' : '#00ff88';
    ctx.font = '72px Orbitron, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(num > 0 ? String(num) : 'GO!', 0, 0);
    ctx.restore();
    ctx.shadowBlur = 0;
    ctx.textBaseline = 'alphabetic';
  }

  private drawServeScreen() {
    this.drawBackground();
    this.drawCourt();
    this.drawPaddle(this.paddleLeft, this.getPaddleH('left'));
    this.drawPaddle(this.paddleRight, this.getPaddleH('right'));
    this.drawHUD();
    const ctx = this.ctx;
    const autoServe = !this.twoPlayer && this.serveSide === 'left';
    const server = this.practice ? 'COACH' : this.serveSide === 'right'
      ? (this.twoPlayer ? 'P2' : 'PLAYER')
      : (this.twoPlayer ? 'P1' : 'CPU');
    ctx.textAlign = 'center';
    this.drawPlate(W / 2 - 230, H / 2 - 66, 460, 124);
    ctx.fillStyle = '#d7fa59';
    ctx.shadowBlur = 18;
    ctx.shadowColor = '#d7fa59';
    ctx.font = '30px Orbitron, sans-serif';
    ctx.fillText(`${server} SERVE`, W / 2, H / 2 - 28);
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '10px "Press Start 2P", monospace';
    ctx.fillText(autoServe ? `${server} IS LINING IT UP…` : this.prompt('PRESS SPACE TO SERVE', 'PRESS A TO SERVE', 'TAP SERVE'), W / 2, H / 2 + 18);
    if (!autoServe) {
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.fillText(this.prompt('MOVE YOUR PADDLE TO AIM', 'MOVE YOUR PADDLE TO AIM', 'DRAG ON THE COURT TO AIM'), W / 2, H / 2 + 44);
    }
  }

  private drawGoalFlash() {
    const ctx = this.ctx;
    const maxTimer = (this.scoreLeft >= WIN_SCORE || this.scoreRight >= WIN_SCORE) ? 2 : 1.05;
    const progress = 1 - (this.goalTimer / maxTimer);
    ctx.globalAlpha = Math.max(0, 0.3 * (1 - progress));
    ctx.fillStyle = this.goalScorer === 'left' ? '#ef4444' : '#3b82f6';
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }

  private drawGameOver() {
    this.drawBackground();
    this.drawCourt();
    this.dimCourt();
    this.drawHUD();
    const ctx = this.ctx;
    const t = this.time;

    // Continual confetti
    if (Math.random() < 0.3) {
      const colors = ['#ef4444', '#3b82f6', '#FFD700', '#CCFF00', '#60a5fa'];
      this.emitParticles(Math.random() * W, Math.random() * 100, colors[Math.floor(Math.random()*5)], 1, 50, 1.5, 3);
    }

    const leftWon = this.scoreLeft >= WIN_SCORE;
    const winColor = leftWon ? '#f87171' : '#60a5fa';
    let winText: string;
    if (this.twoPlayer) {
      winText = leftWon ? 'PLAYER 1 WINS!' : 'PLAYER 2 WINS!';
    } else {
      winText = leftWon ? 'CPU WINS!' : 'YOU WIN!';
    }

    const pulse = Math.sin(t * 3) * 0.1 + 0.9;
    ctx.globalAlpha = pulse;
    ctx.fillStyle = winColor;
    ctx.shadowBlur = 25; ctx.shadowColor = winColor;
    ctx.font = '36px Orbitron, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(winText, W/2, H/2 - 30);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;

    ctx.fillStyle = '#fff';
    ctx.font = '18px "Press Start 2P", monospace';
    ctx.fillText(`${this.scoreLeft}  -  ${this.scoreRight}`, W/2, H/2 + 20);

    if (!this.twoPlayer && this.winStreak > 0) {
      ctx.fillStyle = '#FFD700';
      ctx.font = '12px "Press Start 2P", monospace';
      ctx.fillText(`WIN STREAK: ${this.winStreak}`, W/2, H/2 + 55);
    }

    if (this.matchHistory.length > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.fillText('RECENT MATCHES', W/2, H/2 + 90);
      this.matchHistory.slice(-5).forEach((m, i) => {
        ctx.fillStyle = m.includes('WIN') ? '#00ff88' : m.includes('LOSS') ? '#ff4444' : '#aaa';
        ctx.fillText(m, W/2, H/2 + 110 + i * 16);
      });
    }

    if (Math.sin(t * 3) > 0) {
      ctx.fillStyle = '#fff';
      ctx.font = '11px "Press Start 2P", monospace';
      ctx.fillText(this.prompt('PRESS ENTER TO CONTINUE', 'PRESS A TO CONTINUE', 'TAP TO CONTINUE'), W/2, H - 40);
    }
  }

  private drawPauseScreen() {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, W, H);

    const pulse = Math.sin(this.time * 2) * 0.15 + 0.85;
    ctx.globalAlpha = pulse;
    ctx.fillStyle = '#3b82f6';
    ctx.shadowBlur = 20; ctx.shadowColor = '#3b82f6';
    ctx.font = '36px Orbitron, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PAUSED', W/2, H/2 - 40);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;

    PAUSE_OPTIONS.forEach((option, i) => {
      const selected = this.pauseSelection === i;
      const y = this.pauseRowY(i);
      if (selected) {
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 2;
        ctx.strokeRect(W/2 - 170, y - 19, 340, 38);
      }
      ctx.fillStyle = selected ? '#fff' : 'rgba(255,255,255,0.45)';
      ctx.font = '12px "Press Start 2P", monospace';
      ctx.fillText(option, W/2, y + 6);
    });

    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '9px "Press Start 2P", monospace';
    ctx.fillText(this.prompt('ESC OR P TO RESUME', 'START TO RESUME', 'TAP AN OPTION'), W/2, H/2 + 145);
  }

  // ---- Main Loop ----
  private loop = (now: number) => {
    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;
    this.time += dt;

    this.pollGamepads();

    for (let i = this.floatTexts.length - 1; i >= 0; i--) {
      const text = this.floatTexts[i];
      text.y -= 26 * dt;
      text.life -= dt / 0.9;
      if (text.life <= 0) this.floatTexts.splice(i, 1);
    }

    // Update shake
    if (this.shakeMag > 0.5) {
      this.shakeX = (Math.random() - 0.5) * this.shakeMag * 2;
      this.shakeY = (Math.random() - 0.5) * this.shakeMag * 2;
      this.shakeMag *= 0.9;
    } else {
      this.shakeX = 0; this.shakeY = 0; this.shakeMag = 0;
    }

    // Update particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.life -= dt; p.vx *= 0.98; p.vy *= 0.98;
      if (p.life <= 0) this.particles.splice(i, 1);
    }

    // Update stars
    for (const s of this.stars) {
      s.y += s.speed * dt;
      if (s.y > H) { s.y = 0; s.x = Math.random() * W; }
      s.brightness += (Math.random() - 0.5) * 0.1;
      s.brightness = Math.max(0.1, Math.min(0.7, s.brightness));
    }

    const ctx = this.ctx;
    ctx.save();
    ctx.translate(this.shakeX, this.shakeY);

    switch (this.state) {
      case GameState.TITLE:
        this.drawTitleScreen();
        break;

      case GameState.MODE_SELECT:
        this.drawModeSelect();
        break;

      case GameState.DIFFICULTY:
        this.drawDifficultySelect();
        break;

      case GameState.COUNTDOWN: {
        const prevCount = Math.ceil(this.countdownTimer);
        this.countdownTimer -= dt;
        const currCount = Math.ceil(this.countdownTimer);
        if (currCount < prevCount) {
          if (currCount > 0) this.audio.countdown();
          else this.audio.countdownGo();
        }
        if (this.countdownTimer <= 0) {
          this.serveSide = (this.scoreLeft + this.scoreRight) % 2 === 0 ? 'right' : 'left';
          this.serveWait = 0;
          this.state = GameState.SERVE;
          this.onStateChange?.(this.state);
        }
        this.drawCountdownScreen();
        break;
      }

      case GameState.SERVE:
        this.handlePaddleInput();
        this.updatePaddles(dt);
        this.serveWait += dt;
        if (!this.twoPlayer && this.serveSide === 'left' && this.serveWait >= 0.85) this.launchServe();
        this.drawServeScreen();
        break;

      case GameState.PLAYING:
        if (this.hitStop > 0) this.hitStop -= dt;
        else this.simulateRally(dt);

        this.drawBackground();
        this.drawCourt();
        this.drawPaddle(this.paddleLeft, this.getPaddleH('left'));
        this.drawPaddle(this.paddleRight, this.getPaddleH('right'));
        this.drawBallTrail(this.ball, SHOT_COLORS[this.ball.shot]);
        for (const eb of this.extraBalls) this.drawBallTrail(eb, 'rgba(200,255,0,0.7)');
        this.drawBallObj(this.ball, '#fff', '#ffffff');
        for (const eb of this.extraBalls) this.drawBallObj(eb, '#ff88ff', '#ff44ff');
        if (this.practice) this.drawPracticeCue();
        this.drawGoldBall();
        this.drawPowerUp();
        this.drawActivePowerUps();
        this.drawHUD();
        this.drawParticles();
        break;

      case GameState.GOAL:
        this.goalTimer -= dt;
        this.drawBackground();
        this.drawCourt();
        this.drawPaddle(this.paddleLeft, this.getPaddleH('left'));
        this.drawPaddle(this.paddleRight, this.getPaddleH('right'));
        this.drawHUD();
        this.drawGoalFlash();
        this.drawParticles();
        if (this.goalTimer <= 0) {
          if (this.scoreLeft >= WIN_SCORE || this.scoreRight >= WIN_SCORE) {
            this.state = GameState.GAME_OVER;
          } else {
            this.resetBall();
            this.serveSide = (this.scoreLeft + this.scoreRight) % 2 === 0 ? 'right' : 'left';
            this.serveWait = 0;
            this.state = GameState.SERVE;
          }
          this.onStateChange?.(this.state);
        }
        break;

      case GameState.GAME_OVER:
        this.drawGameOver();
        this.drawParticles();
        break;

      case GameState.PAUSED:
        this.drawBackground();
        this.drawCourt();
        this.drawPaddle(this.paddleLeft, this.getPaddleH('left'));
        this.drawPaddle(this.paddleRight, this.getPaddleH('right'));
        if (this.resumeState === GameState.PLAYING) this.drawBallObj(this.ball, '#fff', '#ffffff');
        this.drawGoldBall();
        this.drawPowerUp();
        this.drawHUD();
        this.drawPauseScreen();
        break;
    }

    this.drawOverlays();
    ctx.restore();

    this.animId = requestAnimationFrame(this.loop);
  };

  private simulateRally(dt: number) {
    this.handlePaddleInput();
    this.updateShotCharge(dt);
    this.updateAI(dt);
    this.updatePaddles(dt);
    this.updateBall(this.ball, dt, false);

    for (let i = this.extraBalls.length - 1; i >= 0; i--) {
      if (!this.updateBall(this.extraBalls[i], dt, true)) {
        this.extraBalls.splice(i, 1);
      }
    }

    if (this.practice) return;

    this.goldBallTimer -= dt;
    if (this.goldBallTimer <= 0 && !this.goldBall) {
      this.goldBall = {
        x: W * 0.25 + Math.random() * W * 0.5,
        y: 60 + Math.random() * (H - 120),
      };
    }
    this.checkGoldBall();

    this.powerUpTimer -= dt;
    if (this.powerUpTimer <= 0 && !this.powerUp) {
      const typeDef = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
      this.powerUp = {
        x: W * 0.3 + Math.random() * W * 0.4,
        y: 80 + Math.random() * (H - 160),
        typeDef,
      };
    }
    this.checkPowerUp();

    this.activePowerUps = this.activePowerUps.filter(p => Date.now() < p.endTime);
  }
}
