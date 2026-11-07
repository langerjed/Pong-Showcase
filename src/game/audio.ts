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
  topspin: { freq: 300, slideTo: 170, duration: 0.075, type: 'triangle', volume: 0.3 },
  flat: { freq: 210, slideTo: 95, duration: 0.09, type: 'triangle', volume: 0.36 },
  slice: { freq: 430, slideTo: 240, duration: 0.07, type: 'sine', volume: 0.26 },
  lob: { freq: 260, slideTo: 200, duration: 0.09, type: 'sine', volume: 0.24 },
  drop: { freq: 520, slideTo: 340, duration: 0.05, type: 'sine', volume: 0.16 },
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

  private noise(duration: number, volume: number, filterFreq: number, pan = 0, attack = 0.004) {
    if (!this.ctx) return;
    const length = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = filterFreq;
    filter.Q.value = 0.7;
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(volume, now + attack);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + duration);
    source.connect(filter);
    filter.connect(gain);
    if (pan !== 0 && typeof this.ctx.createStereoPanner === 'function') {
      const panner = this.ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      gain.connect(panner);
      panner.connect(this.ctx.destination);
    } else {
      gain.connect(this.ctx.destination);
    }
    source.start();
  }

  /** A racket thwack: a felt-and-string noise burst over a short body tone that differs per stroke. */
  shotHit(shot: ShotType, pan: number, power: number, perfect: boolean) {
    const base = SHOT_TONES[shot];
    this.tone({ ...base, pan, volume: (base.volume ?? 0.2) * (0.7 + power * 0.4) });
    this.noise(0.05, shot === 'drop' ? 0.12 : 0.3, perfect ? 3200 : 2200, pan);
    if (perfect) this.tone({ freq: 150, slideTo: 70, duration: 0.11, type: 'sine', volume: 0.3, pan });
  }

  bounce(pan: number, volume = 1) {
    this.noise(0.035, 0.12 * volume, 1500, pan);
    this.tone({ freq: 190, slideTo: 130, duration: 0.03, type: 'sine', volume: 0.09 * volume, pan });
  }

  netHit(pan: number) { this.noise(0.12, 0.16, 500, pan); }
  whoosh(pan: number) { this.noise(0.16, 0.07, 900, pan, 0.06); }
  crowd(strength: number) { this.noise(1.1 + strength * 0.9, 0.05 + strength * 0.09, 1300, 0, 0.12); }

  menuSelect()     { this.tone({ freq: 600, duration: 0.03 }); }
  countdown()      { this.tone({ freq: 800, duration: 0.08 }); }
  countdownGo()    { this.tone({ freq: 1200, duration: 0.15 }); }

  victory()    { this.sequence([523, 659, 784, 1047], 0.12, 0.12); }
  gameOver()   { this.sequence([400, 350, 300, 200], 0.15, 0.15); }
}
