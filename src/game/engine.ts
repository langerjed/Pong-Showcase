// ============================================================
//  JEDAI Space Tennis — Game Engine
//  Tennis in space, plays like Pong — where it all started
// ============================================================

import { AudioEngine } from './audio';
import {
  GameState, Paddle, Ball, GoldBall, PowerUpDef,
  PowerUpInstance, ActivePowerUp, Particle, Star,
} from './types';

// --- Constants ---
const W = 800, H = 600;
const PADDLE_W = 12, PADDLE_H = 80, BALL_R = 7;
const WIN_SCORE = 11;
const COUNTDOWN_SECS = 3;
const GOLD_SPAWN_DELAY = 8;
const POWERUP_SPAWN_DELAY = 15;
const AI_SPEEDS = [3.5, 5.5, 8];
const AI_NAMES = ['EASY', 'MEDIUM', 'HARD'];

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
    color1: '#ff0044', color2: '#ff66aa', glowColor: '#ff0044', name: 'CPU',
  };
  private paddleRight: Paddle = {
    x: W - 30 - PADDLE_W, y: H / 2 - PADDLE_H / 2, vy: 0,
    color1: '#00ffff', color2: '#66ffff', glowColor: '#00ffff', name: 'P1',
  };

  // Ball
  private ball: Ball = {
    x: W/2, y: H/2, vx: 0, vy: 0, speed: 5.5,
    trail: [], lastHitBy: null, frozen: true,
  };
  private extraBalls: Ball[] = [];

  // Power-ups
  private goldBall: GoldBall | null = null;
  private goldBallTimer = GOLD_SPAWN_DELAY;
  private powerUp: PowerUpInstance | null = null;
  private powerUpTimer = POWERUP_SPAWN_DELAY;
  private activePowerUps: ActivePowerUp[] = [];

  // Particles & effects
  private particles: Particle[] = [];
  private stars: Star[] = [];
  private shakeX = 0;
  private shakeY = 0;
  private shakeMag = 0;

  // Input
  private keys: Record<string, boolean> = {};
  private keydownHandler: (e: KeyboardEvent) => void;
  private keyupHandler: (e: KeyboardEvent) => void;

  // Callback for React state sync
  onStateChange?: (state: GameState) => void;

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
    } catch { /* ignore */ }

    // Input handlers
    this.keydownHandler = (e: KeyboardEvent) => this.onKeyDown(e);
    this.keyupHandler = (e: KeyboardEvent) => { this.keys[e.key] = false; };
    document.addEventListener('keydown', this.keydownHandler);
    document.addEventListener('keyup', this.keyupHandler);
  }

  destroy() {
    cancelAnimationFrame(this.animId);
    document.removeEventListener('keydown', this.keydownHandler);
    document.removeEventListener('keyup', this.keyupHandler);
  }

  start() {
    this.lastTime = performance.now();
    this.loop(this.lastTime);
  }

  initAudio() {
    this.audio.init();
  }

  // ---- Input ----
  private onKeyDown(e: KeyboardEvent) {
    this.keys[e.key] = true;
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) {
      e.preventDefault();
    }
    this.audio.init();

    switch (this.state) {
      case GameState.TITLE:
        if (e.key === 'Enter' || e.key === ' ') {
          this.audio.menuSelect();
          this.state = GameState.MODE_SELECT;
          this.menuSelection = 0;
          this.onStateChange?.(this.state);
        }
        break;

      case GameState.MODE_SELECT:
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'w' || e.key === 'W' || e.key === 's' || e.key === 'S') {
          this.menuSelection = (this.menuSelection + 1) % 2;
          this.audio.menuSelect();
        }
        if (e.key === 'Enter' || e.key === ' ') {
          this.audio.menuSelect();
          this.twoPlayer = this.menuSelection === 1;
          if (this.twoPlayer) {
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
        if (e.key === 'Escape') {
          this.state = GameState.TITLE;
          this.audio.menuSelect();
          this.onStateChange?.(this.state);
        }
        break;

      case GameState.DIFFICULTY:
        if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
          this.difficultySelection = (this.difficultySelection + 2) % 3;
          this.audio.menuSelect();
        }
        if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
          this.difficultySelection = (this.difficultySelection + 1) % 3;
          this.audio.menuSelect();
        }
        if (e.key === 'Enter' || e.key === ' ') {
          this.audio.menuSelect();
          this.aiDifficulty = this.difficultySelection;
          this.startCountdown();
        }
        if (e.key === 'Escape') {
          this.state = GameState.MODE_SELECT;
          this.audio.menuSelect();
          this.onStateChange?.(this.state);
        }
        break;

      case GameState.PLAYING:
        if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
          this.state = GameState.PAUSED;
          this.onStateChange?.(this.state);
        }
        break;

      case GameState.PAUSED:
        if (e.key === 'Escape' || e.key === 'p' || e.key === 'P' || e.key === ' ') {
          this.state = GameState.PLAYING;
          this.onStateChange?.(this.state);
        }
        break;

      case GameState.GAME_OVER:
        if (e.key === 'Enter' || e.key === ' ') {
          this.audio.menuSelect();
          this.state = GameState.MODE_SELECT;
          this.menuSelection = 0;
          this.onStateChange?.(this.state);
        }
        break;
    }
  }

  handleClick() {
    this.audio.init();
    if (this.state === GameState.TITLE) {
      this.audio.menuSelect();
      this.state = GameState.MODE_SELECT;
      this.menuSelection = 0;
      this.onStateChange?.(this.state);
    }
  }

  // ---- Game flow ----
  private startCountdown() {
    this.resetField();
    this.countdownTimer = COUNTDOWN_SECS;
    this.state = GameState.COUNTDOWN;
    this.onStateChange?.(this.state);
  }

  private resetField() {
    this.scoreLeft = 0;
    this.scoreRight = 0;
    this.goldBall = null;
    this.goldBallTimer = GOLD_SPAWN_DELAY;
    this.powerUp = null;
    this.powerUpTimer = POWERUP_SPAWN_DELAY;
    this.activePowerUps = [];
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
      vx: Math.cos(angle) * 5.5 * dir,
      vy: Math.sin(angle) * 5.5,
      speed: 5.5, trail: [], lastHitBy: null, frozen: true,
    };
    this.extraBalls = [];
  }

  private launchBall() { this.ball.frozen = false; }

  private getPaddleH(side: 'left' | 'right'): number {
    let h = PADDLE_H;
    const paddle = side === 'left' ? this.paddleLeft : this.paddleRight;
    for (const p of this.activePowerUps) {
      if (p.type === 'big' && p.owner === side) h = PADDLE_H * 1.5;
      if (p.type === 'small' && p.target === side) h = PADDLE_H * 0.6;
    }
    return h;
  }

  // ---- Physics ----
  private handlePaddleInput(dt: number) {
    const speed = 420;
    if (this.keys['ArrowUp']) this.paddleRight.vy = -speed;
    else if (this.keys['ArrowDown']) this.paddleRight.vy = speed;
    else this.paddleRight.vy *= 0.85;

    if (this.twoPlayer) {
      if (this.keys['w'] || this.keys['W']) this.paddleLeft.vy = -speed;
      else if (this.keys['s'] || this.keys['S']) this.paddleLeft.vy = speed;
      else this.paddleLeft.vy *= 0.85;
    }
  }

  private updateAI(dt: number) {
    if (this.twoPlayer) return;
    const aiSpd = AI_SPEEDS[this.aiDifficulty];
    const paddleCenter = this.paddleLeft.y + this.getPaddleH('left') / 2;
    let targetY = this.ball.y;

    if (this.aiDifficulty >= 1 && this.ball.vx < 0) {
      const timeToReach = (this.ball.x - this.paddleLeft.x - PADDLE_W) / (-this.ball.vx + 0.001);
      targetY = this.ball.y + this.ball.vy * timeToReach;
      while (targetY < 0 || targetY > H) {
        if (targetY < 0) targetY = -targetY;
        if (targetY > H) targetY = 2 * H - targetY;
      }
    }

    const imprecision = this.aiDifficulty === 0 ? 40 : this.aiDifficulty === 1 ? 20 : 8;
    targetY += Math.sin(Date.now() / 500) * imprecision;
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

    const relY = (b.y - paddle.y) / ph;
    const angle = (relY - 0.5) * Math.PI * 0.6;
    const spd = Math.min(Math.sqrt(b.vx*b.vx + b.vy*b.vy) * 1.05, 14);
    const dir = side === 'left' ? 1 : -1;
    return {
      vx: Math.cos(angle) * spd * dir,
      vy: Math.sin(angle) * spd + paddle.vy * 0.15,
    };
  }

  private updateBall(b: Ball, dt: number, isExtra: boolean): boolean {
    if (b.frozen) return true;

    let speedMult = 1;
    for (const p of this.activePowerUps) {
      if (p.type === 'fast') speedMult = 1.5;
      if (p.type === 'slow') speedMult = 0.6;
    }

    b.x += b.vx * 60 * dt * speedMult;
    b.y += b.vy * 60 * dt * speedMult;

    // Wall bounce
    if (b.y - BALL_R < 20) {
      b.y = 20 + BALL_R;
      b.vy = Math.abs(b.vy);
      this.audio.wallHit();
      this.emitParticles(b.x, b.y, '#00ffff', 5, 80, 0.3, 2);
    }
    if (b.y + BALL_R > H - 20) {
      b.y = H - 20 - BALL_R;
      b.vy = -Math.abs(b.vy);
      this.audio.wallHit();
      this.emitParticles(b.x, b.y, '#00ffff', 5, 80, 0.3, 2);
    }

    // Paddle collisions
    const leftHit = this.ballPaddleCollision(b, this.paddleLeft, 'left');
    if (leftHit) {
      b.vx = leftHit.vx; b.vy = leftHit.vy;
      b.x = this.paddleLeft.x + PADDLE_W + BALL_R;
      b.lastHitBy = 'left';
      this.audio.paddleHit();
      this.emitParticles(b.x, b.y, this.paddleLeft.glowColor, 12, 150, 0.4, 3);
      this.triggerShake(3);
    }
    const rightHit = this.ballPaddleCollision(b, this.paddleRight, 'right');
    if (rightHit) {
      b.vx = rightHit.vx; b.vy = rightHit.vy;
      b.x = this.paddleRight.x - BALL_R;
      b.lastHitBy = 'right';
      this.audio.paddleHit();
      this.emitParticles(b.x, b.y, this.paddleRight.glowColor, 12, 150, 0.4, 3);
      this.triggerShake(3);
    }

    // Scoring
    if (b.x < -BALL_R * 2) {
      if (!isExtra) {
        this.scoreRight++;
        this.goalScorer = 'right';
        this.audio.score();
        this.emitParticles(50, H/2, '#ff0044', 30, 200, 0.8, 4);
        this.triggerShake(8);
        this.onGoal();
      }
      return false;
    }
    if (b.x > W + BALL_R * 2) {
      if (!isExtra) {
        this.scoreLeft++;
        this.goalScorer = 'left';
        this.audio.score();
        this.emitParticles(W - 50, H/2, '#00ffff', 30, 200, 0.8, 4);
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

  private onGoal() {
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
      setTimeout(() => {
        this.state = GameState.GAME_OVER;
        this.onStateChange?.(this.state);
      }, 2000);
    } else {
      this.goalTimer = 1.2;
      this.state = GameState.GOAL;
      this.onStateChange?.(this.state);
      setTimeout(() => {
        this.resetBall();
        this.state = GameState.PLAYING;
        this.onStateChange?.(this.state);
        setTimeout(() => this.launchBall(), 500);
      }, 1200);
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
            speed: spd, trail: [], lastHitBy: this.ball.lastHitBy, frozen: false,
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
    const ctx = this.ctx;

    // Court surface — subtle green tint in space
    ctx.fillStyle = 'rgba(0, 60, 30, 0.12)';
    ctx.fillRect(15, 15, W - 30, H - 30);

    // Outer boundary (baselines + sidelines) — white like real tennis
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(15, 15, W - 30, H - 30);

    // Net — center vertical line (thicker, solid, like a real net)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(W / 2, 15);
    ctx.lineTo(W / 2, H - 15);
    ctx.stroke();

    // Net cross-hatching for texture
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 0.5;
    for (let ny = 20; ny < H - 20; ny += 12) {
      ctx.beginPath();
      ctx.moveTo(W / 2 - 4, ny);
      ctx.lineTo(W / 2 + 4, ny);
      ctx.stroke();
    }

    // Net post markers (top and bottom)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.fillRect(W / 2 - 3, 12, 6, 6);
    ctx.fillRect(W / 2 - 3, H - 18, 6, 6);

    // Service line left
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(W * 0.3, 15);
    ctx.lineTo(W * 0.3, H - 15);
    ctx.stroke();

    // Service line right
    ctx.beginPath();
    ctx.moveTo(W * 0.7, 15);
    ctx.lineTo(W * 0.7, H - 15);
    ctx.stroke();

    // Center service line (horizontal through middle of each service box)
    ctx.beginPath();
    ctx.moveTo(W * 0.3, H / 2);
    ctx.lineTo(W / 2, H / 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(W / 2, H / 2);
    ctx.lineTo(W * 0.7, H / 2);
    ctx.stroke();

    // Center marks on baselines (small tick marks)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(15, H / 2 - 8);
    ctx.lineTo(15, H / 2 + 8);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(W - 15, H / 2 - 8);
    ctx.lineTo(W - 15, H / 2 + 8);
    ctx.stroke();

    // Doubles tramlines (inner sidelines)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(15, 45);
    ctx.lineTo(W - 15, 45);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(15, H - 45);
    ctx.lineTo(W - 15, H - 45);
    ctx.stroke();
  }

  private drawPaddle(paddle: Paddle, h: number) {
    const ctx = this.ctx;
    const { x, y, color1, color2, glowColor } = paddle;

    // Racket head (oval shape)
    const cx = x + PADDLE_W / 2;
    const cy = y + h / 2;
    const rx = PADDLE_W * 0.9;  // horizontal radius
    const ry = h / 2;           // vertical radius

    // Glow
    ctx.shadowBlur = 22;
    ctx.shadowColor = glowColor;

    // Racket frame
    const grad = ctx.createLinearGradient(x, y, x + PADDLE_W, y + h);
    grad.addColorStop(0, color1);
    grad.addColorStop(0.5, color2);
    grad.addColorStop(1, color1);
    ctx.strokeStyle = grad;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Racket strings — vertical
    ctx.strokeStyle = `${glowColor}33`;
    ctx.lineWidth = 0.8;
    const stringCount = 5;
    for (let i = 1; i < stringCount; i++) {
      const sy = y + (h / stringCount) * i;
      // Calculate x extent of ellipse at this y
      const relY = (sy - cy) / ry;
      if (Math.abs(relY) >= 1) continue;
      const xExtent = rx * Math.sqrt(1 - relY * relY);
      ctx.beginPath();
      ctx.moveTo(cx - xExtent, sy);
      ctx.lineTo(cx + xExtent, sy);
      ctx.stroke();
    }

    // Racket strings — horizontal
    const hStringCount = 3;
    for (let i = 1; i < hStringCount; i++) {
      const sx = x + (PADDLE_W / hStringCount) * i;
      const relX = (sx - cx) / rx;
      if (Math.abs(relX) >= 1) continue;
      const yExtent = ry * Math.sqrt(1 - relX * relX);
      ctx.beginPath();
      ctx.moveTo(sx, cy - yExtent);
      ctx.lineTo(sx, cy + yExtent);
      ctx.stroke();
    }

    // Racket handle — small line extending from bottom of paddle
    ctx.strokeStyle = glowColor;
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.4;
    const handleDir = paddle === this.paddleLeft ? -1 : 1;
    // No handle needed vertically, just a subtle grip dot
    ctx.fillStyle = glowColor;
    ctx.beginPath();
    ctx.arc(cx, cy, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.shadowBlur = 0;
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

    ctx.shadowBlur = 25;
    ctx.shadowColor = tennisGlow;
    ctx.fillStyle = tennisBallColor;
    ctx.beginPath();
    ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2);
    ctx.fill();

    // Tennis ball seam — curved line across the ball
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(b.x, b.y, BALL_R * 0.7, -0.8, 0.8);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(b.x, b.y, BALL_R * 0.7, Math.PI - 0.8, Math.PI + 0.8);
    ctx.stroke();

    // Highlight
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.arc(b.x - 2, b.y - 2, BALL_R * 0.3, 0, Math.PI * 2);
    ctx.fill();
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
    this.drawScoreDisplay(this.scoreLeft, W/2 - 120, 35, '#ff4488', '#ff0044');
    this.drawScoreDisplay(this.scoreRight, W/2 + 50, 35, '#00ffff', '#0088ff');

    ctx.font = '10px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = this.paddleLeft.glowColor;
    ctx.globalAlpha = 0.6;
    ctx.fillText(this.paddleLeft.name, W/2 - 90, 28);
    ctx.fillStyle = this.paddleRight.glowColor;
    ctx.fillText(this.paddleRight.name, W/2 + 82, 28);
    ctx.globalAlpha = 1;

    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`FIRST TO ${WIN_SCORE}`, W/2, H - 8);
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
      ctx.fillText(`${p.label} ${remaining.toFixed(1)}s`, x, H - 35 + yOff);
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
    ctx.fillStyle = '#00ffff';
    ctx.shadowBlur = 30;
    ctx.shadowColor = '#00ffff';
    ctx.font = '62px Orbitron, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('JEDAI', W/2, H/2 - 80);

    ctx.font = '28px Orbitron, sans-serif';
    ctx.fillStyle = '#CCFF00';
    ctx.shadowColor = '#88AA00';
    ctx.fillText('SPACE TENNIS', W/2, H/2 - 35);
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;

    // Demo tennis ball (yellow-green)
    const dx = W/2 + Math.sin(t * 3) * 180;
    const dy = H/2 + 30 + Math.sin(t * 4.7) * 60;
    ctx.fillStyle = '#CCFF00';
    ctx.shadowBlur = 15; ctx.shadowColor = '#AADD00';
    ctx.beginPath(); ctx.arc(dx, dy, 6, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;

    // Demo rackets
    const lpy = H/2 + 30 + Math.sin(t * 4.7) * 50 - 30;
    const rpy = H/2 + 30 + Math.sin(t * 4.7 + 0.3) * 50 - 30;
    ctx.strokeStyle = '#ff0044'; ctx.shadowBlur = 10; ctx.shadowColor = '#ff0044';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(W/2 - 196, lpy + 30, 6, 30, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#00ffff'; ctx.shadowColor = '#00ffff';
    ctx.beginPath(); ctx.ellipse(W/2 + 196, rpy + 30, 6, 30, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '10px "Press Start 2P", monospace';
    ctx.fillText('WHERE VIDEO GAMES ALL STARTED', W/2, H/2 + 120);

    if (Math.sin(t * 3) > 0) {
      ctx.fillStyle = '#fff';
      ctx.font = '13px "Press Start 2P", monospace';
      ctx.fillText('PRESS ENTER OR CLICK TO START', W/2, H/2 + 160);
    }

    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.fillText('INSPIRED BY PONG  ATARI  1972', W/2, H - 30);
    ctx.fillText('JEDAI SPACE TENNIS EDITION', W/2, H - 15);
  }

  private drawModeSelect() {
    this.drawBackground();
    this.drawCourt();
    const ctx = this.ctx;
    const t = this.time;

    ctx.fillStyle = '#00ffff';
    ctx.shadowBlur = 20; ctx.shadowColor = '#00ffff';
    ctx.font = '28px Orbitron, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SELECT MODE', W/2, 100);
    ctx.shadowBlur = 0;

    const options = ['1 PLAYER  vs  CPU', '2 PLAYERS  LOCAL'];
    options.forEach((opt, i) => {
      const selected = this.menuSelection === i;
      const y = 220 + i * 80;

      if (selected) {
        ctx.fillStyle = 'rgba(0, 255, 255, 0.08)';
        ctx.fillRect(W/2 - 200, y - 25, 400, 50);
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = 2;
        ctx.strokeRect(W/2 - 200, y - 25, 400, 50);
        const ap = Math.sin(t * 5) * 5;
        ctx.fillStyle = '#00ffff';
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
    ctx.fillText('UP/DOWN TO SELECT  -  ENTER TO CONFIRM', W/2, H - 50);
    ctx.fillText('ESC TO GO BACK', W/2, H - 30);

    if (this.winStreak > 0) {
      ctx.fillStyle = '#FFD700';
      ctx.font = '10px "Press Start 2P", monospace';
      ctx.fillText(`WIN STREAK: ${this.winStreak}`, W/2, H - 80);
    }
  }

  private drawDifficultySelect() {
    this.drawBackground();
    this.drawCourt();
    const ctx = this.ctx;
    const t = this.time;

    ctx.fillStyle = '#00ffff';
    ctx.shadowBlur = 20; ctx.shadowColor = '#00ffff';
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
    ctx.fillText('UP/DOWN TO SELECT  -  ENTER TO CONFIRM', W/2, H - 50);
    ctx.fillText('ESC TO GO BACK', W/2, H - 30);
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

  private drawGoalFlash() {
    const ctx = this.ctx;
    const progress = 1 - (this.goalTimer / 1.2);
    ctx.globalAlpha = Math.max(0, 0.3 * (1 - progress));
    ctx.fillStyle = this.goalScorer === 'left' ? '#ff0044' : '#00ffff';
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }

  private drawGameOver() {
    this.drawBackground();
    this.drawCourt();
    this.drawHUD();
    const ctx = this.ctx;
    const t = this.time;

    // Continual confetti
    if (Math.random() < 0.3) {
      const colors = ['#ff0044', '#00ffff', '#FFD700', '#ff66aa', '#66ffff'];
      this.emitParticles(Math.random() * W, Math.random() * 100, colors[Math.floor(Math.random()*5)], 1, 50, 1.5, 3);
    }

    const leftWon = this.scoreLeft >= WIN_SCORE;
    const winColor = leftWon ? '#ff4488' : '#00ffff';
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
      ctx.fillText('PRESS ENTER TO CONTINUE', W/2, H - 40);
    }
  }

  private drawPauseScreen() {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, W, H);

    const pulse = Math.sin(this.time * 2) * 0.15 + 0.85;
    ctx.globalAlpha = pulse;
    ctx.fillStyle = '#00ffff';
    ctx.shadowBlur = 20; ctx.shadowColor = '#00ffff';
    ctx.font = '36px Orbitron, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PAUSED', W/2, H/2 - 20);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;

    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '10px "Press Start 2P", monospace';
    ctx.fillText('PRESS ESC OR P TO RESUME', W/2, H/2 + 30);

    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '9px "Press Start 2P", monospace';
    if (this.twoPlayer) {
      ctx.fillText('P1: W / S    P2: UP / DOWN', W/2, H/2 + 70);
    } else {
      ctx.fillText('CONTROLS: UP / DOWN ARROWS', W/2, H/2 + 70);
    }
  }

  // ---- Main Loop ----
  private loop = (now: number) => {
    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;
    this.time += dt;

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
          this.state = GameState.PLAYING;
          this.onStateChange?.(this.state);
          this.launchBall();
        }
        this.drawCountdownScreen();
        break;
      }

      case GameState.PLAYING:
        this.handlePaddleInput(dt);
        this.updateAI(dt);
        this.updatePaddles(dt);
        this.updateBall(this.ball, dt, false);

        for (let i = this.extraBalls.length - 1; i >= 0; i--) {
          if (!this.updateBall(this.extraBalls[i], dt, true)) {
            this.extraBalls.splice(i, 1);
          }
        }

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

        this.drawBackground();
        this.drawCourt();
        this.drawPaddle(this.paddleLeft, this.getPaddleH('left'));
        this.drawPaddle(this.paddleRight, this.getPaddleH('right'));
        this.drawBallTrail(this.ball, '#CCFF00');
        for (const eb of this.extraBalls) this.drawBallTrail(eb, 'rgba(200,255,0,0.7)');
        this.drawBallObj(this.ball, '#fff', '#ffffff');
        for (const eb of this.extraBalls) this.drawBallObj(eb, '#ff88ff', '#ff44ff');
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
        this.drawBallObj(this.ball, '#fff', '#ffffff');
        this.drawGoldBall();
        this.drawPowerUp();
        this.drawHUD();
        this.drawPauseScreen();
        break;
    }

    ctx.restore();

    this.animId = requestAnimationFrame(this.loop);
  };
}
