# Botovejero V1 Tasks

## Setup & Infraestructura
- [x] Initialize Vite vanilla project
- [x] Instalar dependencias (tone, js-yaml)
- [x] Create `yt-dlp` script (`scripts/download_clips.sh`) para 100 clips
- [ ] Ejecutar script de descarga para poblar `public/media/`

## Core — Motor de Audio (Tone.js SOTA)
- [x] Motor polifónico con Tone.js (múltiples pads simultáneos)
- [x] Cadena de efectos master: PitchShift → Filter → Gain → Analyser
- [x] XY Pad tipo Kaoss Pad (X=velocidad, Y=pitch+filtro)
- [x] Auto-play secuencial (reproduce todos los clips en orden)

## Core — Motor Visual
- [x] Canvas rendering con `requestAnimationFrame`
- [x] 6 shaders visuales (Directo, Gráfico Sucio, Invertido, Rojo Urbano, Fantasma, Posterizado)
- [x] Composición de múltiples videos con blending `screen`
- [x] Waveform overlay desde analyser de Tone.js
- [x] Efecto ghosting (persistencia de frames)

## UI
- [x] Botonera de 10 pads por página (teclas 1-9, 0)
- [x] Paginación (↑↓ para navegar páginas)
- [x] Multi-touch / multi-pointer support
- [x] CSS premium dark con animaciones (glassmorphism, glow, fade-in)
- [x] Layout responsivo (desktop + mobile)
- [x] Hint bar con controles

## Config & Data
- [x] Carga de playlist desde YAML (`public/media/playlist.yaml`)
- [x] Fallback a config demo si no hay YAML

## Documentación
- [x] README.md con setup, controles, estructura
- [x] concept.md (diseño conceptual del panel de expertxs)
- [x] implementation_suggest.md (plan técnico)

## Pendiente
- [ ] Descargar los 100 clips con `bash scripts/download_clips.sh`
- [ ] Probar latencia real con clips cargados

