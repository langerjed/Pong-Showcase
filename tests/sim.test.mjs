import test from 'node:test';
import assert from 'node:assert/strict';
const { COURT, gradeTiming, netHeightAt, SHOTS, solveLaunch, stepBall, TennisSim, TOSS_IDEAL, toMph, toRpm, WINDOW } = await import('../.test-build/sim.js');
const { applyDeadzone, mapGamepads, padEnd, shotForKey } = await import('../.test-build/input.js');
const { fallbackCommentary } = await import('../.test-build/announcer.js');

const seeded = (seed = 7) => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

function fly(shot, from = { x: 0, y: 11, z: 1 }, tx = 1, ty = -9) {
  const spec = SHOTS[shot];
  const launch = solveLaunch(from, tx, ty, spec.speed, spec);
  const b = { ...from, vx: launch.vx, vy: launch.vy, vz: launch.vz, spin: spec.spin, curve: 0, e: spec.bounceE, f: spec.bounceF, bounces: 0, netted: false };
  let t = 0, apex = 0, netted = false, land = null, reboundApex = 0, landSpeed = 0;
  for (let i = 0; i < 2400 && b.bounces < 2; i++) {
    const event = stepBall(b, 1 / 120);
    t += 1 / 120;
    if (event === 'net') netted = true;
    if (b.bounces === 0) apex = Math.max(apex, b.z);
    if (event === 'bounce' && b.bounces === 1) { land = { x: b.x, y: b.y, t }; landSpeed = Math.hypot(b.vx, b.vy); }
    if (b.bounces === 1) reboundApex = Math.max(reboundApex, b.z);
  }
  return { launch, apex, netted, land, reboundApex, landSpeed };
}

test('every stroke clears the net and lands on its target', () => {
  for (const shot of ['topspin', 'flat', 'slice', 'lob']) {
    const f = fly(shot);
    assert.ok(!f.netted, `${shot} hit the net`);
    assert.ok(Math.abs(f.land.y + 9) < 0.4 && Math.abs(f.land.x - 1) < 0.4, `${shot} landed at ${f.land.x},${f.land.y}`);
  }
  const drop = fly('drop', { x: 0, y: 8, z: 1 }, 0.5, -2.6);
  assert.ok(!drop.netted);
  assert.ok(Math.abs(drop.land.y + 2.6) < 0.4);
});

test('shots are physically different from each other', () => {
  const topspin = fly('topspin'), flat = fly('flat'), slice = fly('slice'), lob = fly('lob');
  assert.ok(flat.land.t < topspin.land.t && topspin.land.t < slice.land.t && slice.land.t < lob.land.t, 'flight time order');
  assert.ok(lob.apex > 6, `lob apex ${lob.apex}`);
  assert.ok(flat.apex < topspin.apex, 'flat flies lower than topspin');
  assert.ok(topspin.reboundApex > slice.reboundApex * 1.5, 'topspin kicks up, slice stays low');
  const drop = fly('drop', { x: 0, y: 8, z: 1 }, 0.5, -2.6);
  assert.ok(drop.landSpeed < 3, 'drop shot dies after bouncing');
});

test('timing grades control quality and direction of error', () => {
  assert.equal(gradeTiming(0).grade, 'perfect');
  assert.equal(gradeTiming(0.08).grade, 'good');
  assert.equal(gradeTiming(-0.15).grade, 'early');
  assert.equal(gradeTiming(0.15).grade, 'late');
  assert.ok(gradeTiming(0).pace > gradeTiming(0.08).pace && gradeTiming(0.08).pace > gradeTiming(0.15).pace);
  assert.ok(gradeTiming(-0.15).lift > 0, 'early sails long');
  assert.ok(gradeTiming(0.15).lift < 0, 'late drops towards the net');
});

function neutralRally(errSeconds, shot = 'topspin', seed = 7) {
  // A practice feed returned by a scripted swing at a fixed timing error.
  const sim = new TennisSim({ practice: true, rng: seeded(seed) });
  sim.events = [];
  const p = sim.players.near;
  let released = false;
  sim.press('near', shot);
  for (let i = 0; i < 1500; i++) {
    const plan = sim.plans.near;
    if (plan && !released) { p.x = plan.x - 0.5; p.y = plan.y + 0.2; }
    if (plan && !released && sim.t >= plan.t + errSeconds) { sim.release('near'); released = true; }
    sim.tick(1 / 120);
    const done = sim.events.find(e => e.type === 'call');
    if (done) return { call: done.text, hit: sim.events.find(e => e.type === 'hit' && e.end === 'near') };
  }
  return { call: 'NONE', hit: null };
}

