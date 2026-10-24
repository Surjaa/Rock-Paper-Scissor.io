/*
  Rock Paper Scissors 3D
  Rules kept from the original script.js:
  - 3-second timer per round; no move chosen counts as a lost round
  - ties do not score
  - first to 10 points wins the match
  Look: procedurally built 3D rock, paper and scissors on a reflective arena with bloom.
  Sound: music and effects synthesised with the Web Audio API (no audio files).
*/
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { create } from 'jss';
import preset from 'jss-preset-default';

/* ------------------------------------------------------------------ */
/* Constants and helpers                                               */
/* ------------------------------------------------------------------ */
const CHOICES = ['rock', 'paper', 'scissors'];
const NAMES = { rock: 'Rock', paper: 'Paper', scissors: 'Scissors', none: 'nothing' };
const POINTS_TO_WIN = 10;
const KEY_MAP = { 1: 'rock', r: 'rock', 2: 'paper', p: 'paper', 3: 'scissors', s: 'scissors' };
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const damp = (current, target, lambda, dt) =>
  THREE.MathUtils.lerp(current, target, 1 - Math.exp(-lambda * dt));

/* ------------------------------------------------------------------ */
/* Design tokens: one dark arena look, set explicitly on every colour  */
/* ------------------------------------------------------------------ */
const THEME = {
  bg: '#06080d',
  surface: '#10141e',
  surface2: '#171d2b',
  text: '#f2f4f8',
  muted: '#9aa4b5',
  primary: '#ff7a45',
  onPrimary: '#1a0e08',
  primarySoft: '#2b1a14',
  accent: '#7cc0ff',
  border: 'rgba(255, 255, 255, 0.1)',
  success: '#4ee2a0',
  danger: '#ff8a7a',
  stage: '#05070b',
};

const tokenCss = `
:root {
  --font-display: 'Outfit', system-ui, sans-serif;
  --font-body: 'Inter', system-ui, sans-serif;
  --bs-body-font-family: var(--font-body);
  --bs-body-bg: var(--bg);
  --bs-body-color: var(--text);
  ${Object.entries(THEME).map(([k, v]) => `--${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}: ${v};`).join(' ')}
  color-scheme: dark;
}
body {
  margin: 0;
  min-height: 100vh;
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-body);
}
@keyframes pop {
  from { transform: translateX(-50%) scale(1.3); }
  to { transform: translateX(-50%) scale(1); }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}
`;
const tokenEl = document.createElement('style');
tokenEl.id = 'theme-tokens';
tokenEl.textContent = tokenCss;
document.head.append(tokenEl);

/* ------------------------------------------------------------------ */
/* JSS component styles. Bootstrap handles layout and the grid.        */
/* ------------------------------------------------------------------ */
const btnBase = {
  fontFamily: 'var(--font-display)',
  fontWeight: 700,
  cursor: 'pointer',
  transition:
    'transform 0.25s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.25s ease, border-color 0.25s ease, background-color 0.25s ease',
  '&:focus-visible': { outline: '3px solid var(--accent)', outlineOffset: '3px' },
};

