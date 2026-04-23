import './style.css';
import * as Tone from 'tone';
import yaml from 'js-yaml';

// ─────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────
const PADS_PER_PAGE = 10;
const COLUMNS = 5;
const ROWS = 2;

// ─────────────────────────────────────────
// STATE
// ─────────────────────────────────────────
let clips = [];
let currentPage = 0;
let totalPages = 1;
let isAutoPlaying = false;
let autoPlayIndex = 0;
let autoPlayTimer = null;

// Audio engine state
const players = new Map();       // padIndex -> Tone.Player
const activePads = new Set();    // currently pressed pad indices
let masterFilter, masterPitchShift, masterGain, masterAnalyser;

// XY Pad state
let xyActive = false;
let xyX = 0.5;  // 0..1 (left=slow, right=fast)
let xyY = 0.5;  // 0..1 (top=high pitch, bottom=low pitch / filter)

// Video state
const activeVideos = new Map(); // padIndex -> video element
let canvas, ctx;
let currentShaderIndex = 0;
const shaders = [
  { name: 'DIRECTO', apply: () => { ctx.filter = 'none'; } },
  { name: 'GRÁFICO SUCIO', apply: () => { ctx.filter = 'contrast(300%) grayscale(100%)'; } },
  { name: 'INVERTIDO', apply: () => { ctx.filter = 'invert(100%) hue-rotate(180deg)'; } },
  { name: 'ROJO URBANO', apply: () => { ctx.filter = 'sepia(100%) hue-rotate(-50deg) saturate(500%)'; } },
  { name: 'FANTASMA', apply: () => { ctx.filter = 'saturate(200%) blur(2px) contrast(150%)'; } },
  { name: 'POSTERIZADO', apply: () => { ctx.filter = 'contrast(200%) saturate(300%) brightness(120%)'; } },
];

// Keyboard mapping: keys 1-9, 0 to pad indices 0-9
const keyMap = {
  '1': 0, '2': 1, '3': 2, '4': 3, '5': 4,
  '6': 5, '7': 6, '8': 7, '9': 8, '0': 9,
};

// ─────────────────────────────────────────
// AUDIO ENGINE (Tone.js — SOTA)
// ─────────────────────────────────────────
function initAudioEngine() {
  // Master chain: PitchShift → Filter → Gain → Analyser → Destination
  masterPitchShift = new Tone.PitchShift({ pitch: 0, windowSize: 0.1 });
  masterFilter = new Tone.Filter({ frequency: 20000, type: 'lowpass', rolloff: -24 });
  masterGain = new Tone.Gain(1);
  masterAnalyser = new Tone.Analyser('waveform', 256);

  masterPitchShift.chain(masterFilter, masterGain, masterAnalyser, Tone.getDestination());
}

function loadClipAudio(index) {
  if (players.has(index)) return players.get(index);
  const clip = clips[index];
  if (!clip) return null;

  const player = new Tone.Player({
    url: `/media/${clip.file}`,
    loop: false,
    onload: () => {
      console.log(`Audio loaded: ${clip.title || clip.file}`);
    },
    onerror: (e) => {
      console.warn(`Audio error for ${clip.file}:`, e);
    }
  });
  player.connect(masterPitchShift);
  players.set(index, player);
  return player;
}

