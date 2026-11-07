// ============================================================
//  Pong Showcase — game flow, input and HUD around the tennis sim
// ============================================================

import { AudioEngine } from './audio';
import { GameState } from './types';
import type { AnnouncerEvent, ShotTiming, ShotType } from './types';
import { Commentator, pointSituation } from './commentary';
import type { Situation } from './commentary';
import { InputDevice, mapGamepads, padEnd, shotForKey, SIDE_KEYS } from './input';
import { CourtRenderer, H, project, SHOT_COLORS, unproject, W } from './render';
import { REACH, shotTarget, TennisSim } from './sim';
import type { End, SimEvent } from './sim';

const MODE_OPTIONS = ['1 PLAYER  vs  CPU', '2 PLAYERS  LOCAL', 'TIMING PRACTICE'];
const PAUSE_OPTIONS = ['RESUME', 'QUIT TO MENU'];
const AI_NAMES = ['EASY', 'MEDIUM', 'HARD'];
const AI_DESCS = ['Moves late, mistimes often', 'Solid baseline rallies', 'Fast, accurate, punishes short balls'];
const AI_COLORS = ['#00ff88', '#ffaa00', '#ff2244'];
const PRACTICE_BEST_KEY = 'pong_practice_best';
const PERFECT_COLOR = '#39e36f';
const SHOT_LABELS: Record<ShotType, string> = { topspin: 'TOPSPIN', flat: 'FLAT', slice: 'SLICE', lob: 'LOB', drop: 'DROP SHOT' };
const SERVE_LABELS: Partial<Record<ShotType, string>> = { flat: 'FLAT SERVE', topspin: 'KICK SERVE', slice: 'SLICE SERVE' };
const TIMING_COLORS: Record<ShotTiming, string> = { perfect: PERFECT_COLOR, good: '#fff176', early: '#ffb300', late: '#ffb300', none: '#ffffff' };

