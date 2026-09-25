import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { World } from './world.js';
import { LEVELS } from './levels.js';
import { QuizDeck } from './quiz.js';
import { GameScene, LETTER_COLORS } from './scene.js';
import logo from '../assets/dlicomLogoData.js';

const $ = (sel) => document.querySelector(sel);
const params = new URLSearchParams(location.search);
const SAVE_KEY = 'dli-echoes-progress-v1';

// --- progress ----------------------------------------------------------
const progress = (() => {
  try {
    return { unlocked: 1, stars: {}, ...JSON.parse(localStorage.getItem(SAVE_KEY) || '{}') };
  } catch {
    return { unlocked: 1, stars: {} };
  }
})();
const saveProgress = () => localStorage.setItem(SAVE_KEY, JSON.stringify(progress));

// --- logo --------------------------------------------------------------
function logoSvg() {
  const path = (pts) => 'M' + pts.map(([x, y]) => `${x} ${-y}`).join('L') + 'Z';
  const { cx, cy, r } = logo.diamond;
  const diamond = `M${cx + r} ${-cy}L${cx} ${-cy - r}L${cx - r} ${-cy}L${cx} ${-cy + r}Z`;
  return `<svg viewBox="-1.15 -1.15 2.3 2.3" aria-label="Dlicom"><rect x="-1.15" y="-1.15" width="2.3" height="2.3" rx="0.45" fill="#0b1440"/>
    <path fill="#fff" d="${logo.blades.map(path).join('')}${diamond}"/></svg>`;
}
document.querySelectorAll('[data-logo]').forEach((el) => (el.innerHTML = logoSvg()));

// --- screens -----------------------------------------------------------
const screens = ['loading', 'title', 'levels', 'howto', 'quiz', 'pause', 'complete'];
let screen = 'loading';
let returnTo = 'title';
function show(name) {
  for (const s of screens) $(`#${s}`).classList.toggle('show', s === name);
  screen = name;
  const inGame = name === null || ['quiz', 'pause', 'complete'].includes(name) || (name === 'howto' && world);
  $('#hud').classList.toggle('hidden', !inGame || !world);
  $('#touch').classList.toggle('hidden', name !== null || !isTouch);
  if (name === 'levels') renderLevelGrid();
}
const playing = () => screen === null && world && world.state === 'playing';

// --- game state --------------------------------------------------------
let scene, world = null, levelIndex = 0;
const deck = new QuizDeck();
let quiz = null;

function startLevel(i) {
  levelIndex = Math.max(0, Math.min(i, LEVELS.length - 1));
  world = new World(LEVELS[levelIndex]);
  scene.loadLevel(world);
  $('#hud-level').textContent = `Level ${levelIndex + 1} · ${LEVELS[levelIndex].name}`;
  $('#hud-par').textContent = world.par;
  $('#hud-max').textContent = world.maxEchoes;
  $('#toasts').innerHTML = '';
  show(null);
  showHint();
  history.replaceState(null, '', `?level=${levelIndex + 1}`);
}

let hintTimer;
function showHint() {
  const el = $('#hint');
  el.textContent = LEVELS[levelIndex].hint;
  el.classList.add('show');
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => el.classList.remove('show'), 9000);
}

function toast(text, kind = '') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = text;
  $('#toasts').append(el);
  setTimeout(() => el.classList.add('out'), 2200);
  setTimeout(() => el.remove(), 2700);
}

const DEATH_TEXT = {
  spikes: 'Spiked! Your Echo stays behind.',
  laser: 'Lasered! Your Echo blocks the beam now.',
  zap: 'ZAP! Wrong answer. An Echo is left here.',
  echo: 'Echo left behind.',
  void: 'Lost to the void. The void keeps no Echo.',
};
const QUOTES = [
  'Every failure became part of the path.',
  'Your Echoes are proud of you.',
  'Fail forward. Literally.',
  'Crystal clear thinking.',
];