function triggerPad(globalIndex) {
  if (globalIndex >= clips.length) return;

  // Start Tone context on first interaction
  if (Tone.getContext().state !== 'running') {
    Tone.start();
  }

  const player = loadClipAudio(globalIndex);
  if (!player || !player.loaded) {
    // Try to load and will play when ready
    const p = loadClipAudio(globalIndex);
    if (p) {
      p.onstop = () => {};
      // Queue play when loaded
      const checkReady = setInterval(() => {
        if (p.loaded) {
          clearInterval(checkReady);
          p.start();
        }
      }, 50);
    }
    return;
  }

  // If already playing, restart it
  if (player.state === 'started') {
    player.stop();
  }
  player.start();

  activePads.add(globalIndex);

  // Trigger video
  triggerVideo(globalIndex);

  // Visual feedback on pad
  const localIndex = globalIndex - currentPage * PADS_PER_PAGE;
  const padEl = document.querySelector(`.pad[data-local="${localIndex}"]`);
  if (padEl) {
    padEl.classList.add('active');
    // Remove active after the clip ends or a timeout
    const dur = player.buffer ? player.buffer.duration * 1000 : 3000;
    setTimeout(() => {
      padEl.classList.remove('active');
      activePads.delete(globalIndex);
    }, Math.min(dur, 30000));
  }
}

function stopPad(globalIndex) {
  const player = players.get(globalIndex);
  if (player && player.state === 'started') {
    player.stop();
  }
  activePads.delete(globalIndex);

  // Stop video
  const video = activeVideos.get(globalIndex);
  if (video) {
    video.pause();
    activeVideos.delete(globalIndex);
  }

  const localIndex = globalIndex - currentPage * PADS_PER_PAGE;
  const padEl = document.querySelector(`.pad[data-local="${localIndex}"]`);
  if (padEl) padEl.classList.remove('active');
}

// Update XY effects on all active players
function updateXYEffects() {
  // X axis: playback rate (0.25x to 3x)
  const rate = 0.25 + xyX * 2.75;

  // Y axis: pitch shift (-12 to +12 semitones) and filter
  const pitch = (1 - xyY) * 24 - 12; // top = +12, bottom = -12
  const filterFreq = 200 + xyY * 19800; // top = 20000 (open), bottom = 200 (closed)

  // Update master effects
  if (masterPitchShift) {
    masterPitchShift.pitch = pitch;
  }
  if (masterFilter) {
    masterFilter.frequency.rampTo(filterFreq, 0.05);
  }

  // Update playback rate on all active players
  for (const [, player] of players) {
    if (player.state === 'started') {
      player.playbackRate = rate;
    }
  }

  // Update video playback rates to match
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
  video.src = `/media/${clip.file}`;
  video.crossOrigin = 'anonymous';
  video.muted = true; // Audio comes from Tone.js
  video.playsInline = true;

  video.onended = () => {
    activeVideos.delete(globalIndex);
  };
  video.onerror = () => {
    activeVideos.delete(globalIndex);
  };

  // Remove previous video for this pad if any
  if (activeVideos.has(globalIndex)) {
    activeVideos.get(globalIndex).pause();
  }

  activeVideos.set(globalIndex, video);
  video.play().catch(() => activeVideos.delete(globalIndex));
}