const styles = {
  eyebrow: {
    fontSize: '0.78rem',
    fontWeight: 600,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: 'var(--muted)',
  },
  title: {
    fontFamily: 'var(--font-display)',
    fontWeight: 800,
    fontSize: 'clamp(1.7rem, 4vw, 2.6rem)',
    lineHeight: 1.05,
    letterSpacing: '-0.015em',
    margin: '0.25rem 0 0',
  },
  scoreCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '2px',
    height: '100%',
    padding: '0.6rem 0.4rem',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 14,
    '@media (min-width: 768px)': { padding: '0.85rem 0.5rem' },
  },
  scoreLabel: {
    fontSize: '0.7rem',
    fontWeight: 600,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: 'var(--muted)',
  },
  scoreValue: {
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: 'clamp(1.5rem, 4vw, 2.1rem)',
    lineHeight: 1.1,
  },
  stageCard: {
    position: 'relative',
    height: 'clamp(270px, 56vw, 480px)',
    overflow: 'hidden',
    borderRadius: 20,
    background: 'radial-gradient(ellipse at 50% 35%, #1b2436 0%, var(--stage) 70%)',
    border: '1px solid var(--border)',
    boxShadow: '0 22px 50px rgba(0, 0, 0, 0.45), inset 0 0 80px rgba(0, 0, 0, 0.5)',
    '& canvas': { display: 'block', width: '100%', height: '100%', cursor: 'grab', touchAction: 'none' },
  },
  timerBadge: {
    position: 'absolute',
    top: 14,
    left: '50%',
    transform: 'translateX(-50%)',
    minWidth: '7.5rem',
    padding: '0.35rem 1rem',
    borderRadius: 999,
    background: 'rgba(255, 255, 255, 0.1)',
    backdropFilter: 'blur(6px)',
    color: '#ffffff',
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: '1.1rem',
    textAlign: 'center',
    pointerEvents: 'none',
  },
  tickOn: { animation: 'pop 0.35s ease-out' },
  stageLabels: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 12,
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    color: '#ffffff',
    textAlign: 'center',
    fontWeight: 600,
    fontSize: '0.9rem',
    letterSpacing: '0.04em',
    textShadow: '0 1px 8px rgba(0, 0, 0, 0.6)',
    pointerEvents: 'none',
  },
  webglFallback: {
    position: 'absolute',
    inset: 0,
    display: 'grid',
    placeItems: 'center',
    padding: '1.5rem',
    textAlign: 'center',
    color: '#e8ecf4',
    fontSize: '0.95rem',
  },
  resultLine: {
    minHeight: '2.2rem',
    margin: '0.75rem 0 0',
    fontWeight: 600,
    fontSize: '1.02rem',
    textAlign: 'center',
  },
  resultWin: { color: 'var(--success)' },
  resultLose: { color: 'var(--danger)' },
  resultTie: { color: 'var(--accent)' },
  controls: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.7rem',
    marginTop: '0.5rem',
  },
  panel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.9rem',
    height: '100%',
    padding: '1.25rem',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 20,
  },
  panelTitle: {
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: '1.15rem',
    margin: 0,
    color: 'var(--text)',
  },
  statusText: { margin: 0, color: 'var(--muted)', fontSize: '0.95rem', lineHeight: 1.5 },
  primaryBtn: {
    ...btnBase,
    display: 'block',
    width: '100%',
    padding: '0.85rem 1rem',
    border: 'none',
    borderRadius: 12,
    background: 'var(--primary)',
    color: 'var(--on-primary)',
    fontSize: '1.05rem',
    '&:hover:not(:disabled)': { opacity: 0.92, transform: 'scale(1.01)' },
    '&:active:not(:disabled)': { transform: 'scale(0.99)' },
    '&:disabled': { opacity: 0.55, cursor: 'not-allowed' },
  },
  chipBtn: {
    ...btnBase,
    padding: '0.35rem 0.85rem',
    borderRadius: 999,
    border: '1px solid var(--border)',
    background: 'var(--surface2)',
    color: 'var(--text)',
    fontFamily: 'var(--font-body)',
    fontWeight: 600,
    fontSize: '0.85rem',
    '&[aria-pressed="false"]': { color: 'var(--muted)' },
    '&:hover': { borderColor: 'var(--accent)' },
  },
  history: {
    flex: '1 1 auto',
    margin: 0,
    paddingLeft: '1.2rem',
    maxHeight: '16rem',
    overflowY: 'auto',
    fontSize: '0.88rem',
    color: 'var(--muted)',
    '& li': { marginBottom: '4px' },
  },
  choiceBtn: {
    ...btnBase,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.3rem',
    padding: '0.8rem 0.4rem',
    border: '2px solid var(--border)',
    borderRadius: 16,
    background: 'var(--surface)',
    color: 'var(--text)',
    '& svg': { width: 'clamp(36px, 9vw, 60px)', height: 'auto', color: 'var(--primary)' },
    '&:hover': { borderColor: 'var(--primary)', transform: 'scale(1.01)' },
    '&:active': { transform: 'scale(0.99)' },
    '&[aria-pressed="true"]': {
      borderColor: 'var(--primary)',
      background: 'var(--primary-soft)',
      boxShadow: '0 0 24px rgba(255, 122, 69, 0.25)',
    },
  },
  choiceName: {
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: 'clamp(0.9rem, 2.6vw, 1.1rem)',
  },
  choiceKey: { fontSize: '0.72rem', color: 'var(--muted)' },
  modalCard: {
    background: 'var(--surface)',
    color: 'var(--text)',
    border: '1px solid var(--border)',
    borderRadius: 20,
  },
};

const jss = create(preset());
const sheet = jss.createStyleSheet(styles).attach();
document.querySelectorAll('[data-jss]').forEach((node) => {
  node.classList.add(sheet.classes[node.dataset.jss]);
});
const toneClass = {
  win: sheet.classes.resultWin,
  lose: sheet.classes.resultLose,
  tie: sheet.classes.resultTie,
};

