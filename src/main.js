import './style.css';
import * as Tone from 'tone';
import yaml from 'js-yaml';

// ─────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────
const PADS_PER_PAGE = 10;
const RELEASE_SEC   = 0.03;
// XY pad: X es piecewise-linear alrededor del centro.
//   X=0.0 → RATE_REV_MAX (reverse al máximo, usa Tone.Player.reverse)
//   X=0.5 → RATE_CENTER  (reproducción normal, sin tocar el pad)
//   X=1.0 → RATE_FWD_MAX (fast forward)
const RATE_REV_MAX  = -2.0;
const RATE_CENTER   = 1.0;
const RATE_FWD_MAX  = 3.0;
// Y axis: centro = neutro.
//   Arriba → highpass resonante (low-cut) que sube freq + Q.
//   Abajo  → delay + reverb wet.
const HPF_MIN_FREQ     = 20;     // Y=0.5 (centro): filtro inaudible
const HPF_MAX_FREQ     = 3500;   // Y=0 (tope arriba): corta todo menos agudos
const HPF_MIN_Q        = 0.7;
const HPF_MAX_Q        = 12;     // resonancia agresiva en el tope → pico audible

const DELAY_TIME       = 0.28;
const DELAY_FEEDBACK   = 0.45;
const DELAY_MAX_WET    = 0.55;
const REVERB_ROOM_SIZE = 0.75;
const REVERB_MAX_WET   = 0.45;

const UI_MODES = ['FULL', 'XY_ONLY', 'PADS_ONLY', 'STEALTH'];

// Resolver paths relativos contra la URL real del documento.
// Funciona en dev (localhost:3000/), en GitHub Pages project page
// (user.github.io/botovejero/) y con `base: './'` en Vite.
const assetUrl = (rel) => new URL(rel, document.baseURI).toString();

// Fallbacks mínimos. La fuente de verdad es `public/config.yaml`;
// estos valores solo se usan si el YAML no existe o falla el parseo.
const FALLBACK_EFFECTS = [
  { name: 'DIRECTO', type: 'css', filter: 'none', ghost: 0.15 },
];
const FALLBACK_INFO = { title: '', subtitle: '', github: '', description: '' };

// ─────────────────────────────────────────
// STATE
// ─────────────────────────────────────────
let clips = [];
let effects = FALLBACK_EFFECTS;
let info = { ...FALLBACK_INFO };
let currentPage = 0;
let totalPages = 1;
let isAutoPlaying = false;
let autoPlayIndex = 0;
let autoPlayTimer = null;
let lastAutoPlayPad = -1;
let allLoaded = false;

let uiMode = 'FULL';
let currentEffectIndex = 0;
let showWaveform = false;
let masterVolumePct = 85;  // 0..100 (configurable via config.yaml ui.masterVolume)
let volumeStep = 5;        // delta por click/tecla (configurable via ui.volumeStep)

// Audio
const players    = new Map();
const padStates  = new Map();
const activePads = new Set();
let masterFilter, masterDelay, masterReverb, masterGain, masterAnalyser;

// XY Pad
let xyActive = false;
let xyX = 0.5;
let xyY = 0.5;
let xyReturnMs = 400;      // portamento al soltar (configurable via config.yaml ui.xyReturnMs)
let xyReturnAnim = null;   // id del requestAnimationFrame en curso, o null

// Video
const activeVideos = new Map();
let canvas, ctx;
let offscreenCanvas, offscreenCtx;
// Reverse state: cuando X < 0.5 decrementamos video.currentTime manualmente
let videoReverseActive = false;
let videoReverseRate = 1;
let videoReverseLastT = 0;

const keyMap = {
  '1': 0, '2': 1, '3': 2, '4': 3, '5': 4,
  '6': 5, '7': 6, '8': 7, '9': 8, '0': 9,
};

// X axis → rate (piecewise: reverse hasta el centro, normal-to-fast después)
function computeRate(x) {
  if (x <= 0.5) return RATE_REV_MAX + (x / 0.5) * (RATE_CENTER - RATE_REV_MAX);
  return RATE_CENTER + ((x - 0.5) / 0.5) * (RATE_FWD_MAX - RATE_CENTER);
}

// Aplica rate (posiblemente negativo) a un Tone.Player:
// negativo → player.reverse=true + abs rate; positivo → reverse=false.
function applyRateToPlayer(player, rate) {
  if (!player) return;
  const isReverse = rate < 0;
  const absRate = Math.max(0.01, Math.abs(rate));
  try { if (player.buffer && player.buffer.loaded) player.reverse = isReverse; } catch { /* no-op */ }
  player.playbackRate = absRate;
}

// ─────────────────────────────────────────
// AUDIO ENGINE
// Cadena: Player → HPF(resonante) → Delay → Reverb → Gain → Analyser → Destination
// Y centro = neutro. Arriba abre HPF + Q (pico resonante). Abajo moja delay+reverb.
// ─────────────────────────────────────────
function initAudioEngine() {
  masterFilter   = new Tone.Filter(HPF_MIN_FREQ, 'highpass');
  masterFilter.Q.value = HPF_MIN_Q;
  masterDelay    = new Tone.FeedbackDelay({ delayTime: DELAY_TIME, feedback: DELAY_FEEDBACK, wet: 0 });
  masterReverb   = new Tone.Freeverb({ roomSize: REVERB_ROOM_SIZE, dampening: 3000, wet: 0 });
  masterGain     = new Tone.Gain(1);
  masterAnalyser = new Tone.Analyser('waveform', 256);
  masterFilter.chain(masterDelay, masterReverb, masterGain, masterAnalyser, Tone.getDestination());
}

// ─────────────────────────────────────────
// MASTER VOLUME
// pct ∈ [0..100] → gain lineal [0..1]. Actualiza label + barra ANSI.
// ─────────────────────────────────────────
function setMasterVolume(pct) {
  masterVolumePct = Math.max(0, Math.min(100, Math.round(pct)));
  if (masterGain) {
    try { masterGain.gain.rampTo(masterVolumePct / 100, 0.05); }
    catch { masterGain.gain.value = masterVolumePct / 100; }
  }
  const bar = document.getElementById('vol-bar');
  if (bar) bar.textContent = renderVolBar(masterVolumePct);
  const num = document.getElementById('vol-num');
  if (num) num.textContent = String(masterVolumePct).padStart(3, '0');
}

