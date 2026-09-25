import * as THREE from 'three';
import { createHeroMaterials, createEchoMaterials, ECHO_SLOT } from './palette.js';
import { createDlicomLogoGeometry } from './dlicomLogo.js';
import { applyPose, POSES } from './animations.js';

// Units are meters. The character stands on the origin, faces +Z (glTF forward),
// and its own right side is -X. Total height ~1.21 m.
export const HERO_DIMENSIONS = {
  height: 1.21,
  hipHeight: 0.3,
  helmetRadius: 0.31,
  collider: { type: 'capsule', radius: 0.3, height: 1.21, center: [0, 0.605, 0] },
};

const TORSO_Z_SCALE = 0.82;
const TORSO_PROFILE = [
  [0.0, -0.02], [0.12, -0.02], [0.14, 0.03], [0.15, 0.1], [0.148, 0.18],
  [0.138, 0.25], [0.11, 0.3], [0.06, 0.325], [0.0, 0.33],
];

function mesh(name, geometry, material, { castShadow = true } = {}) {
  const m = new THREE.Mesh(geometry, material);
  m.name = name;
  m.castShadow = castShadow;
  m.receiveShadow = true;
  return m;
}

function pivot(name, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(x, y, z);
  return g;
}

function torsoRadiusAt(y) {
  for (let i = 1; i < TORSO_PROFILE.length; i++) {
    const [r1, y1] = TORSO_PROFILE[i];
    const [r0, y0] = TORSO_PROFILE[i - 1];
    if (y <= y1) return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
  }
  return 0;
}

function createTorsoGeometry() {
  const curve = new THREE.SplineCurve(TORSO_PROFILE.map(([r, y]) => new THREE.Vector2(r, y)));
  const geo = new THREE.LatheGeometry(curve.getPoints(28), 40);
  geo.scale(1, 1, TORSO_Z_SCALE);
  return geo;
}

// The Dlicom logo replaces the "D" from the original artwork.
function createChestLogo(mat) {
  const y = 0.185;
  const r = torsoRadiusAt(y);
  const geo = createDlicomLogoGeometry({ width: 0.15, depth: 0.012, bevel: 0.003 });
  // Wrap the flat logo around the elliptical chest so it sits flush.
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const surface = TORSO_Z_SCALE * Math.sqrt(Math.max(r * r - x * x, 0));
    pos.setZ(i, pos.getZ(i) + surface - 0.004);
  }
  geo.computeVertexNormals();
  const logo = mesh('ChestLogo', geo, mat);
  logo.position.y = y;
  return logo;
}

function createChatBubbleGeometry() {
  const w = 0.34, h = 0.22, r = 0.08;
  const x0 = -w / 2, x1 = w / 2, y0 = -h / 2, y1 = h / 2;
  const s = new THREE.Shape();
  s.moveTo(x0 + r, y0);
  // Speech-bubble tail on the bottom edge, character's left (+X), like the artwork.
  s.lineTo(0.03, y0);
  s.quadraticCurveTo(0.075, y0 - 0.02, 0.085, y0 - 0.075);
  s.quadraticCurveTo(0.115, y0 - 0.02, 0.11, y0);
  s.lineTo(x1 - r, y0);
  s.quadraticCurveTo(x1, y0, x1, y0 + r);
  s.lineTo(x1, y1 - r);
  s.quadraticCurveTo(x1, y1, x1 - r, y1);
  s.lineTo(x0 + r, y1);
  s.quadraticCurveTo(x0, y1, x0, y1 - r);
  s.lineTo(x0, y0 + r);
  s.quadraticCurveTo(x0, y0, x0 + r, y0);
  const depth = 0.1;
  const geo = new THREE.ExtrudeGeometry(s, {
    depth, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.035, bevelSegments: 6, curveSegments: 16,
  });
  geo.translate(0, 0, -depth / 2);
  return { geo, frontZ: depth / 2 + 0.05 };
}

function diamondGeometry(size, depth) {
  const s = new THREE.Shape().moveTo(size, 0).lineTo(0, size * 1.15).lineTo(-size, 0).lineTo(0, -size * 1.15).closePath();
  return new THREE.ExtrudeGeometry(s, {
    depth, bevelEnabled: true, bevelThickness: depth * 0.5, bevelSize: size * 0.18, bevelSegments: 2,
  });
}