/* ------------------------------------------------------------------ */
/* Sound: synthesised music loop and effects (Web Audio, no files)     */
/* ------------------------------------------------------------------ */
const sound = (() => {
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const BPM = 92;
  const STEP = 60 / BPM / 4; // one sixteenth note
  // Four-bar loop in A minor: Am7, Fmaj7, Cmaj7, G. Notes are MIDI numbers.
  const CHORDS = [
    { bass: 45, notes: [57, 60, 64, 67] },
    { bass: 41, notes: [53, 57, 60, 64] },
    { bass: 36, notes: [60, 64, 67, 71] },
    { bass: 43, notes: [55, 59, 62, 66] },
  ];

  let ctx = null;
  let master, musicBus, sfxBus, echoIn, noiseBuf;
  let enabled = true;
  let timer = null;
  let nextTime = 0;
  let step = 0;

  function init() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = enabled ? 0.8 : 0;
    master.connect(ctx.destination);

    musicBus = ctx.createGain();
    musicBus.gain.value = 0;
    musicBus.connect(master);

    sfxBus = ctx.createGain();
    sfxBus.gain.value = 0.7;
    sfxBus.connect(master);

    // Dotted echo for the arpeggio
    echoIn = ctx.createDelay(2);
    echoIn.delayTime.value = STEP * 3;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.35;
    const wet = ctx.createGain();
    wet.gain.value = 0.25;
    echoIn.connect(feedback);
    feedback.connect(echoIn);
    echoIn.connect(wet);
    wet.connect(musicBus);

    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return true;
  }

  function resumeCtx() {
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  function setEnv(gainNode, t, peak, attack, decay) {
    gainNode.gain.setValueAtTime(0.0001, t);
    gainNode.gain.exponentialRampToValueAtTime(peak, t + attack);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  function kick(t) {
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    const g = ctx.createGain();
    setEnv(g, t, 0.9, 0.003, 0.32);
    o.connect(g);
    g.connect(musicBus);
    o.start(t);
    o.stop(t + 0.4);
  }

  function noiseHit(t, { type = 'bandpass', freq = 1800, sweepTo, q = 0.8, peak = 0.2, dur = 0.15, bus }) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t);
    if (sweepTo) filter.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    filter.Q.value = q;
    const g = ctx.createGain();
    setEnv(g, t, peak, 0.002, dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(bus || musicBus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  function bassNote(t, midi) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = mtof(midi);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(900, t);
    filter.frequency.exponentialRampToValueAtTime(260, t + 0.25);
    const g = ctx.createGain();
    setEnv(g, t, 0.22, 0.004, 0.3);
    o.connect(filter);
    filter.connect(g);
    g.connect(musicBus);
    o.start(t);
    o.stop(t + 0.36);
  }

  function pad(t, notes, dur) {
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1100;
    filter.Q.value = 0.4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.08, t + 0.9);
    g.gain.setValueAtTime(0.08, t + dur - 0.9);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.4);
    filter.connect(g);
    g.connect(musicBus);
    notes.forEach((m, i) => {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = mtof(m);
      o.detune.value = (i - 1.5) * 7;
      o.connect(filter);
      o.start(t);
      o.stop(t + dur + 0.5);
    });
  }

  function arp(t, midi) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = mtof(midi);
    const g = ctx.createGain();
    setEnv(g, t, 0.09, 0.004, 0.22);
    o.connect(g);
    g.connect(musicBus);
    g.connect(echoIn);
    o.start(t);
    o.stop(t + 0.3);
  }

  function scheduleStep(n, t) {
    const s = n % 16;
    const bar = Math.floor(n / 16) % 4;
    const chord = CHORDS[bar];
    if (s === 0) pad(t, chord.notes, 16 * STEP);
    if (s === 0 || s === 10) kick(t);
    if (s === 4 || s === 12) noiseHit(t, { freq: 1900, q: 0.9, peak: 0.16, dur: 0.14 });
    if (s % 2 === 0) noiseHit(t, { type: 'highpass', freq: 7500, q: 0.5, peak: s % 4 === 2 ? 0.05 : 0.03, dur: 0.045 });
    if (s === 0 || s === 6 || s === 8 || s === 14) bassNote(t, chord.bass);
    if (s % 2 === 0) {
      const idx = (s / 2 + bar) % 4;
      const octave = s % 8 === 4 ? 12 : 0;
      arp(t, chord.notes[idx] + octave);
    }
  }

  function startMusic() {
    if (!init()) return;
    resumeCtx();
    if (timer) return;
    musicBus.gain.cancelScheduledValues(ctx.currentTime);
    musicBus.gain.setTargetAtTime(0.5, ctx.currentTime, 0.4);
    nextTime = ctx.currentTime + 0.12;
    step = 0;
    timer = setInterval(() => {
      while (nextTime < ctx.currentTime + 0.15) {
        scheduleStep(step, nextTime);
        nextTime += STEP;
        step += 1;
      }
    }, 25);
  }

  function stopMusic() {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
    musicBus.gain.setTargetAtTime(0, ctx.currentTime, 0.6);
  }

  function beep(t0, { freq, to, type = 'triangle', dur = 0.12, peak = 0.2 }) {
    const t = ctx.currentTime + t0;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    setEnv(g, t, peak, 0.005, dur);
    o.connect(g);
    g.connect(sfxBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // Effects only play when sound is on and the audio context is ready
  function ready() {
    if (!init()) return false;
    resumeCtx();
    return enabled;
  }

  const sfx = {
    tick: () => ready() && beep(0, { freq: 880, type: 'sine', dur: 0.08, peak: 0.18 }),
    pick: () => ready() && beep(0, { freq: 1320, to: 880, dur: 0.06, peak: 0.14 }),
    shoot: () => {
      if (!ready()) return;
      noiseHit(ctx.currentTime, { freq: 500, sweepTo: 3400, q: 0.7, peak: 0.3, dur: 0.32, bus: sfxBus });
      beep(0, { freq: 160, to: 55, type: 'sine', dur: 0.25, peak: 0.35 });
    },
    win: () => ready() && [72, 76, 79, 84].forEach((m, i) => beep(i * 0.085, { freq: mtof(m), dur: 0.25, peak: 0.2 })),
    lose: () => ready() && beep(0, { freq: 330, to: 140, type: 'sawtooth', dur: 0.5, peak: 0.14 }),
    tie: () => ready() && [0, 0.14].forEach((d) => beep(d, { freq: mtof(67), type: 'sine', dur: 0.22, peak: 0.16 })),
    fanfare: () =>
      ready() &&
      [[60, 0], [64, 0.12], [67, 0.24], [72, 0.36], [76, 0.5]].forEach(([m, d]) =>
        beep(d, { freq: mtof(m), dur: 0.5, peak: 0.18 })
      ),
  };

  return {
    sfx,
    startMusic,
    stopMusic,
    unlock() {
      init();
      resumeCtx();
    },
    isEnabled: () => enabled,
    setEnabled(value) {
      enabled = value;
      if (ctx) master.gain.setTargetAtTime(value ? 0.8 : 0, ctx.currentTime, 0.05);
    },
  };
})();

