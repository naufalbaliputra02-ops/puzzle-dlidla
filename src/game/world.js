// Pure game simulation (no rendering): level parsing, physics, Echo rules, puzzles.
// Coordinates: map column = x, map row = z (row 0 is the far side), y is up. 1 cell = 1 m.

export const WALL_H = 4.5;
export const PLAYER_HW = 0.28;
export const PLAYER_H = 1.15;
// Same footprint as the player, so an Echo left in a laser always covers the beam line.
export const ECHO_HW = PLAYER_HW;
export const ECHO_H = 1.2;
export const GRAVITY = 25;
export const JUMP_SPEED = 8.3; // apex ~1.38 m: clears 1 m blocks and Echoes, not 2 m ledges
export const MOVE_SPEED = 4.2;
export const DEATH_TIME = 1.2;
export const VOID_DEATH_TIME = 0.7;
export const TERMINAL_HW = 0.32;
export const TERMINAL_H = 1.1;
export const BEAM_H = 2.2;
export const TERMINAL_REACH = 1.2;

const EPS = 1e-5;
const SUBSTEP = 1 / 120;
const EMITTER_DIRS = { '>': [1, 0], '<': [-1, 0], v: [0, 1], m: [0, -1] };

export function parseLevel(def) {
  const d = def.map.length;
  const w = def.map[0].length;
  const cells = [];
  const plates = [], doors = [], terminals = [], emitters = [], checkpoints = [];
  let start = null, goal = null;

  def.map.forEach((row, r) => {
    if (row.length !== w) throw new Error(`${def.name}: row ${r} has length ${row.length}, expected ${w}`);
  });

  for (let r = 0; r < d; r++) {
    for (let c = 0; c < w; c++) {
      const ch = def.map[r][c];
      const hc = def.heights?.[r]?.[c];
      let h = hc && /\d/.test(hc) ? Number(hc) : 0;
      if (/[1-9]/.test(ch)) h = Number(ch);
      let type = 'floor';
      if (ch === '#' || EMITTER_DIRS[ch]) type = 'wall';
      else if (ch === '_') type = 'pit';
      const cell = { c, r, type, h: type === 'wall' ? WALL_H : h, spike: ch === '^' };
      cells.push(cell);

      const at = { c, r, x: c, z: r, h };
      if (EMITTER_DIRS[ch]) emitters.push({ ...at, dir: EMITTER_DIRS[ch] });
      else if (ch === 'S') start = { x: c, y: h, z: r };
      else if (ch === 'G') goal = { x: c, y: h, z: r };
      else if (ch === '*') checkpoints.push({ ...at, active: false });
      else if (/[a-f]/.test(ch)) plates.push({ ...at, id: ch.toUpperCase(), pressed: false });
      else if (/[A-F]/.test(ch)) doors.push({ ...at, id: ch, open: false, axis: 'x' });
      else if (ch === '?') {
        const door = def.terminals?.[terminals.length];
        if (!door) throw new Error(`${def.name}: terminal #${terminals.length + 1} has no door in "terminals"`);
        terminals.push({ ...at, index: terminals.length, door, solved: false });
      }
    }
  }
  if (!start || !goal) throw new Error(`${def.name}: needs S and G`);
  if ((def.terminals?.length ?? 0) !== terminals.length) throw new Error(`${def.name}: terminals list mismatch`);

  const cellAt = (c, r) => (c < 0 || r < 0 || c >= w || r >= d ? null : cells[r * w + c]);
  for (const door of doors) {
    if (!plates.some((p) => p.id === door.id) && !terminals.some((t) => t.door === door.id)) {
      throw new Error(`${def.name}: door ${door.id} has no plate or terminal`);
    }
    // Door panel runs along whichever axis its neighboring walls run.
    const left = cellAt(door.c - 1, door.r);
    door.axis = left && left.type === 'wall' ? 'x' : 'z';
  }
  return { def, w, d, cells, cellAt, start, goal, plates, doors, terminals, emitters, checkpoints };
}

export function starsFor(deaths, par) {
  if (deaths <= par) return 3;
  if (deaths <= par + 2) return 2;
  return 1;
}

function overlaps(b, x, y, z, hw, h) {
  return (
    x - hw < b.maxX - EPS && x + hw > b.minX + EPS &&
    z - hw < b.maxZ - EPS && z + hw > b.minZ + EPS &&
    y < b.maxY - EPS && y + h > b.minY + EPS
  );
}

export class World {
  constructor(def) {
    this.level = parseLevel(def);
    this.reset();
  }