function renderVolBar(pct) {
  const len = 14;
  const filled = Math.round((pct / 100) * len);
  return '█'.repeat(filled) + '░'.repeat(len - filled);
}

function setPadState(globalIndex, state) {
  padStates.set(globalIndex, state);
  const localIndex = globalIndex - currentPage * PADS_PER_PAGE;
  const padEl = document.querySelector(`.pad[data-local="${localIndex}"][data-global="${globalIndex}"]`);
  if (!padEl) return;
  padEl.classList.remove('loading', 'ready', 'playing');
  padEl.classList.add(state);
}

function refreshAllPadStates() {
  for (let i = 0; i < PADS_PER_PAGE; i++) {
    const globalIndex = currentPage * PADS_PER_PAGE + i;
    const state = padStates.get(globalIndex);
    if (state) {
      const padEl = document.querySelector(`.pad[data-local="${i}"]`);
      if (padEl) {
        padEl.classList.remove('loading', 'ready', 'playing');
        padEl.classList.add(state);
      }
    }
  }
}

async function preloadAllClips(onProgress) {
  let loaded = 0;
  const total = clips.length;
  onProgress(0, total);

  const tasks = clips.map((clip, i) => new Promise((resolve) => {
    setPadState(i, 'loading');
    const player = new Tone.Player({
      url: assetUrl(`media/${clip.file}`),
      loop: false,
      fadeOut: RELEASE_SEC,
      onload: () => {
        loaded++;
        setPadState(i, 'ready');
        onProgress(loaded, total);
        resolve();
      },
      onerror: (e) => {
        console.warn(`Error loading ${clip.file}:`, e);
        loaded++;
        onProgress(loaded, total);
        resolve();
      },
      onstop: () => {
        activePads.delete(i);
        const video = activeVideos.get(i);
        if (video) { video.pause(); activeVideos.delete(i); }
        if (padStates.get(i) === 'playing') setPadState(i, 'ready');
      },
    });
    player.connect(masterFilter);
    players.set(i, player);
  }));

  await Promise.all(tasks);
  allLoaded = true;
}

function triggerPad(globalIndex) {
  if (globalIndex >= clips.length) return;
  if (!allLoaded) return;

  if (Tone.getContext().state !== 'running') Tone.start();

  const player = players.get(globalIndex);
  if (!player || !player.loaded) return;

  if (player.state === 'started') player.stop();

  applyRateToPlayer(player, computeRate(xyX));
  player.start();

  activePads.add(globalIndex);
  setPadState(globalIndex, 'playing');

  triggerVideo(globalIndex);
}

function stopPad(globalIndex) {
  const player = players.get(globalIndex);
  if (player && player.state === 'started') player.stop();
}

function panicStopAll() {
  videoReverseActive = false;
  for (const [, player] of players) {
    if (player.state === 'started') player.stop();
  }
  activePads.clear();
  for (const [, video] of activeVideos) video.pause();
  activeVideos.clear();
  for (const [i, s] of padStates) {
    if (s === 'playing') setPadState(i, 'ready');
  }
  if (isAutoPlaying) {
    isAutoPlaying = false;
    const btn = document.getElementById('autoplay-btn');
    if (btn) { btn.classList.remove('on'); btn.textContent = '[ ] AUTOPLAY'; }
    clearTimeout(autoPlayTimer);
  }
  cancelXYReturn();
  xyX = 0.5; xyY = 0.5;
  const xyCursor = document.getElementById('xy-cursor');
  if (xyCursor) { xyCursor.style.left = '50%'; xyCursor.style.top = '50%'; }
  updateXYEffects();
}

function cancelXYReturn() {
  if (xyReturnAnim !== null) {
    cancelAnimationFrame(xyReturnAnim);
    xyReturnAnim = null;
  }
}

// Al soltar el XY, desliza xyX/xyY hacia el centro (0.5, 0.5) durante
// xyReturnMs con ease-out, llamando updateXYEffects() cada frame para que
// el portamento se escuche (rate/filtro/wet barren suavemente).
function animateXYReturn() {
  cancelXYReturn();
  const xyCursor = document.getElementById('xy-cursor');
  if (xyReturnMs <= 0) {
    xyX = 0.5; xyY = 0.5;
    if (xyCursor) { xyCursor.style.left = '50%'; xyCursor.style.top = '50%'; }
    updateXYEffects();
    return;
  }
  const startX = xyX, startY = xyY;
  const startT = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - startT) / xyReturnMs);
    const e = 1 - (1 - t) * (1 - t); // easeOutQuad
    xyX = startX + (0.5 - startX) * e;
    xyY = startY + (0.5 - startY) * e;
    if (xyCursor) {
      xyCursor.style.left = (xyX * 100) + '%';
      xyCursor.style.top  = (xyY * 100) + '%';
    }
    updateXYEffects();
    if (t < 1) xyReturnAnim = requestAnimationFrame(step);
    else xyReturnAnim = null;
  };
  xyReturnAnim = requestAnimationFrame(step);
}

function updateXYEffects() {
  const rate       = computeRate(xyX);
  const absRate    = Math.max(0.01, Math.abs(rate));
  const isReverse  = rate < 0;

  // Y: centro = neutro (reposo).
  //    upper (0..1) = cuánto se subió del centro → abre HPF resonante + LFO
  //    lower (0..1) = cuánto se bajó del centro  → moja delay+reverb
  const upper = Math.max(0, 0.5 - xyY) * 2;
  const lower = Math.max(0, xyY - 0.5) * 2;

  if (masterFilter) {
    const hpfFreq = HPF_MIN_FREQ + upper * (HPF_MAX_FREQ - HPF_MIN_FREQ);
    const hpfQ    = HPF_MIN_Q    + upper * (HPF_MAX_Q    - HPF_MIN_Q);
    masterFilter.frequency.rampTo(hpfFreq, 0.05);
    // Q en algunas versiones de Tone no es un Signal con rampTo — seteo directo
    try { masterFilter.Q.rampTo(hpfQ, 0.05); } catch { masterFilter.Q.value = hpfQ; }
  }

  if (masterDelay)  masterDelay.wet.rampTo(lower * DELAY_MAX_WET,  0.05);
  if (masterReverb) masterReverb.wet.rampTo(lower * REVERB_MAX_WET, 0.05);

  for (const [, player] of players) {
    if (player.state === 'started') applyRateToPlayer(player, rate);
  }

  // Video: en reverse decrementamos currentTime manualmente (loop en videoReverseTick).
  // En playback normal el video usa su propio playbackRate.
  if (isReverse) {
    videoReverseRate = absRate;
    if (!videoReverseActive) {
      videoReverseActive = true;
      videoReverseLastT = performance.now();
      requestAnimationFrame(videoReverseTick);
    }
    for (const [, video] of activeVideos) {
      video.pause();
    }
  } else {
    videoReverseActive = false;
    for (const [, video] of activeVideos) {
      video.playbackRate = absRate;
      if (video.paused) video.play().catch(() => {});
    }
  }
}