/* ------------------------------------------------------------------ */
/* Procedural shape builders                                           */
/* ------------------------------------------------------------------ */
// Fit any object into a holder so every shape has the same size and sits centred on its origin.
function fitHolder(obj, size = 1.7) {
  const holder = new THREE.Group();
  holder.add(obj);
  holder.userData.obj = obj;
  const box = new THREE.Box3().setFromObject(obj);
  const dims = box.getSize(new THREE.Vector3());
  obj.scale.multiplyScalar(size / Math.max(dims.x, dims.y, dims.z));
  box.setFromObject(obj);
  obj.position.sub(box.getCenter(new THREE.Vector3()));
  return holder;
}

// Value noise for organic rock shapes
function hash(x, y, z) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
function valueNoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const lerp = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => hash(xi + dx, yi + dy, zi + dz);
  return lerp(
    lerp(lerp(c(0, 0, 0), c(1, 0, 0), u), lerp(c(0, 1, 0), c(1, 1, 0), u), v),
    lerp(lerp(c(0, 0, 1), c(1, 0, 1), u), lerp(c(0, 1, 1), c(1, 1, 1), u), v),
    w
  );
}
function fbm(x, y, z) {
  let amp = 0.5, sum = 0, norm = 0;
  for (let i = 0; i < 5; i++) {
    sum += amp * valueNoise(x, y, z);
    norm += amp;
    x *= 2.03; y *= 2.03; z *= 2.03;
    amp *= 0.5;
  }
  return sum / norm;
}

function makeRock() {
  let geo = new THREE.IcosahedronGeometry(1, 48);
  geo.deleteAttribute('normal');
  geo.deleteAttribute('uv');
  geo = mergeVertices(geo);

  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const dir = new THREE.Vector3();
  const color = new THREE.Color();
  const warm = new THREE.Color(0xa39a8c);
  const cool = new THREE.Color(0x4b4740);
  const tint = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    dir.fromBufferAttribute(pos, i).normalize();
    const mass = fbm(dir.x * 1.3 + 4, dir.y * 1.3 + 4, dir.z * 1.3 + 4);
    const fracture = 1 - Math.abs(2 * fbm(dir.x * 4.2, dir.y * 4.2, dir.z * 4.2) - 1); // ridged cracks
    const grit = fbm(dir.x * 14, dir.y * 14, dir.z * 14);
    const r = 0.76 + 0.32 * mass - 0.07 * fracture + 0.025 * grit;
    pos.setXYZ(i, dir.x * r * 1.08, dir.y * r * 0.9, dir.z * r);

    // Lighter tops and shoulders, dark cracks and pits
    tint.copy(cool).lerp(warm, fbm(dir.x * 2.5, dir.y * 2.5, dir.z * 2.5));
    const cavity = 0.55 + 0.45 * fracture;
    color.copy(tint).multiplyScalar(cavity * (0.9 + 0.2 * dir.y) * (0.9 + 0.15 * grit));
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0 })
  );
  mesh.castShadow = true;
  return mesh;
}

// Paper with fibres and creases. The same canvas drives colour and bump.
function makePaperTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const g = canvas.getContext('2d');
  g.fillStyle = '#f7f4ea';
  g.fillRect(0, 0, 512, 512);
  g.strokeStyle = 'rgba(120, 110, 90, 0.22)';
  g.lineWidth = 2;
  [[0, 180, 512, 220], [0, 360, 512, 330], [120, 0, 150, 512], [380, 0, 340, 512]].forEach(([x1, y1, x2, y2]) => {
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.stroke();
  });
  for (let i = 0; i < 3200; i++) {
    g.fillStyle = `rgba(90, 80, 60, ${Math.random() * 0.07})`;
    g.fillRect(Math.random() * 512, Math.random() * 512, 1.8, 1.8);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function makePaper() {
  const geo = new THREE.PlaneGeometry(1.6, 1.6, 40, 40);
  const tex = makePaperTexture();
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ map: tex, bumpMap: tex, bumpScale: 0.8, roughness: 0.92, side: THREE.DoubleSide })
  );
  mesh.castShadow = true;
  const base = geo.attributes.position.array.slice();
  mesh.userData.animate = (t) => {
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3], y = base[i * 3 + 1];
      pos.setZ(i, Math.sin(x * 3.2 + t * 1.7) * 0.06 + Math.cos(y * 2.6 - t * 1.3) * 0.05);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  };
  return mesh;
}

function makeScissors() {
  const group = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0xdfe5ef, metalness: 1, roughness: 0.18 });
  const grip = new THREE.MeshPhysicalMaterial({ color: 0xe4572e, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.12 });

  const outline = new THREE.Shape();
  outline.moveTo(0, -0.05);
  outline.lineTo(1.2, -0.01);
  outline.quadraticCurveTo(1.34, 0.01, 1.3, 0.06);
  outline.lineTo(0, 0.07);
  outline.closePath();
  const bladeGeo = new THREE.ExtrudeGeometry(outline, {
    depth: 0.03, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2, curveSegments: 16,
  });

  const pivots = [];
  [[0.28, 0.04], [-0.28, -0.04]].forEach(([angle, z]) => {
    const pivot = new THREE.Group();
    pivot.rotation.z = angle;
    const blade = new THREE.Mesh(bladeGeo, steel);
    blade.position.z = z;
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.09, 0.035), steel);
    shaft.position.set(-0.3, 0, z);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.055, 16, 48), grip);
    ring.position.set(-0.95, 0, z);
    blade.castShadow = shaft.castShadow = ring.castShadow = true;
    pivot.add(blade, shaft, ring);
    group.add(pivot);
    pivots.push(pivot);
  });

  const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.14, 20), steel);
  screw.rotation.x = Math.PI / 2;
  group.add(screw);

  group.rotation.z = Math.PI / 2; // blades point up
  group.userData.animate = (t) => {
    const open = 0.28 + 0.06 * Math.sin(t * 4); // gentle snipping
    pivots[0].rotation.z = open;
    pivots[1].rotation.z = -open;
  };
  return group;
}