function createFaces(mats, frontZ) {
  const happy = pivot('Face_Happy', 0, 0, frontZ);
  // Diamond eyes echo the diamond at the center of the Dlicom mark.
  const eyeGeo = diamondGeometry(0.03, 0.006);
  const glintGeo = new THREE.SphereGeometry(0.008, 10, 8);
  for (const side of [-1, 1]) {
    const eye = mesh(side < 0 ? 'EyeR' : 'EyeL', eyeGeo, mats.face, { castShadow: false });
    eye.position.set(side * 0.068, 0.012, -0.002);
    happy.add(eye);
    const glint = mesh('Glint', glintGeo, mats.white, { castShadow: false });
    glint.position.set(side * 0.068 - 0.009, 0.026, 0.012);
    happy.add(glint);
  }
  const arc = Math.PI * 0.7;
  const smile = mesh('Smile', new THREE.TorusGeometry(0.02, 0.0055, 8, 20, arc), mats.face, { castShadow: false });
  smile.rotation.z = -Math.PI / 2 - arc / 2;
  smile.position.set(0, -0.028, 0.004);
  happy.add(smile);

  // Hidden via scale 0; the Death clip swaps faces and the Echo keeps this one.
  const shock = pivot('Face_Shock', 0, 0, frontZ);
  const ringGeo = new THREE.TorusGeometry(0.024, 0.008, 8, 24);
  const pupilGeo = new THREE.SphereGeometry(0.009, 10, 8);
  for (const side of [-1, 1]) {
    const eye = mesh(side < 0 ? 'ShockEyeR' : 'ShockEyeL', ringGeo, mats.face, { castShadow: false });
    eye.position.set(side * 0.07, 0.018, 0.003);
    shock.add(eye);
    const pupil = mesh('ShockPupil', pupilGeo, mats.face, { castShadow: false });
    pupil.position.set(side * 0.07, 0.018, 0.004);
    shock.add(pupil);
  }
  const mouth = mesh('ShockMouth', new THREE.TorusGeometry(0.015, 0.007, 8, 20), mats.face, { castShadow: false });
  mouth.scale.set(0.8, 1.1, 1);
  mouth.position.set(0, -0.038, 0.004);
  shock.add(mouth);
  shock.scale.setScalar(0);
  return [happy, shock];
}

function createHead(mats) {
  const head = pivot('Head', 0, 0.31, 0);
  const R = HERO_DIMENSIONS.helmetRadius;
  const helmetY = 0.29;
  const openTheta = Math.PI * 0.83;

  const bubble = createChatBubbleGeometry();
  const face = pivot('ChatHead', 0, helmetY, 0.02);
  face.add(mesh('ChatHeadMesh', bubble.geo, mats.head));
  face.add(...createFaces(mats, bubble.frontZ));
  head.add(face);

  const glass = mesh('HelmetGlass', new THREE.SphereGeometry(R, 56, 36, 0, Math.PI * 2, 0, openTheta), mats.glass, { castShadow: false });
  glass.position.y = helmetY;
  glass.renderOrder = 2;
  head.add(glass);

  const shine = mesh(
    'HelmetShine',
    new THREE.SphereGeometry(R * 1.004, 16, 8, Math.PI * 1.02, Math.PI * 0.32, Math.PI * 0.2, Math.PI * 0.14),
    mats.shine,
    { castShadow: false },
  );
  shine.position.y = helmetY;
  shine.renderOrder = 3;
  head.add(shine);

  const ring = mesh('HelmetRing', new THREE.TorusGeometry(R * Math.sin(openTheta), 0.026, 12, 40), mats.collar);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = helmetY + R * Math.cos(openTheta);
  head.add(ring);
  return head;
}

function createArm(mats, side) {
  const tag = side < 0 ? 'R' : 'L';
  const arm = pivot(`Arm${tag}`, side * 0.155, 0.255, 0);
  arm.add(mesh(`Shoulder${tag}`, new THREE.SphereGeometry(0.056, 16, 12), mats.suit));
  const upper = mesh(`UpperArm${tag}`, new THREE.CapsuleGeometry(0.048, 0.08, 6, 14), mats.suit);
  upper.position.y = -0.06;
  arm.add(upper);

  const fore = pivot(`Forearm${tag}`, 0, -0.12, 0);
  const foreMesh = mesh(`ForearmMesh${tag}`, new THREE.CapsuleGeometry(0.045, 0.06, 6, 14), mats.suit);
  foreMesh.position.y = -0.045;
  fore.add(foreMesh);

  const hand = pivot(`Hand${tag}`, 0, -0.115, 0);
  const palm = mesh(`Mitten${tag}`, new THREE.SphereGeometry(0.058, 16, 12), mats.glove);
  palm.scale.set(1, 1.1, 0.8);
  hand.add(palm);
  const thumb = mesh(`Thumb${tag}`, new THREE.CapsuleGeometry(0.02, 0.025, 4, 8), mats.glove);
  thumb.position.set(-side * 0.045, 0.012, 0.02);
  thumb.rotation.z = side * 0.9;
  hand.add(thumb);
  const cuff = mesh(`Cuff${tag}`, new THREE.TorusGeometry(0.046, 0.012, 8, 20), mats.collar);
  cuff.rotation.x = Math.PI / 2;
  cuff.position.y = 0.045;
  hand.add(cuff);
  fore.add(hand);
  arm.add(fore);
  return arm;
}