function videoReverseTick() {
  if (!videoReverseActive) return;
  const now = performance.now();
  const dt = (now - videoReverseLastT) / 1000;
  videoReverseLastT = now;
  for (const [, video] of activeVideos) {
    if (video.readyState >= 2 && video.duration) {
      let next = video.currentTime - dt * videoReverseRate;
      if (next <= 0) next = video.duration; // loop al final cuando llega al 0
      video.currentTime = next;
    }
  }
  requestAnimationFrame(videoReverseTick);
}

// ─────────────────────────────────────────
// VIDEO ENGINE
// ─────────────────────────────────────────
function triggerVideo(globalIndex) {
  const clip = clips[globalIndex];
  if (!clip) return;

  const video = document.createElement('video');
  video.src = assetUrl(`media/${clip.file}`);
  video.crossOrigin = 'anonymous';
  video.muted = true;
  video.playsInline = true;
  const initRate = computeRate(xyX);
  if (initRate >= 0) {
    video.playbackRate = Math.max(0.01, initRate);
  } else {
    // Arranca en reverse: el videoReverseTick ya decrementa currentTime.
    // Empezar desde el final para que visualmente se note el reverse.
    video.addEventListener('loadedmetadata', () => {
      if (video.duration) video.currentTime = video.duration;
    }, { once: true });
    videoReverseRate = Math.abs(initRate);
    if (!videoReverseActive) {
      videoReverseActive = true;
      videoReverseLastT = performance.now();
      requestAnimationFrame(videoReverseTick);
    }
  }

  video.onended = () => activeVideos.delete(globalIndex);
  video.onerror = () => activeVideos.delete(globalIndex);

  if (activeVideos.has(globalIndex)) activeVideos.get(globalIndex).pause();
  activeVideos.set(globalIndex, video);
  video.play().catch(() => activeVideos.delete(globalIndex));
}

function fitCover(video) {
  const vr = video.videoWidth / video.videoHeight;
  const cr = canvas.width / canvas.height;
  let dw, dh, sx, sy;
  if (vr > cr) {
    dh = canvas.height;
    dw = canvas.height * vr;
    sx = (canvas.width - dw) / 2;
    sy = 0;
  } else {
    dw = canvas.width;
    dh = canvas.width / vr;
    sx = 0;
    sy = (canvas.height - dh) / 2;
  }
  return [sx, sy, dw, dh];
}

function ensureOffscreen(w, h) {
  if (!offscreenCanvas) {
    offscreenCanvas = document.createElement('canvas');
    offscreenCtx = offscreenCanvas.getContext('2d', { willReadFrequently: true });
  }
  if (offscreenCanvas.width !== w || offscreenCanvas.height !== h) {
    offscreenCanvas.width = w;
    offscreenCanvas.height = h;
  }
}

function drawVideosToCanvas(dstCtx, w, h) {
  dstCtx.globalCompositeOperation = 'screen';
  let videoCount = 0;
  for (const [, video] of activeVideos) {
    if (video.readyState >= 2) {
      const vr = video.videoWidth / video.videoHeight;
      const cr = w / h;
      let dw, dh, sx, sy;
      if (vr > cr) {
        dh = h; dw = h * vr;
        sx = (w - dw) / 2; sy = 0;
      } else {
        dw = w; dh = w / vr;
        sx = 0; sy = (h - dh) / 2;
      }
      dstCtx.globalAlpha = Math.min(1, 1 / (videoCount + 1) + 0.3);
      dstCtx.drawImage(video, sx, sy, dw, dh);
      videoCount++;
    }
  }
  dstCtx.globalAlpha = 1;
  dstCtx.globalCompositeOperation = 'source-over';
}

