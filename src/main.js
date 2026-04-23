import './style.css';
import * as Tone from 'tone';
import yaml from 'js-yaml';

// ─────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────
const PADS_PER_PAGE = 10;
const RELEASE_SEC   = 0.03;
const RATE_MIN      = 0.25;
const RATE_MAX      = 3.0;
const FILTER_MIN    = 200;
const FILTER_MAX    = 20000;

const UI_MODES = ['FULL', 'XY_ONLY', 'PADS_ONLY', 'STEALTH'];

// Base URL de Vite (respeta `base` del vite.config para deploys en subpath
// como GitHub Pages project pages)
const BASE = import.meta.env.BASE_URL || './';

const DEFAULT_EFFECTS = [
  { name: 'DIRECTO', type: 'css', filter: 'none', ghost: 0.15 },
];

const DEFAULT_INFO = {
  title: 'BOTOVEJERO v1.5',
  subtitle: 'instrumento audiovisual vivo',
  github: 'https://github.com/VladimiroBellini/botovejero',
  description: 'Sampler/VJ web.',
};

// ─────────────────────────────────────────
// STATE
// ─────────────────────────────────────────
let clips = [];
let effects = DEFAULT_EFFECTS;
let info = DEFAULT_INFO;
let currentPage = 0;
let totalPages = 1;
let isAutoPlaying = false;
let autoPlayIndex = 0;
let autoPlayTimer = null;
let allLoaded = false;

let uiMode = 'FULL';
let currentEffectIndex = 0;
let showWaveform = false;

// Audio
const players    = new Map();
const padStates  = new Map();
const activePads = new Set();
let masterFilter, masterGain, masterAnalyser;

// XY Pad
let xyActive = false;
let xyX = 0.5;
let xyY = 0.5;

// Video
const activeVideos = new Map();
let canvas, ctx;
let offscreenCanvas, offscreenCtx;

const keyMap = {
  '1': 0, '2': 1, '3': 2, '4': 3, '5': 4,
  '6': 5, '7': 6, '8': 7, '9': 8, '0': 9,
};

// ─────────────────────────────────────────
// AUDIO ENGINE
// ─────────────────────────────────────────
function initAudioEngine() {
  masterFilter   = new Tone.Filter({ frequency: FILTER_MAX, type: 'lowpass', rolloff: -24 });
  masterGain     = new Tone.Gain(1);
  masterAnalyser = new Tone.Analyser('waveform', 256);
  masterFilter.chain(masterGain, masterAnalyser, Tone.getDestination());
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
      url: `${BASE}media/${clip.file}`,
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

  const rate = RATE_MIN + xyX * (RATE_MAX - RATE_MIN);
  player.playbackRate = rate;
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
  xyX = 0.5; xyY = 0.5;
  const xyCursor = document.getElementById('xy-cursor');
  if (xyCursor) { xyCursor.style.left = '50%'; xyCursor.style.top = '50%'; }
  updateXYEffects();
}

function updateXYEffects() {
  const rate       = RATE_MIN + xyX * (RATE_MAX - RATE_MIN);
  const filterFreq = FILTER_MIN + (1 - xyY) * (FILTER_MAX - FILTER_MIN);
  if (masterFilter) masterFilter.frequency.rampTo(filterFreq, 0.05);
  for (const [, player] of players) {
    if (player.state === 'started') player.playbackRate = rate;
  }
  for (const [, video] of activeVideos) {
    video.playbackRate = rate;
  }
}

// ─────────────────────────────────────────
// VIDEO ENGINE
// ─────────────────────────────────────────
function triggerVideo(globalIndex) {
  const clip = clips[globalIndex];
  if (!clip) return;

  const video = document.createElement('video');
  video.src = `${BASE}media/${clip.file}`;
  video.crossOrigin = 'anonymous';
  video.muted = true;
  video.playsInline = true;
  video.playbackRate = RATE_MIN + xyX * (RATE_MAX - RATE_MIN);

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
  }
}

