# BOTOVEJERO

**Instrumento audiovisual web — sampler + VJ tool construido sobre una playlist de 322 videos de pregoneros callejeros latinoamericanos.**

Disparás pads con el teclado, modulás velocidad y filtro con un XY pad tipo Kaoss, y aplicás efectos visuales configurables sobre los clips en tiempo real. Estética ANSI BBS.

> **Demo (una vez activada la página en GitHub):** `https://<tu-usuario>.github.io/botovejero/`

---

## Features

- **Motor de audio Tone.js** polifónico con pre-carga eager de todos los clips — latencia cero al primer disparo.
- **XY pad** tipo Kaoss (eje X = playback rate, eje Y = filtro lowpass).
- **12 efectos visuales** aplicables al canvas, configurables vía YAML:
  CSS filters (directo, sucio, invertido, rojo urbano, fantasma, posterizado, ghosting pesado), **pixelado**, **scanlines**, **RGB shift**, **ASCII art** (verde fósforo), **ANSI blocks** (paleta CGA/AMIGA/MONO), y 4 modos multi-video (**DIFFERENCE**, **EXCLUSION**, **CHANNEL SPLIT**, **WEAVE**, **VIDEO GRID**).
- **4 modos de UI** cicleables por teclado: `FULL`, `XY_ONLY`, `PADS_ONLY`, `STEALTH` (solo video).
- **Autoplay** secuencial que ajusta la duración por `playbackRate`.
- **Panic button** (`.`) que corta todo instantáneo.
- **Modal de ayuda** (`?`) con shortcuts y links.
- **Pre-carga con indicador** ANSI y consolidación automática de clips faltantes (si un video no existe, no deja hueco — corre los siguientes).
- Estética **ANSI BBS** (paleta CGA/EGA, fuente monoespaciada, box-drawing).

---

## Stack