function drawEffect(effect) {
  switch (effect.type) {
    case 'css': {
      ctx.filter = effect.filter || 'none';
      drawVideosToCanvas(ctx, canvas.width, canvas.height);
      ctx.filter = 'none';
      break;
    }
    case 'pixelate': {
      const size = effect.size || 80;
      const ratio = canvas.height / canvas.width;
      const w = size;
      const h = Math.max(1, Math.round(size * ratio));
      ensureOffscreen(w, h);
      offscreenCtx.clearRect(0, 0, w, h);
      drawVideosToCanvas(offscreenCtx, w, h);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(offscreenCanvas, 0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = true;
      break;
    }
    case 'scanlines': {
      drawVideosToCanvas(ctx, canvas.width, canvas.height);
      const thickness = effect.thickness || 2;
      const gap = effect.gap || 2;
      const intensity = effect.intensity != null ? effect.intensity : 0.5;
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = `rgba(0, 0, 0, ${intensity})`;
      for (let y = 0; y < canvas.height; y += thickness + gap) {
        ctx.fillRect(0, y, canvas.width, thickness);
      }
      ctx.globalCompositeOperation = 'source-over';
      break;
    }
    case 'rgbShift': {
      const offset = effect.offset || 10;
      ctx.globalCompositeOperation = 'lighter';
      const shifts = [
        { dx: -offset, filter: 'sepia(100%) hue-rotate(-50deg) saturate(600%)' }, // red
        { dx: 0,        filter: 'sepia(100%) hue-rotate( 60deg) saturate(600%)' }, // green
        { dx:  offset,  filter: 'sepia(100%) hue-rotate(180deg) saturate(600%)' }, // blue
      ];
      for (const s of shifts) {
        ctx.filter = s.filter;
        for (const [, video] of activeVideos) {
          if (video.readyState >= 2) {
            const [sx, sy, dw, dh] = fitCover(video);
            ctx.drawImage(video, sx + s.dx, sy, dw, dh);
          }
        }
      }
      ctx.filter = 'none';
      ctx.globalCompositeOperation = 'source-over';
      break;
    }
    case 'ascii': {
      const cellSize = effect.cellSize || 12;
      const charset = effect.charset || ' .:-=+*#%@';
      const color = effect.color || '#55FF55';
      const bg = effect.background || '#000000';
      const cols = Math.max(1, Math.floor(canvas.width / cellSize));
      const rows = Math.max(1, Math.floor(canvas.height / cellSize));
      ensureOffscreen(cols, rows);
      offscreenCtx.fillStyle = bg;
      offscreenCtx.fillRect(0, 0, cols, rows);
      drawVideosToCanvas(offscreenCtx, cols, rows);
      const imageData = offscreenCtx.getImageData(0, 0, cols, rows);
      const px = imageData.data;
      // Fondo plano
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = color;
      ctx.font = `${cellSize}px 'IBM Plex Mono', 'Courier New', monospace`;
      ctx.textBaseline = 'top';
      const lastIdx = charset.length - 1;
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const i = (y * cols + x) * 4;
          const lum = 0.299*px[i] + 0.587*px[i+1] + 0.114*px[i+2];
          const charIdx = Math.floor((lum / 255) * lastIdx);
          const ch = charset[charIdx];
          if (ch !== ' ') ctx.fillText(ch, x * cellSize, y * cellSize);
        }
      }
      break;
    }
    case 'ansiBlocks': {
      const cellSize = effect.cellSize || 10;
      const cols = Math.max(1, Math.floor(canvas.width / cellSize));
      const rows = Math.max(1, Math.floor(canvas.height / cellSize));
      ensureOffscreen(cols, rows);
      offscreenCtx.fillStyle = '#000';
      offscreenCtx.fillRect(0, 0, cols, rows);
      drawVideosToCanvas(offscreenCtx, cols, rows);
      const imageData = offscreenCtx.getImageData(0, 0, cols, rows);
      const px = imageData.data;
      const palette = getPalette(effect.palette || 'CGA');
      // upscale cuantizando a paleta
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const i = (y * cols + x) * 4;
          const [r, g, b] = nearestPaletteColor(px[i], px[i+1], px[i+2], palette);
          ctx.fillStyle = `rgb(${r},${g},${b})`;
          ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
        }
      }
      break;
    }
    case 'blend': {
      ctx.globalCompositeOperation = effect.composite || 'difference';
      for (const [, video] of activeVideos) {
        if (video.readyState >= 2) {
          const [sx, sy, dw, dh] = fitCover(video);
          ctx.drawImage(video, sx, sy, dw, dh);
        }
      }
      ctx.globalCompositeOperation = 'source-over';
      break;
    }
    case 'channelSplit': {
      const channels = effect.channels || [
        'sepia(100%) hue-rotate(-50deg) saturate(700%)',
        'sepia(100%) hue-rotate( 60deg) saturate(700%)',
        'sepia(100%) hue-rotate(180deg) saturate(700%)',
      ];
      ctx.globalCompositeOperation = 'lighter';
      let i = 0;
      for (const [, video] of activeVideos) {
        if (video.readyState >= 2) {
          ctx.filter = channels[i % channels.length];
          const [sx, sy, dw, dh] = fitCover(video);
          ctx.drawImage(video, sx, sy, dw, dh);
          i++;
        }
      }
      ctx.filter = 'none';
      ctx.globalCompositeOperation = 'source-over';
      break;
    }
    case 'weave': {
      const bandHeight = Math.max(4, effect.bandHeight || 36);
      const vids = [];
      for (const [, v] of activeVideos) if (v.readyState >= 2) vids.push(v);
      if (vids.length === 0) break;
      const rows = Math.ceil(canvas.height / bandHeight);
      for (let r = 0; r < rows; r++) {
        const v = vids[r % vids.length];
        const y = r * bandHeight;
        const h = Math.min(bandHeight, canvas.height - y);
        const sRatio = y / canvas.height;
        const sy = sRatio * v.videoHeight;
        const sh = (h / canvas.height) * v.videoHeight;
        ctx.drawImage(v, 0, sy, v.videoWidth, sh, 0, y, canvas.width, h);
      }
      break;
    }
    case 'videoGrid': {
      const vids = [];
      for (const [, v] of activeVideos) if (v.readyState >= 2) vids.push(v);
      if (vids.length === 0) break;
      const n = vids.length;
      const cols = Math.ceil(Math.sqrt(n));
      const rows = Math.ceil(n / cols);
      const cellW = canvas.width / cols;
      const cellH = canvas.height / rows;
      for (let i = 0; i < n; i++) {
        const r = Math.floor(i / cols);
        const c = i % cols;
        const v = vids[i];
        const vr = v.videoWidth / v.videoHeight;
        const cr = cellW / cellH;
        let dw, dh, dx, dy;
        if (vr > cr) { dh = cellH; dw = cellH * vr; dx = c*cellW + (cellW - dw)/2; dy = r*cellH; }
        else         { dw = cellW; dh = cellW / vr; dx = c*cellW; dy = r*cellH + (cellH - dh)/2; }
        ctx.drawImage(v, dx, dy, dw, dh);
      }
      break;
    }
    default: {
      ctx.filter = 'none';
      drawVideosToCanvas(ctx, canvas.width, canvas.height);
    }
  }
}

function getPalette(name) {
  switch ((name || '').toUpperCase()) {
    case 'AMIGA':
      return [
        [0,0,0],[34,34,68],[68,68,136],[136,136,204],
        [204,102,0],[238,170,0],[238,238,170],[255,255,255],
      ];
    case 'MONO':
      return [
        [0,0,0],[60,60,60],[120,120,120],[180,180,180],[255,255,255],
      ];
    case 'CGA':
    default:
      return [
        [0,0,0],[0,0,170],[0,170,0],[0,170,170],
        [170,0,0],[170,0,170],[170,85,0],[170,170,170],
        [85,85,85],[85,85,255],[85,255,85],[85,255,255],
        [255,85,85],[255,85,255],[255,255,85],[255,255,255],
      ];
  }
}

function nearestPaletteColor(r, g, b, palette) {
  let best = palette[0];
  let bestDist = Infinity;
  for (const p of palette) {
    const dr = r - p[0], dg = g - p[1], db = b - p[2];
    const d = dr*dr + dg*dg + db*db;
    if (d < bestDist) { bestDist = d; best = p; }
  }
  return best;
}