export class PongEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private audio = new AudioEngine();
  private render = new CourtRenderer();
  private sim: TennisSim | null = null;
  private animId = 0;
  private lastTime = 0;
  private time = 0;

  state: GameState = GameState.TITLE;
  twoPlayer = false;
  practice = false;
  aiDifficulty = 1;
  menuSelection = 0;
  difficultySelection = 1;
  winStreak = 0;
  matchHistory: string[] = [];
  onStateChange?: (state: GameState) => void;
  onAnnouncer?: (event: AnnouncerEvent) => void;
  onInputChange?: (device: InputDevice) => void;
  /** A line for the British commentator to speak: match start and big points only. */
  onCommentary?: (line: string) => void;
  /** The commentator stops talking when a match is abandoned. */
  onCommentaryReset?: () => void;

  private pauseSelection = 0;
  private resumeState: GameState = GameState.PLAYING;
  private gameOverAt = 0;

  // Input
  private keys: Record<string, boolean> = {};
  private lastInput: InputDevice = 'keyboard';
  private heldPadKeys = new Set<string>();
  private padMove: Record<End, { x: number; y: number }> = { near: { x: 0, y: 0 }, far: { x: 0, y: 0 } };
  private aim: { x: number; y: number } | null = null;
  private mouseHeldKey: string | null = null;
  private drag: { startX: number; startY: number; baseX: number; baseY: number } | null = null;
  private touchPointers = new Map<number, { end: End; startX: number; startY: number; x: number; y: number }>();
  private keydownHandler = (e: KeyboardEvent) => this.onKeyDown(e);
  private keyupHandler = (e: KeyboardEvent) => this.releaseKey(e.key);
  private blurHandler = () => { for (const key of Object.keys(this.keys)) if (this.keys[key]) this.releaseKey(key); };
  private padConnectHandler = () => this.showToast('CONTROLLER CONNECTED');
  private padDisconnectHandler = () => {
    this.showToast('CONTROLLER DISCONNECTED');
    if (this.state === GameState.PLAYING || this.state === GameState.SERVE) this.pauseGame();
  };

  // Effects
  private trail: { x: number; y: number; z: number }[] = [];
  private marks: { x: number; y: number; life: number }[] = [];
  private floats: { x: number; y: number; text: string; color: string; life: number; size: number }[] = [];
  private sparks: { x: number; y: number; vx: number; vy: number; life: number; color: string }[] = [];
  private bigCall: { text: string; life: number; color: string } | null = null;
  private lineReplay: { x: number; y: number; margin: number; inCourt: boolean; life: number } | null = null;
  private readout: { text: string; color: string; at: number } | null = null;
  private toast: { text: string; until: number } | null = null;
  private hitStop = 0;
  private shake = 0;
  private longRallyCalled = false;

  // Commentary
  private commentator: Commentator | null = null;
  private situation: Situation | null = null;
  private situationKey = '';
  private servedBy: End = 'near';

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    try {
      this.winStreak = parseInt(localStorage.getItem('jedai_streak') || '0') || 0;
      this.matchHistory = JSON.parse(localStorage.getItem('jedai_history') || '[]');
    } catch { /* ignore */ }
    document.addEventListener('keydown', this.keydownHandler);
    document.addEventListener('keyup', this.keyupHandler);
    window.addEventListener('blur', this.blurHandler);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerEnd);
    canvas.addEventListener('pointercancel', this.onPointerEnd);
    canvas.addEventListener('pointerleave', this.onPointerLeave);
    canvas.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('gamepadconnected', this.padConnectHandler);
    window.addEventListener('gamepaddisconnected', this.padDisconnectHandler);
    if (window.matchMedia?.('(pointer: coarse)').matches) this.lastInput = 'touch';
  }

  destroy() {
    cancelAnimationFrame(this.animId);
    document.removeEventListener('keydown', this.keydownHandler);
    document.removeEventListener('keyup', this.keyupHandler);
    window.removeEventListener('blur', this.blurHandler);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerEnd);
    this.canvas.removeEventListener('pointercancel', this.onPointerEnd);
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave);
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('gamepadconnected', this.padConnectHandler);
    window.removeEventListener('gamepaddisconnected', this.padDisconnectHandler);
  }

  start() {
    this.lastTime = performance.now();
    this.animId = requestAnimationFrame(this.loop);
  }

  // ---- Input ----
  private onKeyDown(e: KeyboardEvent) {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
    this.setLastInput('keyboard');
    if (!e.repeat) this.pressKey(e.key);
  }

  private normal(key: string) { return key.length === 1 ? key.toLowerCase() : key; }

  private isHuman(end: End) { return this.sim ? !this.sim.isCpu(end) && !(this.practice && end === 'far') : false; }

  pressKey(rawKey: string) {
    const key = this.normal(rawKey);
    this.keys[key] = true;
    this.audio.init();
    const confirm = key === 'Enter' || key === ' ';
    const up = key === 'ArrowUp' || key === 'w';
    const down = key === 'ArrowDown' || key === 's';

    switch (this.state) {
      case GameState.TITLE:
        if (confirm) this.setState(GameState.MODE_SELECT, true);
        break;
      case GameState.MODE_SELECT:
        if (up) this.moveMenu(() => { this.menuSelection = (this.menuSelection + MODE_OPTIONS.length - 1) % MODE_OPTIONS.length; });
        if (down) this.moveMenu(() => { this.menuSelection = (this.menuSelection + 1) % MODE_OPTIONS.length; });
        if (confirm) {
          this.audio.menuSelect();
          if (this.menuSelection === 2) this.startGame(false, true);
          else if (this.menuSelection === 1) this.startGame(true, false);
          else { this.difficultySelection = 1; this.setState(GameState.DIFFICULTY); }
        }
        if (key === 'Escape') this.setState(GameState.TITLE, true);
        break;
      case GameState.DIFFICULTY:
        if (up) this.moveMenu(() => { this.difficultySelection = (this.difficultySelection + 2) % 3; });
        if (down) this.moveMenu(() => { this.difficultySelection = (this.difficultySelection + 1) % 3; });
        if (confirm) {
          this.audio.menuSelect();
          this.aiDifficulty = this.difficultySelection;
          this.startGame(false, false);
        }
        if (key === 'Escape') this.setState(GameState.MODE_SELECT, true);
        break;
      case GameState.SERVE:
      case GameState.PLAYING:
      case GameState.GOAL:
        if (key === 'Escape' || key === 'p') { this.pauseGame(); break; }
        this.pressShot(key);
        break;
      case GameState.PAUSED:
        if (key === 'Escape' || key === 'p') this.resumeGame();
        else if (up || down) this.moveMenu(() => { this.pauseSelection = (this.pauseSelection + 1) % PAUSE_OPTIONS.length; });
        else if (confirm) {
          this.audio.menuSelect();
          if (this.pauseSelection === 0) this.resumeGame();
          else this.quitToMenu();
        }
        break;
      case GameState.GAME_OVER:
        if (confirm && this.time - this.gameOverAt > 0.6) this.quitToMenu();
        break;
    }
  }

  releaseKey(rawKey: string) {
    const key = this.normal(rawKey);
    this.keys[key] = false;
    if (!this.sim || this.state === GameState.PAUSED) return;
    const mapped = shotForKey(key);
    if (mapped && !this.twoPlayer) this.sim.release('near');
    else if (mapped && this.isHuman(mapped.end)) this.sim.release(mapped.end);
    if (key === ' ' && this.isHuman(this.sim.server) && this.sim.players[this.sim.server].swing.serve) this.sim.release(this.sim.server);
  }

  private pressShot(key: string) {
    if (!this.sim) return;
    const mapped = shotForKey(key);
    // Playing alone, either set of keys works, so one hand can stay on WASD and the other on the mouse.
    if (mapped && !this.twoPlayer) this.sim.press('near', mapped.shot);
    else if (mapped && this.isHuman(mapped.end)) this.sim.press(mapped.end, mapped.shot);
    if (key === ' ' && this.sim.phase === 'serve' && this.isHuman(this.sim.server)) this.sim.press(this.sim.server, 'flat');
  }

  private moveMenu(apply: () => void) {
    apply();
    this.audio.menuSelect();
  }

  private setLastInput(device: InputDevice) {
    if (this.lastInput === device) return;
    this.lastInput = device;
    this.onInputChange?.(device);
  }

  private prompt(keyboard: string, gamepad: string, touch: string) {
    return this.lastInput === 'gamepad' ? gamepad : this.lastInput === 'touch' ? touch : keyboard;
  }

  private showToast(text: string) { this.toast = { text, until: this.time + 2.5 }; }

  private connectedPads() {
    if (typeof navigator.getGamepads !== 'function') return [];
    return Array.from(navigator.getGamepads()).filter((pad): pad is Gamepad => Boolean(pad?.connected));
  }

  private pollGamepads() {
    const frame = mapGamepads(this.connectedPads(), { state: this.state, twoPlayer: this.twoPlayer });
    const moving = frame.move.near.x || frame.move.near.y || frame.move.far.x || frame.move.far.y;
    if (frame.keys.size > 0 || moving) this.setLastInput('gamepad');
    this.padMove = frame.move;
    const held = this.heldPadKeys;
    this.heldPadKeys = frame.keys;
    held.forEach(key => { if (!frame.keys.has(key)) this.releaseKey(key); });
    frame.keys.forEach(key => { if (!held.has(key)) this.pressKey(key); });
  }

  private rumble(end: End, strong: number, weak: number, duration: number) {
    if (this.lastInput !== 'gamepad') return;
    this.connectedPads().forEach((pad, index) => {
      if (padEnd(index, this.twoPlayer) !== end) return;
      try {
        void pad.vibrationActuator?.playEffect('dual-rumble', { duration, strongMagnitude: strong, weakMagnitude: weak })?.catch(() => undefined);
      } catch { /* rumble is a bonus; not every controller supports it */ }
    });
  }

  private toCanvasPoint(clientX: number, clientY: number) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: ((clientX - rect.left) / (rect.width || 1)) * W, y: ((clientY - rect.top) / (rect.height || 1)) * H };
  }

  private inPlay() { return this.state === GameState.SERVE || this.state === GameState.PLAYING || this.state === GameState.GOAL; }

  /** Pointing at the far court aims the near player's shots, leaving the running keys free. */
  private updateAim(clientX: number, clientY: number) {
    const point = this.toCanvasPoint(clientX, clientY);
    const ground = unproject(point.x, point.y);
    this.aim = ground && ground.y < -0.3 ? ground : null;
    return this.aim !== null;
  }

  private onPointerLeave = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && !this.drag) this.aim = null;
  };

  private onContextMenu = (e: Event) => {
    if (this.inPlay()) e.preventDefault();
  };

  private onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') {
      // In a rally, hold the left button for topspin and the right for slice, as with the keys.
      if (this.inPlay() && (e.button === 0 || e.button === 2)) {
        this.mouseHeldKey = e.button === 0 ? SIDE_KEYS.near.topspin : SIDE_KEYS.near.slice;
        this.pressKey(this.mouseHeldKey);
        // Press anywhere and drag: the target moves with the drag, and letting go swings.
        const start = this.toCanvasPoint(e.clientX, e.clientY);
        const base = this.aim ?? { x: 0, y: -8.5 };
        this.drag = { startX: start.x, startY: start.y, baseX: base.x, baseY: base.y };
        this.aim = base;
        this.canvas.setPointerCapture?.(e.pointerId);
      }
      return;
    }
    if (e.pointerType !== 'touch') return;
    this.setLastInput('touch');
    this.audio.init();
    if (!this.inPlay()) return;
    const point = this.toCanvasPoint(e.clientX, e.clientY);
    // On your own in a match, tapping the far court places the aim; two players each drag their own half.
    if (!this.twoPlayer && this.updateAim(e.clientX, e.clientY)) return;
    const end: End = this.twoPlayer && point.y < H * 0.42 ? 'far' : 'near';
    this.touchPointers.set(e.pointerId, { end, startX: point.x, startY: point.y, x: point.x, y: point.y });
    this.canvas.setPointerCapture?.(e.pointerId);
  };

  private onPointerMove = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') {
      if (this.drag) {
        const point = this.toCanvasPoint(e.clientX, e.clientY);
        this.aim = {
          x: Math.max(-4.5, Math.min(4.5, this.drag.baseX + (point.x - this.drag.startX) * 0.035)),
          y: Math.max(-11.8, Math.min(-1, this.drag.baseY + (point.y - this.drag.startY) * 0.05)),
        };
      } else if (this.sim?.players.near.swing.phase !== 'forward') {
        // Hovering aims too, but not while a released swing is on its way to the ball.
        this.updateAim(e.clientX, e.clientY);
      }
      return;
    }
    const touch = this.touchPointers.get(e.pointerId);
    if (!touch) return;
    const point = this.toCanvasPoint(e.clientX, e.clientY);
    touch.x = point.x;
    touch.y = point.y;
  };

  private onPointerEnd = (e: PointerEvent) => {
    this.touchPointers.delete(e.pointerId);
    if (e.pointerType === 'mouse' && this.mouseHeldKey) {
      this.releaseKey(this.mouseHeldKey);
      this.mouseHeldKey = null;
      this.drag = null;
    }
  };

  private touchMove(end: End) {
    for (const touch of this.touchPointers.values()) {
      if (touch.end !== end) continue;
      const dx = (touch.x - touch.startX) / 45, dy = (touch.y - touch.startY) / 45;
      const size = Math.hypot(dx, dy);
      return size > 1 ? { x: dx / size, y: dy / size } : { x: dx, y: dy };
    }
    return null;
  }

  handleClick(clientX: number, clientY: number) {
    this.audio.init();
    const { x, y } = this.toCanvasPoint(clientX, clientY);
    const inRow = (rowY: number, halfWidth: number, halfHeight: number) => Math.abs(x - W / 2) <= halfWidth && Math.abs(y - rowY) <= halfHeight;
    const goBack = y > H - 60;
    switch (this.state) {
      case GameState.TITLE:
      case GameState.GAME_OVER:
        this.pressKey('Enter');
        this.releaseKey('Enter');
        break;
      case GameState.MODE_SELECT: {
        if (goBack) { this.pressKey('Escape'); this.releaseKey('Escape'); break; }
        const row = MODE_OPTIONS.findIndex((_, i) => inRow(this.modeRowY(i), 220, 25));
        if (row >= 0) { this.menuSelection = row; this.pressKey('Enter'); this.releaseKey('Enter'); }
        break;
      }
      case GameState.DIFFICULTY: {
        if (goBack) { this.pressKey('Escape'); this.releaseKey('Escape'); break; }
        const row = AI_NAMES.findIndex((_, i) => inRow(this.difficultyRowY(i), 220, 28));
        if (row >= 0) { this.difficultySelection = row; this.pressKey('Enter'); this.releaseKey('Enter'); }
        break;
      }
      case GameState.PAUSED: {
        const row = PAUSE_OPTIONS.findIndex((_, i) => inRow(this.pauseRowY(i), 170, 19));
        if (row >= 0) { this.pauseSelection = row; this.pressKey('Enter'); this.releaseKey('Enter'); }
        break;
      }
    }
  }

  private modeRowY(index: number) { return 215 + index * 70; }
  private difficultyRowY(index: number) { return 200 + index * 84; }
  private pauseRowY(index: number) { return H / 2 + 30 + index * 44; }

  // ---- Game flow ----
  private setState(state: GameState, withSound = false) {
    if (withSound) this.audio.menuSelect();
    if (this.state === state) return;
    this.state = state;
    if (state === GameState.MODE_SELECT) this.menuSelection = 0;
    this.onStateChange?.(state);
  }

  private startGame(twoPlayer: boolean, practice: boolean) {
    this.twoPlayer = twoPlayer;
    this.practice = practice;
    this.trail = [];
    this.marks = [];
    this.floats = [];
    this.sparks = [];
    this.readout = null;
    this.bigCall = null;
    this.lineReplay = null;
    this.longRallyCalled = false;
    this.sim = new TennisSim({
      practice,
      cpu: twoPlayer || practice ? {} : { far: this.aiDifficulty },
      firstServer: 'near',
    });
    this.onCommentaryReset?.();
    this.commentator = new Commentator(this.spokenNames());
    this.situation = null;
    this.situationKey = this.scoreKey();
    this.servedBy = this.sim.server;
    const detail = twoPlayer ? '' : `, set to ${AI_NAMES[this.aiDifficulty].toLowerCase()} today`;
    this.onCommentary?.(this.commentator.opening(practice, detail));
    if (practice) {
      try {
        this.sim.practice.best = parseInt(localStorage.getItem(PRACTICE_BEST_KEY) || '0') || 0;
      } catch { /* ignore */ }
    }
    this.syncState();
  }

  private pauseGame() {
    this.resumeState = this.state;
    this.pauseSelection = 0;
    this.setState(GameState.PAUSED);
  }

  private resumeGame() { this.setState(this.resumeState); }

  private quitToMenu() {
    this.onCommentaryReset?.();
    this.commentator = null;
    this.sim = null;
    this.practice = false;
    this.setState(GameState.MODE_SELECT);
  }

  private syncState() {
    if (!this.sim || !this.inPlayOrFresh()) return;
    if (this.sim.matchWinner && this.sim.phase === 'dead') {
      this.gameOverAt = this.time;
      this.setState(GameState.GAME_OVER);
      return;
    }
    const next = this.sim.phase === 'serve' ? GameState.SERVE : this.sim.phase === 'rally' ? GameState.PLAYING : GameState.GOAL;
    this.setState(next);
  }

  private inPlayOrFresh() {
    return this.inPlay() || this.state === GameState.MODE_SELECT || this.state === GameState.DIFFICULTY;
  }

  private nameOf(end: End) {
    if (this.practice) return end === 'near' ? 'YOU' : 'COACH';
    if (this.twoPlayer) return end === 'far' ? 'P1' : 'P2';
    return end === 'near' ? 'YOU' : `CPU ${AI_NAMES[this.aiDifficulty]}`;
  }

  private spokenNames() {
    return this.twoPlayer ? { near: 'player two', far: 'player one' } : { near: 'our player', far: 'the computer' };
  }

  private scoreKey() {
    const sim = this.sim;
    return sim ? `${sim.points.near}-${sim.points.far}-${sim.games.near}-${sim.games.far}` : '';
  }

  /** Decides whether anything in this frame is worth saying out loud. */
  private commentate(events: SimEvent[]) {
    const sim = this.sim;
    if (!sim || !this.commentator || this.practice) return;
    const point = events.find(event => event.type === 'point');
    if (point && point.type === 'point') {
      const line = this.commentator.result({
        winner: point.winner,
        reason: point.reason,
        rally: point.rally,
        situation: this.situation,
        gameWon: events.some(event => event.type === 'game'),
        matchWon: events.some(event => event.type === 'match'),
        server: this.servedBy,
        games: sim.games,
      });
      if (line) this.onCommentary?.(line);
    }
    if (sim.phase === 'serve' && sim.faults === 0 && !sim.matchWinner) {
      const key = this.scoreKey();
      if (key !== this.situationKey) {
        this.situationKey = key;
        this.servedBy = sim.server;
        this.situation = pointSituation({ points: sim.points, games: sim.games, server: sim.server, gamesToWin: sim.gamesToWin });
        if (this.situation) this.onCommentary?.(this.commentator.situation(this.situation));
      }
    }
  }

  private shooterOf(end: End): AnnouncerEvent['shooter'] {
    if (this.twoPlayer) return end === 'far' ? 'P1' : 'P2';
    return end === 'near' ? 'PLAYER' : 'CPU';
  }

  private announce(kind: AnnouncerEvent['kind'], end: End, shot: ShotType, timing: ShotTiming) {
    if (!this.sim) return;
    this.onAnnouncer?.({
      kind, shooter: this.shooterOf(end), shot, timing,
      scoreLeft: this.sim.games.far,
      scoreRight: this.sim.games.near,
      rallyHits: this.sim.rally,
      playerRead: '',
      localOnly: this.practice,
    });
  }

  private panFor(x: number) { return Math.max(-0.8, Math.min(0.8, x / 6)); }

  private handleEvent(event: SimEvent) {
    const sim = this.sim;
    if (!sim) return;
    switch (event.type) {
      case 'hit': {
        const human = this.isHuman(event.end);
        const perfect = event.timing === 'perfect';
        this.audio.shotHit(event.shot, this.panFor(event.x), Math.min(1, event.mph / 90), perfect);
        this.trail = [];
        if (perfect && human) {
          this.hitStop = 0.05;
          this.shake = 5;
          this.burst(event.x, event.y, event.z, PERFECT_COLOR, 18);
        } else {
          this.burst(event.x, event.y, event.z, SHOT_COLORS[event.shot], 6);
        }
        this.rumble(event.end, perfect ? 0.9 : event.shot === 'flat' ? 0.5 : 0.2, 0.3, perfect ? 170 : 70);
        if (human) {
          const type = event.serve ? SERVE_LABELS[event.shot] ?? 'SERVE' : SHOT_LABELS[event.shot];
          const stretched = event.stretched ? '  STRETCHED' : event.onTheRun ? '  ON THE RUN' : '';
          this.readout = {
            text: `${type}  ${event.mph} MPH  ${event.rpm} RPM  ${event.timing.toUpperCase()}${stretched}`,
            color: TIMING_COLORS[event.timing],
            at: this.time,
          };
          const s = project(event.x, event.y, event.z);
          this.floats.push({ x: s.x, y: s.y - 34, text: event.timing.toUpperCase(), color: TIMING_COLORS[event.timing], life: 1, size: 12 });
          if (perfect || event.shot !== 'topspin') this.announce('shot', event.end, event.shot, event.timing);
        }
        if (sim.rally >= 8 && !this.longRallyCalled) {
          this.longRallyCalled = true;
          this.announce('long-rally', event.end, event.shot, 'none');
        }
        break;
      }
      case 'bounce':
        this.audio.bounce(this.panFor(event.x));
        this.marks.push({ x: event.x, y: event.y, life: 1 });
        if (this.marks.length > 6) this.marks.shift();
        break;
      case 'linecall':
        this.lineReplay = { x: event.x, y: event.y, margin: event.margin, inCourt: event.inCourt, life: 1 };
        break;
      case 'net':
        this.audio.netHit(this.panFor(event.x));
        break;
      case 'call': {
        const big = ['OUT', 'NET', 'NET - FAULT', 'FAULT', 'DOUBLE FAULT', 'WINNER', 'ACE', 'IN', 'MISSED'].includes(event.text);
        if (big) {
          const good = event.text === 'WINNER' || event.text === 'ACE' || event.text === 'IN';
          this.bigCall = { text: event.text, life: 1, color: good ? PERFECT_COLOR : '#ffd24d' };
        } else {
          const s = project(event.x, event.y, 1.9);
          this.floats.push({ x: s.x, y: s.y, text: event.text, color: '#ff8a65', life: 1.2, size: 11 });
          this.audio.whoosh(this.panFor(event.x));
        }
        break;
      }
      case 'point':
        this.audio.crowd(Math.min(1, event.rally / 10));
        this.longRallyCalled = false;
        this.announce('point', event.winner, sim.ballShot, 'none');
        break;
      case 'game':
        this.bigCall = { text: `GAME ${this.nameOf(event.winner)}`, life: 1.3, color: '#ffffff' };
        this.audio.crowd(1);
        break;
      case 'match':
        this.finishMatch(event.winner);
        break;
    }
  }

  private finishMatch(winner: End) {
    const sim = this.sim;
    if (!sim) return;
    const score = `${sim.games.near}-${sim.games.far}`;
    let result: string;
    if (this.twoPlayer) {
      this.audio.victory();
      result = `${this.nameOf(winner)} WINS ${score}`;
    } else if (winner === 'near') {
      this.winStreak++;
      this.audio.victory();
      result = `WIN (${score})`;
    } else {
      this.winStreak = 0;
      this.audio.gameOver();
      result = `LOSS (${score})`;
    }
    this.matchHistory.push(result);
    if (this.matchHistory.length > 10) this.matchHistory.shift();
    try {
      localStorage.setItem('jedai_streak', String(this.winStreak));
      localStorage.setItem('jedai_history', JSON.stringify(this.matchHistory));
    } catch { /* ignore */ }
  }

  private burst(x: number, y: number, z: number, color: string, count: number) {
    const s = project(x, y, z);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 130;
      this.sparks.push({ x: s.x, y: s.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 0.3 + Math.random() * 0.25, color });
    }
  }

  private applyMovement() {
    const sim = this.sim;
    if (!sim) return;
    for (const end of ['near', 'far'] as const) {
      if (!this.isHuman(end) || (end === 'far' && !this.twoPlayer)) continue;
      const map = SIDE_KEYS[end];
      const touch = this.touchMove(end);
      const pad = this.padMove[end];
      const held = (name: 'right' | 'left' | 'down' | 'up') => this.keys[map[name]] || (!this.twoPlayer && this.keys[SIDE_KEYS.far[name]]);
      let x = (held('right') ? 1 : 0) - (held('left') ? 1 : 0);
      let y = (held('down') ? 1 : 0) - (held('up') ? 1 : 0);
      if (touch) { x = touch.x; y = touch.y; }
      else if (pad.x || pad.y) { x = pad.x; y = pad.y; }
      sim.setMove(end, x, y);
      if (end === 'near') sim.setAim('near', this.aim);
    }
  }

  private updateEffects(dt: number) {
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.y -= 24 * dt;
      f.life -= dt / 0.85;
      if (f.life <= 0) this.floats.splice(i, 1);
    }
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 200 * dt;
      s.life -= dt;
      if (s.life <= 0) this.sparks.splice(i, 1);
    }
    for (let i = this.marks.length - 1; i >= 0; i--) {
      this.marks[i].life -= dt / 2.2;
      if (this.marks[i].life <= 0) this.marks.splice(i, 1);
    }
    if (this.bigCall) {
      this.bigCall.life -= dt / 1.1;
      if (this.bigCall.life <= 0) this.bigCall = null;
    }
    if (this.lineReplay) {
      this.lineReplay.life -= dt / 2.4;
      if (this.lineReplay.life <= 0) this.lineReplay = null;
    }
    this.shake = this.shake > 0.3 ? this.shake * 0.86 : 0;
  }

  // ---- Main loop ----
  private loop = (now: number) => {
    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;
    this.time += dt;
    this.pollGamepads();
    this.updateEffects(dt);

    if (this.sim && this.inPlay()) {
      this.applyMovement();
      if (this.hitStop > 0) {
        this.hitStop -= dt;
      } else {
        this.sim.step(dt);
        if (this.sim.phase === 'rally' || !this.sim.ballHeld) {
          this.trail.push({ x: this.sim.ball.x, y: this.sim.ball.y, z: this.sim.ball.z });
          if (this.trail.length > 11) this.trail.shift();
        }
      }
      const events = this.sim.events;
      this.sim.events = [];
      events.forEach(event => this.handleEvent(event));
      this.commentate(events);
      if (this.practice) {
        try {
          localStorage.setItem(PRACTICE_BEST_KEY, String(this.sim.practice.best));
        } catch { /* ignore */ }
      }
      this.syncState();
    }

    const ctx = this.ctx;
    ctx.save();
    if (this.shake > 0) ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    this.draw();
    ctx.restore();
    this.animId = requestAnimationFrame(this.loop);
  };

  // ---- Drawing ----
  private draw() {
    const ctx = this.ctx;
    this.render.drawCourt(ctx);
    if (this.sim && this.state !== GameState.TITLE && this.state !== GameState.MODE_SELECT && this.state !== GameState.DIFFICULTY) {
      this.drawScene();
      this.drawHud();
    } else {
      this.render.drawNet(ctx);
    }
    switch (this.state) {
      case GameState.TITLE: this.drawTitle(); break;
      case GameState.MODE_SELECT: this.drawModeSelect(); break;
      case GameState.DIFFICULTY: this.drawDifficulty(); break;
      case GameState.PAUSED: this.drawPause(); break;
      case GameState.GAME_OVER: this.drawGameOver(); break;
    }
    this.drawOverlays();
  }

  private drawScene() {
    const sim = this.sim;
    if (!sim) return;
    const ctx = this.ctx;
    for (const mark of this.marks) this.render.drawBallMark(ctx, mark.x, mark.y, mark.life);
    if (sim.landing && sim.phase === 'rally' && sim.ball.bounces === 0 && sim.lastHitter && this.isHuman(sim.lastHitter === 'near' ? 'far' : 'near')) {
      this.render.drawGroundRing(ctx, sim.landing.x, sim.landing.y, 0.42, '#ffffff', 0.6);
    }

    if (this.aim && this.isHuman('near')) {
      const swing = sim.players.near.swing;
      if (sim.phase === 'serve' && sim.server === 'near') {
        // A serve must land in the diagonal box, so the marker shows where it will really go.
        const boxSide = -Math.sign(sim.players.near.x || 1);
        this.render.drawAimMarker(ctx, boxSide * Math.max(0.4, Math.min(3.75, Math.abs(this.aim.x))), -Math.max(3, Math.min(6, Math.abs(this.aim.y))));
      } else {
        const target = shotTarget(swing.shot, this.aim.x, this.aim.y);
        this.render.drawAimMarker(ctx, target.x, -target.depth);
      }
    }

    // Footwork cue: where you will meet the ball, green in the sweet spot, amber at a stretch, red out of reach.
    for (const end of ['far', 'near'] as const) {
      const plan = sim.plans[end];
      if (!plan || !this.isHuman(end) || (end === 'far' && !this.twoPlayer)) continue;
      const player = sim.players[end];
      const distance = Math.hypot(plan.x - player.x, plan.y - player.y);
      const color = distance <= 1.3 ? '#39e36f' : distance <= REACH ? '#ffb300' : '#ff5a4f';
      this.render.drawGroundRing(ctx, plan.x, plan.y, 0.3, color, 0.9);
    }

    // Painter's order, far to near, with the net between the two ends of the court.
    const ballOnFarSide = sim.ball.y < 0;
    this.render.drawPlayer(ctx, sim, sim.players.far);
    if (ballOnFarSide) this.render.drawBall(ctx, sim, this.trail);
    this.render.drawNet(ctx);
    if (!ballOnFarSide && sim.ball.y < sim.players.near.y) this.render.drawBall(ctx, sim, this.trail);
    this.render.drawPlayer(ctx, sim, sim.players.near);
    if (!ballOnFarSide && sim.ball.y >= sim.players.near.y) this.render.drawBall(ctx, sim, this.trail);

    for (const end of ['far', 'near'] as const) {
      if (this.isHuman(end) && (end === 'near' || this.twoPlayer)) this.render.drawTimingMeter(ctx, sim, end);
    }
    for (const touch of this.touchPointers.values()) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(touch.startX, touch.startY, 45, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      const dx = touch.x - touch.startX, dy = touch.y - touch.startY;
      const size = Math.hypot(dx, dy), limit = size > 45 ? 45 / size : 1;
      ctx.arc(touch.startX + dx * limit, touch.startY + dy * limit, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  private plate(x: number, y: number, width: number, height: number, alpha = 0.8) {
    this.ctx.fillStyle = `rgba(5,10,20,${alpha})`;
    this.ctx.fillRect(x, y, width, height);
  }

  private text(value: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'center') {
    const ctx = this.ctx;
    ctx.font = `${size}px "Press Start 2P", monospace`;
    ctx.textAlign = align;
    ctx.fillStyle = color;
    ctx.fillText(value, x, y);
  }

  private platedText(value: string, x: number, y: number, size: number, color: string) {
    const ctx = this.ctx;
    ctx.font = `${size}px "Press Start 2P", monospace`;
    const width = ctx.measureText(value).width + 16;
    this.plate(x - width / 2, y - size - 5, width, size + 11);
    this.text(value, x, y, size, color);
  }

  private drawHud() {
    const sim = this.sim;
    if (!sim) return;
    if (this.practice) {
      const stats = sim.practice;
      const x = W - 214;
      this.plate(x, 12, 202, 66);
      this.text(`PERFECT ${stats.perfects}/${stats.tries}`, x + 10, 32, 9, PERFECT_COLOR, 'left');
      this.text(`LANDED IN ${stats.inCourt}`, x + 10, 50, 9, '#ffffff', 'left');
      this.text(`STREAK ${stats.streak}  BEST ${stats.best}`, x + 10, 68, 8, 'rgba(255,255,255,0.75)', 'left');
      if (stats.tries < 4) this.platedText(this.prompt(
        'ARROWS MOVE - HOLD Z X C V B - RELEASE IN THE GREEN',
        'STICK MOVES - HOLD A SHOT BUTTON - RELEASE IN THE GREEN',
        'DRAG TO MOVE - HOLD A SHOT - RELEASE IN THE GREEN',
      ), W / 2, 96, 7, 'rgba(255,255,255,0.85)');
    } else {
      this.drawScoreboard();
    }

    if (this.readout && this.time - this.readout.at < 3.5) {
      this.ctx.save();
      this.ctx.globalAlpha = Math.min(1, (3.5 - (this.time - this.readout.at)) / 1);
      this.platedText(this.readout.text, W / 2, H - 7, 8, this.readout.color);
      this.ctx.restore();
    }

    if (sim.phase === 'serve' && !this.practice && this.isHuman(sim.server) && sim.tossAt === null) {
      const second = sim.faults === 1 ? 'SECOND SERVE - ' : '';
      this.platedText(second + this.prompt(
        sim.server === 'near' ? 'HOLD C FLAT, V KICK OR Z SLICE - RELEASE IN THE GREEN' : 'HOLD R FLAT, E KICK OR Q SLICE - RELEASE IN THE GREEN',
        'HOLD X FLAT, A KICK OR B SLICE - RELEASE IN THE GREEN',
        'HOLD FLAT, TOPSPIN OR SLICE - RELEASE IN THE GREEN',
      ), W / 2, 300, 8, '#ffffff');
    } else if (sim.phase === 'serve' && !this.practice && sim.faults === 1) {
      this.platedText('SECOND SERVE', W / 2, 300, 8, '#ffffff');
    }
  }

  private drawScoreboard() {
    const sim = this.sim;
    if (!sim) return;
    const x = W - 244, y = 12, rowH = 26;
    this.plate(x, y, 232, rowH * 2 + 6, 0.88);
    (['far', 'near'] as const).forEach((end, i) => {
      const rowY = y + 21 + i * rowH;
      if (sim.server === end) {
        this.ctx.fillStyle = '#d6f53c';
        this.ctx.beginPath();
        this.ctx.arc(x + 12, rowY - 4, 4, 0, Math.PI * 2);
        this.ctx.fill();
      }
      this.text(this.nameOf(end), x + 24, rowY, 8, end === 'near' ? '#9ec5ff' : '#ff9d9a', 'left');
      this.text(String(sim.games[end]), x + 176, rowY, 11, '#ffffff', 'right');
      this.text(sim.pointLabel(end), x + 224, rowY, 11, '#d6f53c', 'right');
    });
  }

  private drawOverlays() {
    const ctx = this.ctx;
    ctx.save();
    for (const spark of this.sparks) {
      ctx.globalAlpha = Math.min(1, spark.life * 3);
      ctx.fillStyle = spark.color;
      ctx.fillRect(spark.x - 1.5, spark.y - 1.5, 3, 3);
    }
    ctx.globalAlpha = 1;
    for (const f of this.floats) {
      ctx.globalAlpha = Math.min(1, f.life * 1.6);
      ctx.font = `${f.size}px "Press Start 2P", monospace`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      const x = Math.max(70, Math.min(W - 70, f.x));
      ctx.strokeText(f.text, x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, x, f.y);
    }
    if (this.bigCall) {
      ctx.globalAlpha = Math.min(1, this.bigCall.life * 2.5);
      ctx.font = '34px Orbitron, sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.strokeText(this.bigCall.text, W / 2, 262);
      ctx.fillStyle = this.bigCall.color;
      ctx.fillText(this.bigCall.text, W / 2, 262);
    }
    ctx.globalAlpha = 1;
    if (this.lineReplay && this.inPlay()) this.render.drawLineReplay(ctx, this.lineReplay, Math.min(1, this.lineReplay.life * 4));
    if (this.toast && this.time < this.toast.until) this.platedText(this.toast.text, W / 2, H - 40, 9, '#d6f53c');
    ctx.restore();
  }

  private dim(alpha = 0.72) {
    this.ctx.fillStyle = `rgba(4,8,18,${alpha})`;
    this.ctx.fillRect(0, 0, W, H);
  }

  private drawTitle() {
    const ctx = this.ctx;
    this.dim(0.62);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#d7fa59';
    ctx.shadowBlur = 26;
    ctx.shadowColor = '#d7fa59';
    ctx.font = '62px Orbitron, sans-serif';
    ctx.fillText('PONG', W / 2, H / 2 - 70);
    ctx.font = '28px Orbitron, sans-serif';
    ctx.fillStyle = '#f5f5f0';
    ctx.fillText('SHOWCASE', W / 2, H / 2 - 25);
    ctx.restore();
    this.text('REAL TENNIS. PERFECT TIMING.', W / 2, H / 2 + 8, 9, 'rgba(245,245,240,0.7)');
    if (Math.sin(this.time * 3) > -0.3) {
      this.text(this.prompt('PRESS ENTER OR CLICK TO START', 'PRESS A TO START', 'TAP TO START'), W / 2, H / 2 + 80, 13, '#ffffff');
    }
  }

  private drawHeading(text: string) {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = '#d7fa59';
    ctx.shadowBlur = 16;
    ctx.shadowColor = '#d7fa59';
    ctx.font = '28px Orbitron, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(text, W / 2, 120);
    ctx.restore();
  }

  private menuFooter() {
    this.text(this.prompt('UP/DOWN TO SELECT  -  ENTER TO CONFIRM', 'STICK TO SELECT  -  A TO CONFIRM', 'TAP AN OPTION'), W / 2, H - 50, 9, 'rgba(255,255,255,0.45)');
    this.text(this.prompt('ESC TO GO BACK', 'B TO GO BACK', 'TAP HERE TO GO BACK'), W / 2, H - 30, 9, 'rgba(255,255,255,0.45)');
  }

  private menuRow(label: string, y: number, selected: boolean, color: string, sub?: string) {
    if (selected) {
      this.ctx.fillStyle = 'rgba(255,255,255,0.06)';
      this.ctx.fillRect(W / 2 - 220, y - 25, 440, 50);
      this.ctx.strokeStyle = color;
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(W / 2 - 220, y - 25, 440, 50);
    }
    this.text(label, W / 2, y + (sub && selected ? 0 : 5), selected ? 14 : 12, selected ? '#ffffff' : 'rgba(255,255,255,0.45)');
    if (sub && selected) this.text(sub, W / 2, y + 17, 7, 'rgba(255,255,255,0.6)');
  }

  private drawModeSelect() {
    this.dim();
    this.drawHeading('SELECT MODE');
    MODE_OPTIONS.forEach((option, i) => this.menuRow(option, this.modeRowY(i), this.menuSelection === i, '#d7fa59'));
    if (this.winStreak > 0) this.text(`WIN STREAK: ${this.winStreak}`, W / 2, H - 76, 10, '#FFD700');
    this.menuFooter();
  }

  private drawDifficulty() {
    this.dim();
    this.drawHeading('SELECT DIFFICULTY');
    AI_NAMES.forEach((name, i) => this.menuRow(name, this.difficultyRowY(i), this.difficultySelection === i, AI_COLORS[i], AI_DESCS[i]));
    this.menuFooter();
  }

  private drawPause() {
    const ctx = this.ctx;
    this.dim(0.62);
    ctx.save();
    ctx.fillStyle = '#d7fa59';
    ctx.font = '34px Orbitron, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PAUSED', W / 2, H / 2 - 40);
    ctx.restore();
    PAUSE_OPTIONS.forEach((option, i) => {
      const y = this.pauseRowY(i);
      if (this.pauseSelection === i) {
        ctx.strokeStyle = '#d7fa59';
        ctx.lineWidth = 2;
        ctx.strokeRect(W / 2 - 170, y - 19, 340, 38);
      }
      this.text(option, W / 2, y + 6, 12, this.pauseSelection === i ? '#ffffff' : 'rgba(255,255,255,0.45)');
    });
    this.text(this.prompt('ESC OR P TO RESUME', 'START TO RESUME', 'TAP AN OPTION'), W / 2, H / 2 + 145, 9, 'rgba(255,255,255,0.45)');
  }

  private drawGameOver() {
    const sim = this.sim;
    if (!sim) return;
    const ctx = this.ctx;
    this.dim(0.72);
    const winner = sim.matchWinner ?? 'near';
    const label = this.twoPlayer ? `${this.nameOf(winner)} WINS!` : winner === 'near' ? 'YOU WIN!' : 'CPU WINS!';
    ctx.save();
    ctx.fillStyle = '#d7fa59';
    ctx.shadowBlur = 20;
    ctx.shadowColor = '#d7fa59';
    ctx.font = '36px Orbitron, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, W / 2, H / 2 - 70);
    ctx.restore();
    this.text(`${sim.games.far}  -  ${sim.games.near}`, W / 2, H / 2 - 28, 18, '#ffffff');
    if (!this.twoPlayer && this.winStreak > 0) this.text(`WIN STREAK: ${this.winStreak}`, W / 2, H / 2 + 6, 11, '#FFD700');
    this.text('RECENT MATCHES', W / 2, H / 2 + 42, 8, 'rgba(255,255,255,0.45)');
    this.matchHistory.slice(-5).forEach((match, i) => {
      this.text(match, W / 2, H / 2 + 62 + i * 16, 8, match.includes('LOSS') ? '#ff6b6b' : match.includes('WIN') ? '#39e36f' : '#bbbbbb');
    });
    if (Math.sin(this.time * 3) > -0.3) {
      this.text(this.prompt('PRESS ENTER TO CONTINUE', 'PRESS A TO CONTINUE', 'TAP TO CONTINUE'), W / 2, H - 40, 11, '#ffffff');
    }
  }
}