function makePlaceholder() {
  const mesh = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1, 2),
    new THREE.MeshBasicMaterial({ color: 0x7cc0ff, wireframe: true, transparent: true, opacity: 0.3 })
  );
  return fitHolder(mesh, 1.2);
}

const SHAPE_BUILDERS = {
  none: makePlaceholder,
  rock: () => fitHolder(makeRock()),
  paper: () => fitHolder(makePaper()),
  scissors: () => fitHolder(makeScissors()),
};

/* ------------------------------------------------------------------ */
/* 3D arena                                                            */
/* ------------------------------------------------------------------ */
const PEDESTAL_TOP = 0.28;

function createArena(renderer, stageEl, onPick) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05070b);
  scene.fog = new THREE.Fog(0x05070b, 15, 28);

  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  const target = new THREE.Vector3(0, 0.95, 0.8);

  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.85;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  stageEl.prepend(renderer.domElement); // canvas sits under the overlay text

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  // Lighting: soft fill, warm key with shadows, cool rim, and a coloured light per player
  scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x1a120c, 0.35));
  const key = new THREE.DirectionalLight(0xfff0dd, 1.7);
  key.position.set(3.5, 8, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.radius = 4;
  Object.assign(key.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 26 });
  key.shadow.camera.updateProjectionMatrix();
  scene.add(key);

  const spot = new THREE.SpotLight(0xffe6cc, 38, 0, Math.PI / 5, 0.8, 2);
  spot.position.set(0, 9, 4);
  spot.target.position.set(0, 0, 0);
  scene.add(spot, spot.target);

  const rim = new THREE.DirectionalLight(0x7cc0ff, 1.0);
  rim.position.set(-5, 4, -4);
  scene.add(rim);

  const playerLight = new THREE.PointLight(0x7cc0ff, 4, 6, 2);
  playerLight.position.set(-2.5, 3, 1.5);
  const cpuLight = new THREE.PointLight(0xff7a45, 4, 6, 2);
  cpuLight.position.set(2.5, 3, 1.5);
  scene.add(playerLight, cpuLight);

  // Reflective floor with a shadow-catching layer on top
  const floor = new Reflector(new THREE.CircleGeometry(14, 64), {
    clipBias: 0.003,
    textureWidth: 1024,
    textureHeight: 1024,
    color: 0x2a3446,
  });
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const shadowCatcher = new THREE.Mesh(
    new THREE.CircleGeometry(14, 64),
    new THREE.ShadowMaterial({ opacity: 0.55 })
  );
  shadowCatcher.rotation.x = -Math.PI / 2;
  shadowCatcher.position.y = 0.004;
  shadowCatcher.receiveShadow = true;
  scene.add(shadowCatcher);

  // Floating dust for atmosphere
  const DUST = 260;
  const dustPos = new Float32Array(DUST * 3);
  for (let i = 0; i < DUST; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 2 + Math.random() * 8;
    dustPos[i * 3] = Math.cos(a) * r;
    dustPos[i * 3 + 1] = 0.4 + Math.random() * 4.5;
    dustPos[i * 3 + 2] = Math.sin(a) * r;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(
    dustGeo,
    new THREE.PointsMaterial({ color: 0x9fd4ff, size: 0.035, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  scene.add(dust);

  const pedestalMat = new THREE.MeshStandardMaterial({ color: 0x1c2333, roughness: 0.3, metalness: 0.7 });

  function makePedestal(x, z, color, radius, withBeam) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius * 1.05, PEDESTAL_TOP, 64),
      pedestalMat
    );
    base.position.y = PEDESTAL_TOP / 2;
    base.castShadow = base.receiveShadow = true;
    const ringMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35, roughness: 0.3 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.97, 0.03, 12, 96), ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = PEDESTAL_TOP + 0.005;
    group.add(base, ring);
    let beamMat = null;
    if (withBeam) {
      beamMat = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.04, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
      });
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.95, radius * 1.1, 3.6, 48, 1, true), beamMat);
      beam.position.y = PEDESTAL_TOP + 1.8;
      group.add(beam);
    }
    scene.add(group);
    return { ringMat, beamMat };
  }

  // keys: which shapes a slot can show. Selectors show one fixed shape.
  function createSlot({ x, z, color, scale = 1, radius = 1.25, keys, interactive = false, beam = false }) {
    const pedestal = makePedestal(x, z, color, radius, beam);
    const root = new THREE.Group();
    root.position.set(x, PEDESTAL_TOP, z);
    root.scale.setScalar(scale);
    if (interactive) root.userData.choice = keys[0];

    const models = {};
    keys.forEach((key) => {
      const holder = SHAPE_BUILDERS[key]();
      holder.scale.setScalar(0.001);
      holder.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
      root.add(holder);
      models[key] = holder;
    });
    scene.add(root);

    return {
      x, z, root, models,
      ringMat: pedestal.ringMat,
      beamMat: pedestal.beamMat,
      baseScale: scale,
      targetScale: scale,
      choice: keys.length === 1 ? keys[0] : null,
      shown: keys.length === 1 ? keys[0] : null,
      bob: 0,
      glow: 0.5,
      glowTarget: 0.5,
      hover: false,
      selected: false,
    };
  }

  const slots = {
    player: createSlot({ x: -2.5, z: 0, color: 0x7cc0ff, keys: ['none', ...CHOICES], beam: true }),
    cpu: createSlot({ x: 2.5, z: 0, color: 0xff7a45, keys: ['none', ...CHOICES], beam: true }),
  };
  const selectors = CHOICES.map((key, i) =>
    createSlot({ x: (i - 1) * 1.5, z: 2.7, color: 0x8fa3bf, scale: 0.55, radius: 0.75, keys: [key], interactive: true })
  );

  function updateSlot(slot, t, dt) {
    const shownKey = slot.shown ?? 'none';
    for (const key of Object.keys(slot.models)) {
      const holder = slot.models[key];
      const active = key === shownKey;
      holder.scale.setScalar(damp(holder.scale.x, active ? 1 : 0.001, 10, dt));
      if (active) {
        holder.rotation.y += dt * 0.7;
        const animate = holder.userData.obj?.userData.animate;
        if (animate && holder.scale.x > 0.02) animate(t);
      }
    }
    const scale = damp(slot.root.scale.x, slot.targetScale, 10, dt);
    slot.root.scale.setScalar(scale);
    slot.root.position.y =
      PEDESTAL_TOP + 0.85 * scale + Math.sin(t * 1.8 + slot.x) * 0.035 * scale + slot.bob * scale;
    slot.glow = damp(slot.glow, slot.glowTarget, 6, dt);
    slot.ringMat.emissiveIntensity = slot.glow;
    if (slot.beamMat) slot.beamMat.opacity = 0.03 + 0.03 * slot.glow;
  }

  function updateSelector(slot) {
    const factor = slot.selected ? 1.25 : slot.hover ? 1.12 : 1;
    slot.targetScale = slot.baseScale * factor;
    slot.glowTarget = slot.selected ? 2.4 : slot.hover ? 1.2 : 0.35;
    slot.shown = slot.choice;
  }

  // Particle burst for wins and losses
  const BURST = 110;
  const burstPos = new Float32Array(BURST * 3);
  const burstVel = new Float32Array(BURST * 3);
  const burstGeo = new THREE.BufferGeometry();
  burstGeo.setAttribute('position', new THREE.BufferAttribute(burstPos, 3));
  const burstMat = new THREE.PointsMaterial({
    size: 0.14, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const burst = new THREE.Points(burstGeo, burstMat);
  scene.add(burst);
  let burstLife = 0;

  function fire(x, z, color) {
    burstMat.color.set(color);
    for (let i = 0; i < BURST; i++) {
      burstPos[i * 3] = x + (Math.random() - 0.5) * 0.4;
      burstPos[i * 3 + 1] = 1.3 + Math.random() * 0.3;
      burstPos[i * 3 + 2] = z + (Math.random() - 0.5) * 0.4;
      burstVel[i * 3] = (Math.random() - 0.5) * 3;
      burstVel[i * 3 + 1] = 1 + Math.random() * 3.2;
      burstVel[i * 3 + 2] = (Math.random() - 0.5) * 3;
    }
    burstLife = 1;
  }

  function updateBurst(dt) {
    if (burstLife <= 0) return;
    burstLife = Math.max(0, burstLife - dt * 0.8);
    burstMat.opacity = burstLife;
    for (let i = 0; i < BURST; i++) {
      burstVel[i * 3 + 1] -= 9.8 * dt;
      burstPos[i * 3] += burstVel[i * 3] * dt;
      burstPos[i * 3 + 1] += burstVel[i * 3 + 1] * dt;
      burstPos[i * 3 + 2] += burstVel[i * 3 + 2] * dt;
    }
    burstGeo.attributes.position.needsUpdate = true;
  }

  // Picking on the three selector shapes
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const selectorRoots = selectors.map((s) => s.root);
  const dom = renderer.domElement;
  let downAt = null;

  function setPointer(e) {
    const r = dom.getBoundingClientRect();
    pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }
  function pickAt(e) {
    setPointer(e);
    raycaster.setFromCamera(pointer, camera);
    for (const hit of raycaster.intersectObjects(selectorRoots, true)) {
      let node = hit.object;
      while (node && node.userData.choice === undefined) node = node.parent;
      if (node) return node.userData.choice;
    }
    return null;
  }

  dom.addEventListener('pointerdown', (e) => { downAt = { x: e.clientX, y: e.clientY }; });
  dom.addEventListener('pointermove', (e) => {
    const hovered = pickAt(e);
    dom.style.cursor = hovered ? 'pointer' : 'grab';
    selectors.forEach((s) => { s.hover = s.choice === hovered; });
  });
  dom.addEventListener('pointerleave', () => {
    selectors.forEach((s) => { s.hover = false; });
  });
  dom.addEventListener('pointerup', (e) => {
    if (!downAt) return;
    const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
    downAt = null;
    if (moved > 6) return; // it was an orbit drag, not a click
    const choice = pickAt(e);
    if (choice) onPick(choice);
  });

  // Camera: framing depends on the stage shape so both players fit on phones
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.22, 0.5, 0.92);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  let finalPos = new THREE.Vector3(0, 3.2, target.z + 9);
  let introT = 0;
  const INTRO_TIME = reduceMotion ? 0.01 : 2.4;
  const controls = new OrbitControls(camera, dom);
  controls.target.copy(target);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 6;
  controls.maxDistance = 16;
  controls.minPolarAngle = 0.5;
  controls.maxPolarAngle = 1.35;
  controls.enabled = false;

  function resize() {
    const w = stageEl.clientWidth, h = stageEl.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(w, h);
    camera.aspect = w / h;
    const distance = THREE.MathUtils.clamp((9 * 1.6) / camera.aspect, 9, 16);
    finalPos = new THREE.Vector3(0, 3.2 * (distance / 9), target.z + distance);
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(stageEl);
  resize();
  camera.position.set(0, 6, finalPos.z + 7);
  camera.lookAt(target);

  // Camera shake for reveals
  let shakeTime = 0;
  let shakeAmp = 0;
  const lastOffset = new THREE.Vector3();

  const clock = new THREE.Clock();
  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;

    // Undo last frame's shake before the controls read the camera
    camera.position.sub(lastOffset);

    if (introT < 1) {
      introT = Math.min(1, introT + dt / INTRO_TIME);
      const e = 1 - Math.pow(1 - introT, 3);
      const start = new THREE.Vector3(0, 6, finalPos.z + 7);
      camera.position.lerpVectors(start, finalPos, e);
      camera.lookAt(target);
      if (introT >= 1) controls.enabled = true;
    } else {
      controls.update();
    }

    lastOffset.set(0, 0, 0);
    if (shakeTime > 0) {
      shakeTime = Math.max(0, shakeTime - dt);
      const k = (shakeTime / 0.35) * shakeAmp;
      lastOffset.set((Math.random() - 0.5) * k, (Math.random() - 0.5) * k, 0);
    }
    camera.position.add(lastOffset);

    updateSlot(slots.player, t, dt);
    updateSlot(slots.cpu, t, dt);
    selectors.forEach((s) => { updateSelector(s); updateSlot(s, t, dt); });
    updateBurst(dt);
    dust.rotation.y += dt * 0.015;

    composer.render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return {
    setShown(side, key) { slots[side].shown = key; },
    setSelected(choice) { selectors.forEach((s) => { s.selected = s.choice === choice; }); },
    setBob(p) {
      const amp = reduceMotion ? 0.1 : 0.45;
      // three bumps over the shoot phase: rock, paper, scissors
      const bob = p == null ? 0 : Math.abs(Math.sin(p * Math.PI * 3)) * amp;
      slots.player.bob = bob;
      slots.cpu.bob = bob;
    },
    celebrate(side) {
      slots.player.glowTarget = side === 'player' ? 2.4 : 0.3;
      slots.cpu.glowTarget = side === 'cpu' ? 2.4 : 0.3;
      if (side === 'player') fire(slots.player.x, slots.player.z, 0x7cc0ff);
      if (side === 'cpu') fire(slots.cpu.x, slots.cpu.z, 0xff7a45);
    },
    resetGlow() {
      slots.player.glowTarget = 0.5;
      slots.cpu.glowTarget = 0.5;
    },
    shake(amount = 0.12) {
      if (reduceMotion) return;
      shakeAmp = amount;
      shakeTime = 0.35;
    },
  };
}

/* ------------------------------------------------------------------ */
/* Game state and logic (rules unchanged from original)                */
/* ------------------------------------------------------------------ */
const $ = (id) => document.getElementById(id);
const el = {
  player: $('player-score'),
  cpu: $('computer-score'),
  round: $('round-number'),
  timer: $('timer-text'),
  result: $('result-text'),
  status: $('status-text'),
  start: $('start-button'),
  history: $('history'),
  modal: $('match-modal'),
  matchTitle: $('match-title'),
  matchText: $('match-text'),
  playAgain: $('play-again'),
  stage: $('stage'),
  fallback: $('webgl-fallback'),
  sound: $('sound-toggle'),
};
const choiceButtons = [...document.querySelectorAll('[data-choice]')];

const state = {
  player: 0,
  cpu: 0,
  round: 0,
  choice: null,      // the player's current move (null = none)
  cpuChoice: null,   // the computer's move for this round
  phase: 'idle',     // idle | ready | countdown | shoot | result | over
  running: false,
};

function determineWinner(userChoice, computerChoice) {
  if (!userChoice) return 'You lose!';
  if (userChoice === computerChoice) return "It's a tie!";
  if (
    (userChoice === 'rock' && computerChoice === 'scissors') ||
    (userChoice === 'paper' && computerChoice === 'rock') ||
    (userChoice === 'scissors' && computerChoice === 'paper')
  ) {
    return 'You win!';
  }
  return 'You lose!';
}

function updateScores() {
  el.player.textContent = state.player;
  el.cpu.textContent = state.cpu;
  el.round.textContent = state.round;
}

function syncChoiceUI() {
  choiceButtons.forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.dataset.choice === state.choice));
  });
}