function drawVideoFrame() {
  if (!ctx) return;

  // Dark background with slight persistence for ghosting effect
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = 'rgba(5, 5, 10, 0.85)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Apply current shader
  shaders[currentShaderIndex].apply();

  // Layer active videos with 'screen' blending for luminous overlay
  ctx.globalCompositeOperation = 'screen';

  let videoCount = 0;
  for (const [, video] of activeVideos) {
    if (video.readyState >= 2) {
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
      ctx.globalAlpha = Math.min(1, 1 / (videoCount + 1) + 0.3);
      ctx.drawImage(video, sx, sy, dw, dh);
      videoCount++;
    }
  }

  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'none';

  // Draw waveform overlay from analyser
  if (masterAnalyser && activePads.size > 0) {
    const waveform = masterAnalyser.getValue();
    ctx.strokeStyle = 'rgba(255, 60, 60, 0.5)';
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

  requestAnimationFrame(drawVideoFrame);
}

// ─────────────────────────────────────────
// AUTO-PLAY MODE
// ─────────────────────────────────────────
function toggleAutoPlay() {
  isAutoPlaying = !isAutoPlaying;
  const btn = document.getElementById('autoplay-btn');
  if (isAutoPlaying) {
    btn.classList.add('on');
    btn.textContent = '⏹ STOP';
    autoPlayNext();
  } else {
    btn.classList.remove('on');
    btn.textContent = '▶ AUTO PLAY';
    clearTimeout(autoPlayTimer);
  }
}

function autoPlayNext() {
  if (!isAutoPlaying) return;
  if (autoPlayIndex >= clips.length) autoPlayIndex = 0;

  // Navigate to correct page
  const targetPage = Math.floor(autoPlayIndex / PADS_PER_PAGE);
  if (targetPage !== currentPage) {
    currentPage = targetPage;
    renderPadGrid();
    updatePageIndicator();
  }

  triggerPad(autoPlayIndex);
  autoPlayIndex++;

  // Get clip duration or default to 5s
  const player = players.get(autoPlayIndex - 1);
  const dur = (player && player.loaded && player.buffer) ? player.buffer.duration * 1000 : 5000;
  autoPlayTimer = setTimeout(autoPlayNext, dur + 200);
}

// ─────────────────────────────────────────
// UI RENDERING
// ─────────────────────────────────────────

function buildUI() {
  document.querySelector('#app').innerHTML = `
    <div class="container">
      <canvas id="main-canvas"></canvas>
      <div class="hud">
        <header class="top-bar">
          <h1>BOTOVEJERO</h1>
          <div class="controls-row">
            <button id="autoplay-btn" class="ctrl-btn">▶ AUTO PLAY</button>
            <button id="shader-btn" class="ctrl-btn">🎨 EFECTO: DIRECTO</button>
            <span id="page-indicator" class="page-indicator">1 / 1</span>
            <div class="nav-btns">
              <button id="prev-page" class="nav-btn">◀</button>
              <button id="next-page" class="nav-btn">▶</button>
            </div>
          </div>
        </header>

        <div class="main-area">
          <div id="pad-grid" class="pad-grid"></div>
          <div id="xy-pad" class="xy-pad">
            <div id="xy-cursor" class="xy-cursor"></div>
            <span class="xy-label xy-top">PITCH ▲</span>
            <span class="xy-label xy-bottom">FILTER ▼</span>
            <span class="xy-label xy-left">◀ SLOW</span>
            <span class="xy-label xy-right">FAST ▶</span>
            <span class="xy-label xy-center">XY PAD</span>
          </div>
        </div>

        <footer class="bottom-bar">
          <span class="hint">TECLAS: 1-9, 0 = pads · ↑↓ = página · ←→ = efecto · SPACE = auto play</span>
        </footer>
      </div>
    </div>
  `;
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
    pad.className = 'pad' + (clip ? '' : ' empty');
    pad.dataset.local = i;
    pad.dataset.global = globalIndex;

    const keyLabel = keyLabels[i] || '';
    const title = clip ? (clip.title || clip.file) : '—';
    const truncTitle = title.length > 28 ? title.substring(0, 25) + '...' : title;

    pad.innerHTML = `
      <span class="pad-key">${keyLabel}</span>
      <span class="pad-index">${globalIndex + 1}</span>
      <span class="pad-title">${truncTitle}</span>
    `;

    // Pointer events for multi-touch
    pad.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (clip) triggerPad(globalIndex);
    });
    pad.addEventListener('pointerup', (e) => {
      e.preventDefault();
    });

    grid.appendChild(pad);
  }
}

function updatePageIndicator() {
  const el = document.getElementById('page-indicator');
  if (el) el.textContent = `${currentPage + 1} / ${totalPages}`;
}