function drawWaveformOverlay() {
  if (!showWaveform) return;
  if (!masterAnalyser || activePads.size === 0) return;
  const waveform = masterAnalyser.getValue();
  ctx.strokeStyle = 'rgba(255, 255, 85, 0.6)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  const sliceWidth = canvas.width / waveform.length;
  let x = 0;
  for (let i = 0; i < waveform.length; i++) {
    const v = (waveform[i] + 1) / 2;
    const y = canvas.height * 0.5 + v * canvas.height * 0.3 - canvas.height * 0.15;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
    x += sliceWidth;
  }
  ctx.stroke();
}

function drawVideoFrame() {
  if (!ctx) { requestAnimationFrame(drawVideoFrame); return; }
  const effect = effects[currentEffectIndex] || effects[0];
  const ghost = Math.min(1, Math.max(0, effect.ghost != null ? effect.ghost : 0.15));
  const clearAlpha = 1 - ghost;

  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = `rgba(0, 0, 0, ${clearAlpha})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawEffect(effect);
  drawWaveformOverlay();

  requestAnimationFrame(drawVideoFrame);
}

// ─────────────────────────────────────────
// AUTO-PLAY
// ─────────────────────────────────────────
function toggleAutoPlay() {
  if (!allLoaded) return;
  isAutoPlaying = !isAutoPlaying;
  const btn = document.getElementById('autoplay-btn');
  if (isAutoPlaying) {
    btn.classList.add('on');
    btn.textContent = '[*] AUTOPLAY';
    autoPlayNext();
  } else {
    btn.classList.remove('on');
    btn.textContent = '[ ] AUTOPLAY';
    clearTimeout(autoPlayTimer);
    // Detener el último pad que lanzó el autoplay
    if (lastAutoPlayPad >= 0) {
      const p = players.get(lastAutoPlayPad);
      if (p && p.state === 'started') p.stop();
    }
    lastAutoPlayPad = -1;
  }
}

function autoPlayNext() {
  if (!isAutoPlaying) return;
  if (clips.length === 0) { isAutoPlaying = false; return; }
  if (autoPlayIndex >= clips.length) autoPlayIndex = 0;

  // Detener el pad anterior del autoplay: su onstop limpia audio + video
  if (lastAutoPlayPad >= 0 && lastAutoPlayPad !== autoPlayIndex) {
    const prev = players.get(lastAutoPlayPad);
    if (prev && prev.state === 'started') prev.stop();
  }

  const targetPage = Math.floor(autoPlayIndex / PADS_PER_PAGE);
  if (targetPage !== currentPage) {
    currentPage = targetPage;
    renderPadGrid();
    updatePageIndicator();
  }

  const player = players.get(autoPlayIndex);

  // Si el clip no cargó, saltar en 60ms sin disparar
  if (!player || !player.loaded || !player.buffer || !player.buffer.duration) {
    autoPlayIndex++;
    autoPlayTimer = setTimeout(autoPlayNext, 60);
    return;
  }

  triggerPad(autoPlayIndex);
  lastAutoPlayPad = autoPlayIndex;

  const rateAbs = Math.max(0.05, Math.abs(computeRate(xyX)));
  const dur = (player.buffer.duration * 1000) / rateAbs;
  autoPlayIndex++;
  autoPlayTimer = setTimeout(autoPlayNext, dur + 200);
}

// ─────────────────────────────────────────
// UI MODE (Tab cycle)
// ─────────────────────────────────────────
function applyUIMode(mode) {
  uiMode = mode;
  const body = document.body;
  UI_MODES.forEach(m => body.classList.remove('mode-' + m.toLowerCase()));
  body.classList.add('mode-' + mode.toLowerCase());
  showToast(`UI: ${mode.replace('_', ' ')}`);
}

function cycleUIMode() {
  const idx = UI_MODES.indexOf(uiMode);
  const next = UI_MODES[(idx + 1) % UI_MODES.length];
  applyUIMode(next);
}

function showToast(text) {
  let toast = document.getElementById('ui-toast');
  if (!toast) return;
  toast.textContent = text;
  toast.classList.add('visible');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.remove('visible'), 1200);
}

// ─────────────────────────────────────────
// INFO INJECTION (desde config.yaml)
// ─────────────────────────────────────────
function applyInfo() {
  const setText = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text || '';
  };
  setText('brand-name',    info.title);
  setText('loading-title', info.title);
  setText('loading-sub',   info.subtitle);
  setText('help-title',    info.title);
  setText('help-sub',      info.subtitle);
  setText('help-desc',     info.description);

  const ghLink = document.getElementById('help-github');
  if (ghLink) {
    ghLink.href = info.github || '#';
    ghLink.textContent = info.github || '(configurá info.github en config.yaml)';
  }

  if (info.title) document.title = info.title;
}

// ─────────────────────────────────────────
// HELP MODAL
// ─────────────────────────────────────────
function openHelpModal() {
  const modal = document.getElementById('help-modal');
  if (!modal) return;
  modal.classList.add('open');
}
function closeHelpModal() {
  const modal = document.getElementById('help-modal');
  if (!modal) return;
  modal.classList.remove('open');
}

// ─────────────────────────────────────────
// UI RENDERING
// ─────────────────────────────────────────
function buildUI() {
  document.querySelector('#app').innerHTML = `
    <canvas id="main-canvas"></canvas>

    <div id="loading-overlay" class="ansi-overlay">
      <div class="loading-box">
        <div class="loading-title" id="loading-title"></div>
        <div class="loading-sub" id="loading-sub"></div>
        <div class="loading-divider"></div>
        <div class="loading-status">CARGANDO CLIPS...</div>
        <div class="loading-bar-row">
          <span class="bar-bracket">[</span>
          <span id="loading-bar-fill" class="bar-fill"></span>
          <span class="bar-bracket">]</span>
          <span id="loading-pct" class="bar-pct">  0%</span>
        </div>
        <div class="loading-counter"><span id="loading-counter">0/0</span></div>
      </div>
    </div>

    <div id="ui-toast" class="ui-toast"></div>

    <div id="help-modal" class="ansi-overlay modal">
      <div class="loading-box help-box">
        <div class="loading-title" id="help-title">BOTOVEJERO v1.5</div>
        <div class="loading-sub" id="help-sub">instrumento audiovisual vivo</div>
        <div class="loading-divider"></div>
        <div class="help-desc" id="help-desc"></div>
        <div class="help-section">
          <div class="help-section-title">// SHORTCUTS</div>
          <table class="help-table">
            <tr><td>1-9 , 0</td><td>disparar pads</td></tr>
            <tr><td>← / →</td><td>página anterior / siguiente</td></tr>
            <tr><td>↑ / ↓</td><td>efecto visual siguiente / anterior</td></tr>
            <tr><td>SPACE</td><td>autoplay on/off</td></tr>
            <tr><td>TAB</td><td>ciclar modo UI (FULL · XY · PADS · STEALTH)</td></tr>
            <tr><td>W</td><td>toggle onda de audio (waveform) sobre el video</td></tr>
            <tr><td>[ / ]</td><td>bajar / subir master volume</td></tr>
            <tr><td>.</td><td>PANIC — stop all</td></tr>
            <tr><td>?</td><td>mostrar esta ayuda</td></tr>
            <tr><td>ESC</td><td>cerrar ayuda</td></tr>
          </table>
        </div>
        <div class="help-section">
          <div class="help-section-title">// XY PAD</div>
          <table class="help-table">
            <tr><td>X (centro)</td><td>reproducción normal — 1x</td></tr>
            <tr><td>X (izq)</td><td>rebobinar, hasta reverse 2x en el tope</td></tr>
            <tr><td>X (der)</td><td>fast forward, hasta 3x en el tope</td></tr>
            <tr><td>Y (centro)</td><td>NEUTRO — sin FX</td></tr>
            <tr><td>Y (arriba)</td><td>highpass con resonancia — low-cut agresivo</td></tr>
            <tr><td>Y (abajo)</td><td>delay + reverb ambient al máximo</td></tr>
          </table>
        </div>
        <div class="help-section">
          <div class="help-section-title">// LINKS</div>
          <a id="help-github" class="help-link" href="#" target="_blank" rel="noreferrer noopener">github</a>
        </div>
        <div class="help-footer">
          <button id="help-close" class="ctrl-btn">[X] CERRAR  (ESC)</button>
        </div>
      </div>
    </div>

    <div class="screen">
      <header class="top-bar">
        <div class="brand">
          <span class="brand-bracket">╔═══</span>
          <span class="brand-name" id="brand-name"></span>
          <span class="brand-bracket">═══╗</span>
        </div>
        <div class="controls-row">
          <div class="volume-control" title="[ / ] bajan / suben el master volume">
            <button id="vol-down" class="ctrl-btn vol-step" title="[">[-]</button>
            <span class="vol-readout">
              <span id="vol-bar" class="vol-bar">░░░░░░░░░░░░░░</span>
              <span id="vol-num" class="vol-num">085</span>
            </span>
            <button id="vol-up" class="ctrl-btn vol-step" title="]">[+]</button>
          </div>
          <button id="autoplay-btn" class="ctrl-btn">[ ] AUTOPLAY</button>
          <button id="shader-btn"   class="ctrl-btn">FX: DIRECTO</button>
          <span   id="page-indicator" class="page-indicator">PAG 01/01</span>
          <button id="prev-page" class="nav-btn">◄</button>
          <button id="next-page" class="nav-btn">►</button>
          <button id="ui-mode-btn" class="ctrl-btn" title="Tab">UI: FULL</button>
          <button id="help-btn" class="ctrl-btn help-btn" title="?">[?]</button>
        </div>
      </header>

      <div class="main-area">
        <div id="pad-grid" class="pad-grid"></div>

        <div id="xy-pad" class="xy-pad">
          <div class="xy-frame">
            <span class="xy-label xy-top">▲ HI-CUT (resonante)</span>
            <span class="xy-label xy-bottom">WET ▼ (DLY+RVB)</span>
            <span class="xy-label xy-left">◄ REW</span>
            <span class="xy-label xy-right">FF ►</span>
            <span class="xy-label xy-center">CENTER = NEUTRO · X=RATE · Y=FX</span>
            <div id="xy-cursor" class="xy-cursor"><pre class="xy-cursor-art">   │
   │
───┼───
   │
   │   </pre></div>
          </div>
        </div>
      </div>

      <footer class="bottom-bar">
        <span class="hint">1-0=PADS · ←→=PAG · ↑↓=FX · [/]=VOL · SPC=AUTO · TAB=UI · W=WAVE · .=PANIC · ?=AYUDA</span>
      </footer>
    </div>
  `;
}

function renderLoadingOverlay(loaded, total) {
  const overlay = document.getElementById('loading-overlay');
  const barEl   = document.getElementById('loading-bar-fill');
  const pctEl   = document.getElementById('loading-pct');
  const ctrEl   = document.getElementById('loading-counter');
  if (!overlay || !barEl) return;

  const barLen = 30;
  const pct = total > 0 ? loaded / total : 0;
  const filled = Math.round(pct * barLen);
  barEl.textContent = '█'.repeat(filled) + '░'.repeat(barLen - filled);
  pctEl.textContent = `${String(Math.round(pct * 100)).padStart(3, ' ')}%`;
  ctrEl.textContent = `${loaded} / ${total}`;

  if (total > 0 && loaded >= total) {
    overlay.classList.add('done');
    setTimeout(() => { overlay.style.display = 'none'; }, 250);
  }
}

function renderPadGrid() {
  const grid = document.getElementById('pad-grid');
  if (!grid) return;
  grid.innerHTML = '';

  const keyLabels = ['1','2','3','4','5','6','7','8','9','0'];

  for (let i = 0; i < PADS_PER_PAGE; i++) {
    const globalIndex = currentPage * PADS_PER_PAGE + i;
    const clip = clips[globalIndex];

    const pad = document.createElement('div');
    const state = clip ? (padStates.get(globalIndex) || 'loading') : 'empty';
    pad.className = `pad ${state}`;
    pad.dataset.local = i;
    pad.dataset.global = globalIndex;

    const keyLabel = keyLabels[i] || '';
    const title = clip ? (clip.title || clip.file) : '---';
    const truncTitle = title.length > 24 ? title.substring(0, 22) + '..' : title;
    const idxStr = clip ? String(globalIndex + 1).padStart(3, '0') : '---';

    pad.innerHTML = `
      <div class="pad-corner pad-tl">┌</div>
      <div class="pad-corner pad-tr">┐</div>
      <div class="pad-corner pad-bl">└</div>
      <div class="pad-corner pad-br">┘</div>
      <span class="pad-key">[${keyLabel}]</span>
      <span class="pad-index">${idxStr}</span>
      <span class="pad-title">${truncTitle}</span>
      <span class="pad-status"></span>
    `;

    pad.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (clip && allLoaded) triggerPad(globalIndex);
    });

    grid.appendChild(pad);
  }

  refreshAllPadStates();
}

function updatePageIndicator() {
  const el = document.getElementById('page-indicator');
  if (!el) return;
  el.textContent = `PAG ${String(currentPage + 1).padStart(2, '0')}/${String(totalPages).padStart(2, '0')}`;
}

function setEffect(idx) {
  currentEffectIndex = ((idx % effects.length) + effects.length) % effects.length;
  const name = effects[currentEffectIndex].name;
  const btn = document.getElementById('shader-btn');
  if (btn) btn.textContent = `FX: ${name}`;
}

function setupEventListeners() {
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    const key = e.key.toLowerCase();

    // Help modal shortcuts first
    if (key === 'escape') {
      e.preventDefault();
      closeHelpModal();
      return;
    }
    if (e.key === '?' || (e.shiftKey && key === '/')) {
      e.preventDefault();
      openHelpModal();
      return;
    }

    if (key === '.') {
      e.preventDefault();
      panicStopAll();
      return;
    }

    if (key === 'tab') {
      e.preventDefault();
      cycleUIMode();
      const btn = document.getElementById('ui-mode-btn');
      if (btn) btn.textContent = `UI: ${uiMode.replace('_', ' ')}`;
      return;
    }

    if (key === 'w') {
      e.preventDefault();
      showWaveform = !showWaveform;
      showToast(`WAVEFORM ${showWaveform ? 'ON' : 'OFF'}`);
      return;
    }

    if (key === ' ') {
      e.preventDefault();
      toggleAutoPlay();
      return;
    }

    // [ y ] controlan el master volume (bajar / subir)
    if (e.key === '[') {
      e.preventDefault();
      setMasterVolume(masterVolumePct - volumeStep);
      showToast(`VOL ${String(masterVolumePct).padStart(3, '0')}`);
      return;
    }
    if (e.key === ']') {
      e.preventDefault();
      setMasterVolume(masterVolumePct + volumeStep);
      showToast(`VOL ${String(masterVolumePct).padStart(3, '0')}`);
      return;
    }

    // ← → paginado de clips
    if (key === 'arrowright') {
      e.preventDefault();
      if (currentPage < totalPages - 1) {
        currentPage++; renderPadGrid(); updatePageIndicator();
      }
      return;
    }
    if (key === 'arrowleft') {
      e.preventDefault();
      if (currentPage > 0) {
        currentPage--; renderPadGrid(); updatePageIndicator();
      }
      return;
    }
    // ↑ ↓ cambio de efecto visual
    if (key === 'arrowup') {
      e.preventDefault();
      setEffect(currentEffectIndex + 1);
      return;
    }
    if (key === 'arrowdown') {
      e.preventDefault();
      setEffect(currentEffectIndex - 1);
      return;
    }

    if (key in keyMap) {
      const localIndex = keyMap[key];
      const globalIndex = currentPage * PADS_PER_PAGE + localIndex;
      if (globalIndex < clips.length) triggerPad(globalIndex);
    }
  });

  document.getElementById('prev-page').addEventListener('click', () => {
    if (currentPage > 0) { currentPage--; renderPadGrid(); updatePageIndicator(); }
  });
  document.getElementById('next-page').addEventListener('click', () => {
    if (currentPage < totalPages - 1) { currentPage++; renderPadGrid(); updatePageIndicator(); }
  });

  const volDown = document.getElementById('vol-down');
  const volUp   = document.getElementById('vol-up');
  if (volDown) volDown.addEventListener('click', () => setMasterVolume(masterVolumePct - volumeStep));
  if (volUp)   volUp.addEventListener('click',   () => setMasterVolume(masterVolumePct + volumeStep));

  document.getElementById('autoplay-btn').addEventListener('click', toggleAutoPlay);
  document.getElementById('shader-btn').addEventListener('click', () => setEffect(currentEffectIndex + 1));

  document.getElementById('ui-mode-btn').addEventListener('click', () => {
    cycleUIMode();
    const btn = document.getElementById('ui-mode-btn');
    if (btn) btn.textContent = `UI: ${uiMode.replace('_', ' ')}`;
  });

  document.getElementById('help-btn').addEventListener('click', openHelpModal);
  document.getElementById('help-close').addEventListener('click', closeHelpModal);
  document.getElementById('help-modal').addEventListener('click', (e) => {
    if (e.target.id === 'help-modal') closeHelpModal();
  });

  // XY Pad
  const xyPad = document.getElementById('xy-pad');
  const xyCursor = document.getElementById('xy-cursor');

  function handleXY(e) {
    const rect = xyPad.getBoundingClientRect();
    xyX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    xyY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    xyCursor.style.left = (xyX * 100) + '%';
    xyCursor.style.top  = (xyY * 100) + '%';
    updateXYEffects();
  }

  xyPad.addEventListener('pointerdown', (e) => {
    cancelXYReturn();
    xyActive = true;
    xyPad.setPointerCapture(e.pointerId);
    xyPad.classList.add('active');
    handleXY(e);
  });
  xyPad.addEventListener('pointermove', (e) => { if (xyActive) handleXY(e); });
  xyPad.addEventListener('pointerup', () => {
    xyActive = false;
    xyPad.classList.remove('active');
    animateXYReturn();
  });
}

// ─────────────────────────────────────────
// CONFIG / PLAYLIST LOADING
// ─────────────────────────────────────────
async function loadConfig() {
  try {
    const res = await fetch(assetUrl('config.yaml'));
    if (!res.ok) throw new Error('config.yaml missing');
    const parsed = yaml.load(await res.text());
    if (parsed?.effects?.length)  effects = parsed.effects;
    if (parsed?.info)             info = { ...info, ...parsed.info };
    if (parsed?.ui?.defaultMode && UI_MODES.includes(parsed.ui.defaultMode)) {
      uiMode = parsed.ui.defaultMode;
    }
    if (typeof parsed?.ui?.defaultEffect === 'number') {
      currentEffectIndex = Math.max(0, Math.min(effects.length - 1, parsed.ui.defaultEffect));
    }
    if (typeof parsed?.ui?.showWaveform === 'boolean') {
      showWaveform = parsed.ui.showWaveform;
    }
    if (typeof parsed?.ui?.xyPadOpacity === 'number') {
      const a = Math.max(0, Math.min(1, parsed.ui.xyPadOpacity));
      document.documentElement.style.setProperty('--xy-pad-opacity', String(a));
    }
    if (typeof parsed?.ui?.padOpacity === 'number') {
      const a = Math.max(0, Math.min(1, parsed.ui.padOpacity));
      document.documentElement.style.setProperty('--pad-opacity', String(a));
    }
    if (typeof parsed?.ui?.xyReturnMs === 'number') {
      xyReturnMs = Math.max(0, parsed.ui.xyReturnMs);
    }
    if (typeof parsed?.ui?.masterVolume === 'number') {
      masterVolumePct = Math.max(0, Math.min(100, Math.round(parsed.ui.masterVolume)));
    }
    if (typeof parsed?.ui?.volumeStep === 'number') {
      volumeStep = Math.max(1, Math.min(50, Math.round(parsed.ui.volumeStep)));
    }
  } catch (err) {
    console.warn('config.yaml no encontrado, usando defaults');
  }
}

async function loadPlaylist() {
  try {
    const response = await fetch(assetUrl('media/playlist.yaml'));
    if (!response.ok) throw new Error('no playlist.yaml');
    const parsed = yaml.load(await response.text());
    clips = Array.isArray(parsed) ? parsed : (parsed?.clips || parsed?.playlist || []);
  } catch (err) {
    console.warn('playlist.yaml no encontrado, usando config demo');
    clips = [];
    for (let i = 1; i <= 100; i++) {
      clips.push({
        index: i,
        title: `Pregón #${String(i).padStart(3, '0')}`,
        file:  `${String(i).padStart(3, '0')}.mp4`,
      });
    }
  }
}

