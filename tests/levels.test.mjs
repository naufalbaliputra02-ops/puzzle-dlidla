import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS } from '../src/game/levels.js';
import { World, parseLevel, starsFor } from '../src/game/world.js';
import { QUESTIONS, QuizDeck } from '../src/game/quiz.js';
import { playScript } from './bot.mjs';

const byName = Object.fromEntries(LEVELS.map((l) => [l.name, l]));

// Reference solutions. Each must win with exactly `par` deaths.
const SOLUTIONS = {
  'First Steps': [{ to: [3, 1], jump: true }],
  'Leave a Mark': [{ to: [2, 5] }, { echo: true }, { to: [4, 4] }, { to: [4, 1] }],
  'Stepping Stone': [
    { to: [3, 2.9], tol: 0.2 }, { echo: true },
    { toEcho: 0, jump: true, tol: 0.2, minY: 1.2 },
    { to: [3, 1], jump: true },
  ],
  'Quiz Gate': [
    { to: [6, 8] }, { quiz: true }, { to: [4, 7] }, { to: [4, 5] },
    { to: [2, 5] }, { quiz: true }, { to: [4, 4] }, { to: [4, 1] },
  ],
  'Spike Bridge': [
    { to: [3, 5], expectDeath: true },
    { toEcho: 0, jump: true, tol: 0.3, minY: 1.2 },
    { to: [3, 1], jump: true, expectDeath: true },
    { toEcho: 0, jump: true, tol: 0.3, minY: 1.2 },
    { toEcho: 1, jump: true, tol: 0.3, minY: 1.2 },
    { to: [3, 1], jump: true },
  ],
  'Laser Curtain': [
    { to: [4, 5], expectDeath: true },
    { to: [3, 7] }, { to: [3, 2], expectDeath: true },
    { to: [4, 7] }, { to: [3, 7] }, { to: [3, 4.5] }, { to: [4, 4.5] }, { to: [4, 1] },
  ],
  'Double Trouble': [{ to: [1, 4] }, { echo: true }, { to: [9, 4] }, { echo: true }, { to: [5, 4] }, { to: [5, 1] }],
  'Laser Lock': [{ to: [4, 5], expectDeath: true }, { to: [5, 6] }, { to: [5, 4] }, { to: [4, 4] }, { to: [4, 1] }],
  'Brain Maze': [
    { to: [2, 12] }, { quiz: true }, { to: [5, 12] }, { to: [5, 9] }, { quiz: true },
    { to: [3, 9] }, { to: [3, 7] }, { to: [2, 7] }, { quiz: true },
    { to: [4, 7] }, { to: [4, 5] }, { to: [6, 4] }, { quiz: true },
    { to: [1, 4] }, { echo: true },
    { to: [4, 4] }, { to: [4, 1] },
  ],
  'Higher Ground': [
    { to: [2.5, 3], jump: true, minY: 1 }, { echo: true },
    { to: [3.25, 3.1], jump: true, minY: 1, tol: 0.2 },
    { toEcho: 0, jump: true, minY: 2.2, tol: 0.2 },
    { to: [3, 1], jump: true },
  ],
  'Echo Chamber': [
    { to: [4, 12], expectDeath: true },
    { to: [5, 14] }, { to: [5, 12] }, { to: [4, 12] }, { to: [4, 7], expectDeath: true },
    { to: [5, 14] }, { to: [5, 12] }, { to: [4, 12] }, { to: [4, 10.2] },
    { toEcho: -1, jump: true, tol: 0.3, minY: 1.2 },
    { to: [4, 4], jump: true, expectDeath: true },
    { to: [5, 14] }, { to: [5, 12] }, { to: [4, 12] }, { to: [4, 10.2] },
    { toEcho: -2, jump: true, tol: 0.3, minY: 1.2 },
    { toEcho: -1, jump: true, tol: 0.3, minY: 1.2 },
    { to: [4, 4.5], jump: true },
    { to: [6, 4] }, { to: [2, 4] }, { quiz: true },
    { to: [4, 4] }, { to: [4, 2.2], tol: 0.45 }, { echo: true },
    { to: [4, 4] }, { toEcho: -1, jump: true, tol: 0.3, minY: 1.2 }, { to: [4, 1], jump: true },
  ],
};

