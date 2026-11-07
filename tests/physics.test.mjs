import test from 'node:test';
import assert from 'node:assert/strict';
const {
  applyBounceKick,
  applySpin,
  calculateServe,
  calculateShot,
  getTimingGrade,
  getTimingProgress,
  predictInterceptY,
  reflectY,
  toMph,
  toRpm,
  BALL_SPEED_MAX,
  POWER_SHOT_SPEED_MAX,
} = await import('../.test-build/physics.js');
const { fallbackCommentary } = await import('../.test-build/announcer.js');
const { applyDeadzone, mapGamepads, padSide } = await import('../.test-build/input.js');

const pad = ({ axisY = 0, pressed = [] } = {}) => ({
  axes: [0, axisY],
  buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0 })),
});

test('vertical reflection handles repeated and negative wall crossings', () => {
  assert.equal(reflectY(15, 20, 580), 25);
  assert.equal(reflectY(1140, 20, 580), 20);
  assert.equal(reflectY(-1100, 20, 580), 20);
});

test('AI intercept prediction reflects the ball at the court edges', () => {
  assert.equal(predictInterceptY(570, 4, -5, 500, 20, 580), 190);
});

test('normal returns follow racket contact and stay within the speed ceiling', () => {
  const high = calculateShot({ side: 'right', shot: 'normal', hitOffset: -1, paddleVelocity: 0, incomingVy: 0, incomingSpeed: 12 });
  const low = calculateShot({ side: 'right', shot: 'normal', hitOffset: 1, paddleVelocity: 0, incomingVy: 0, incomingSpeed: 12 });
  assert.ok(high.vx < 0);
  assert.ok(high.vy < 0);
  assert.ok(low.vy > 0);
  assert.ok(high.speed <= BALL_SPEED_MAX);
  assert.ok(Math.hypot(high.vx, high.vy) <= BALL_SPEED_MAX + 1e-8);
});

test('slice and stop-spin slow the ball and apply curve', () => {
  const args = { side: 'right', hitOffset: 0.8, paddleVelocity: 180, incomingVy: 2, incomingSpeed: 6 };
  const normal = calculateShot({ ...args, shot: 'normal' });
  const slice = calculateShot({ ...args, shot: 'slice' });
  const stopspin = calculateShot({ ...args, shot: 'stopspin' });
  assert.ok(slice.speed < normal.speed);
  assert.ok(stopspin.speed < slice.speed);
  assert.notEqual(slice.spin, 0);
  assert.notEqual(stopspin.spin, 0);
  assert.ok(Math.abs(slice.vy / slice.vx) < Math.abs(normal.vy / normal.vx));
});

test('topspin adds a downward-curving ball for either player direction', () => {
  const leftPlayer = calculateShot({ side: 'left', shot: 'topspin', hitOffset: 0, paddleVelocity: 0, incomingVy: 0, incomingSpeed: 6 });
  const rightPlayer = calculateShot({ side: 'right', shot: 'topspin', hitOffset: 0, paddleVelocity: 0, incomingVy: 0, incomingSpeed: 6 });
  assert.ok(leftPlayer.spin > 0);
  assert.ok(rightPlayer.spin < 0);
  assert.ok(applySpin(leftPlayer.vx, leftPlayer.vy, leftPlayer.spin, 0.12).vy > leftPlayer.vy);
  assert.ok(applySpin(rightPlayer.vx, rightPlayer.vy, rightPlayer.spin, 0.12).vy > rightPlayer.vy);
});

test('charged power shots hit harder without exceeding the hard cap', () => {
  const power = calculateShot({ side: 'right', shot: 'power', hitOffset: 0.4, paddleVelocity: 0, incomingVy: 1, incomingSpeed: 7.4 });
  assert.ok(power.speed > BALL_SPEED_MAX);
  assert.ok(power.speed <= POWER_SHOT_SPEED_MAX);
});

test('timing meter rewards release in the green contact window', () => {
  assert.equal(getTimingGrade(0.4), 'early');
  assert.equal(getTimingGrade(0.15), 'perfect');
  assert.equal(getTimingGrade(0.04), 'late');
  assert.equal(getTimingGrade(null), 'none');
  assert.ok(Math.abs(getTimingProgress(0.22) - 0.6) < 1e-8);
  assert.ok(Math.abs(getTimingProgress(0.08) - (1 - 0.08 / 0.55)) < 1e-8);
});

test('perfectly timed charged shots gain pace and straighter aim', () => {
  const args = { side: 'right', shot: 'power', hitOffset: 0.6, paddleVelocity: 0, incomingVy: 1, incomingSpeed: 6, charge: 80 };
  const perfect = calculateShot({ ...args, timing: 'perfect' });
  const late = calculateShot({ ...args, timing: 'late' });
  const perfectAngle = Math.abs(Math.atan2(perfect.vy, Math.abs(perfect.vx)));
  const lateAngle = Math.abs(Math.atan2(late.vy, Math.abs(late.vx)));
  assert.ok(perfect.speed > late.speed);
  assert.ok(perfectAngle < lateAngle);
});

