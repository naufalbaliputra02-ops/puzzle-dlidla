import * as THREE from 'three';

// Rigid node animation (no skinning): each clip keys the rotation/position/scale of
// named pivot nodes, which exports cleanly to glTF and plays in any engine.
const REST = {
  Hips: { pos: [0, 0.3, 0], rot: [0, 0, 0] },
  Torso: { rot: [0, 0, 0] },
  Head: { rot: [0, 0, 0] },
  ArmR: { rot: [0, 0, -0.18] },
  ForearmR: { rot: [0, 0, -0.1] },
  ArmL: { rot: [0, 0, 0.18] },
  ForearmL: { rot: [0, 0, 0.1] },
  LegR: { rot: [0, 0, 0] },
  LegL: { rot: [0, 0, 0] },
  Cape: { rot: [0.08, 0, 0] },
  Face_Happy: { scale: 1 },
  Face_Shock: { scale: 0 },
};

const pose = (overrides) => {
  const out = structuredClone(REST);
  for (const [k, v] of Object.entries(overrides)) out[k] = { ...out[k], ...v };
  return out;
};

export const POSES = {
  rest: REST,
  // Final pose of the Death clip; the Echo is frozen in it. Arms up, legs braced:
  // reads as a solid "pillar" the player can stand on or wedge into machinery.
  echo: pose({
    Hips: { pos: [0, 0.285, 0] },
    Torso: { rot: [-0.1, 0, 0] },
    Head: { rot: [-0.18, 0, 0] },
    ArmR: { rot: [0, 0, -2.55] },
    ForearmR: { rot: [0, 0, -0.35] },
    ArmL: { rot: [0, 0, 2.55] },
    ForearmL: { rot: [0, 0, 0.35] },
    LegR: { rot: [0, 0, -0.16] },
    LegL: { rot: [0, 0, 0.16] },
    Cape: { rot: [0.3, 0, 0.12] },
    Face_Happy: { scale: 0 },
    Face_Shock: { scale: 1 },
  }),
};

const euler = new THREE.Euler();
const quat = new THREE.Quaternion();

export function applyPose(root, p) {
  for (const [name, t] of Object.entries(p)) {
    const node = root.getObjectByName(name);
    if (!node) continue;
    if (t.pos) node.position.fromArray(t.pos);
    if (t.rot) node.rotation.set(...t.rot);
    if (t.scale !== undefined) node.scale.setScalar(t.scale);
  }
}

/** keys: [{ t, pose }] where each pose is a full pose object (see REST). */
function clipFromKeys(name, keys) {
  const duration = keys[keys.length - 1].t;
  const times = keys.map((k) => k.t);
  const tracks = [];
  for (const node of Object.keys(REST)) {
    const first = keys[0].pose[node];
    if (first.rot) {
      const values = keys.flatMap((k) => quat.setFromEuler(euler.set(...k.pose[node].rot)).toArray());
      tracks.push(new THREE.QuaternionKeyframeTrack(`${node}.quaternion`, times, values));
    }
    if (first.pos) {
      tracks.push(new THREE.VectorKeyframeTrack(`${node}.position`, times, keys.flatMap((k) => k.pose[node].pos)));
    }
    if (first.scale !== undefined) {
      const values = keys.flatMap((k) => Array(3).fill(k.pose[node].scale));
      tracks.push(new THREE.VectorKeyframeTrack(`${node}.scale`, times, values));
    }
  }
  return new THREE.AnimationClip(name, duration, tracks);
}

const loop = (name, duration, steps, fn) =>
  clipFromKeys(name, Array.from({ length: steps + 1 }, (_, i) => ({ t: (duration * i) / steps, pose: fn((i / steps) * Math.PI * 2) })));