function handleEvents(events) {
  scene.handleEvents(events);
  for (const e of events) {
    if (e.type === 'death') toast(DEATH_TEXT[e.cause] ?? 'Ouch!', e.cause === 'echo' ? 'info' : 'bad');
    else if (e.type === 'shatter' && e.reason === 'limit') toast(`Echo limit (${world.maxEchoes}) reached: your oldest Echo shattered.`, 'warn');
    else if (e.type === 'shatter') toast('Echo shattered.', 'info');
    else if (e.type === 'door') toast(`Door ${e.door.id} ${e.door.open ? 'opened' : 'closed'}`, e.door.open ? 'good' : 'info');
    else if (e.type === 'checkpoint') toast('Checkpoint reached!', 'good');
    else if (e.type === 'quiz') openQuiz(e.terminal);
    else if (e.type === 'win') onWin(e);
  }
}

// --- quiz --------------------------------------------------------------
function openQuiz(terminal) {
  const q = deck.next();
  quiz = { terminal, q, answered: false };
  const color = `#${LETTER_COLORS[terminal.door].toString(16).padStart(6, '0')}`;
  $('#quiz-door').textContent = `Door ${terminal.door}`;
  $('#quiz-door').style.background = color;
  $('#quiz-cat').textContent = q.cat;
  $('#quiz-q').textContent = q.q;
  $('#quiz-feedback').textContent = '';
  $('#quiz-feedback').className = 'feedback';
  const box = $('#quiz-choices');
  box.innerHTML = '';
  q.c.forEach((text, i) => {
    const b = document.createElement('button');
    b.innerHTML = `<kbd>${i + 1}</kbd> ${text}`;
    b.onclick = () => answerQuiz(i);
    box.append(b);
  });
  show('quiz');
}

function answerQuiz(i) {
  if (!quiz || quiz.answered) return;
  quiz.answered = true;
  const correct = i === quiz.q.a;
  const buttons = [...$('#quiz-choices').children];
  buttons[quiz.q.a].classList.add('right');
  if (!correct) buttons[i].classList.add('wrong');
  const fb = $('#quiz-feedback');
  fb.textContent = correct ? `Correct! Door ${quiz.terminal.door} unlocked.` : `Wrong! The answer was "${quiz.q.c[quiz.q.a]}".`;
  fb.className = `feedback ${correct ? 'good' : 'bad'}`;
  const { terminal } = quiz;
  setTimeout(() => {
    quiz = null;
    show(null);
    world.answerQuiz(terminal, correct);
  }, correct ? 900 : 1500);
}

// --- win ---------------------------------------------------------------
function onWin(e) {
  const key = String(levelIndex);
  progress.stars[key] = Math.max(progress.stars[key] ?? 0, e.stars);
  progress.unlocked = Math.max(progress.unlocked, Math.min(LEVELS.length, levelIndex + 2));
  saveProgress();
  const last = levelIndex === LEVELS.length - 1;
  setTimeout(() => {
    $('#complete-name').textContent = LEVELS[levelIndex].name;
    $('#complete-stars').innerHTML = [1, 2, 3].map((n) => `<span class="${n <= e.stars ? 'on' : ''}">★</span>`).join('');
    $('#complete-stats').innerHTML = `Deaths: <b>${e.deaths}</b> (par ${world.par}) · Time: <b>${e.time.toFixed(1)}s</b>`;
    $('#complete-quote').textContent = last ? 'You beat every level! Try for ⭐⭐⭐ everywhere.' : QUOTES[levelIndex % QUOTES.length];
    $('[data-action="next"]').textContent = last ? 'Back to Levels' : 'Next Level';
    show('complete');
  }, 1100);
}

function renderLevelGrid() {
  const grid = $('#level-grid');
  grid.innerHTML = '';
  LEVELS.forEach((def, i) => {
    const locked = i >= progress.unlocked && !params.has('unlock');
    const stars = progress.stars[i] ?? 0;
    const b = document.createElement('button');
    b.className = `level ${locked ? 'locked' : ''}`;
    b.disabled = locked;
    b.innerHTML = `<span class="num">${locked ? '🔒' : i + 1}</span><span class="name">${def.name}</span>
      <span class="st">${[1, 2, 3].map((n) => (n <= stars ? '★' : '☆')).join('')}</span>`;
    b.onclick = () => startLevel(i);
    grid.append(b);
  });
}