function createLeg(mats, side) {
  const tag = side < 0 ? 'R' : 'L';
  const leg = pivot(`Leg${tag}`, side * 0.075, 0, 0);
  const thigh = mesh(`LegMesh${tag}`, new THREE.CapsuleGeometry(0.064, 0.11, 6, 14), mats.suit);
  thigh.position.y = -0.1;
  leg.add(thigh);

  const bootProfile = [[0, 0], [0.075, 0], [0.087, 0.018], [0.087, 0.075], [0.08, 0.11], [0.07, 0.125], [0, 0.125]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  const bootGeo = new THREE.LatheGeometry(bootProfile, 24);
  bootGeo.scale(1, 1, 1.22);
  const boot = mesh(`Boot${tag}`, bootGeo, mats.white);
  boot.position.set(0, -HERO_DIMENSIONS.hipHeight, 0.012);
  leg.add(boot);
  return leg;
}

function createCapeGeometry() {
  const segU = 18, segV = 22;
  const topW = 0.26, botW = 0.62, length = 0.5, flare = 0.12;
  const positions = [], uvs = [], indices = [];
  for (let j = 0; j <= segV; j++) {
    const v = j / segV;
    const w = THREE.MathUtils.lerp(topW, botW, v);
    for (let i = 0; i <= segU; i++) {
      const u = i / segU;
      const k = 2 * u - 1;
      // Wraps behind the body, flares toward the character's left like the artwork, with soft folds.
      const x = w * (u - 0.5) + flare * v * v;
      const y = -length * v;
      const z = -0.03 - 0.16 * v + 0.06 * k * k - 0.05 * v * v + 0.018 * Math.sin(u * Math.PI * 5) * v;
      positions.push(x, y, z);
      uvs.push(u, 1 - v);
    }
  }
  for (let j = 0; j < segV; j++) {
    for (let i = 0; i < segU; i++) {
      const a = j * (segU + 1) + i, b = a + 1, c = a + segU + 1, d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds the Dli hero. Node names (Hips, Torso, Head, ArmR/L, ForearmR/L, LegR/L,
 * Cape, Face_Happy, Face_Shock) are the animation targets used by animations.js.
 */
export function createDliHero({ materials = createHeroMaterials() } = {}) {
  const root = new THREE.Group();
  root.name = 'DliHero';
  root.userData = { asset: 'dli-hero', collider: HERO_DIMENSIONS.collider, forward: '+Z', units: 'meters' };

  const hips = pivot('Hips', 0, HERO_DIMENSIONS.hipHeight, 0);
  root.add(hips);

  const torso = pivot('Torso');
  torso.add(mesh('TorsoMesh', createTorsoGeometry(), materials.suit));
  torso.add(createChestLogo(materials.logo));
  const belt = mesh('Belt', new THREE.TorusGeometry(0.143, 0.012, 8, 40), materials.collar);
  belt.rotation.x = Math.PI / 2;
  belt.scale.set(1, TORSO_Z_SCALE, 1);
  belt.position.y = 0.045;
  torso.add(belt);
  torso.add(createHead(materials));
  torso.add(createArm(materials, -1), createArm(materials, 1));

  const cape = pivot('Cape', 0, 0.27, -0.09);
  cape.add(mesh('CapeMesh', createCapeGeometry(), materials.cape));
  torso.add(cape);
  hips.add(torso);

  hips.add(createLeg(materials, -1), createLeg(materials, 1));
  applyPose(root, POSES.rest);
  return root;
}

/**
 * Echo: a frozen, crystallized copy of the hero. Pass a posed hero as `source` to
 * snapshot its exact pose at the moment of death; defaults to the Death clip's end pose.
 */
export function createDliEcho({ source, materials = createEchoMaterials() } = {}) {
  let echo;
  if (source) {
    echo = source.clone(true);
  } else {
    echo = createDliHero();
    applyPose(echo, POSES.echo);
    echo.getObjectByName('Face_Happy').removeFromParent();
  }
  echo.name = 'DliEcho';
  echo.userData = {
    asset: 'dli-echo',
    solid: true,
    // Heavier than the player so it keeps pressure plates held down.
    weight: 2,
    collider: { type: 'box', size: [0.62, 1.2, 0.5], center: [0, 0.6, 0] },
    forward: '+Z',
    units: 'meters',
  };
  echo.traverse((o) => {
    if (!o.isMesh) return;
    o.material = materials[ECHO_SLOT[o.material.name] ?? 'crystal'];
    o.castShadow = o.material.name !== 'EchoGlass';
  });
  return echo;
}
