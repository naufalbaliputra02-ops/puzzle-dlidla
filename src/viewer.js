import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { createDliEcho } from './assets/dliHero.js';
import { createEchoMaterials } from './assets/palette.js';

// URL params for reproducible captures: ?focus=hero&clip=Wave&t=0.4&capture=1
const params = new URLSearchParams(location.search);
if (params.has('capture')) document.body.classList.add('capture');

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x070b24);
scene.fog = new THREE.Fog(0x070b24, 8, 18);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.7;

const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 50);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;

scene.add(new THREE.HemisphereLight(0x9cc8ff, 0x0a1030, 0.6));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(2.5, 5, 3.5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4 });
sun.shadow.bias = -0.0005;
scene.add(sun);
const rim = new THREE.DirectionalLight(0x2ecdd1, 1.4);
rim.position.set(-3, 2.5, -3);
scene.add(rim);

// --- Blockout level: floor tiles, a pressure plate and the door it opens ---
const tileMat = new THREE.MeshStandardMaterial({ color: 0x141d4a, roughness: 0.7 });
const tileMat2 = new THREE.MeshStandardMaterial({ color: 0x1a2660, roughness: 0.7 });
const tileGeo = new THREE.BoxGeometry(0.98, 0.3, 0.98);
for (let x = -3; x <= 3; x++) {
  for (let z = -2; z <= 1; z++) {
    const t = new THREE.Mesh(tileGeo, (x + z) % 2 ? tileMat : tileMat2);
    t.position.set(x, -0.15, z);
    t.receiveShadow = true;
    scene.add(t);
  }
}
const wall = new THREE.Mesh(new THREE.BoxGeometry(7, 2.4, 0.3), new THREE.MeshStandardMaterial({ color: 0x0e1640, roughness: 0.8 }));
wall.position.set(0, 1.2, -2.65);
wall.receiveShadow = true;
scene.add(wall);

const plateOn = new THREE.MeshStandardMaterial({ color: 0x2ecdd1, emissive: 0x2ecdd1, emissiveIntensity: 1.2 });
const plateOff = new THREE.MeshStandardMaterial({ color: 0x3a4a80, emissive: 0x2ecdd1, emissiveIntensity: 0.08 });
const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.06, 40), plateOff);
plate.position.set(1.2, 0.03, 0);
plate.receiveShadow = true;
scene.add(plate);

// Door slides down into the floor when the plate is held, revealing a glowing exit.
const frameMat = new THREE.MeshStandardMaterial({ color: 0x0b1440, roughness: 0.6 });
for (const [w, h, x, y] of [[0.15, 1.8, -2.375, 0.9], [0.15, 1.8, -1.225, 0.9], [1.3, 0.15, -1.8, 1.725]]) {
  const part = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.25), frameMat);
  part.position.set(x, y, -2.42);
  scene.add(part);
}
const exitGlow = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.65), new THREE.MeshBasicMaterial({ color: 0x2ecdd1 }));
exitGlow.position.set(-1.8, 0.825, -2.49);
scene.add(exitGlow);
const door = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.6, 0.12), new THREE.MeshStandardMaterial({ color: 0x1677f5, roughness: 0.4, metalness: 0.3 }));
door.position.set(-1.8, 0.8, -2.32);
door.castShadow = true;
scene.add(door);

const status = document.getElementById('status');
const loader = new GLTFLoader();
const [heroGltf, echoGltf, badgeGltf] = await Promise.all(
  ['dli-hero', 'dli-echo', 'dlicom-badge'].map((n) => loader.loadAsync(`${import.meta.env.BASE_URL}models/${n}.glb`)),
);

const enableShadows = (root) => root.traverse((o) => {
  if (o.isMesh) {
    o.castShadow = !o.material.transparent;
    o.receiveShadow = true;
  }
});

const hero = heroGltf.scene;
hero.position.set(-0.6, 0, 0.3);
hero.rotation.y = Number(params.get('yaw') ?? 0);
enableShadows(hero);
scene.add(hero);

const echoHome = echoGltf.scene;
echoHome.position.set(1.2, 0.03, 0);
echoHome.rotation.y = -0.4;
enableShadows(echoHome);
scene.add(echoHome);

