// ============================================================
//  Pong Showcase — broadcast camera, court and player drawing
//  Everything is projected from the simulation's 3D metres.
// ============================================================

import { COURT, LINES, MARK_RADIUS, netHeightAt, TOSS_IDEAL, WINDOW } from './sim';
import type { End, Player, TennisSim } from './sim';
import type { ShotType } from './types';

export const W = 800;
export const H = 600;

export const SHOT_COLORS: Record<ShotType, string> = {
  topspin: '#ffb020',
  flat: '#ffffff',
  slice: '#38e1ff',
  lob: '#e3ccff',
  drop: '#ff8fb0',
};

type V3 = [number, number, number];
export interface Screen { x: number; y: number; s: number }

const CAM = { y: 24.5, z: 11, lookY: -1.5, f: 806, screenY: 226 };
const camLen = Math.hypot(CAM.lookY - CAM.y, CAM.z);
const F = { y: (CAM.lookY - CAM.y) / camLen, z: -CAM.z / camLen };
const U = { y: F.z, z: -F.y };

export function project(x: number, y: number, z: number): Screen {
  const dy = y - CAM.y, dz = z - CAM.z;
  const depth = Math.max(0.5, dy * F.y + dz * F.z);
  const s = CAM.f / depth;
  return { x: W / 2 + x * s, y: CAM.screenY - (dy * U.y + dz * U.z) * s, s };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerp3 = (a: V3, b: V3, t: number): V3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const ease = (t: number) => t * t * (3 - 2 * t);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Hand path for each stroke in the player's frame: [right, forward, height]. */
const STROKES: Record<ShotType, { back: V3; contact: V3; follow: V3; turn: number }> = {
  topspin: { back: [0.5, -0.55, 0.95], contact: [0.62, 0.42, 1.0], follow: [-0.4, 0.2, 1.65], turn: 1.05 },
  flat: { back: [0.55, -0.6, 1.25], contact: [0.62, 0.5, 1.12], follow: [-0.55, 0.4, 1.2], turn: 1.15 },
  slice: { back: [0.5, -0.35, 1.6], contact: [0.55, 0.45, 0.95], follow: [0.2, 0.75, 0.72], turn: 0.85 },
  lob: { back: [0.45, -0.4, 0.7], contact: [0.55, 0.35, 0.95], follow: [-0.1, 0.25, 1.95], turn: 0.8 },
  drop: { back: [0.45, -0.1, 1.45], contact: [0.5, 0.5, 0.95], follow: [0.42, 0.62, 0.92], turn: 0.5 },
};
const READY_HAND: V3 = [0.2, 0.34, 1.02];

interface Kit { shirt: string; trim: string; shorts: string; skin: string; hair: string; shoe: string }
export const KITS: Record<End, Kit> = {
  near: { shirt: '#f4f6fa', trim: '#2f7bf6', shorts: '#1c3f8f', skin: '#e8b08c', hair: '#2a1d14', shoe: '#ffffff' },
  far: { shirt: '#e8423f', trim: '#ffd9d6', shorts: '#2a2730', skin: '#c98d68', hair: '#17120e', shoe: '#f2f2f2' },
};

export class CourtRenderer {
  private layer: HTMLCanvasElement | null = null;
  private netLayer: HTMLCanvasElement | null = null;

  private makeLayer() {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    return canvas;
  }

  private quad(ctx: CanvasRenderingContext2D, pts: [number, number][], fill: string) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    pts.forEach(([x, y], i) => {
      const p = project(x, y, 0);
      if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    });
    ctx.closePath();
    ctx.fill();
  }

  private paintCourt() {
    const layer = this.makeLayer();
    const ctx = layer.getContext('2d');
    if (!ctx) return layer;

    // Stands: tiers of spectators fading into the dark behind the back wall.
    const wallBottom = project(0, -17.5, 0).y;
    const wallTop = project(0, -17.5, 1.9).y;
    const sky = ctx.createLinearGradient(0, 0, 0, wallTop);
    sky.addColorStop(0, '#0b1420');
    sky.addColorStop(1, '#1a2a3c');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    const crowd = ['#d9d4c8', '#b1553f', '#3f6ea8', '#e0b24a', '#6d8a58', '#8d8d98', '#c9786f', '#55616f'];
    for (let row = 0; row < wallTop; row += 4) {
      const fade = 0.32 + (row / wallTop) * 0.5;
      for (let x = 0; x < W; x += 4) {
        if (Math.random() < 0.12) continue;
        ctx.globalAlpha = fade * (0.55 + Math.random() * 0.45);
        ctx.fillStyle = crowd[Math.floor(Math.random() * crowd.length)];
        ctx.fillRect(x + Math.random() * 2, row + Math.random() * 2, 2.6, 2.6);
      }
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#10263f';
    ctx.fillRect(0, wallTop, W, wallBottom - wallTop);
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.font = `${Math.max(9, (wallBottom - wallTop) * 0.5)}px Orbitron, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('PONG SHOWCASE', W / 2, (wallTop + wallBottom) / 2);
    ctx.textBaseline = 'alphabetic';

    // Ground: run-off, then the hard court itself.
    const edge = 40;
    this.quad(ctx, [[-edge, -17.5], [edge, -17.5], [edge, 26], [-edge, 26]], '#2f7a58');
    const hl = COURT.halfLength, dh = COURT.doublesHalf, sh = COURT.singlesHalf;
    this.quad(ctx, [[-dh, -hl], [dh, -hl], [dh, hl], [-dh, hl]], '#22639f');
    // Doubles alleys are out in singles, so they are tinted to make the playing area obvious.
    const alley = '#3a7f77';
    this.quad(ctx, [[-dh, -hl], [-sh, -hl], [-sh, hl], [-dh, hl]], alley);
    this.quad(ctx, [[sh, -hl], [dh, -hl], [dh, hl], [sh, hl]], alley);
    for (let i = 0; i < 16000; i++) {
      const p = project((Math.random() - 0.5) * 34, -17 + Math.random() * 34, 0);
      ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.05)';
      ctx.fillRect(p.x, p.y, 1.5, 1.2);
    }

    // Court lines, painted as ground quads so they narrow with distance.
    const white = 'rgba(255,255,255,0.97)';
    const faded = 'rgba(255,255,255,0.42)';
    const across = (y: number, x1: number, x2: number, w: number, color = white) => this.quad(ctx, [[x1, y - w], [x2, y - w], [x2, y + w], [x1, y + w]], color);
    const along = (x: number, y1: number, y2: number, w: number, color = white) => this.quad(ctx, [[x - w, y1], [x + w, y1], [x + w, y2], [x - w, y2]], color);
    // The outer doubles markings are faded; the singles court that counts is bright.
    along(dh, -hl, hl, LINES.doubles, faded);
    along(-dh, -hl, hl, LINES.doubles, faded);
    for (const y of [hl, -hl]) {
      across(y, -dh, -sh, LINES.doubles, faded);
      across(y, sh, dh, LINES.doubles, faded);
      across(y, -sh - LINES.sideline, sh + LINES.sideline, LINES.baseline);
    }
    along(sh, -hl, hl, LINES.sideline);
    along(-sh, -hl, hl, LINES.sideline);
    across(COURT.serviceLine, -sh, sh, LINES.service);
    across(-COURT.serviceLine, -sh, sh, LINES.service);
    along(0, -COURT.serviceLine, COURT.serviceLine, LINES.centre);
    along(0, hl - 0.3, hl, LINES.centre);
    along(0, -hl, -hl + 0.3, LINES.centre);
    return layer;
  }

  private paintNet() {
    const layer = this.makeLayer();
    const ctx = layer.getContext('2d');
    if (!ctx) return layer;
    const half = COURT.netHalf;
    const top = (x: number) => project(x, 0, netHeightAt(x));
    const ground = (x: number) => project(x, 0, 0);

    // Shadow on the court, then the mesh, tape and posts.
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    const shadowA = project(-half, 0.05, 0), shadowB = project(half, 0.05, 0), shadowC = project(half, 0.55, 0), shadowD = project(-half, 0.55, 0);
    ctx.beginPath();
    ctx.moveTo(shadowA.x, shadowA.y); ctx.lineTo(shadowB.x, shadowB.y); ctx.lineTo(shadowC.x, shadowC.y); ctx.lineTo(shadowD.x, shadowD.y);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = 'rgba(235,240,245,0.38)';
    ctx.lineWidth = 0.7;
    for (let x = -half; x <= half + 0.01; x += 0.28) {
      const a = top(x), b = ground(x);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    for (let k = 0; k <= 1.001; k += 0.2) {
      ctx.beginPath();
      for (let x = -half; x <= half + 0.01; x += 0.5) {
        const p = project(x, 0, netHeightAt(x) * k);
        if (x === -half) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    for (let x = -half; x <= half + 0.01; x += 0.5) {
      const p = top(x);
      if (x === -half) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.strokeStyle = '#1b2430';
    ctx.lineWidth = 5;
    for (const x of [-half, half]) {
      const a = top(x), b = ground(x);
      ctx.beginPath(); ctx.moveTo(a.x, a.y - 2); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    return layer;
  }

  drawCourt(ctx: CanvasRenderingContext2D) {
    if (!this.layer) this.layer = this.paintCourt();
    ctx.drawImage(this.layer, 0, 0);
  }

  drawNet(ctx: CanvasRenderingContext2D) {
    if (!this.netLayer) this.netLayer = this.paintNet();
    ctx.drawImage(this.netLayer, 0, 0);
  }

  drawGroundRing(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string, alpha: number) {
    const c = project(x, y, 0);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, radius * c.s, radius * c.s * 0.42, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  drawBallMark(ctx: CanvasRenderingContext2D, x: number, y: number, alpha: number) {
    const c = project(x, y, 0);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(255,214,120,0.95)';
    ctx.strokeStyle = 'rgba(70,35,0,0.8)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    // The same radius the line call uses, flattened only by the camera angle.
    ctx.ellipse(c.x, c.y, MARK_RADIUS * c.s, Math.max(1.5, MARK_RADIUS * c.s * 0.42), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  /** Close-call replay: an overhead zoom of the mark against the real lines, so every call can be checked. */
  drawLineReplay(ctx: CanvasRenderingContext2D, call: { x: number; y: number; margin: number; inCourt: boolean }, alpha: number) {
    const size = 74;
    const cx = 18 + size, cy = H - 34 - size;
    const zoom = 130;
    const sx = (x: number) => cx + (x - call.x) * zoom;
    const sy = (y: number) => cy + (y - call.y) * zoom;
    const hl = COURT.halfLength, sh = COURT.singlesHalf;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(5,10,20,0.9)';
    ctx.fillRect(cx - size - 6, cy - size - 6, size * 2 + 12, size * 2 + 32);
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx - size, cy - size, size * 2, size * 2);
    ctx.clip();
    ctx.fillStyle = '#2f7a58';
    ctx.fillRect(cx - size, cy - size, size * 2, size * 2);
    ctx.fillStyle = '#3a7f77';
    ctx.fillRect(sx(-COURT.doublesHalf), sy(-hl), (COURT.doublesHalf * 2) * zoom, hl * 2 * zoom);
    ctx.fillStyle = '#22639f';
    ctx.fillRect(sx(-sh), sy(-hl), sh * 2 * zoom, hl * 2 * zoom);
    ctx.fillStyle = '#ffffff';
    const v = (x: number, y1: number, y2: number, w: number) => ctx.fillRect(sx(x - w), sy(y1), w * 2 * zoom, (y2 - y1) * zoom);
    const h = (y: number, x1: number, x2: number, w: number) => ctx.fillRect(sx(x1), sy(y - w), (x2 - x1) * zoom, w * 2 * zoom);
    v(sh, -hl, hl, LINES.sideline);
    v(-sh, -hl, hl, LINES.sideline);
    h(hl, -sh - LINES.sideline, sh + LINES.sideline, LINES.baseline);
    h(-hl, -sh - LINES.sideline, sh + LINES.sideline, LINES.baseline);
    h(COURT.serviceLine, -sh, sh, LINES.service);
    h(-COURT.serviceLine, -sh, sh, LINES.service);
    v(0, -COURT.serviceLine, COURT.serviceLine, LINES.centre);
    ctx.fillStyle = 'rgba(255,214,120,0.95)';
    ctx.strokeStyle = '#3a1c00';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, MARK_RADIUS * zoom, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = call.inCourt ? '#39e36f' : '#ff8a65';
    const gapCm = Math.max(1, Math.round((-call.margin - MARK_RADIUS) * 100));
    ctx.fillText(call.inCourt ? 'ON THE LINE: IN' : `OUT BY ${gapCm} CM`, cx, cy + size + 18);
    ctx.restore();
  }

  drawBall(ctx: CanvasRenderingContext2D, sim: TennisSim, trail: { x: number; y: number; z: number }[]) {
    const b = sim.ball;
    const color = SHOT_COLORS[sim.ballShot];
    ctx.save();
    // The shadow stays on the court: the gap between it and the ball is what shows height.
    const ground = project(b.x, b.y, 0);
    const heightFade = clamp(1 - b.z / 9, 0.25, 1);
    ctx.fillStyle = `rgba(0,0,0,${0.42 * heightFade})`;
    ctx.beginPath();
    ctx.ellipse(ground.x, ground.y, Math.max(2.5, 0.1 * ground.s), Math.max(1.3, 0.045 * ground.s), 0, 0, Math.PI * 2);
    ctx.fill();

    trail.forEach((point, i) => {
      const p = project(point.x, point.y, point.z);
      const k = (i + 1) / trail.length;
      ctx.globalAlpha = k * 0.34;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(1, 0.06 * p.s * k), 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    const p = project(b.x, b.y, b.z);
    const radius = Math.max(3, 0.085 * p.s);
    ctx.fillStyle = '#d6f53c';
    ctx.strokeStyle = 'rgba(40,60,0,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.beginPath();
    ctx.arc(p.x - radius * 0.3, p.y - radius * 0.3, radius * 0.32, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawPlayer(ctx: CanvasRenderingContext2D, sim: TennisSim, p: Player) {
    const kit = KITS[p.end];
    const near = p.end === 'near';
    const rx = near ? 1 : -1; // world x of the player's right
    const fy = near ? -1 : 1; // world y of the player's forward
    const sw = p.swing;
    const t = sim.t;
    const speed = Math.hypot(p.vx, p.vy);
    const runAmount = clamp(speed / 6.4, 0, 1);
    const moveR = speed > 0.05 ? (p.vx * rx) / speed : 0;
    const moveF = speed > 0.05 ? (p.vy * fy) / speed : 0;

    // Stroke timeline.
    const mirror = sw.hand === 'bh' ? -1 : 1;
    const stroke = STROKES[sw.shot];
    let hand: V3 = READY_HAND;
    let yaw = 0;
    let crouch = 0.09;
    let lunge: [number, number] = [0, 0];
    const key = (v: V3): V3 => [v[0] * mirror, v[1], v[2]];
    const liveContact = (): V3 | null => {
      if (!sw.contact) return null;
      const r = (sw.contact.x - p.x) * rx, f = (sw.contact.y - p.y) * fy;
      const dist = Math.hypot(r, f) || 1;
      // The racket head meets the ball, so the hand stops a racket-length short of it.
      const pull = Math.min(dist, 0.5);
      return [r - (r / dist) * pull, f - (f / dist) * pull, clamp(sw.contact.z - 0.1, 0.5, 2.3)];
    };

    if (sw.serve) {
      const trophy: V3 = [0.42, -0.3, 1.75];
      const strike: V3 = [0.22, 0.28, 2.3];
      const finish: V3 = [-0.38, 0.32, 0.85];
      if (sw.phase === 'load') {
        const u = ease(clamp((t - sw.pressedAt) / TOSS_IDEAL, 0, 1));
        hand = lerp3(READY_HAND, trophy, u);
        yaw = 0.95 * u;
        crouch = 0.09 + 0.14 * u;
      } else if (sw.phase === 'forward') {
        const u = clamp((t - sw.startedAt) / Math.max(0.03, sw.contactAt - sw.startedAt), 0, 1);
        hand = lerp3(trophy, strike, u * u);
        yaw = 0.95 * (1 - u);
      } else if (sw.phase === 'follow') {
        const u = clamp((t - sw.contactAt) / (sw.endsAt - sw.contactAt), 0, 1);
        hand = lerp3(strike, finish, ease(u));
        yaw = -0.7 * ease(u);
        crouch = 0.14 * u;
      }
    } else if (sw.phase === 'load') {
      const u = ease(clamp((t - sw.pressedAt) / 0.2, 0, 1));
      hand = lerp3(READY_HAND, key(stroke.back), u);
      yaw = stroke.turn * mirror * u;
      crouch = 0.09 + 0.1 * u;
    } else if (sw.phase === 'forward') {
      const u = clamp((t - sw.startedAt) / Math.max(0.03, sw.contactAt - sw.startedAt), 0, 1);
      const contact = liveContact() ?? key(stroke.contact);
      hand = lerp3(key(stroke.back), contact, u * u);
      yaw = stroke.turn * mirror * (1 - u * 1.15);
      crouch = 0.19 - 0.08 * u;
      const reach = Math.hypot(contact[0], contact[1]);
      if (reach > 0.75) lunge = [(contact[0] / reach) * (reach - 0.75) * 0.7 * u, (contact[1] / reach) * (reach - 0.75) * 0.7 * u];
    } else if (sw.phase === 'follow') {
      const u = clamp((t - sw.contactAt) / Math.max(0.05, sw.endsAt - sw.contactAt), 0, 1);
      const settled = u > 0.7 ? ease((u - 0.7) / 0.3) : 0;
      hand = lerp3(lerp3(liveContact() ?? key(stroke.contact), key(stroke.follow), ease(Math.min(1, u / 0.7))), READY_HAND, settled);
      yaw = -stroke.turn * 0.6 * mirror * ease(Math.min(1, u / 0.7)) * (1 - settled);
      crouch = 0.1;
    }

    const hop = t - p.splitAt < 0.2 ? Math.sin(((t - p.splitAt) / 0.2) * Math.PI) * 0.1 : 0;
    const breathe = runAmount < 0.1 ? Math.sin(t * 5) * 0.012 : 0;
    const bob = runAmount > 0.1 ? Math.abs(Math.sin(p.runPhase)) * 0.06 * runAmount : 0;
    const leanR = moveR * runAmount * 0.2 + lunge[0] * 0.4;
    const leanF = moveF * runAmount * 0.2 + 0.07 + lunge[1] * 0.4;

    const world = (r: number, f: number, u: number): Screen => project(p.x + r * rx, p.y + f * fy, u);
    const rotate = (r: number, f: number, angle: number): [number, number] => [r * Math.cos(angle) + f * Math.sin(angle), f * Math.cos(angle) - r * Math.sin(angle)];

    const hipBase: V3 = [lunge[0] * 0.5 + leanR * 0.25, lunge[1] * 0.5 + leanF * 0.25, 0.94 - crouch + hop + bob + breathe];
    const chest: V3 = [hipBase[0] + leanR, hipBase[1] + leanF, hipBase[2] + 0.5];
    const neck: V3 = [chest[0] + leanR * 0.2, chest[1] + leanF * 0.2, chest[2] + 0.13];
    const headPos: V3 = [neck[0], neck[1] + 0.02, neck[2] + 0.15];

    const shoulder = (side: number): V3 => {
      const [r, f] = rotate(side * 0.21, 0, yaw);
      return [chest[0] + r, chest[1] + f, chest[2] + 0.02];
    };
    const hip = (side: number): V3 => {
      const [r, f] = rotate(side * 0.12, 0, yaw * 0.55);
      return [hipBase[0] + r, hipBase[1] + f, hipBase[2]];
    };
    const foot = (side: number): V3 => {
      const phase = p.runPhase + (side > 0 ? 0 : Math.PI);
      const stride = Math.sin(phase) * 0.46 * runAmount;
      const lift = Math.max(0, Math.cos(phase)) * 0.2 * runAmount;
      const stance = side * (0.14 + 0.11 * (1 - runAmount) + crouch * 0.25);
      const set = sw.phase !== 'idle' && !sw.serve ? side * mirror * -0.14 : 0;
      return [stance + moveR * stride + lunge[0] * (side * mirror > 0 ? 1 : 0.2), set + moveF * stride + lunge[1] * (side * mirror > 0 ? 1 : 0.2), 0.04 + lift + hop];
    };

    const joint = (a: V3, b: V3, length: number, bend: V3): V3 => {
      const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      const offset = Math.sqrt(Math.max(0.0004, length * length - (d / 2) * (d / 2)));
      return [(a[0] + b[0]) / 2 + bend[0] * offset, (a[1] + b[1]) / 2 + bend[1] * offset, (a[2] + b[2]) / 2 + bend[2] * offset];
    };

    const limb = (points: V3[], width: number, color: string) => {
      const scale = world(points[0][0], points[0][1], points[0][2]).s;
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1.4, width * scale);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      points.forEach((v, i) => {
        const s = world(v[0], v[1], v[2]);
        if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y);
      });
      ctx.stroke();
    };

    // Ground shadow.
    const shadow = project(p.x + 0.12, p.y + 0.1, 0);
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.beginPath();
    ctx.ellipse(shadow.x, shadow.y, 0.5 * shadow.s, 0.2 * shadow.s, 0, 0, Math.PI * 2);
    ctx.fill();

    // Legs.
    for (const side of [-1, 1]) {
      const h = hip(side), fo = foot(side);
      const knee = joint(h, fo, 0.46, [side * 0.12, 0.95, 0.1]);
      limb([h, knee], 0.15, kit.skin);
      limb([knee, fo], 0.115, kit.skin);
      limb([[fo[0], fo[1] - 0.05, fo[2]], [fo[0], fo[1] + 0.14, fo[2]]], 0.11, kit.shoe);
    }

    // Shorts and torso.
    limb([hip(-1), [hipBase[0], hipBase[1], hipBase[2] - 0.14], hip(1)], 0.2, kit.shorts);
    const left = shoulder(-1), right = shoulder(1), hipL = hip(-1), hipR = hip(1);
    const corners = [left, right, hipR, hipL].map(v => world(v[0], v[1], v[2]));
    ctx.fillStyle = kit.shirt;
    ctx.strokeStyle = kit.shirt;
    ctx.lineWidth = Math.max(2, 0.14 * corners[0].s);
    ctx.lineJoin = 'round';
    ctx.beginPath();
    corners.forEach((c, i) => { if (i === 0) ctx.moveTo(c.x, c.y); else ctx.lineTo(c.x, c.y); });
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    limb([left, right], 0.05, kit.trim);

    // Off arm: balances the run, tosses on the serve, or joins the grip on a backhand.
    const racketShoulder = shoulder(1);
    const offShoulder = shoulder(-1);
    const twoHanded = sw.hand === 'bh' && sw.phase !== 'idle' && !sw.serve && sw.shot !== 'slice';
    let offHand: V3;
    if (sw.serve && sw.phase === 'load') {
      const u = ease(clamp((t - sw.pressedAt) / (TOSS_IDEAL * 0.8), 0, 1));
      offHand = lerp3([-0.22, 0.3, 1.1], [-0.16, 0.3, 2.3], u);
    } else if (twoHanded) {
      offHand = [hand[0] * 0.9, hand[1] * 0.9, hand[2] - 0.02];
    } else if (sw.phase === 'idle' && runAmount < 0.25) {
      offHand = [-0.1, 0.36, 1.05]; // both hands on the racket in the ready position
    } else {
      const armSwing = Math.sin(p.runPhase) * 0.34 * runAmount;
      offHand = [offShoulder[0] - 0.14, offShoulder[1] + armSwing + 0.05, offShoulder[2] - 0.42];
    }
    limb([offShoulder, joint(offShoulder, offHand, 0.33, [-0.5, -0.2, -0.7]), offHand], 0.09, kit.skin);

    // Head.
    const headScreen = world(headPos[0], headPos[1], headPos[2]);
    const headR = Math.max(2.5, 0.125 * headScreen.s);
    ctx.fillStyle = kit.skin;
    ctx.beginPath();
    ctx.arc(headScreen.x, headScreen.y, headR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = kit.hair;
    ctx.beginPath();
    if (near) ctx.arc(headScreen.x, headScreen.y, headR, 0, Math.PI * 2); // seen from behind
    else ctx.arc(headScreen.x, headScreen.y - headR * 0.2, headR, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = kit.trim;
    ctx.lineWidth = Math.max(1, headR * 0.26);
    ctx.beginPath();
    ctx.moveTo(headScreen.x - headR * 0.98, headScreen.y - headR * 0.18);
    ctx.lineTo(headScreen.x + headR * 0.98, headScreen.y - headR * 0.18);
    ctx.stroke();

    // Racket arm and racket.
    const elbow = joint(racketShoulder, hand, 0.33, [0.45, -0.25, -0.75]);
    limb([racketShoulder, elbow, hand], 0.09, kit.skin);

    const direction = (() => {
      const blend = sw.phase === 'idle' ? 0 : 1;
      const out: V3 = [hand[0] - chest[0], hand[1] - chest[1], (hand[2] - chest[2]) * 0.8];
      const size = Math.hypot(out[0], out[1], out[2]) || 1;
      const swingDir: V3 = [out[0] / size, out[1] / size, out[2] / size];
      const rest: V3 = [-0.25, 0.8, 0.5];
      return lerp3(rest, swingDir, blend);
    })();
    const size = Math.hypot(direction[0], direction[1], direction[2]) || 1;
    const dir: V3 = [direction[0] / size, direction[1] / size, direction[2] / size];
    const throat: V3 = [hand[0] + dir[0] * 0.3, hand[1] + dir[1] * 0.3, hand[2] + dir[2] * 0.3];
    const headCentre: V3 = [hand[0] + dir[0] * 0.5, hand[1] + dir[1] * 0.5, hand[2] + dir[2] * 0.5];
    limb([hand, throat], 0.035, '#1c2128');
    const sideVec: V3 = (() => {
      const cross: V3 = [dir[1], -dir[0], 0];
      const len = Math.hypot(cross[0], cross[1]) || 1;
      return [cross[0] / len, cross[1] / len, 0];
    })();
    const frame: Screen[] = [];
    for (let a = 0; a < 16; a++) {
      const angle = (a / 16) * Math.PI * 2;
      const along = Math.cos(angle) * 0.17, across = Math.sin(angle) * 0.125;
      frame.push(world(
        headCentre[0] + dir[0] * along + sideVec[0] * across,
        headCentre[1] + dir[1] * along + sideVec[1] * across,
        headCentre[2] + dir[2] * along,
      ));
    }
    ctx.fillStyle = 'rgba(240,245,250,0.28)';
    ctx.strokeStyle = near ? '#2f7bf6' : '#ffe08a';
    ctx.lineWidth = Math.max(1.2, 0.03 * frame[0].s);
    ctx.beginPath();
    frame.forEach((c, i) => { if (i === 0) ctx.moveTo(c.x, c.y); else ctx.lineTo(c.x, c.y); });
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  /**
   * The timing meter sits at the player's feet: the marker slides towards the middle as the
   * ball reaches the strike point, and freezes where you actually swung.
   */
  drawTimingMeter(ctx: CanvasRenderingContext2D, sim: TennisSim, end: End) {
    const p = sim.players[end];
    const sw = p.swing;
    const committed = (sw.phase === 'forward' || sw.phase === 'follow') && (sw.serve || sw.contact || sw.whiff);
    const plan = sim.plans[end];
    let err: number | null = null;
    if (committed) err = sw.err;
    else if (sw.serve && sim.tossAt !== null) err = sim.t - sim.tossAt - TOSS_IDEAL;
    else if (plan && plan.t - sim.t < 1.25) err = sim.t - plan.t;
    if (err === null) return;

    const feet = project(p.x, p.y, 0);
    const halfWidth = 82;
    const range = 0.4;
    const cx = clamp(feet.x, halfWidth + 8, W - halfWidth - 8);
    const cy = clamp(feet.y + 15, 20, H - 44);
    const px = (seconds: number) => (seconds / range) * halfWidth;
    ctx.save();
    ctx.fillStyle = 'rgba(5,10,20,0.82)';
    ctx.fillRect(cx - halfWidth - 3, cy - 3, halfWidth * 2 + 6, 15);
    ctx.fillStyle = '#ef5350';
    ctx.fillRect(cx - halfWidth, cy, halfWidth * 2, 9);
    ctx.fillStyle = '#ffb300';
    ctx.fillRect(cx - px(WINDOW.poor), cy, px(WINDOW.poor) * 2, 9);
    ctx.fillStyle = '#fff176';
    ctx.fillRect(cx - px(WINDOW.good), cy, px(WINDOW.good) * 2, 9);
    ctx.fillStyle = '#39e36f';
    ctx.fillRect(cx - px(WINDOW.perfect), cy, px(WINDOW.perfect) * 2, 9);
    const marker = cx + clamp(px(err), -halfWidth, halfWidth);
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#000000';
    ctx.shadowBlur = 3;
    ctx.fillRect(marker - 2, cy - 3, 4, 15);
    ctx.shadowBlur = 0;
    if (sw.phase === 'load' && !sw.serve) {
      const load = clamp((sim.t - sw.pressedAt) / 0.45, 0, 1);
      ctx.fillStyle = 'rgba(5,10,20,0.82)';
      ctx.fillRect(cx - halfWidth - 3, cy + 12, halfWidth * 2 + 6, 5);
      ctx.fillStyle = load >= 1 ? '#39e36f' : '#90caf9';
      ctx.fillRect(cx - halfWidth, cy + 13, halfWidth * 2 * load, 3);
    }
    ctx.restore();
  }
}
