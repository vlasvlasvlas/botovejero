import './style.css';
import yaml from 'js-yaml';

// Constantes y Estado
const CLIPS_PER_BANK = 10;
let clips = [];
let currentBankIndex = 0; // 0 to 9
let currentShaderIndex = 0;
const activeVideos = new Set();
let canvas, ctx;

// Mapeo de teclas: '1'-'9' y '0' al final
const keyMap = {
  '1': 0, '2': 1, '3': 2, '4': 3, '5': 4,
  '6': 5, '7': 6, '8': 7, '9': 8, '0': 9
};

// Shaders basados en CSS filters para máximo rendimiento 2D
const shaders = [
  { name: 'PASS-THROUGH', filter: 'none' },
  { name: 'GRÁFICO SUCIO', filter: 'contrast(300%) grayscale(100%)' },
  { name: 'INVERTIDO', filter: 'invert(100%) hue-rotate(180deg)' },
  { name: 'ROJO URBANO', filter: 'sepia(100%) hue-rotate(-50deg) saturate(500%)' },
  { name: 'FANTASMA', filter: 'saturate(200%) blur(2px) contrast(150%)' }
];

document.querySelector('#app').innerHTML = `
  <div class="container">
    <canvas id="main-canvas"></canvas>
    <div class="hud">
      <h1>BOTOVEJERO</h1>
      <div class="status">
        <span id="bank-indicator">CARGANDO...</span>
        <span id="shader-indicator">EFECTO: PASS-THROUGH</span>
      </div>
      <div id="keyboard-map" class="keyboard-map">
        <!-- Generado dinámicamente -->
      </div>
    </div>
  </div>
`;

async function init() {
  canvas = document.getElementById('main-canvas');
  ctx = canvas.getContext('2d');
  
  // Resize canvas
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  try {
    // Cargar playlist.yaml
    const response = await fetch('/media/playlist.yaml');
    if (!response.ok) throw new Error('No se encontró playlist.yaml. ¿Se ejecutó el script de descarga?');
    const yamlText = await response.text();
    clips = yaml.load(yamlText) || [];
  } catch (err) {
    console.error(err);
    document.getElementById('bank-indicator').innerText = 'ERROR: No se encontraron los clips.';
    return;
  }

  // Si hay menos de 100 clips, igual funcionará, simplemente habrá bancos vacíos
  updateHUD();
  
  // Event listeners de teclado
  window.addEventListener('keydown', handleKeyDown);

  // Iniciar loop de render
  requestAnimationFrame(draw);
}

function resizeCanvas() {
  if (canvas) {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
}

function handleKeyDown(e) {
  // Evitar repetición si se mantiene presionada
  if (e.repeat) return;

  const key = e.key.toLowerCase();

  // Navegación de bancos
  if (key === 'arrowup') {
    currentBankIndex = (currentBankIndex + 1) % 10;
    updateHUD();
  } else if (key === 'arrowdown') {
    currentBankIndex = (currentBankIndex - 1 + 10) % 10;
    updateHUD();
  }
  
  // Navegación de shaders
  else if (key === 'arrowleft') {
    currentShaderIndex = (currentShaderIndex - 1 + shaders.length) % shaders.length;
    updateHUD();
  } else if (key === 'arrowright') {
    currentShaderIndex = (currentShaderIndex + 1) % shaders.length;
    updateHUD();
  }

  // Disparadores (Triggers)
  if (key in keyMap) {
    const localIndex = keyMap[key];
    const globalIndex = currentBankIndex * CLIPS_PER_BANK + localIndex;
    
    if (globalIndex < clips.length) {
      triggerClip(globalIndex, key);
    }
  }
}

function triggerClip(index, key) {
  const clip = clips[index];
  if (!clip) return;

  // Feedback visual en la UI
  const pad = document.getElementById(\`pad-\${key}\`);
  if (pad) {
    pad.classList.add('active');
    setTimeout(() => pad.classList.remove('active'), 200);
  }

  // Instanciar el video
  const video = document.createElement('video');
  video.src = \`/media/\${clip.file}\`;
  video.crossOrigin = 'anonymous';
  video.autoplay = true;
  video.controls = false;
  
  // Al terminar, lo sacamos del Set
  video.onended = () => {
    activeVideos.delete(video);
  };
  
  // Si hay error (ej: no existe el archivo aún), lo ignoramos
  video.onerror = () => {
    console.warn(\`Clip no encontrado: \${clip.file}\`);
    activeVideos.delete(video);
  };

  activeVideos.add(video);
  
  // Manejar el play() catch por temas del navegador
  video.play().catch(e => {
    console.error("Autoplay bloqueado:", e);
    activeVideos.delete(video);
  });
}

function updateHUD() {
  document.getElementById('bank-indicator').innerText = \`BANCO \${currentBankIndex + 1} DE 10 [Flechas Arriba/Abajo]\`;
  document.getElementById('shader-indicator').innerText = \`EFECTO: \${shaders[currentShaderIndex].name} [Flechas Izq/Der]\`;

  const mapContainer = document.getElementById('keyboard-map');
  mapContainer.innerHTML = '';

  for (let i = 0; i < CLIPS_PER_BANK; i++) {
    const globalIndex = currentBankIndex * CLIPS_PER_BANK + i;
    const clip = clips[globalIndex];
    
    // Encontrar la tecla correspondiente
    let targetKey = '';
    for (const [k, v] of Object.entries(keyMap)) {
      if (v === i) targetKey = k;
    }

    const pad = document.createElement('div');
    pad.className = 'key-pad';
    pad.id = \`pad-\${targetKey}\`;
    
    pad.innerHTML = \`
      <span class="key-label">\${targetKey.toUpperCase()}</span>
      <span class="clip-name">\${clip ? clip.title : '-- Vacío --'}</span>
    \`;
    mapContainer.appendChild(pad);
  }
}

function draw() {
  if (!ctx) return;
  
  // Limpiar fondo
  ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Aplicar shader
  ctx.filter = shaders[currentShaderIndex].filter;
  
  // Modo de composición para sumar luz si hay varios videos (tipo instalación)
  ctx.globalCompositeOperation = 'screen';
  
  // Dibujar videos activos
  for (const video of activeVideos) {
    if (video.readyState >= 2) {
      // Cálculo para mantener el aspect ratio y cubrir la pantalla
      const videoRatio = video.videoWidth / video.videoHeight;
      const canvasRatio = canvas.width / canvas.height;
      let drawWidth, drawHeight, startX, startY;
      
      if (videoRatio > canvasRatio) {
        drawHeight = canvas.height;
        drawWidth = canvas.height * videoRatio;
        startX = (canvas.width - drawWidth) / 2;
        startY = 0;
      } else {
        drawWidth = canvas.width;
        drawHeight = canvas.width / videoRatio;
        startX = 0;
        startY = (canvas.height - drawHeight) / 2;
      }
      
      ctx.drawImage(video, startX, startY, drawWidth, drawHeight);
    }
  }
  
  ctx.globalCompositeOperation = 'source-over'; // Reset
  ctx.filter = 'none'; // Reset
  
  requestAnimationFrame(draw);
}

// Arrancar la app
init();
