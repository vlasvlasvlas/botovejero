# BOTOVEJERO

**Instrumento audiovisual web experimental basado en pregones callejeros latinoamericanos.**

Sampler/VJ tool con motor de audio Tone.js, pad XY tipo Kaoss Pad para modulación en tiempo real (pitch, filtro, velocidad), botonera paginada de 10 pads (teclas 0-9), efectos visuales por shader sobre canvas, y auto-play secuencial.

## Fuente

[Playlist YouTube — 322 videos de ropavejeros/pregoneros](https://www.youtube.com/playlist?list=PLqY0WHGqeB2tdEn_quF2paebPOI70NQhj)

## Stack

| Componente | Tecnología |
|-----------|-----------|
| Build | Vite |
| Audio Engine | Tone.js (Web Audio API) |
| Config | YAML (`js-yaml`) |
| Video | Canvas 2D con shaders CSS |
| Descarga | `yt-dlp` (bash script) |

## Setup

```bash
# Instalar dependencias
npm install

# Descargar clips (requiere yt-dlp instalado)
bash scripts/download_clips.sh

# Iniciar dev server
npm run dev
```

## Controles

| Tecla | Acción |
|-------|--------|
| `1`-`9`, `0` | Disparar pad 1-10 |
| `↑` / `↓` | Cambiar página de pads |
| `←` / `→` | Cambiar efecto visual |
| `SPACE` | Toggle auto-play |
| **XY Pad (mouse)** | X=velocidad, Y=pitch+filtro |

## Estructura

```
botovejero/
├── index.html
├── src/
│   ├── main.js          # App + AudioEngine + VideoEngine
│   └── style.css        # UI premium dark
├── public/
│   └── media/           # Clips descargados + playlist.yaml
├── scripts/
│   └── download_clips.sh
├── concept.md           # Diseño conceptual (panel de expertxs)
└── implementation_suggest.md
```
