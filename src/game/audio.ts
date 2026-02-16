// ============================================================
//  JEDAI Space Pong — Audio Engine
//  Authentic Pong sounds via Web Audio API
// ============================================================

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private initialized = false;

  init() {
    if (this.initialized) return;
    this.ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    this.initialized = true;
  }

  private pip(freq = 440, duration = 0.06) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  paddleHit()  { this.pip(480, 0.05); }
  wallHit()    { this.pip(300, 0.04); }
  score()      { this.pip(220, 0.25); }
  menuSelect() { this.pip(600, 0.03); }
  countdown()  { this.pip(800, 0.08); }
  countdownGo(){ this.pip(1200, 0.15); }

  goldPickup() {
    [660, 880, 1100, 1320].forEach((f, i) => {
      setTimeout(() => this.pip(f, 0.08), i * 60);
    });
  }

  powerUp() {
    [500, 700, 900].forEach((f, i) => {
      setTimeout(() => this.pip(f, 0.06), i * 50);
    });
  }

  victory() {
    [523, 659, 784, 1047].forEach((f, i) => {
      setTimeout(() => this.pip(f, 0.12), i * 120);
    });
  }

  gameOver() {
    [400, 350, 300, 200].forEach((f, i) => {
      setTimeout(() => this.pip(f, 0.15), i * 150);
    });
  }
}