| Componente   | Tecnología                              |
|--------------|------------------------------------------|
| Build        | [Vite](https://vitejs.dev/) vanilla JS  |
| Audio        | [Tone.js](https://tonejs.github.io/) 15 |
| YAML parser  | `js-yaml` 4                              |
| Video        | Canvas 2D + filtros/efectos              |
| Descarga     | `yt-dlp` (bash script)                   |
| Deploy       | GitHub Actions + GitHub Pages            |

---

## Quick start (local)

```bash
git clone https://github.com/<tu-usuario>/botovejero.git
cd botovejero
npm install
npm run dev        # → http://localhost:3000
```

Al arrancar, la app detecta qué clips están efectivamente presentes en `public/media/` (filtra los faltantes) y pre-carga todos en paralelo. Cuando la barra ANSI llega a 100%, los pads se habilitan.

Si no tenés los `.mp4` descargados todavía, corré el script de descarga (ver sección **Descarga de media**). Si no, la app levanta con clips demo que fallan al tocarse — vas a ver los pads, pero sin sonido.

---

## Controles

### Teclado

| Tecla                | Acción                                              |
|----------------------|------------------------------------------------------|
| `1`-`9`, `0`         | Disparar pads 1-10 de la página actual              |
| `↑` / `↓`            | Cambiar página                                       |
| `←` / `→`            | Efecto visual anterior / siguiente                  |
| `SPACE`              | Toggle autoplay secuencial                          |
| `TAB`                | Ciclar modo UI (FULL · XY · PADS · STEALTH)         |
| `W`                  | Toggle onda de audio (waveform) sobre el video      |
| `.`                  | **PANIC** — detiene todo y resetea XY               |
| `?`                  | Abrir modal de ayuda                                |
| `ESC`                | Cerrar modal de ayuda                               |
| `F11` (navegador)    | Pantalla completa                                   |

### Mouse / touch

| Zona     | Acción                                 |
|----------|-----------------------------------------|
| Pad      | Click / touch dispara el clip          |
| XY pad   | Drag para modular rate (X) y filter (Y). Al soltar vuelve al centro (neutro). |
| Top bar  | Botones equivalentes a los shortcuts   |

---

## Modos de UI

Cicleable con `Tab`:

| Modo         | Qué se ve                                  | Pensado para…                         |
|--------------|---------------------------------------------|----------------------------------------|
| `FULL`       | Top bar + pads + XY + bottom bar           | Sesión normal, armar y ajustar        |
| `XY_ONLY`    | Solo XY pad (pads ocultos)                 | Modular finamente un clip ya disparado |
| `PADS_ONLY`  | Solo grilla de pads (XY oculto)            | Disparo rápido con teclado            |
| `STEALTH`    | Solo el video de fondo (todo oculto)       | Proyección pura, performance en vivo  |

En `STEALTH` el waveform está off por default — si lo querés ver, `W`.

---

## Configuración (`public/config.yaml`)

Todo lo estético y la lista de efectos viven en YAML. Editás y recargás, sin rebuild.

```yaml
ui:
  defaultMode: FULL       # FULL | XY_ONLY | PADS_ONLY | STEALTH
  defaultEffect: 0        # índice del efecto inicial
  showWaveform: false     # onda de audio (toggle: W)

info:
  title: "BOTOVEJERO"
  subtitle: "Lo que quieren las wachas"
  github: "https://github.com/<tu-usuario>/botovejero"
  description: >
    Sampler/VJ basado en pregoneros latinoamericanos.

effects:
  - name: DIRECTO
    type: css
    filter: "none"
    ghost: 0.15
  - name: ASCII
    type: ascii
    cellSize: 12
    charset: " .:-=+*#%@"
    color: "#55FF55"
    ghost: 0.10
  # ... etc
```

### Tipos de efecto soportados

| Tipo            | Parámetros                                                         | Descripción                                           |
|-----------------|---------------------------------------------------------------------|--------------------------------------------------------|
| `css`           | `filter` (string), `ghost` (0..1)                                  | Filtros CSS nativos (`blur`, `contrast`, `invert`…)   |
| `pixelate`      | `size` (px), `ghost`                                               | Downsample + upscale sin smoothing                    |
| `scanlines`     | `thickness`, `gap`, `intensity` (0..1), `ghost`                    | Líneas negras horizontales tipo CRT                   |
| `rgbShift`      | `offset` (px), `ghost`                                             | Desfase cromático R/G/B                               |
| `ascii`         | `cellSize`, `charset`, `color`, `background`, `ghost`              | Arte ASCII por luminancia                             |
| `ansiBlocks`    | `cellSize`, `palette` (`CGA`/`AMIGA`/`MONO`), `ghost`              | Bloques de color cuantizados a paleta retro           |
| `blend`         | `composite` (`difference`/`exclusion`/`multiply`/…), `ghost`       | Compositing entre videos — se nota con varios pads    |
| `channelSplit`  | `channels` (array de CSS filters), `ghost`                         | Cada video al canal R/G/B sumados con `lighter`       |
| `weave`         | `bandHeight` (px), `ghost`                                         | Bandas horizontales alternando entre videos activos   |
| `videoGrid`     | `ghost`                                                            | Auto-grilla dinámica según cantidad de videos         |

El parámetro `ghost: 0..1` controla cuánto del frame anterior se preserva (0 = sin rastro, 0.9 = ghost muy largo).

---

## Playlist (`public/media/playlist.yaml`)

Define los clips disponibles. Formato:

```yaml
- index: 001
  title: "Vendedor ambulante argentino"
  file: "001.mp4"
- index: 002
  title: "Oferta de verdura para los guampa en el barrio"
  file: "002.mp4"
```

La app filtra en runtime los `file:` que no existen en disco, así que podés tener la playlist completa y solo bajar algunos.

---

## Descarga de media

Requiere [`yt-dlp`](https://github.com/yt-dlp/yt-dlp) instalado y Python 3.10+.

```bash
bash scripts/download_clips.sh
```

Esto baja los primeros 100 videos de la [playlist fuente](https://www.youtube.com/playlist?list=PLqY0WHGqeB2tdEn_quF2paebPOI70NQhj) a `public/media/` en 360p y genera `playlist.yaml`.

> ⚠️ Algunos videos de la playlist pueden estar privados/borrados. Esos quedan fuera y la app los salta sin mostrar hueco.

---

## Deploy a GitHub Pages

El workflow `.github/workflows/deploy.yml` ya está incluido y usa el flujo oficial de Pages:

1. **Push** del repo a GitHub.
2. En el repo: **Settings → Pages → Build and deployment → Source: "GitHub Actions"**.
3. Primer push a `main` (o disparo manual desde Actions → *Deploy to GitHub Pages* → *Run workflow*) construye y publica.
4. URL: `https://<tu-usuario>.github.io/botovejero/`.

El workflow:
- Usa Node 20 con cache de npm.
- Corre `npm ci && npm run build`.
- Publica el directorio `dist/` como artefacto de Pages.
- Usa `concurrency: pages` para que solo haya un deploy en vuelo.

### Sobre el tamaño del repo

GitHub Pages tiene un límite **soft** de 1 GB por repo y **100 GB/mes** de ancho de banda. Los 86 clips en 360p pesan ~500 MB. Si excedés, opciones:

- Hostear los `.mp4` en otro lado (S3, Cloudflare R2, Bunny CDN) y ajustar `clip.file` a URL absoluta.
- Bajarlos a 240p.
- Usar Git LFS (no recomendado para Pages por bandwidth).

### Sobre el `base` de Vite

`vite.config.js` usa `base: './'` — rutas relativas que funcionan tanto en `<user>.github.io/` como en subpaths tipo `<user>.github.io/botovejero/`. Si cambiás el nombre del repo o lo servís desde otra ruta, no tenés que tocar nada.

---

## Estructura

```
botovejero/
├── .github/
│   └── workflows/
│       └── deploy.yml              # CI/CD a GitHub Pages
├── index.html
├── src/
│   ├── main.js                     # App + AudioEngine + VideoEngine + Effects
│   └── style.css                   # UI ANSI BBS (paleta CGA/EGA)
├── public/
│   ├── config.yaml                 # Config runtime (efectos + UI + info)
│   └── media/
│       ├── playlist.yaml           # Catálogo de clips
│       └── 001.mp4, 002.mp4, …     # Videos descargados
├── scripts/
│   └── download_clips.sh           # Descarga via yt-dlp
├── docs/                           # (gitignored) auditoría, concept, tasks
├── package.json
├── vite.config.js
├── .gitignore
└── README.md
```

---

## Arquitectura de audio

```
┌──────────────┐    ┌─────────────┐    ┌────────┐    ┌──────────┐    ┌────────────┐
│ Tone.Player  │───▶│ master      │───▶│ master │───▶│ master   │───▶│ destination│
│ (por clip,   │    │ Filter      │    │ Gain   │    │ Analyser │    │            │
│ fadeOut 30ms)│    │ (Y = freq)  │    │        │    │ (wave)   │    │            │
└──────────────┘    └─────────────┘    └────────┘    └──────────┘    └────────────┘
       ▲
       │ playbackRate = X axis (0.25x - 3x, pitch natural)
```

- Cada `Tone.Player` pre-carga su buffer al arranque.
- Release envelope de 30 ms en `fadeOut` evita clicks al `stop()`.
- El eje Y del XY Pad controla el cutoff del lowpass master con rampa de 50 ms.
- El eje X modifica el `playbackRate` del player y el del elemento `<video>` en sincronía (pitch natural de vinilo, sin compensación).

---

## Arquitectura de video

- Canvas 2D fullscreen de fondo (`#main-canvas`).
- Cada trigger crea un `<video>` mudo, `playsInline`, añadido a un `Map<padIndex, video>`.
- `requestAnimationFrame` dibuja el efecto actual sobre el canvas.
- El efecto elige cómo combinar los videos activos (los multi-video aprovechan cuando hay más de uno).
- Ghost-trail por efecto: al inicio de cada frame, `fillRect` con alpha `1 - ghost` "aclara" el frame anterior.

---

## Créditos

- **Fuente de audio/video**: [Playlist YouTube — 322 videos de ropavejeros/pregoneros](https://www.youtube.com/playlist?list=PLqY0WHGqeB2tdEn_quF2paebPOI70NQhj).
- Fuente VT323 via Google Fonts, IBM Plex Mono via Google Fonts.

---

## Licencia

Sin licencia declarada por ahora. Si vas a re-usar, preguntá al autor.