const errorRate = (err, shot) => {
  let errors = 0;
  for (let seed = 1; seed <= 30; seed++) if (neutralRally(err, shot, seed * 131).call !== 'IN') errors++;
  return errors / 30;
};

test('timing decides whether the ball lands in', () => {
  for (const shot of ['topspin', 'flat', 'slice']) {
    assert.equal(errorRate(0, shot), 0, `${shot} on the sweet spot always lands in`);
    assert.equal(errorRate(-0.19, shot), 1, `${shot} badly early sails out`);
    assert.ok(errorRate(0.19, shot) >= 0.5, `${shot} badly late usually misses`);
  }
  assert.ok(errorRate(0.12, 'flat') > errorRate(0.12, 'topspin'), 'flat is riskier than topspin when mistimed');
  assert.equal(neutralRally(0).hit.timing, 'perfect');
  assert.equal(neutralRally(-0.3).call, 'TOO EARLY');
  assert.equal(neutralRally(0.3).call, 'TOO LATE');
  assert.ok(neutralRally(0).hit.mph > neutralRally(0.08).hit.mph, 'perfect hits harder than good');
});

test('standing out of reach misses the ball', () => {
  const sim = new TennisSim({ practice: true, rng: seeded() });
  sim.events = [];
  sim.press('near', 'topspin');
  let released = false;
  for (let i = 0; i < 1500; i++) {
    sim.players.near.x = -8;
    sim.players.near.y = 14;
    const plan = sim.plans.near;
    if (plan && !released && sim.t >= plan.t) { sim.release('near'); released = true; }
    sim.tick(1 / 120);
    if (sim.events.some(e => e.type === 'call')) break;
  }
  assert.ok(sim.events.some(e => e.type === 'call' && e.text === 'OUT OF REACH'));
});

test('tennis scoring counts 15-30-40, deuce and advantage', () => {
  const sim = new TennisSim({ rng: seeded(), firstServer: 'near' });
  const win = end => sim.awardPoint(end, 'test');
  win('near');
  assert.equal(sim.pointLabel('near'), '15');
  win('near'); win('near');
  assert.equal(sim.pointLabel('near'), '40');
  win('far'); win('far'); win('far');
  assert.equal(sim.pointLabel('near'), '40');
  assert.equal(sim.pointLabel('far'), '40');
  win('near');
  assert.equal(sim.pointLabel('near'), 'AD');
  win('far');
  assert.equal(sim.pointLabel('near'), '40');
  win('near'); win('near');
  assert.equal(sim.games.near, 1);
  assert.equal(sim.pointLabel('near'), '0');
  assert.equal(sim.server, 'far', 'serve changes after each game');
});

function cpuMatch(nearLevel, farLevel, seed, maxMinutes = 30) {
  const sim = new TennisSim({ cpu: { near: nearLevel, far: farLevel }, rng: seeded(seed) });
  const rallies = [], reasons = {};
  for (let i = 0; i < 120 * 60 * maxMinutes && !sim.matchWinner; i++) {
    sim.tick(1 / 120);
    for (const e of sim.events) if (e.type === 'point') { rallies.push(e.rally); reasons[e.reason] = (reasons[e.reason] || 0) + 1; }
    sim.events = [];
  }
  return { sim, rallies, reasons };
}

test('two computer players finish a believable match with real rallies', () => {
  const { sim, rallies, reasons } = cpuMatch(1, 1, 11);
  assert.ok(sim.matchWinner, 'match finished');
  const average = rallies.reduce((a, b) => a + b, 0) / rallies.length;
  assert.ok(average >= 2.5, `average rally ${average} ${JSON.stringify(reasons)}`);
  assert.ok(Object.keys(reasons).length >= 2, 'points end in different ways');
});