test('serves move toward the receiver and aim follows paddle placement', () => {
  const leftServe = calculateServe('left', -1, 'normal');
  const rightServe = calculateServe('right', 1, 'normal');
  assert.ok(leftServe.vx > 0);
  assert.ok(rightServe.vx < 0);
  assert.ok(leftServe.vy < 0);
  assert.ok(rightServe.vy > 0);
});

test('spin bends the ball path while preserving its pace and decaying', () => {
  const spun = applySpin(5, 0, 0.8, 0.25);
  assert.ok(spun.vy > 0);
  assert.ok(spun.spin < 0.8);
  assert.ok(Math.abs(Math.hypot(spun.vx, spun.vy) - 5) < 1e-8);
});

test('local announcer produces contextual lines for game events', () => {
  const line = fallbackCommentary({
    kind: 'shot', shooter: 'PLAYER', shot: 'slice', scoreLeft: 2, scoreRight: 3, rallyHits: 5, playerRead: '',
  });
  assert.match(line, /slice/i);
});

test('well-timed spin strokes bite harder and rushed ones spray', () => {
  const args = { side: 'right', hitOffset: 0.4, paddleVelocity: 0, incomingVy: 1, incomingSpeed: 6 };
  for (const shot of ['topspin', 'slice', 'stopspin']) {
    const plain = calculateShot({ ...args, shot });
    const perfect = calculateShot({ ...args, shot, timing: 'perfect' });
    const late = calculateShot({ ...args, shot, timing: 'late' });
    assert.ok(perfect.speed > plain.speed, shot);
    assert.ok(Math.abs(perfect.spin) > Math.abs(plain.spin), shot);
    assert.ok(late.speed < plain.speed, shot);
    assert.ok(perfect.speed <= BALL_SPEED_MAX, shot);
  }
});

test('first bounce gives each stroke its own character', () => {
  const pace = (ball) => Math.hypot(ball.vx, ball.vy);
  const start = pace({ vx: 4, vy: 3 });
  assert.ok(pace(applyBounceKick(4, 3, 'topspin')) > start);
  assert.ok(pace(applyBounceKick(4, 3, 'stopspin')) < start);
  const slice = applyBounceKick(-4, 3, 'slice');
  assert.ok(Math.abs(pace(slice) - start) < 1e-8);
  assert.ok(slice.vx < 0 && Math.abs(slice.vy) < 3);
  assert.deepEqual(applyBounceKick(4, 3, 'normal'), { vx: 4, vy: 3 });
  assert.ok(pace(applyBounceKick(7, 2, 'topspin')) <= BALL_SPEED_MAX);
});

test('shot readout converts to arcade units', () => {
  assert.equal(toMph(5), 70);
  assert.equal(toRpm(-1.2), 3000);
});

test('stick deadzone removes drift and keeps full range', () => {
  assert.equal(applyDeadzone(0.1), 0);
  assert.equal(applyDeadzone(1), 1);
  assert.equal(applyDeadzone(-1), -1);
  assert.ok(applyDeadzone(0.5) > 0 && applyDeadzone(0.5) < 0.5);
});

test('controllers map to the correct player', () => {
  assert.equal(padSide(0, false), 'right');
  assert.equal(padSide(0, true), 'left');
  assert.equal(padSide(1, true), 'right');
  const frame = mapGamepads([pad({ axisY: -1, pressed: [3] }), pad({ pressed: [1, 7] })], { state: 'playing', twoPlayer: true, serveSide: 'right' });
  assert.equal(frame.axis.left, -1);
  assert.deepEqual([...frame.keys].sort(), ['c', 'e', 'z']);
});

test('only the serving player can serve with a controller', () => {
  const press = { pressed: [0] };
  const ctx = { state: 'serve', twoPlayer: true };
  assert.ok(!mapGamepads([pad(press)], { ...ctx, serveSide: 'right' }).keys.has(' '));
  assert.ok(mapGamepads([pad(press)], { ...ctx, serveSide: 'left' }).keys.has(' '));
  assert.ok(!mapGamepads([pad(press)], { state: 'serve', twoPlayer: false, serveSide: 'left' }).keys.has(' '));
});

test('B goes back in menus but plays a slice in a rally', () => {
  const press = pad({ pressed: [1] });
  assert.ok(mapGamepads([press], { state: 'mode_select', twoPlayer: false, serveSide: 'right' }).keys.has('Escape'));
  const rally = mapGamepads([press], { state: 'playing', twoPlayer: false, serveSide: 'right' }).keys;
  assert.ok(rally.has('z') && !rally.has('Escape'));
});