  reset() {
    const L = this.level;
    L.plates.forEach((p) => (p.pressed = false));
    L.doors.forEach((d) => (d.open = false));
    L.terminals.forEach((t) => (t.solved = false));
    L.checkpoints.forEach((c) => (c.active = false));
    this.echoes = [];
    this.nextEchoId = 1;
    this.deaths = 0;
    this.time = 0;
    this.state = 'playing';
    this.events = [];
    this.beams = [];
    this.nearTerminal = null;
    this.respawnPoint = { ...L.start };
    this.player = this.newPlayer();
    this.updateTriggers(true);
    this.computeBeams();
  }

  get maxEchoes() {
    return this.level.def.maxEchoes ?? 5;
  }

  get par() {
    return this.level.def.par ?? 0;
  }

  newPlayer() {
    const p = {
      x: this.respawnPoint.x, y: this.respawnPoint.y, z: this.respawnPoint.z,
      vx: 0, vy: 0, vz: 0, facing: Math.PI, onGround: true,
      coyote: 0, jumpBuffer: 0, state: 'alive', deathTimer: 0, cause: null, leavesEcho: false,
    };
    // Never respawn inside an Echo someone left on the spawn point: stand on top of it.
    for (let i = 0; i < 10; i++) {
      const e = this.echoes.find((e) => overlaps(this.echoBox(e), p.x, p.y, p.z, PLAYER_HW, PLAYER_H));
      if (!e) break;
      p.y = e.y + ECHO_H;
    }
    return p;
  }

  drainEvents() {
    const ev = this.events;
    this.events = [];
    return ev;
  }

  emit(type, data = {}) {
    this.events.push({ type, ...data });
  }

  // --- collision geometry -------------------------------------------------

  echoBox(e) {
    return { minX: e.x - ECHO_HW, maxX: e.x + ECHO_HW, minZ: e.z - ECHO_HW, maxZ: e.z + ECHO_HW, minY: e.y, maxY: e.y + ECHO_H };
  }

  doorAt(c, r) {
    return this.level.doors.find((d) => d.c === c && d.r === r);
  }

  collectBoxes(x, z, exclude) {
    const L = this.level;
    const out = [];
    const c0 = Math.round(x), r0 = Math.round(z);
    for (let r = r0 - 2; r <= r0 + 2; r++) {
      for (let c = c0 - 2; c <= c0 + 2; c++) {
        const cell = L.cellAt(c, r);
        const top = cell ? (cell.type === 'pit' ? null : cell.h) : WALL_H;
        if (top === null) continue;
        out.push({ minX: c - 0.5, maxX: c + 0.5, minZ: r - 0.5, maxZ: r + 0.5, minY: -50, maxY: top });
      }
    }
    for (const t of L.terminals) {
      out.push({ minX: t.x - TERMINAL_HW, maxX: t.x + TERMINAL_HW, minZ: t.z - TERMINAL_HW, maxZ: t.z + TERMINAL_HW, minY: t.h, maxY: t.h + TERMINAL_H });
    }
    for (const d of L.doors) {
      if (!d.open) out.push({ minX: d.c - 0.5, maxX: d.c + 0.5, minZ: d.r - 0.5, maxZ: d.r + 0.5, minY: d.h, maxY: WALL_H });
    }
    for (const e of this.echoes) if (e !== exclude) out.push(this.echoBox(e));
    return out;
  }

  moveBody(body, hw, h, dx, dy, dz, exclude) {
    const boxes = this.collectBoxes(body.x, body.z, exclude);
    body.x += dx;
    for (const b of boxes) {
      if (!overlaps(b, body.x, body.y, body.z, hw, h)) continue;
      if (dx > 0) body.x = b.minX - hw;
      else if (dx < 0) body.x = b.maxX + hw;
    }
    body.z += dz;
    for (const b of boxes) {
      if (!overlaps(b, body.x, body.y, body.z, hw, h)) continue;
      if (dz > 0) body.z = b.minZ - hw;
      else if (dz < 0) body.z = b.maxZ + hw;
    }
    body.y += dy;
    let grounded = false;
    for (const b of boxes) {
      if (!overlaps(b, body.x, body.y, body.z, hw, h)) continue;
      if (dy <= 0) {
        body.y = b.maxY;
        grounded = true;
      } else {
        body.y = b.minY - h;
      }
      body.vy = 0;
    }
    return grounded;
  }

  // --- main update -------------------------------------------------------