// Timer text with a small pop on every change
function setTimer(text) {
  el.timer.textContent = text;
  el.timer.classList.remove(sheet.classes.tickOn);
  void el.timer.offsetWidth;
  el.timer.classList.add(sheet.classes.tickOn);
}

function showResult(text, tone) {
  Object.values(toneClass).forEach((cls) => el.result.classList.remove(cls));
  if (tone) el.result.classList.add(toneClass[tone]);
  el.result.textContent = text;
}

function addHistory(round, playerChoice, cpuChoice, side) {
  const label = side === 'player' ? 'You win' : side === 'cpu' ? 'Computer wins' : 'Tie';
  const li = document.createElement('li');
  li.textContent = `Round ${round}: ${NAMES[playerChoice ?? 'none']} vs ${NAMES[cpuChoice]}, ${label}`;
  el.history.prepend(li);
}

function pick(choice) {
  if (!['idle', 'ready', 'countdown'].includes(state.phase)) {
    el.status.textContent = 'This round is locked. Pick again for the next round.';
    return;
  }
  state.choice = choice;
  syncChoiceUI();
  arena?.setShown('player', choice);
  arena?.setSelected(choice);
  sound.sfx.pick();
  el.status.textContent = `Your move: ${NAMES[choice]}.`;
}

function runShoot(ms) {
  return new Promise((resolve) => {
    const start = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - start) / ms);
      arena?.setBob(p);
      if (p < 1) {
        requestAnimationFrame(step);
      } else {
        arena?.setBob(null);
        resolve();
      }
    };
    requestAnimationFrame(step);
  });
}

