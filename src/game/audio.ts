// ============================================================
//  Pong Showcase — Audio Engine
//  Synthesized with the Web Audio API: no files, no services.
// ============================================================

import type { ShotType } from './types';

interface ToneOptions {
  freq?: number;
  duration?: number;
  type?: OscillatorType;
  slideTo?: number;
  volume?: number;
  /** Stereo position from -1 (left) to 1 (right). */
  pan?: number;
  delay?: number;
}

const SHOT_TONES: Record<ShotType, ToneOptions> = {
  normal: { freq: 480, duration: 0.05, type: 'square' },
  topspin: { freq: 460, slideTo: 760, duration: 0.09, type: 'square' },
  slice: { freq: 620, slideTo: 300, duration: 0.11, type: 'triangle', volume: 0.2 },
  stopspin: { freq: 340, slideTo: 220, duration: 0.08, type: 'sine', volume: 0.22 },
  power: { freq: 240, slideTo: 90, duration: 0.14, type: 'sawtooth', volume: 0.2 },
};

export class AudioEngine {
  private ctx: AudioContext | null = null;

  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
  }

  private tone({ freq = 440, duration = 0.06, type = 'square', slideTo, volume = 0.15, pan = 0, delay = 0 }: ToneOptions) {
    if (!this.ctx) return;
    const start = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, start + duration);
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    osc.connect(gain);
    if (pan !== 0 && typeof this.ctx.createStereoPanner === 'function') {
      const panner = this.ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      gain.connect(panner);
      panner.connect(this.ctx.destination);
    } else {
      gain.connect(this.ctx.destination);
    }
    osc.start(start);
    osc.stop(start + duration);
  }

  private sequence(freqs: number[], step: number, duration: number) {
    freqs.forEach((freq, i) => this.tone({ freq, duration, delay: i * step }));
  }

  /** Each stroke has its own sound, placed in stereo where the ball was hit. */
  shotHit(shot: ShotType, pan: number, speedRatio: number, perfect: boolean) {
    const base = SHOT_TONES[shot];
    const pitch = 0.9 + Math.max(0, Math.min(1, speedRatio)) * 0.25;
    this.tone({
      ...base,
      pan,
      freq: (base.freq ?? 440) * pitch,
      slideTo: base.slideTo ? base.slideTo * pitch : undefined,
    });
    if (perfect) {
      [1047, 1568].forEach((freq, i) => this.tone({ freq, duration: 0.14, type: 'triangle', volume: 0.16, pan, delay: i * 0.05 }));
    }
  }

  wallHit(pan = 0) { this.tone({ freq: 300, duration: 0.04, pan }); }
  score(pan = 0)   { this.tone({ freq: 220, duration: 0.25, pan }); }
  miss(pan = 0)    { this.tone({ freq: 200, slideTo: 110, duration: 0.2, type: 'triangle', volume: 0.18, pan }); }
  menuSelect()     { this.tone({ freq: 600, duration: 0.03 }); }
  countdown()      { this.tone({ freq: 800, duration: 0.08 }); }
  countdownGo()    { this.tone({ freq: 1200, duration: 0.15 }); }

  goldPickup() { this.sequence([660, 880, 1100, 1320], 0.06, 0.08); }
  powerUp()    { this.sequence([500, 700, 900], 0.05, 0.06); }
  victory()    { this.sequence([523, 659, 784, 1047], 0.12, 0.12); }
  gameOver()   { this.sequence([400, 350, 300, 200], 0.15, 0.15); }
}