test('a hard computer player beats an easy one', () => {
  let hardWins = 0;
  for (let seed = 1; seed <= 6; seed++) if (cpuMatch(2, 0, seed * 31).sim.matchWinner === 'near') hardWins++;
  assert.ok(hardWins >= 5, `hard won ${hardWins}/6`);
});

test('a serve needs a timed release and must land in the correct box', () => {
  const sim = new TennisSim({ rng: seeded(), firstServer: 'near' });
  for (let i = 0; i < 120; i++) sim.tick(1 / 120);
  sim.press('near', 'flat');
  assert.notEqual(sim.tossAt, null);
  while (sim.t - sim.tossAt < TOSS_IDEAL) sim.tick(1 / 120);
  sim.release('near');
  for (let i = 0; i < 300 && !sim.events.some(e => e.type === 'bounce'); i++) sim.tick(1 / 120);
  const bounce = sim.events.find(e => e.type === 'bounce');
  assert.ok(bounce.y < 0 && bounce.y > -COURT.serviceLine && bounce.x < 0, `landed ${bounce.x},${bounce.y}`);
  assert.equal(sim.faults, 0);
});

test('a badly mistimed serve faults, and two faults lose the point', () => {
  const sim = new TennisSim({ rng: seeded(), firstServer: 'near' });
  const badServe = () => {
    for (let i = 0; i < 240 && sim.phase !== 'serve'; i++) sim.tick(1 / 120);
    for (let i = 0; i < 120; i++) sim.tick(1 / 120);
    sim.press('near', 'flat');
    while (sim.t - sim.tossAt < TOSS_IDEAL + WINDOW.poor) sim.tick(1 / 120);
    sim.release('near');
    for (let i = 0; i < 240 && sim.phase === 'rally' || i < 12; i++) sim.tick(1 / 120);
  };
  badServe();
  assert.equal(sim.faults, 1);
  badServe();
  assert.equal(sim.points.far, 1);
  assert.equal(sim.faults, 0);
});

test('net height follows the real cord sag', () => {
  assert.equal(netHeightAt(0), COURT.netCentre);
  assert.ok(Math.abs(netHeightAt(COURT.netHalf) - COURT.netPost) < 1e-9);
});

test('readout uses real-world units', () => {
  assert.equal(toMph(30), 67);
  assert.equal(toRpm(-1), 2800);
});

test('keys map to the right player and shot', () => {
  assert.deepEqual(shotForKey('v'), { end: 'near', shot: 'topspin' });
  assert.deepEqual(shotForKey('q'), { end: 'far', shot: 'slice' });
  assert.equal(shotForKey('p'), null);
});

const pad = ({ x = 0, y = 0, pressed = [] } = {}) => ({
  axes: [x, y],
  buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0 })),
});

test('controllers move in two dimensions and hit shots for their own player', () => {
  assert.equal(applyDeadzone(0.1), 0);
  assert.equal(padEnd(0, false), 'near');
  assert.equal(padEnd(0, true), 'far');
  assert.equal(padEnd(1, true), 'near');
  const frame = mapGamepads([pad({ x: 1, y: -1, pressed: [0] }), pad({ pressed: [1] })], { state: 'playing', twoPlayer: true });
  assert.deepEqual(frame.move.far, { x: 1, y: -1 });
  assert.deepEqual([...frame.keys].sort(), ['e', 'z']);
});

test('B goes back in menus but plays a slice in a rally', () => {
  const press = pad({ pressed: [1] });
  assert.ok(mapGamepads([press], { state: 'mode_select', twoPlayer: false }).keys.has('Escape'));
  assert.ok(mapGamepads([press], { state: 'playing', twoPlayer: false }).keys.has('z'));
});

test('local announcer has a line for each shot', () => {
  const base = { kind: 'shot', shooter: 'PLAYER', timing: 'good', scoreLeft: 0, scoreRight: 0, rallyHits: 3, playerRead: '' };
  assert.match(fallbackCommentary({ ...base, shot: 'slice' }), /slice/i);
  assert.match(fallbackCommentary({ ...base, shot: 'lob' }), /lob/i);
  assert.match(fallbackCommentary({ ...base, shot: 'drop' }), /drop/i);
  assert.match(fallbackCommentary({ ...base, shot: 'flat', timing: 'perfect' }), /perfect/i);
});