export function createHeroAnimations() {
  const idle = loop('Idle', 2.4, 12, (a) => pose({
    Hips: { pos: [0, 0.3 - 0.006 * (1 - Math.cos(a)), 0] },
    Head: { rot: [0.03 * Math.sin(a), 0, 0.04 * Math.sin(a)] },
    ArmR: { rot: [0.05 * Math.sin(a), 0, -0.18 - 0.04 * Math.sin(a)] },
    ArmL: { rot: [-0.05 * Math.sin(a), 0, 0.18 + 0.04 * Math.sin(a)] },
    Cape: { rot: [0.08 + 0.04 * Math.sin(a + 1), 0, 0.03 * Math.sin(a)] },
  }));

  // Matches the source artwork: right arm out to the side, forearm up, hand waving.
  const wave = loop('Wave', 1.6, 16, (a) => pose({
    Hips: { pos: [0, 0.3, 0], rot: [0, 0.12, 0] },
    Torso: { rot: [0, 0, -0.04] },
    Head: { rot: [0, 0.1, 0.08 + 0.03 * Math.sin(a)] },
    ArmR: { rot: [0.15, 0, -1.9] },
    ForearmR: { rot: [0, 0, -0.7 + 0.3 * Math.sin(a * 2)] },
    ArmL: { rot: [0.1, 0, 0.3] },
    Cape: { rot: [0.12 + 0.04 * Math.sin(a), 0, 0.1] },
  }));

  const run = loop('Run', 0.6, 12, (a) => {
    const s = Math.sin(a);
    return pose({
      Hips: { pos: [0, 0.3 + 0.025 * Math.abs(Math.cos(a)), 0], rot: [0, 0.08 * s, 0] },
      Torso: { rot: [0.18, -0.1 * s, 0] },
      Head: { rot: [-0.12, 0.06 * s, 0] },
      ArmR: { rot: [0.9 * s, 0, -0.25] },
      ForearmR: { rot: [-0.7, 0, -0.1] },
      ArmL: { rot: [-0.9 * s, 0, 0.25] },
      ForearmL: { rot: [-0.7, 0, 0.1] },
      LegR: { rot: [-0.75 * s, 0, 0] },
      LegL: { rot: [0.75 * s, 0, 0] },
      Cape: { rot: [0.95 + 0.12 * Math.sin(a * 2), 0, 0.06 * s] },
    });
  });

  const crouch = pose({
    Hips: { pos: [0, 0.26, 0] }, Torso: { rot: [0.25, 0, 0] },
    ArmR: { rot: [0.6, 0, -0.3] }, ArmL: { rot: [0.6, 0, 0.3] },
    LegR: { rot: [-0.35, 0, 0] }, LegL: { rot: [-0.35, 0, 0] }, Cape: { rot: [0.2, 0, 0] },
  });
  const air = pose({
    Hips: { pos: [0, 0.62, 0] }, Torso: { rot: [-0.08, 0, 0] }, Head: { rot: [-0.15, 0, 0] },
    ArmR: { rot: [-0.3, 0, -2.6] }, ArmL: { rot: [-0.3, 0, 2.6] },
    LegR: { rot: [-0.5, 0, 0] }, LegL: { rot: [0.3, 0, 0] }, Cape: { rot: [-0.25, 0, 0] },
  });
  const jump = clipFromKeys('Jump', [
    { t: 0, pose: REST }, { t: 0.12, pose: crouch }, { t: 0.42, pose: air }, { t: 0.72, pose: crouch }, { t: 0.9, pose: REST },
  ]);

  const flinch = pose({
    Hips: { pos: [0, 0.3, -0.03] }, Torso: { rot: [0.35, 0, 0] }, Head: { rot: [0.3, 0, 0] },
    ArmR: { rot: [0.9, 0, -0.5] }, ForearmR: { rot: [-1.2, 0, 0] },
    ArmL: { rot: [0.9, 0, 0.5] }, ForearmL: { rot: [-1.2, 0, 0] },
    LegR: { rot: [-0.2, 0, -0.05] }, LegL: { rot: [-0.2, 0, 0.05] }, Cape: { rot: [0.5, 0, 0] },
    Face_Happy: { scale: 0 }, Face_Shock: { scale: 1 },
  });
  // Flinch, then snap into the Echo pose and hold. The game swaps in Echo materials at the end.
  const death = clipFromKeys('Death', [
    { t: 0, pose: REST }, { t: 0.15, pose: flinch }, { t: 0.55, pose: flinch }, { t: 0.8, pose: POSES.echo }, { t: 1.2, pose: POSES.echo },
  ]);

  return [idle, wave, run, jump, death];
}
