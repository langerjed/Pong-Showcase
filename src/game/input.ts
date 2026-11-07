// ============================================================
//  Pong Showcase — controller mapping
//  Pure helpers: translate Gamepad state into the same key names
//  the keyboard uses, so every input device shares one game flow.
// ============================================================

import { GameState } from './types';

export type Side = 'left' | 'right';
export type InputDevice = 'keyboard' | 'gamepad' | 'touch';

export const SIDE_KEYS = {
  right: { up: 'ArrowUp', down: 'ArrowDown', topspin: 'v', slice: 'z', stopspin: 'x', power: 'c' },
  left: { up: 'w', down: 's', topspin: 'e', slice: 'a', stopspin: 'd', power: 'f' },
} as const;

// Standard Gamepad layout button indices.
const BTN = { a: 0, b: 1, x: 2, y: 3, lb: 4, rb: 5, lt: 6, rt: 7, back: 8, start: 9, up: 12, down: 13 };
const MENU_STICK_THRESHOLD = 0.5;

export interface PadLike {
  axes: readonly number[];
  buttons: readonly { pressed: boolean; value: number }[];
}

export interface PadContext {
  state: GameState;
  twoPlayer: boolean;
  serveSide: Side;
}

export interface PadFrame {
  keys: Set<string>;
  axis: Record<Side, number>;
}

export function applyDeadzone(value: number, deadzone = 0.18) {
  const magnitude = Math.abs(value);
  if (magnitude < deadzone) return 0;
  return Math.sign(value) * Math.min(1, (magnitude - deadzone) / (1 - deadzone));
}

export function padSide(padIndex: number, twoPlayer: boolean): Side {
  return twoPlayer && padIndex === 0 ? 'left' : 'right';
}

const isDown = (pad: PadLike, index: number) => {
  const button = pad.buttons[index];
  return Boolean(button && (button.pressed || button.value > 0.4));
};

export function mapGamepads(pads: readonly PadLike[], ctx: PadContext): PadFrame {
  const keys = new Set<string>();
  const axis: Record<Side, number> = { left: 0, right: 0 };
  const inRally = ctx.state === GameState.PLAYING || ctx.state === GameState.SERVE;
  const inMenu = ctx.state === GameState.MODE_SELECT || ctx.state === GameState.DIFFICULTY;

  pads.forEach((pad, index) => {
    const side = padSide(index, ctx.twoPlayer);
    const map = SIDE_KEYS[side];
    const stick = applyDeadzone(pad.axes[1] ?? 0);
    const dpad = isDown(pad, BTN.up) ? -1 : isDown(pad, BTN.down) ? 1 : 0;
    const a = isDown(pad, BTN.a);
    const b = isDown(pad, BTN.b);
    const start = isDown(pad, BTN.start);

    if (inRally) {
      const move = dpad || stick;
      if (Math.abs(move) > Math.abs(axis[side])) axis[side] = move;
      if (isDown(pad, BTN.y)) keys.add(map.topspin);
      if (b) keys.add(map.slice);
      if (isDown(pad, BTN.x)) keys.add(map.stopspin);
      if ([BTN.lb, BTN.rb, BTN.lt, BTN.rt].some(button => isDown(pad, button))) keys.add(map.power);
      if (start) keys.add('Escape');
      const humanServe = ctx.twoPlayer || ctx.serveSide === 'right';
      if (a && ctx.state === GameState.SERVE && humanServe && ctx.serveSide === side) keys.add(' ');
      return;
    }

    if (ctx.state === GameState.PAUSED) {
      if (start || b) keys.add('Escape');
    } else if (start) {
      keys.add(' ');
    }
    if (dpad < 0 || stick < -MENU_STICK_THRESHOLD) keys.add(map.up);
    if (dpad > 0 || stick > MENU_STICK_THRESHOLD) keys.add(map.down);
    if (a) keys.add(' ');
    if (b && inMenu) keys.add('Escape');
  });

  return { keys, axis };
}