async function playRound() {
  state.round += 1;
  state.phase = 'countdown';
  state.cpuChoice = CHOICES[Math.floor(Math.random() * CHOICES.length)];
  updateScores();
  el.status.textContent = `Round ${state.round}: choose before the timer hits zero.`;
  showResult('', null);

  // Computer shape cycles while the timer runs
  const cycle = setInterval(() => {
    arena?.setShown('cpu', CHOICES[Math.floor(Math.random() * CHOICES.length)]);
  }, 220);
  for (let n = 3; n > 0; n--) {
    setTimer(String(n));
    sound.sfx.tick();
    await sleep(1000);
  }
  clearInterval(cycle);

  state.phase = 'shoot';
  setTimer('Shoot!');
  sound.sfx.shoot();
  await runShoot(900);

  state.phase = 'result';
  arena?.setShown('cpu', state.cpuChoice);
  const playerChoice = state.choice;
  const verdict = determineWinner(playerChoice, state.cpuChoice);
  if (verdict === 'You win!') state.player += 1;
  else if (verdict === 'You lose!') state.cpu += 1;

  const side = verdict === 'You win!' ? 'player' : verdict === 'You lose!' ? 'cpu' : 'tie';
  const tone = side === 'player' ? 'win' : side === 'cpu' ? 'lose' : 'tie';
  updateScores();
  arena?.celebrate(side);
  arena?.shake(side === 'tie' ? 0.04 : 0.14);
  if (side === 'player') sound.sfx.win();
  else if (side === 'cpu') sound.sfx.lose();
  else sound.sfx.tie();
  showResult(
    `You chose ${NAMES[playerChoice ?? 'none']}, computer chose ${NAMES[state.cpuChoice]}. ${verdict}`,
    tone
  );
  addHistory(state.round, playerChoice, state.cpuChoice, side);
  setTimer('Round over');

  await sleep(1800);

  arena?.resetGlow();
  arena?.setShown('player', null);
  arena?.setSelected(null);
  state.choice = null;
  syncChoiceUI();

  if (state.player + state.cpu < POINTS_TO_WIN) {
    return playRound();
  }
  return finishMatch();
}

