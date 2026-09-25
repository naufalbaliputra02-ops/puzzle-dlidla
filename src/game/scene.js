import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { createDliEcho } from '../assets/dliHero.js';
import { createEchoMaterials } from '../assets/palette.js';
import { WALL_H, TERMINAL_HW, TERMINAL_H, BEAM_H } from './world.js';

export const LETTER_COLORS = { A: 0x2ecdd1, B: 0xffa630, C: 0xff5fa2, D: 0x9be34a, E: 0xa07bff, F: 0xffe14d };
const WALL_VIS = 1.4;
const BEAM_VIS = BEAM_H;
const CAMERA_OFFSET = new THREE.Vector3(0, 7.2, 6.4);

function labelTexture(text, color, { bg = null, size = 128, font = 'bold 84px system-ui, sans-serif' } = {}) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d');
  if (bg) {
    g.fillStyle = bg;
    g.fillRect(0, 0, size, size);
  }
  g.fillStyle = color;
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, size / 2, size / 2 + 4);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;

export class GameScene {
  constructor(canvas, { heroGltf, badgeGltf }) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x060a22);
    this.scene.fog = new THREE.Fog(0x060a22, 14, 30);
    this.scene.environment = new THREE.PMREMGenerator(this.renderer).fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.55;

    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 80);
    this.camTarget = new THREE.Vector3();

    this.scene.add(new THREE.HemisphereLight(0xa8ccff, 0x10183a, 0.75));
    this.sun = new THREE.DirectionalLight(0xffffff, 2.1);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 0.5, far: 40 });
    this.sun.shadow.bias = -0.0006;
    this.scene.add(this.sun, this.sun.target);
    const rim = new THREE.DirectionalLight(0x2ecdd1, 0.9);
    rim.position.set(-4, 3, -6);
    this.scene.add(rim);

    this.badgeSource = badgeGltf.scene;
    this.echoMaterials = createEchoMaterials();
    this.setupHero(heroGltf);
    this.levelGroup = null;
    this.effects = [];
  }

  setupHero(gltf) {
    this.hero = gltf.scene;
    this.hero.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = !o.material.transparent;
        o.receiveShadow = true;
      }
    });
    this.scene.add(this.hero);
    this.mixer = new THREE.AnimationMixer(this.hero);
    this.actions = {};
    for (const clip of gltf.animations) {
      let c = clip;
      // In the air the physics already lifts the body; drop the clip's own hip lift.
      if (clip.name === 'Jump') {
        c = clip.clone();
        c.tracks = c.tracks.filter((t) => t.name !== 'Hips.position');
      }
      this.actions[clip.name] = this.mixer.clipAction(c);
    }
    const once = (a) => { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; };
    once(this.actions.Death);
    this.actions.Jump.play();
    this.actions.Jump.paused = true;
    this.actions.Jump.enabled = false;
    this.current = null;
    this.play('Idle', 0);
  }

  play(name, fade = 0.15) {
    const next = this.actions[name];
    if (this.current === next) return;
    next.enabled = true;
    next.reset();
    if (name === 'Jump') {
      next.time = 0.42; // the airborne pose
      next.paused = true;
    }
    next.setEffectiveWeight(1);
    next.play();
    if (this.current && fade > 0) next.crossFadeFrom(this.current, fade, false);
    else if (this.current) this.current.stop();
    this.current = next;
  }

  // --- level construction ----------------------------------------------

  loadLevel(world) {
    if (this.levelGroup) {
      this.scene.remove(this.levelGroup);
      this.levelGroup.traverse((o) => {
        if (o.isMesh && !o.userData.shared) o.geometry?.dispose();
      });
    }
    this.world = world;
    const L = world.level;
    const group = new THREE.Group();
    this.levelGroup = group;
    this.scene.add(group);
    this.echoObjects = new Map();
    this.effects = [];

    this.wallVis = WALL_VIS;

    const box = new THREE.BoxGeometry(1, 1, 1);
    const mats = {
      floorA: new THREE.MeshStandardMaterial({ color: 0x1a2766, roughness: 0.75 }),
      floorB: new THREE.MeshStandardMaterial({ color: 0x15205a, roughness: 0.75 }),
      raised: new THREE.MeshStandardMaterial({ color: 0x3550b8, roughness: 0.6 }),
      wall: new THREE.MeshStandardMaterial({ color: 0x0c1438, roughness: 0.85 }),
      wallTop: new THREE.MeshStandardMaterial({ color: 0x2a6cff, emissive: 0x2a6cff, emissiveIntensity: 0.5 }),
    };
    const instanced = (mat, cells, fn) => {
      if (!cells.length) return;
      const m = new THREE.InstancedMesh(box, mat, cells.length);
      const tmp = new THREE.Object3D();
      cells.forEach((cell, i) => {
        fn(cell, tmp);
        tmp.updateMatrix();
        m.setMatrixAt(i, tmp.matrix);
      });
      m.receiveShadow = true;
      m.castShadow = true;
      group.add(m);
      return m;
    };

    const floors = L.cells.filter((c) => c.type === 'floor');
    const bottom = -2;
    const setColumn = (top) => (cell, o) => {
      o.position.set(cell.c, (top(cell) + bottom) / 2, cell.r);
      o.scale.set(1, top(cell) - bottom, 1);
    };
    instanced(mats.floorA, floors.filter((c) => c.h === 0 && (c.c + c.r) % 2 === 0), setColumn((c) => c.h));
    instanced(mats.floorB, floors.filter((c) => c.h === 0 && (c.c + c.r) % 2 === 1), setColumn((c) => c.h));
    instanced(mats.raised, floors.filter((c) => c.h > 0), setColumn((c) => c.h));
    const walls = L.cells.filter((c) => c.type === 'wall');
    // Walls always rise a bit above the highest neighboring floor so ledges stay enclosed.
    this.walls = walls.map((cell) => {
      let near = 0;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const n = L.cellAt(cell.c + dc, cell.r + dr);
        if (n?.type === 'floor') near = Math.max(near, n.h);
      }
      const full = Math.max(WALL_VIS, near + 0.8);
      return { cell, full, vis: full };
    });
    this.wallMesh = instanced(mats.wall, walls, () => {});
    this.wallTopMesh = instanced(mats.wallTop, walls, () => {});
    this.wallTopMesh && (this.wallTopMesh.castShadow = false);
    this.updateWalls(0, true);

    // Raised block edges glow so ledge heights read clearly.
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x7fb4ff, transparent: true, opacity: 0.5 });
    for (const cell of floors.filter((c) => c.h > 0)) {
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 0.001, 1)), edgeMat);
      e.position.set(cell.c, cell.h + 0.002, cell.r);
      group.add(e);
    }

    this.buildSpikes(L, group);
    this.buildPlates(L, group);
    this.buildDoors(L, group);
    this.buildTerminals(L, group);
    this.buildLasers(L, group);
    this.buildCheckpoints(L, group);
    this.buildGoal(L, group);

    const p = world.player;
    this.hero.position.set(p.x, p.y, p.z);
    this.hero.rotation.y = p.facing;
    this.hero.scale.setScalar(1);
    this.hero.visible = true;
    this.play('Idle', 0);
    this.camTarget.set(p.x, p.y + 0.6, p.z - 0.8);
    this.updateCamera(1);
    this.sync(0);
  }

  buildSpikes(L, group) {
    const spikes = L.cells.filter((c) => c.spike);
    if (!spikes.length) return;
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x2a0f2a, roughness: 0.6 });
    const spikeMat = new THREE.MeshStandardMaterial({ color: 0xd9dde8, metalness: 0.8, roughness: 0.25, emissive: 0xff2050, emissiveIntensity: 0.15 });
    const cone = new THREE.ConeGeometry(0.13, 0.42, 6);
    const cones = new THREE.InstancedMesh(cone, spikeMat, spikes.length * 4);
    const bases = new THREE.InstancedMesh(new THREE.BoxGeometry(0.94, 0.04, 0.94), baseMat, spikes.length);
    const o = new THREE.Object3D();
    spikes.forEach((cell, i) => {
      o.position.set(cell.c, cell.h + 0.02, cell.r);
      o.scale.setScalar(1);
      o.updateMatrix();
      bases.setMatrixAt(i, o.matrix);
      [[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]].forEach(([dx, dz], k) => {
        o.position.set(cell.c + dx, cell.h + 0.23, cell.r + dz);
        o.updateMatrix();
        cones.setMatrixAt(i * 4 + k, o.matrix);
      });
    });
    cones.castShadow = true;
    bases.receiveShadow = true;
    group.add(cones, bases);
  }

  buildPlates(L, group) {
    this.plateObjects = L.plates.map((plate) => {
      const color = LETTER_COLORS[plate.id];
      const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.15, roughness: 0.4 });
      const g = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.48, 0.05, 40), new THREE.MeshStandardMaterial({ color: 0x0b1440 }));
      ring.position.y = 0.025;
      ring.receiveShadow = true;
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.4, 0.08, 40), mat);
      pad.receiveShadow = true;
      const label = new THREE.Mesh(
        new THREE.PlaneGeometry(0.42, 0.42),
        new THREE.MeshBasicMaterial({ map: labelTexture(plate.id, '#0b1440'), transparent: true, depthWrite: false }),
      );
      label.rotation.x = -Math.PI / 2;
      label.position.y = 0.045;
      pad.add(label);
      g.add(ring, pad);
      g.position.set(plate.x, plate.h, plate.z);
      group.add(g);
      return { plate, pad, mat };
    });
  }

  buildDoors(L, group) {
    this.doorObjects = L.doors.map((door) => {
      const color = LETTER_COLORS[door.id];
      const g = new THREE.Group();
      g.position.set(door.c, door.h, door.r);
      if (door.axis === 'z') g.rotation.y = Math.PI / 2;
      const panel = new THREE.Group();
      const slab = new THREE.Mesh(
        new THREE.BoxGeometry(0.98, this.wallVis, 0.5),
        new THREE.MeshStandardMaterial({ color: 0x14205c, roughness: 0.35, metalness: 0.4 }),
      );
      slab.position.y = this.wallVis / 2;
      slab.castShadow = slab.receiveShadow = true;
      const stripMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.1 });
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.08, 0.52), stripMat);
      strip.position.y = this.wallVis - 0.18;
      const labelMat = new THREE.MeshBasicMaterial({ map: labelTexture(door.id, hex(color)), transparent: true });
      for (const side of [1, -1]) {
        const label = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.55), labelMat);
        label.position.set(0, this.wallVis * 0.5, side * 0.26);
        if (side < 0) label.rotation.y = Math.PI;
        panel.add(label);
      }
      panel.add(slab, strip);
      g.add(panel);
      group.add(g);
      return { door, panel, amount: door.open ? 1 : 0 };
    });
  }

  buildTerminals(L, group) {
    this.terminalObjects = L.terminals.map((t) => {
      const color = LETTER_COLORS[t.door];
      const g = new THREE.Group();
      g.position.set(t.x, t.h, t.z);
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(TERMINAL_HW * 2, TERMINAL_H - 0.15, TERMINAL_HW * 2),
        new THREE.MeshStandardMaterial({ color: 0x1b2a78, roughness: 0.4, metalness: 0.3 }),
      );
      body.position.y = (TERMINAL_H - 0.15) / 2;
      body.castShadow = body.receiveShadow = true;
      const trim = new THREE.Mesh(
        new THREE.BoxGeometry(TERMINAL_HW * 2 + 0.02, 0.06, TERMINAL_HW * 2 + 0.02),
        new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.9 }),
      );
      trim.position.y = 0.25;
      const screenMat = new THREE.MeshBasicMaterial({ map: labelTexture('?', '#ffffff', { bg: hex(color) }) });
      const head = new THREE.Group();
      head.position.y = TERMINAL_H - 0.1;
      const screen = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.42, 0.06), [
        ...Array(4).fill(new THREE.MeshStandardMaterial({ color: 0x0b1440 })), screenMat, screenMat,
      ]);
      head.add(screen);
      g.add(body, trim, head);
      group.add(g);
      return { terminal: t, head, screenMat, color, solvedShown: false };
    });
  }

  buildLasers(L, group) {
    const emitterMat = new THREE.MeshStandardMaterial({ color: 0xff2a4a, emissive: 0xff2a4a, emissiveIntensity: 1.5 });
    for (const em of L.emitters) {
      const lens = new THREE.Mesh(new THREE.BoxGeometry(0.1, BEAM_VIS, 0.7), emitterMat);
      const [dx, dz] = em.dir;
      const first = L.cellAt(em.c + dx, em.r + dz);
      lens.position.set(em.c + dx * 0.5, (first?.h ?? 0) + BEAM_VIS / 2, em.r + dz * 0.5);
      if (dz !== 0) lens.rotation.y = Math.PI / 2;
      group.add(lens);
    }
    this.beamObjects = L.emitters.map(() => {
      const g = new THREE.Group();
      const curtain = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 0.04),
        new THREE.MeshBasicMaterial({ color: 0xff3355, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }),
      );
      const lines = [];
      for (let i = 0; i < 5; i++) {
        const line = new THREE.Mesh(
          new THREE.BoxGeometry(1, 0.03, 0.03),
          new THREE.MeshBasicMaterial({ color: 0xffb0bd, blending: THREE.AdditiveBlending, transparent: true }),
        );
        lines.push(line);
        g.add(line);
      }
      g.add(curtain);
      group.add(g);
      return { g, curtain, lines };
    });
  }

  buildCheckpoints(L, group) {
    this.checkpointObjects = L.checkpoints.map((cp) => {
      const mat = new THREE.MeshStandardMaterial({ color: 0x6f7bb0, emissive: 0x2ecdd1, emissiveIntensity: 0.1 });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.05, 10, 40), mat);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(cp.x, cp.h + 0.05, cp.z);
      group.add(ring);
      return { cp, mat, ring };
    });
  }

  buildGoal(L, group) {
    const g = new THREE.Group();
    g.position.set(L.goal.x, L.goal.y, L.goal.z);
    const ringMat = new THREE.MeshStandardMaterial({ color: 0x2ecdd1, emissive: 0x2ecdd1, emissiveIntensity: 1.4 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.06, 12, 48), ringMat);
    ring.position.y = 0.75;
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(0.4, 40),
      new THREE.MeshBasicMaterial({ color: 0x9ff8ff, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }),
    );
    disc.position.y = 0.75;
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.48, 0.06, 40), ringMat);
    pad.position.y = 0.03;
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 0.4, 3, 32, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x2ecdd1, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }),
    );
    beam.position.y = 1.5;
    const light = new THREE.PointLight(0x2ecdd1, 6, 5);
    light.position.y = 1;
    // The Dlicom brand badge floats above every exit.
    const badge = this.badgeSource.clone(true);
    badge.scale.setScalar(0.7);
    badge.position.y = 1.85;
    g.add(ring, disc, pad, beam, light, badge);
    group.add(g);
    this.goal = { g, ring, disc, badge };
  }

  // --- runtime ---------------------------------------------------------

  // Cutaway: walls between the camera and the player sink so the hero is never hidden.
  updateWalls(dt, instant = false) {
    if (!this.wallMesh) return;
    const p = this.world.player;
    const o = new THREE.Object3D();
    const k = instant ? 1 : Math.min(1, dt * 10);
    this.walls.forEach((w, i) => {
      const { c, r } = w.cell;
      const inFront = r > p.z + 0.4 && r - p.z < 3.2 && Math.abs(c - p.x) < 2.6;
      w.vis += ((inFront ? 0.3 : w.full) - w.vis) * k;
      o.position.set(c, (w.vis - 2) / 2, r);
      o.scale.set(1, w.vis + 2, 1);
      o.updateMatrix();
      this.wallMesh.setMatrixAt(i, o.matrix);
      o.position.set(c, w.vis + 0.02, r);
      o.scale.set(1.001, 0.04, 1.001);
      o.updateMatrix();
      this.wallTopMesh.setMatrixAt(i, o.matrix);
    });
    this.wallMesh.instanceMatrix.needsUpdate = true;
    this.wallTopMesh.instanceMatrix.needsUpdate = true;
  }

  handleEvents(events) {
    for (const e of events) {
      if (e.type === 'death') {
        this.play('Death', 0.08);
        if (e.cause === 'laser' || e.cause === 'zap') this.flash(0xff3355);
      } else if (e.type === 'echo') {
        this.spawnEcho(e.echo);
      } else if (e.type === 'respawn') {
        this.play('Idle', 0);
        this.hero.scale.setScalar(0.01);
        this.effects.push({ t: 0, dur: 0.3, fn: (k) => this.hero.scale.setScalar(Math.max(0.01, easeOutBack(k))) });
      } else if (e.type === 'shatter' || e.type === 'echoLost') {
        this.removeEcho(e.echo);
      } else if (e.type === 'win') {
        this.play('Wave', 0.2);
      }
    }
  }

  spawnEcho(echo) {
    // Snapshot the exact final Death pose, regardless of any crossfade still in progress.
    const death = this.actions.Death;
    for (const a of Object.values(this.actions)) if (a !== death) a.stop();
    death.enabled = true;
    death.setEffectiveWeight(1);
    death.play();
    death.time = death.getClip().duration;
    this.mixer.update(0);
    this.current = death;
    const obj = createDliEcho({ source: this.hero, materials: this.echoMaterials });
    obj.position.set(echo.x, echo.y, echo.z);
    obj.rotation.set(0, echo.facing, 0);
    obj.scale.setScalar(1);
    obj.visible = true;
    this.levelGroup.add(obj);
    this.echoObjects.set(echo.id, obj);
    const light = new THREE.PointLight(0x7fe9ff, 8, 3);
    light.position.y = 0.8;
    obj.add(light);
    this.effects.push({
      t: 0, dur: 0.6,
      fn: (k) => {
        obj.scale.setScalar(1 + 0.25 * (1 - k) * Math.sin(k * Math.PI * 3));
        light.intensity = 8 * (1 - k) + 0.6;
      },
    });
  }

  removeEcho(echo) {
    const obj = this.echoObjects.get(echo.id);
    if (!obj) return;
    this.echoObjects.delete(echo.id);
    this.effects.push({
      t: 0, dur: 0.35,
      fn: (k) => {
        obj.scale.setScalar(1 - k);
        obj.rotation.y += 0.3;
        if (k >= 1) this.levelGroup.remove(obj);
      },
    });
  }

  flash(color) {
    const light = new THREE.PointLight(color, 25, 5);
    light.position.copy(this.hero.position).add(new THREE.Vector3(0, 0.8, 0.4));
    this.levelGroup.add(light);
    this.effects.push({ t: 0, dur: 0.4, fn: (k) => { light.intensity = 25 * (1 - k); if (k >= 1) this.levelGroup.remove(light); } });
  }

  sync(dt) {
    const w = this.world;
    const p = w.player;
    const t = performance.now() / 1000;

    this.hero.position.set(p.x, p.y, p.z);
    let dr = p.facing - this.hero.rotation.y;
    dr = Math.atan2(Math.sin(dr), Math.cos(dr));
    this.hero.rotation.y += dr * Math.min(1, dt * 14);
    this.updateWalls(dt);

    if (w.state === 'won') this.play('Wave', 0.2);
    else if (p.state === 'dying') {
      if (this.current !== this.actions.Death) this.play('Death', 0.08);
    } else if (!p.onGround) this.play('Jump', 0.1);
    else if (Math.hypot(p.vx, p.vz) > 0.3) this.play('Run', 0.12);
    else this.play('Idle', 0.2);
    this.mixer.update(dt);

    for (const e of w.echoes) this.echoObjects.get(e.id)?.position.set(e.x, e.y, e.z);

    for (const o of this.plateObjects) {
      const target = o.plate.pressed ? -0.03 : 0.04;
      o.pad.position.y += (target - o.pad.position.y) * Math.min(1, dt * 12);
      o.mat.emissiveIntensity = o.plate.pressed ? 1.2 : 0.15;
    }
    for (const o of this.doorObjects) {
      o.amount += ((o.door.open ? 1 : 0) - o.amount) * Math.min(1, dt * 6);
      o.panel.position.y = -o.amount * (this.wallVis + 0.05);
      o.panel.visible = o.amount < 0.98;
    }
    for (const o of this.terminalObjects) {
      if (o.terminal.solved && !o.solvedShown) {
        o.screenMat.map = labelTexture('✓', '#ffffff', { bg: '#1faa59' });
        o.solvedShown = true;
      }
      o.head.rotation.x = -0.35;
      o.head.position.y = TERMINAL_H - 0.1 + (o.terminal.solved ? 0 : Math.sin(t * 3) * 0.02);
      const near = w.nearTerminal === o.terminal;
      o.head.scale.setScalar(near ? 1.1 : 1);
    }
    w.beams.forEach((b, i) => {
      const o = this.beamObjects[i];
      const len = Math.max(0.001, Math.hypot(b.x1 - b.x0, b.z1 - b.z0));
      o.g.position.set((b.x0 + b.x1) / 2, 0, (b.z0 + b.z1) / 2);
      o.g.rotation.y = b.dir[0] !== 0 ? 0 : Math.PI / 2;
      o.curtain.scale.set(len, BEAM_VIS, 1);
      o.curtain.position.y = b.y0 + BEAM_VIS / 2;
      o.curtain.material.opacity = 0.28 + Math.sin(t * 20) * 0.06;
      o.lines.forEach((line, k) => {
        line.scale.x = len;
        line.position.y = b.y0 + 0.15 + (k * (BEAM_VIS - 0.3)) / 4;
      });
    });
    for (const o of this.checkpointObjects) {
      o.mat.emissiveIntensity = o.cp.active ? 1.4 : 0.1;
      o.mat.color.set(o.cp.active ? 0x2ecdd1 : 0x6f7bb0);
    }
    this.goal.ring.rotation.y = t * 1.5;
    this.goal.disc.rotation.y = t * 1.5;
    this.goal.badge.rotation.y = Math.sin(t) * 0.6;
    this.goal.badge.position.y = 1.85 + Math.sin(t * 2) * 0.06;

    this.effects = this.effects.filter((fx) => {
      fx.t += dt;
      const k = Math.min(1, fx.t / fx.dur);
      fx.fn(k);
      return k < 1;
    });
  }

  updateCamera(k) {
    const p = this.world.player;
    const want = new THREE.Vector3(p.x, p.y * 0.7 + 0.6, p.z - 0.8);
    this.camTarget.lerp(want, k);
    this.camera.position.copy(this.camTarget).add(CAMERA_OFFSET);
    this.camera.lookAt(this.camTarget);
    this.sun.position.copy(this.camTarget).add(new THREE.Vector3(3, 8, 4));
    this.sun.target.position.copy(this.camTarget);
  }

  resize(w, h) {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Keep narrow (portrait) screens showing the whole room width.
    this.camera.fov = w / h < 1 ? 58 : 40;
    this.camera.updateProjectionMatrix();
  }

  frame(dt) {
    this.sync(dt);
    this.updateCamera(Math.min(1, dt * 5));
    this.renderer.render(this.scene, this.camera);
  }
}


function easeOutBack(k) {
  const c = 1.7;
  return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2);
}
