// ============================================================
//  Pong Showcase — controller mapping
//  Pure helpers: translate Gamepad state into the same key names
//  the keyboard uses, so every input device shares one game flow.
// ============================================================

import { GameState } from './types';
import type { ShotType } from './types';
import type { End } from './sim';

export type InputDevice = 'keyboard' | 'gamepad' | 'touch';

export const SIDE_KEYS = {
  near: { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', topspin: 'v', flat: 'c', slice: 'z', drop: 'x', lob: 'b' },
  far: { up: 'w', down: 's', left: 'a', right: 'd', topspin: 'e', flat: 'r', slice: 'q', drop: 'f', lob: 'g' },
} as const;

export const SHOT_TYPES: ShotType[] = ['topspin', 'flat', 'slice', 'lob', 'drop'];

/** Which player and shot a key means, if any. */
export function shotForKey(key: string): { end: End; shot: ShotType } | null {
  for (const end of ['near', 'far'] as const) {
    for (const shot of SHOT_TYPES) {
      if (SIDE_KEYS[end][shot] === key) return { end, shot };
    }
  }
  return null;
}

// Standard Gamepad layout button indices.
const BTN = { a: 0, b: 1, x: 2, y: 3, rb: 5, rt: 7, start: 9, up: 12, down: 13, left: 14, right: 15 };
const MENU_STICK_THRESHOLD = 0.5;

export interface PadLike {
  axes: readonly number[];
  buttons: readonly { pressed: boolean; value: number }[];
}

export interface PadContext {
  state: GameState;
  twoPlayer: boolean;
}

export interface PadFrame {
  keys: Set<string>;
  move: Record<End, { x: number; y: number }>;
}

export function applyDeadzone(value: number, deadzone = 0.18) {
  const magnitude = Math.abs(value);
  if (magnitude < deadzone) return 0;
  return Math.sign(value) * Math.min(1, (magnitude - deadzone) / (1 - deadzone));
}

export function padEnd(padIndex: number, twoPlayer: boolean): End {
  return twoPlayer && padIndex === 0 ? 'far' : 'near';
}

const isDown = (pad: PadLike, index: number) => {
  const button = pad.buttons[index];
  return Boolean(button && (button.pressed || button.value > 0.4));
};

export function mapGamepads(pads: readonly PadLike[], ctx: PadContext): PadFrame {
  const keys = new Set<string>();
  const move: PadFrame['move'] = { near: { x: 0, y: 0 }, far: { x: 0, y: 0 } };
  const inPlay = ctx.state === GameState.PLAYING || ctx.state === GameState.SERVE || ctx.state === GameState.GOAL;
  const inMenu = ctx.state === GameState.MODE_SELECT || ctx.state === GameState.DIFFICULTY;

  pads.forEach((pad, index) => {
    const end = padEnd(index, ctx.twoPlayer);
    const map = SIDE_KEYS[end];
    const stickX = applyDeadzone(pad.axes[0] ?? 0);
    const stickY = applyDeadzone(pad.axes[1] ?? 0);
    const dpadX = isDown(pad, BTN.left) ? -1 : isDown(pad, BTN.right) ? 1 : 0;
    const dpadY = isDown(pad, BTN.up) ? -1 : isDown(pad, BTN.down) ? 1 : 0;
    const start = isDown(pad, BTN.start);

    if (inPlay) {
      const x = dpadX || stickX, y = dpadY || stickY;
      if (Math.hypot(x, y) > Math.hypot(move[end].x, move[end].y)) move[end] = { x, y };
      if (isDown(pad, BTN.a)) keys.add(map.topspin);
      if (isDown(pad, BTN.x)) keys.add(map.flat);
      if (isDown(pad, BTN.b)) keys.add(map.slice);
      if (isDown(pad, BTN.y)) keys.add(map.lob);
      if (isDown(pad, BTN.rb) || isDown(pad, BTN.rt)) keys.add(map.drop);
      if (start) keys.add('Escape');
      return;
    }

    if (ctx.state === GameState.PAUSED) {
      if (start || isDown(pad, BTN.b)) keys.add('Escape');
    } else if (start) {
      keys.add(' ');
    }
    if (dpadY < 0 || stickY < -MENU_STICK_THRESHOLD) keys.add(map.up);
    if (dpadY > 0 || stickY > MENU_STICK_THRESHOLD) keys.add(map.down);
    if (isDown(pad, BTN.a)) keys.add(' ');
    if (isDown(pad, BTN.b) && inMenu) keys.add('Escape');
  });

  return { keys, move };
}