test('every level parses', () => {
  for (const def of LEVELS) assert.doesNotThrow(() => parseLevel(def), def.name);
});

for (const def of LEVELS) {
  test(`solvable: ${def.name}`, () => {
    const { world } = playScript(def, SOLUTIONS[def.name] ?? assert.fail('missing solution'), { log: true });
    assert.equal(world.state, 'won');
    assert.equal(world.deaths, def.par, `solution should match par (${def.par})`);
  });
}

test('goal is unreachable without Echoes on ledge levels', () => {
  // Hopping straight at the ledge must never win.
  for (const name of ['Stepping Stone', 'Higher Ground']) {
    const w = new World(byName[name]);
    for (let i = 0; i < 60 * 8; i++) {
      const p = w.player;
      w.update(1 / 60, { mx: (3 - p.x) * 2, mz: -1, jumpPressed: p.onGround });
    }
    assert.notEqual(w.state, 'won', name);
  }
});

test('plate held by Echo opens the door; leaving closes it', () => {
  const w = new World(byName['Leave a Mark']);
  const door = w.level.doors[0];
  Object.assign(w.player, { x: 2, z: 5 });
  w.update(1 / 60, {});
  assert.equal(door.open, true);
  Object.assign(w.player, { x: 5, z: 5 });
  w.update(1 / 60, {});
  assert.equal(door.open, false);
});

test('Echo in a laser blocks the beam', () => {
  const w = new World(byName['Laser Lock']);
  const before = w.beams[0].x1;
  w.echoes.push({ id: 99, x: 2, y: 0, z: 5, vy: 0, facing: 0 });
  w.update(1 / 60, {});
  assert.ok(before > 7);
  assert.ok(w.beams[0].x1 < 2, `beam should stop at the Echo, ended at ${w.beams[0].x1}`);
});

test('wrong quiz answer zaps the player and leaves an Echo', () => {
  const w = new World(byName['Quiz Gate']);
  w.answerQuiz(w.level.terminals[1], false);
  for (let i = 0; i < 120; i++) w.update(1 / 60, {});
  assert.equal(w.deaths, 1);
  assert.equal(w.echoes.length, 1);
  assert.equal(w.level.doors.find((d) => d.id === 'A').open, false);
});

test('falling into the void leaves no Echo', () => {
  const w = new World({ name: 'pit', map: ['###', '#G#', '#_#', '#S#', '###'] });
  for (let i = 0; i < 90; i++) w.update(1 / 60, { mz: -1 });
  assert.ok(w.drainEvents().some((e) => e.type === 'death' && e.cause === 'void'));
  assert.equal(w.echoes.length, 0);
});

test('Echo limit shatters the oldest', () => {
  const w = new World(byName['Double Trouble']);
  for (let n = 0; n < 3; n++) {
    w.update(1 / 60, { echo: true });
    for (let i = 0; i < 90; i++) w.update(1 / 60, { mx: n % 2 ? 1 : -1 });
  }
  assert.equal(w.echoes.length, 2);
  assert.deepEqual(w.echoes.map((e) => e.id), [2, 3]);
});

test('stars and quiz bank', () => {
  assert.deepEqual([0, 1, 2, 3, 5].map((d) => starsFor(d, 1)), [3, 3, 2, 2, 1]);
  for (const q of QUESTIONS) assert.ok(q.a >= 0 && q.a < q.c.length, q.q);
  const deck = new QuizDeck();
  const seen = new Set(Array.from({ length: QUESTIONS.length }, () => deck.next().q));
  assert.equal(seen.size, QUESTIONS.length);
});