  /**
   * input: { mx, mz, jump, jumpPressed, echo, shatter, interact } where mx/mz is the
   * desired move direction in world space (length <= 1). Pressed flags are edge-triggered.
   */
  update(dt, input = {}) {
    if (this.state !== 'playing') return;
    dt = Math.min(dt, 1 / 20);
    this.time += dt;
    const p = this.player;
    if (p.state === 'alive') {
      if (input.echo) this.kill('echo');
      else if (input.shatter && this.echoes.length) this.shatter(this.echoes[this.echoes.length - 1], 'manual');
      if (input.jumpPressed) p.jumpBuffer = 0.12;
    }
    const steps = Math.max(1, Math.ceil(dt / SUBSTEP - 1e-9));
    for (let i = 0; i < steps && this.state === 'playing'; i++) this.substep(dt / steps, input);

    this.nearTerminal = null;
    if (this.player.state === 'alive') {
      for (const t of this.level.terminals) {
        if (t.solved) continue;
        const dist = Math.hypot(t.x - this.player.x, t.z - this.player.z);
        if (dist < TERMINAL_REACH && Math.abs(this.player.y - t.h) < 0.7) this.nearTerminal = t;
      }
      if (input.interact && this.nearTerminal) this.emit('quiz', { terminal: this.nearTerminal });
    }
  }

  substep(dt, input) {
    const p = this.player;
    if (p.state === 'alive') {
      let mx = input.mx ?? 0, mz = input.mz ?? 0;
      const len = Math.hypot(mx, mz);
      if (len > 1) { mx /= len; mz /= len; }
      p.vx = mx * MOVE_SPEED;
      p.vz = mz * MOVE_SPEED;
      if (len > 0.1) p.facing = Math.atan2(mx, mz);

      p.coyote = p.onGround ? 0.1 : p.coyote - dt;
      p.jumpBuffer -= dt;
      if (p.jumpBuffer > 0 && p.coyote > 0) {
        p.vy = JUMP_SPEED;
        p.jumpBuffer = 0;
        p.coyote = 0;
        this.emit('jump');
      }
      p.vy = Math.max(p.vy - GRAVITY * dt, -30);
      p.onGround = this.moveBody(p, PLAYER_HW, PLAYER_H, p.vx * dt, p.vy * dt, p.vz * dt, null);
      this.checkHazards();
    } else if (p.state === 'dying') {
      p.deathTimer -= dt;
      if (p.cause === 'void') p.y -= 6 * dt;
      if (p.deathTimer <= 0) this.finishDeath();
    }

    for (const e of [...this.echoes]) {
      e.vy = Math.max(e.vy - GRAVITY * dt, -30);
      this.moveBody(e, ECHO_HW, ECHO_H, 0, e.vy * dt, 0, e);
      if (e.y < -6) {
        this.echoes.splice(this.echoes.indexOf(e), 1);
        this.emit('echoLost', { echo: e });
      }
    }
    this.updateTriggers(false);
    this.computeBeams();
  }

  checkHazards() {
    const p = this.player;
    const L = this.level;
    if (p.y < -3) return this.kill('void');

    const c0 = Math.round(p.x), r0 = Math.round(p.z);
    for (let r = r0 - 1; r <= r0 + 1; r++) {
      for (let c = c0 - 1; c <= c0 + 1; c++) {
        const cell = L.cellAt(c, r);
        if (!cell?.spike) continue;
        const inside = p.x + PLAYER_HW > c - 0.35 && p.x - PLAYER_HW < c + 0.35 && p.z + PLAYER_HW > r - 0.35 && p.z - PLAYER_HW < r + 0.35;
        if (inside && p.y < cell.h + 0.3) return this.kill('spikes');
      }
    }

    for (const b of this.beams) {
      if (p.y >= b.y1 || p.y + PLAYER_H <= b.y0) continue;
      const hit = b.dir[0] !== 0
        ? Math.abs(p.z - b.z0) < PLAYER_HW && p.x + PLAYER_HW > Math.min(b.x0, b.x1) && p.x - PLAYER_HW < Math.max(b.x0, b.x1)
        : Math.abs(p.x - b.x0) < PLAYER_HW && p.z + PLAYER_HW > Math.min(b.z0, b.z1) && p.z - PLAYER_HW < Math.max(b.z0, b.z1);
      if (hit) return this.kill('laser');
    }

    for (const cp of L.checkpoints) {
      if (!cp.active && Math.hypot(cp.x - p.x, cp.z - p.z) < 0.5 && Math.abs(p.y - cp.h) < 0.5) {
        L.checkpoints.forEach((o) => (o.active = false));
        cp.active = true;
        this.respawnPoint = { x: cp.x, y: cp.h, z: cp.z };
        this.emit('checkpoint', { checkpoint: cp });
      }
    }

    const g = L.goal;
    if (Math.hypot(g.x - p.x, g.z - p.z) < 0.4 && p.y >= g.y - 0.1 && p.y < g.y + 0.8) {
      this.state = 'won';
      this.emit('win', { deaths: this.deaths, time: this.time, stars: starsFor(this.deaths, this.par) });
    }
  }