function setupEventListeners() {
  // Keyboard
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    const key = e.key.toLowerCase();

    if (key === ' ') {
      e.preventDefault();
      toggleAutoPlay();
      return;
    }

    if (key === 'arrowup') {
      e.preventDefault();
      if (currentPage < totalPages - 1) {
        currentPage++;
        renderPadGrid();
        updatePageIndicator();
      }
      return;
    }
    if (key === 'arrowdown') {
      e.preventDefault();
      if (currentPage > 0) {
        currentPage--;
        renderPadGrid();
        updatePageIndicator();
      }
      return;
    }
    if (key === 'arrowleft') {
      e.preventDefault();
      currentShaderIndex = (currentShaderIndex - 1 + shaders.length) % shaders.length;
      document.getElementById('shader-btn').textContent = `🎨 EFECTO: ${shaders[currentShaderIndex].name}`;
      return;
    }
    if (key === 'arrowright') {
      e.preventDefault();
      currentShaderIndex = (currentShaderIndex + 1) % shaders.length;
      document.getElementById('shader-btn').textContent = `🎨 EFECTO: ${shaders[currentShaderIndex].name}`;
      return;
    }

    if (key in keyMap) {
      const localIndex = keyMap[key];
      const globalIndex = currentPage * PADS_PER_PAGE + localIndex;
      if (globalIndex < clips.length) {
        triggerPad(globalIndex);
      }
    }
  });

  // Page navigation buttons
  document.getElementById('prev-page').addEventListener('click', () => {
    if (currentPage > 0) {
      currentPage--;
      renderPadGrid();
      updatePageIndicator();
    }
  });
  document.getElementById('next-page').addEventListener('click', () => {
    if (currentPage < totalPages - 1) {
      currentPage++;
      renderPadGrid();
      updatePageIndicator();
    }
  });

  // Auto play button
  document.getElementById('autoplay-btn').addEventListener('click', toggleAutoPlay);

  // Shader button
  document.getElementById('shader-btn').addEventListener('click', () => {
    currentShaderIndex = (currentShaderIndex + 1) % shaders.length;
    document.getElementById('shader-btn').textContent = `🎨 EFECTO: ${shaders[currentShaderIndex].name}`;
  });

  // XY Pad interactions
  const xyPad = document.getElementById('xy-pad');
  const xyCursor = document.getElementById('xy-cursor');

  function handleXY(e) {
    const rect = xyPad.getBoundingClientRect();
    xyX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    xyY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    xyCursor.style.left = (xyX * 100) + '%';
    xyCursor.style.top = (xyY * 100) + '%';

    updateXYEffects();
  }

  xyPad.addEventListener('pointerdown', (e) => {
    xyActive = true;
    xyPad.setPointerCapture(e.pointerId);
    xyPad.classList.add('active');
    handleXY(e);
  });
  xyPad.addEventListener('pointermove', (e) => {
    if (xyActive) handleXY(e);
  });
  xyPad.addEventListener('pointerup', () => {
    xyActive = false;
    xyPad.classList.remove('active');
    // Reset effects to neutral
    xyX = 0.5;
    xyY = 0.5;
    xyCursor.style.left = '50%';
    xyCursor.style.top = '50%';
    updateXYEffects();
  });
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

  // Load clip config
  try {
    const response = await fetch('/media/playlist.yaml');
    if (!response.ok) throw new Error('No se encontró playlist.yaml');
    const yamlText = await response.text();
    const parsed = yaml.load(yamlText);
    // Handle both array format and object-with-array format
    clips = Array.isArray(parsed) ? parsed : (parsed?.clips || parsed?.playlist || []);
  } catch (err) {
    console.warn('playlist.yaml not found, generating demo config...');
    // Generate demo clips for testing
    clips = [];
    for (let i = 1; i <= 100; i++) {
      clips.push({
        index: i,
        title: `Pregón #${String(i).padStart(3, '0')}`,
        file: `${String(i).padStart(3, '0')}.mp4`
      });
    }
  }

  totalPages = Math.ceil(clips.length / PADS_PER_PAGE);

  renderPadGrid();
  updatePageIndicator();
  setupEventListeners();

  // Start render loop
  requestAnimationFrame(drawVideoFrame);
}

init();