// --- menu actions ------------------------------------------------------
const actions = {
  play: () => startLevel(Math.min(progress.unlocked - 1, LEVELS.length - 1)),
  levels: () => show('levels'),
  howto: () => { returnTo = screen === 'pause' || screen === null ? 'pause' : screen; show('howto'); },
  back: () => show(returnTo === 'pause' && !world ? 'title' : returnTo),
  title: () => { world = null; show('title'); },
  pause: () => playing() && show('pause'),
  resume: () => show(null),
  restart: () => startLevel(levelIndex),
  next: () => (levelIndex === LEVELS.length - 1 ? show('levels') : startLevel(levelIndex + 1)),
  hint: () => showHint(),
  'quiz-cancel': () => { if (quiz && !quiz.answered) { quiz = null; show(null); } },
};
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (el) actions[el.dataset.action]?.();
});

// --- input -------------------------------------------------------------
const isTouch = matchMedia('(pointer: coarse)').matches || params.has('touch');
const held = new Set();
const pressed = new Set();
const KEYMAP = {
  KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  Space: 'jump', KeyR: 'echo', KeyX: 'shatter', KeyE: 'interact', Enter: 'interact',
};
addEventListener('keydown', (e) => {
  if (screen === 'quiz') {
    const n = Number(e.key);
    if (n >= 1 && n <= 4) answerQuiz(n - 1);
    if (e.code === 'Escape') actions['quiz-cancel']();
    return;
  }
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (screen === null) actions.pause();
    else if (screen === 'pause') actions.resume();
    else if (screen === 'howto') actions.back();
    return;
  }
  if (screen === 'complete' && e.code === 'Enter') return actions.next();
  const k = KEYMAP[e.code];
  if (!k || screen !== null) return;
  e.preventDefault();
  if (!held.has(k)) pressed.add(k);
  held.add(k);
});
addEventListener('keyup', (e) => held.delete(KEYMAP[e.code]));
addEventListener('blur', () => held.clear());

document.querySelectorAll('#touch [data-key]').forEach((b) => {
  const k = b.dataset.key;
  const down = (e) => { e.preventDefault(); if (!held.has(k)) pressed.add(k); held.add(k); b.classList.add('down'); };
  const up = (e) => { e.preventDefault(); held.delete(k); b.classList.remove('down'); };
  b.addEventListener('pointerdown', down);
  b.addEventListener('pointerup', up);
  b.addEventListener('pointercancel', up);
  b.addEventListener('pointerleave', up);
});

function readInput() {
  const mx = (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0);
  const mz = (held.has('down') ? 1 : 0) - (held.has('up') ? 1 : 0);
  const input = {
    mx, mz,
    jump: held.has('jump'),
    jumpPressed: pressed.has('jump'),
    echo: pressed.has('echo'),
    shatter: pressed.has('shatter'),
    interact: pressed.has('interact'),
  };
  pressed.clear();
  return input;
}

// --- boot --------------------------------------------------------------
const canvas = $('#game');
const loader = new GLTFLoader();
const base = import.meta.env.BASE_URL;
const [heroGltf, badgeGltf] = await Promise.all([
  loader.loadAsync(`${base}models/dli-hero.glb`),
  loader.loadAsync(`${base}models/dlicom-badge.glb`),
]);
scene = new GameScene(canvas, { heroGltf, badgeGltf });

function resize() {
  scene.resize(innerWidth, innerHeight);
}
addEventListener('resize', resize);
resize();

// Title background: a live demo room behind the menu.
world = new World(LEVELS[0]);
scene.loadLevel(world);
world = null;

const startParam = Number(params.get('level'));
if (startParam >= 1 && startParam <= LEVELS.length && (startParam <= progress.unlocked || params.has('unlock'))) startLevel(startParam - 1);
else show('title');

const clock = new THREE.Clock();
let lastEchoCount = -1;
loop();
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (world) {
    if (playing()) world.update(dt, readInput());
    else pressed.clear();
    handleEvents(world.drainEvents());
    $('#hud-deaths').textContent = world.deaths;
    $('#hud-time').textContent = world.time.toFixed(1);
    if (world.echoes.length !== lastEchoCount) {
      lastEchoCount = world.echoes.length;
      $('#hud-echoes').textContent = lastEchoCount;
    }
    $('#prompt').classList.toggle('hidden', !(playing() && world.nearTerminal));
  }
  scene.frame(dt);
}

// Test/automation hook.
window.__game = { get world() { return world; }, get quiz() { return quiz; }, startLevel, answerQuiz, show, get screen() { return screen; } };
window.__ready = true;
