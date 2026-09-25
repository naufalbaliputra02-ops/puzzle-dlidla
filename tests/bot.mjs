// Scripted player used by tests to prove every level can be completed.
import { World } from '../src/game/world.js';

const DT = 1 / 60;

export function playScript(def, script, { log = false } = {}) {
  const world = new World(def);
  const trace = [];
  let deathsSeen = 0;

  const step = (input) => {
    world.update(DT, input);
    for (const e of world.drainEvents()) {
      if (e.type === 'death') deathsSeen++;
      if (log && e.type !== 'jump' && e.type !== 'plate') trace.push(`${world.time.toFixed(2)} ${e.type}${e.cause ? ':' + e.cause : ''}`);
    }
  };
  const waitRespawn = () => {
    for (let i = 0; i < 300 && world.player.state !== 'alive'; i++) step({});
  };
  const fail = (msg) => {
    const p = world.player;
    throw new Error(`${def.name}: ${msg} at (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)})\n${trace.join('\n')}`);
  };

  for (const action of script) {
    if (world.state === 'won') break;
    if (action.echo) {
      step({ echo: true });
      waitRespawn();
      continue;
    }
    if (action.quiz !== undefined) {
      step({ interact: true });
      const t = world.nearTerminal;
      if (!t) fail('no terminal in reach');
      world.answerQuiz(t, action.quiz);
      waitRespawn();
      continue;
    }
    const target = action.toEcho !== undefined
      ? (() => {
          const e = world.echoes[action.toEcho < 0 ? world.echoes.length + action.toEcho : action.toEcho];
          if (!e) fail(`no echo ${action.toEcho}`);
          return [e.x, e.z];
        })()
      : action.to;
    const tol = action.tol ?? 0.12;
    const startDeaths = deathsSeen;
    let reached = false;
    for (let i = 0; i < 60 * 25; i++) {
      const p = world.player;
      if (p.state !== 'alive') {
        if (action.expectDeath) break;
        fail(`unexpected death (${p.cause}) going to ${target}`);
      }
      const dx = target[0] - p.x, dz = target[1] - p.z;
      const dist = Math.hypot(dx, dz);
      if (dist < tol && (!action.minY || p.y >= action.minY - 0.01) && p.onGround) { reached = true; break; }
      const s = Math.min(1, dist / 0.25) / (dist || 1);
      step({ mx: dx * s, mz: dz * s, jumpPressed: !!action.jump && p.onGround });
      if (world.state === 'won') { reached = true; break; }
    }
    if (action.expectDeath) {
      if (deathsSeen === startDeaths) fail(`expected a death going to ${target}`);
      waitRespawn();
    } else if (!reached) {
      fail(`could not reach ${target}${action.minY ? ` at height ${action.minY}` : ''}`);
    }
  }
  return { world, trace };
}