function finishMatch() {
  state.phase = 'over';
  state.running = false;
  const won = state.player > state.cpu;
  setTimer(won ? 'You win!' : 'Game over');
  el.start.disabled = false;
  el.start.textContent = 'Play again';
  el.status.textContent = `Final score ${state.player} : ${state.cpu}.`;
  el.matchTitle.textContent = won ? 'You won the match!' : 'Computer won the match';
  el.matchText.textContent = `Final score: you ${state.player}, computer ${state.cpu}.`;
  arena?.celebrate(won ? 'player' : 'cpu');
  sound.stopMusic();
  if (won) sound.sfx.fanfare();
  window.bootstrap?.Modal.getOrCreateInstance(el.modal).show();
}

async function startMatch() {
  if (state.running) return;
  state.running = true;
  state.player = 0;
  state.cpu = 0;
  state.round = 0;
  state.phase = 'ready';
  el.history.replaceChildren();
  showResult('', null);
  updateScores();
  el.start.disabled = true;
  el.start.textContent = 'Match in progress';
  setTimer('Get ready');
  el.status.textContent = 'Pick a move during the countdown. No move counts as a loss.';
  sound.unlock();
  if (sound.isEnabled()) sound.startMusic();
  await sleep(1200);
  return playRound();
}

/* ------------------------------------------------------------------ */
/* Wiring                                                              */
/* ------------------------------------------------------------------ */
let renderer = null;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true });
} catch (err) {
  console.warn('WebGL is not available, falling back to cards only.', err);
}
const arena = renderer ? createArena(renderer, el.stage, pick) : null;
if (!arena) el.fallback.classList.remove('d-none');

choiceButtons.forEach((btn) => btn.addEventListener('click', () => pick(btn.dataset.choice)));
el.start.addEventListener('click', startMatch);
el.playAgain.addEventListener('click', startMatch);

el.sound.addEventListener('click', () => {
  const on = !sound.isEnabled();
  sound.unlock();
  sound.setEnabled(on);
  el.sound.textContent = on ? 'Sound on' : 'Sound off';
  el.sound.setAttribute('aria-pressed', String(on));
  if (on && state.running) sound.startMusic();
  if (!on) sound.stopMusic();
});

window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (document.body.classList.contains('modal-open')) return;
  const choice = KEY_MAP[e.key.toLowerCase()];
  if (choice) pick(choice);
});

updateScores();
setTimer('Ready');