// Re-bind `onstop` de cada player al índice actual en el Map.
// Necesario después de cualquier re-indexado (compact) — los callbacks
// originales capturaron el índice viejo en su closure.
function rebindPlayerCallbacks() {
  for (const [idx, player] of players) {
    player.onstop = () => {
      activePads.delete(idx);
      const video = activeVideos.get(idx);
      if (video) { video.pause(); activeVideos.delete(idx); }
      if (padStates.get(idx) === 'playing') setPadState(idx, 'ready');
    };
  }
}

// Safety net: después del preload, descarta cualquier clip cuyo Tone.Player
// NO haya logrado cargar el buffer (404, decode error, CORS, etc.) y compacta
// tanto `clips` como el mapa `players` para que la grilla no deje huecos.
function compactClipsToLoaded() {
  const validIndices = [];
  for (let i = 0; i < clips.length; i++) {
    const p = players.get(i);
    if (p && p.loaded) validIndices.push(i);
  }
  if (validIndices.length === clips.length) return;

  const newClips = validIndices.map(i => clips[i]);
  const newPlayers = new Map();
  const newStates = new Map();
  validIndices.forEach((oldIdx, newIdx) => {
    const p = players.get(oldIdx);
    if (p) newPlayers.set(newIdx, p);
    const s = padStates.get(oldIdx);
    if (s) newStates.set(newIdx, s);
  });
  // Descartar players huérfanos
  const keep = new Set(validIndices);
  for (const [oldIdx, p] of players) {
    if (!keep.has(oldIdx)) {
      try { p.dispose(); } catch { /* no-op */ }
    }
  }
  players.clear();
  padStates.clear();
  for (const [k, v] of newPlayers) players.set(k, v);
  for (const [k, v] of newStates) padStates.set(k, v);

  const dropped = clips.length - newClips.length;
  clips = newClips;
  totalPages = Math.max(1, Math.ceil(clips.length / PADS_PER_PAGE));
  if (currentPage >= totalPages) currentPage = totalPages - 1;
  // CRÍTICO: los onstop originales usaban el índice viejo en closure
  rebindPlayerCallbacks();
  if (dropped > 0) console.info(`Compactados ${dropped} clips que no cargaron (grilla sin huecos).`);
}