  kill(cause) {
    const p = this.player;
    if (p.state !== 'alive') return;
    p.state = 'dying';
    p.cause = cause;
    // The void keeps nothing: falling out of the level is the one failure that leaves no Echo.
    p.leavesEcho = cause !== 'void';
    p.deathTimer = cause === 'void' ? VOID_DEATH_TIME : DEATH_TIME;
    p.vx = p.vz = 0;
    this.deaths++;
    this.emit('death', { cause, leavesEcho: p.leavesEcho });
  }

  finishDeath() {
    const p = this.player;
    if (p.leavesEcho) {
      const echo = { id: this.nextEchoId++, x: p.x, y: p.y, z: p.z, vy: 0, facing: p.facing };
      this.echoes.push(echo);
      this.emit('echo', { echo });
      if (this.echoes.length > this.maxEchoes) this.shatter(this.echoes[0], 'limit');
    }
    this.player = this.newPlayer();
    this.emit('respawn');
  }

  shatter(echo, reason) {
    const i = this.echoes.indexOf(echo);
    if (i < 0) return;
    this.echoes.splice(i, 1);
    this.emit('shatter', { echo, reason });
  }

  answerQuiz(terminal, correct) {
    if (correct) {
      terminal.solved = true;
      this.emit('solved', { terminal });
      this.updateTriggers(false);
    } else {
      this.kill('zap');
    }
  }

  // --- puzzle state ------------------------------------------------------

  bodies() {
    const list = this.echoes.map((e) => e);
    if (this.player.state === 'alive') list.push(this.player);
    return list;
  }

  updateTriggers(silent) {
    const L = this.level;
    const bodies = this.bodies();
    for (const plate of L.plates) {
      const pressed = bodies.some(
        (b) => Math.abs(b.x - plate.x) < 0.35 + PLAYER_HW && Math.abs(b.z - plate.z) < 0.35 + PLAYER_HW && b.y >= plate.h - 0.05 && b.y <= plate.h + 0.3,
      );
      if (pressed !== plate.pressed) {
        plate.pressed = pressed;
        if (!silent) this.emit('plate', { plate });
      }
    }
    for (const door of L.doors) {
      const plates = L.plates.filter((p) => p.id === door.id);
      const terms = L.terminals.filter((t) => t.door === door.id);
      let open = plates.every((p) => p.pressed) && terms.every((t) => t.solved);
      // Anti-crush: a door never closes on the player or an Echo standing in it.
      if (!open && door.open) {
        const box = { minX: door.c - 0.5, maxX: door.c + 0.5, minZ: door.r - 0.5, maxZ: door.r + 0.5, minY: door.h, maxY: WALL_H };
        if (bodies.some((b) => overlaps(box, b.x, b.y, b.z, PLAYER_HW, PLAYER_H))) open = true;
      }
      if (open !== door.open) {
        door.open = open;
        if (!silent) this.emit('door', { door });
      }
    }
  }

  computeBeams() {
    const L = this.level;
    this.beams = [];
    for (const em of L.emitters) {
      const [dx, dz] = em.dir;
      const first = L.cellAt(em.c + dx, em.r + dz);
      if (!first || first.type === 'wall') continue;
      const base = first.h;
      const sx = em.c + dx * 0.5, sz = em.r + dz * 0.5;
      const step = 0.05;
      let t = 0;
      for (; t < 40; t += step) {
        const px = sx + dx * (t + step), pz = sz + dz * (t + step);
        const c = Math.round(px), r = Math.round(pz);
        const cell = L.cellAt(c, r);
        if (!cell || cell.type === 'wall' || cell.h > base + 0.05) break;
        const door = this.doorAt(c, r);
        if (door && !door.open) break;
        if (L.terminals.some((tm) => Math.abs(px - tm.x) < TERMINAL_HW && Math.abs(pz - tm.z) < TERMINAL_HW)) break;
        if (this.echoes.some((e) => Math.abs(px - e.x) < ECHO_HW && Math.abs(pz - e.z) < ECHO_HW && e.y < base + BEAM_H && e.y + ECHO_H > base)) break;
      }
      this.beams.push({ emitter: em, dir: em.dir, x0: sx, z0: sz, x1: sx + dx * t, z1: sz + dz * t, y0: base, y1: base + BEAM_H });
    }
  }
}