function autoPlayNext() {
  if (!isAutoPlaying) return;
  if (autoPlayIndex >= clips.length) autoPlayIndex = 0;

  const targetPage = Math.floor(autoPlayIndex / PADS_PER_PAGE);
  if (targetPage !== currentPage) {
    currentPage = targetPage;
    renderPadGrid();
    updatePageIndicator();
  }

  triggerPad(autoPlayIndex);
  const player = players.get(autoPlayIndex);
  const rate = RATE_MIN + xyX * (RATE_MAX - RATE_MIN);
  const baseDur = (player && player.buffer && player.buffer.duration)
    ? player.buffer.duration * 1000
    : 5000;
  const dur = baseDur / Math.max(rate, 0.05);
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
        <div class="loading-title">BOTOVEJERO v1.5</div>
        <div class="loading-sub">instrumento audiovisual</div>
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
            <tr><td>↑ / ↓</td><td>página siguiente / anterior</td></tr>
            <tr><td>← / →</td><td>efecto visual</td></tr>
            <tr><td>SPACE</td><td>autoplay on/off</td></tr>
            <tr><td>TAB</td><td>ciclar modo UI (FULL · XY · PADS · STEALTH)</td></tr>
            <tr><td>W</td><td>toggle onda de audio (waveform) sobre el video</td></tr>
            <tr><td>.</td><td>PANIC — stop all</td></tr>
            <tr><td>?</td><td>mostrar esta ayuda</td></tr>
            <tr><td>ESC</td><td>cerrar ayuda</td></tr>
          </table>
        </div>
        <div class="help-section">
          <div class="help-section-title">// XY PAD</div>
          <table class="help-table">
            <tr><td>X</td><td>playback rate  (0.25x - 3x)</td></tr>
            <tr><td>Y</td><td>filtro lowpass (200 Hz - 20 kHz)</td></tr>
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
          <span class="brand-name">BOTOVEJERO v1.5</span>
          <span class="brand-bracket">═══╗</span>
        </div>
        <div class="controls-row">
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
            <span class="xy-label xy-top">Y:FILTER ▲</span>
            <span class="xy-label xy-bottom">▼ CLOSED</span>
            <span class="xy-label xy-left">◄ SLOW</span>
            <span class="xy-label xy-right">FAST ►</span>
            <span class="xy-label xy-center">X=RATE · Y=FILTER</span>
            <div id="xy-cursor" class="xy-cursor"><pre class="xy-cursor-art">   │
   │
───┼───
   │
   │   </pre></div>
          </div>
        </div>
      </div>

      <footer class="bottom-bar">
        <span class="hint">1-0=PADS · ↑↓=PAG · ←→=FX · SPC=AUTO · TAB=UI · W=WAVE · .=PANIC · ?=AYUDA</span>
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

    if (key === 'arrowup') {
      e.preventDefault();
      if (currentPage < totalPages - 1) {
        currentPage++; renderPadGrid(); updatePageIndicator();
      }
      return;
    }
    if (key === 'arrowdown') {
      e.preventDefault();
      if (currentPage > 0) {
        currentPage--; renderPadGrid(); updatePageIndicator();
      }
      return;
    }
    if (key === 'arrowleft') {
      e.preventDefault();
      setEffect(currentEffectIndex - 1);
      return;
    }
    if (key === 'arrowright') {
      e.preventDefault();
      setEffect(currentEffectIndex + 1);
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
    xyActive = true;
    xyPad.setPointerCapture(e.pointerId);
    xyPad.classList.add('active');
    handleXY(e);
  });
  xyPad.addEventListener('pointermove', (e) => { if (xyActive) handleXY(e); });
  xyPad.addEventListener('pointerup', () => {
    xyActive = false;
    xyPad.classList.remove('active');
    xyX = 0.5; xyY = 0.5;
    xyCursor.style.left = '50%';
    xyCursor.style.top  = '50%';
    updateXYEffects();
  });
}

// ─────────────────────────────────────────
// CONFIG / PLAYLIST LOADING
// ─────────────────────────────────────────
async function loadConfig() {
  try {
    const res = await fetch(`${BASE}config.yaml`);
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
  } catch (err) {
    console.warn('config.yaml no encontrado, usando defaults');
  }
}

async function loadPlaylist() {
  try {
    const response = await fetch(`${BASE}media/playlist.yaml`);
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

// Filtra de la playlist los clips cuyo archivo no existe en disco.
// Consolida: si falta el 005, el pad 5 muestra el siguiente en línea, sin huecos.
async function filterMissingClips() {
  if (!clips.length) return;
  const checks = await Promise.all(clips.map(async (clip) => {
    try {
      const res = await fetch(`${BASE}media/${clip.file}`, { method: 'HEAD' });
      return res.ok;
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

  // Aplicar info en help modal
  document.getElementById('help-title').textContent   = info.title;
  document.getElementById('help-sub').textContent     = info.subtitle;
  document.getElementById('help-desc').textContent    = info.description || '';
  const ghLink = document.getElementById('help-github');
  ghLink.href = info.github;
  ghLink.textContent = info.github;

  totalPages = Math.ceil(clips.length / PADS_PER_PAGE);

  renderPadGrid();
  updatePageIndicator();
  setEffect(currentEffectIndex);
  applyUIMode(uiMode);
  const umBtn = document.getElementById('ui-mode-btn');
  if (umBtn) umBtn.textContent = `UI: ${uiMode.replace('_', ' ')}`;

  setupEventListeners();
  requestAnimationFrame(drawVideoFrame);

  renderLoadingOverlay(0, clips.length);
  await preloadAllClips((loaded, total) => {
    renderLoadingOverlay(loaded, total);
    refreshAllPadStates();
  });
}

init();