// Filtra de la playlist los clips cuyo archivo no existe en disco.
// Consolida: si falta el 005, el pad 5 muestra el siguiente en línea, sin huecos.
async function filterMissingClips() {
  if (!clips.length) return;
  const checks = await Promise.all(clips.map(async (clip) => {
    try {
      const res = await fetch(assetUrl(`media/${clip.file}`), { method: 'HEAD' });
      if (!res.ok) return false;
      // Vite dev server hace SPA fallback y responde 200 + text/html
      // para rutas no encontradas. Hay que rechazar explícitamente eso.
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      if (ct.startsWith('text/html')) return false;
      return true;
    } catch {
      return false;
    }
  }));
  const before = clips.length;
  clips = clips.filter((_, i) => checks[i]);
  const dropped = before - clips.length;
  if (dropped > 0) console.info(`Saltados ${dropped} clips faltantes de la playlist`);
}

// ─────────────────────────────────────────
// INIT
// ─────────────────────────────────────────
async function init() {
  buildUI();
  initAudioEngine();

  canvas = document.getElementById('main-canvas');
  ctx = canvas.getContext('2d');
  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  await loadConfig();
  await loadPlaylist();
  await filterMissingClips();

  applyInfo();

  totalPages = Math.ceil(clips.length / PADS_PER_PAGE);

  renderPadGrid();
  updatePageIndicator();
  setEffect(currentEffectIndex);
  applyUIMode(uiMode);
  const umBtn = document.getElementById('ui-mode-btn');
  if (umBtn) umBtn.textContent = `UI: ${uiMode.replace('_', ' ')}`;

  setupEventListeners();
  setMasterVolume(masterVolumePct);
  requestAnimationFrame(drawVideoFrame);

  renderLoadingOverlay(0, clips.length);
  await preloadAllClips((loaded, total) => {
    renderLoadingOverlay(loaded, total);
    refreshAllPadStates();
  });

  // Safety net: descartar clips que no cargaron (aunque el HEAD check los dejó pasar).
  compactClipsToLoaded();
  totalPages = Math.max(1, Math.ceil(clips.length / PADS_PER_PAGE));
  if (currentPage >= totalPages) currentPage = totalPages - 1;
  renderPadGrid();
  updatePageIndicator();
  renderLoadingOverlay(clips.length, clips.length);
}

init();