const badge = badgeGltf.scene;
badge.position.set(0.6, 1.45, -2.48);
scene.add(badge);

const mixer = new THREE.AnimationMixer(hero);
const clips = Object.fromEntries(heroGltf.animations.map((c) => [c.name, c]));
let current;

function play(name, { fade = 0.25 } = {}) {
  const action = mixer.clipAction(clips[name]);
  const once = name === 'Jump' || name === 'Death';
  action.reset();
  action.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
  action.clampWhenFinished = once;
  if (current && current !== action) action.crossFadeFrom(current, fade, false);
  action.play();
  current = action;
  document.querySelectorAll('#clips button').forEach((b) => b.classList.toggle('active', b.textContent === name));
}

const clipRow = document.getElementById('clips');
for (const name of Object.keys(clips)) {
  const b = document.createElement('button');
  b.textContent = name;
  b.onclick = () => play(name);
  clipRow.append(b);
}

// --- Death -> Echo loop: freeze the hero's final pose into a solid Echo ---
const echoMaterials = createEchoMaterials();
const echoes = [];
let dying = false;

function updatePuzzle() {
  const pressed = [echoHome, ...echoes].some((e) => e.visible && e.position.distanceTo(plate.position) < 0.5);
  plate.material = pressed ? plateOn : plateOff;
  plate.position.y = pressed ? 0.015 : 0.03;
  door.userData.target = pressed ? -0.85 : 0.8;
  status.textContent = `${echoes.length} Echo${echoes.length === 1 ? '' : 'es'} left behind · plate ${pressed ? 'HELD' : 'free'}`;
}

document.getElementById('die').onclick = () => {
  if (dying) return;
  dying = true;
  play('Death', { fade: 0.1 });
};

mixer.addEventListener('finished', (e) => {
  if (e.action.getClip().name === 'Jump') return play('Idle');
  if (e.action.getClip().name !== 'Death') return;
  const echo = createDliEcho({ source: hero, materials: echoMaterials });
  echo.position.copy(hero.position);
  scene.add(echo);
  echoes.push(echo);
  if (echoes.length > 4) scene.remove(echoes.shift());
  // Respawn a step to the side (away from the plate) so the new Echo stays visible.
  hero.position.x -= 0.8;
  if (hero.position.x < -2.5) hero.position.x = -0.6;
  dying = false;
  play('Idle', { fade: 0 });
  updatePuzzle();
});

document.getElementById('clear').onclick = () => {
  echoes.splice(0).forEach((e) => scene.remove(e));
  hero.position.set(-0.6, 0, 0.3);
  updatePuzzle();
};

// --- Camera focus presets ---
const FOCUS = {
  scene: { pos: [0.2, 2.4, 5.2], target: [0, 0.6, -0.5] },
  hero: { pos: () => hero.position.clone().add(new THREE.Vector3(0.2, 0.75, 2.4)), target: () => hero.position.clone().setY(0.62) },
  echo: { pos: [2.0, 1.25, 2.3], target: [1.2, 0.68, 0] },
  badge: { pos: [0.7, 1.55, -1.2], target: [0.6, 1.45, -2.48] },
};
function focus(name) {
  const f = FOCUS[name] ?? FOCUS.scene;
  const v = (x) => (typeof x === 'function' ? x() : new THREE.Vector3(...x));
  camera.position.copy(v(f.pos));
  controls.target.copy(v(f.target));
  controls.update();
}
document.querySelectorAll('[data-focus]').forEach((b) => (b.onclick = () => focus(b.dataset.focus)));

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

const startClip = params.get('clip') ?? 'Wave';
play(clips[startClip] ? startClip : 'Wave', { fade: 0 });
focus(params.get('focus') ?? 'scene');
updatePuzzle();
door.position.y = door.userData.target;

const freezeAt = params.has('t') ? Number(params.get('t')) : null;
if (freezeAt !== null) mixer.setTime(freezeAt);

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (freezeAt === null) mixer.update(dt);
  door.position.y += (door.userData.target - door.position.y) * Math.min(dt * 4, 1);
  badge.rotation.y = Math.sin(clock.elapsedTime * 0.8) * 0.25;
  controls.update();
  renderer.render(scene, camera);
});
window.__ready = true;
