# BOTOVEJERO

> **Instrumento audiovisual web — sampler + VJ tool sobre una playlist de 322 videos de pregoneros callejeros latinoamericanos.**

Disparás pads con el teclado, modulás velocidad y filtro con un XY pad tipo Kaoss, y aplicás efectos visuales configurables sobre los clips en tiempo real. Estética ANSI BBS.

🌐 **Demo en vivo:** [vlasvlasvlas.github.io/botovejero](https://vlasvlasvlas.github.io/botovejero/)
📦 **Repo:** [github.com/vlasvlasvlas/botovejero](https://github.com/vlasvlasvlas/botovejero)
🎞 **Fuente audiovisual:** [Playlist YouTube — 322 pregoneros](https://www.youtube.com/playlist?list=PLqY0WHGqeB2tdEn_quF2paebPOI70NQhj)

---

## Tabla de contenido

- [Features](#features)
- [Quick start](#quick-start)
- [Controles](#controles)
- [Modos de UI](#modos-de-ui)
- [Configuración (`config.yaml`)](#configuración-configyaml)
- [Efectos disponibles](#efectos-disponibles)
- [Playlist (`playlist.yaml`)](#playlist-playlistyaml)
- [Descarga de media](#descarga-de-media)
- [Deploy a GitHub Pages](#deploy-a-github-pages)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Arquitectura](#arquitectura)
- [Stack](#stack)
- [Licencia y uso](#licencia-y-uso)
- [Créditos](#créditos)

---

## Features

- 🎹 **Motor de audio Tone.js** polifónico con pre-carga eager — latencia cero al primer disparo.
- 🎛 **XY pad** tipo Kaoss:
  - Eje X: centro (sin tocar) = playback normal 1×; izquierda = rebobinar hasta reverse 2×; derecha = fast forward hasta 3×.
  - Eje Y: filtro lowpass (200 Hz – 20 kHz).
  - Pitch natural de vinilo, sin time-stretch. El reverse usa el buffer invertido de Tone.js.
- 🎨 **12 efectos visuales** configurables por YAML: CSS filters, pixelado, scanlines, RGB shift, ASCII art, ANSI blocks (paleta CGA/AMIGA/MONO), y 5 modos multi-video (`DIFFERENCE`, `EXCLUSION`, `CHANNEL SPLIT`, `WEAVE`, `VIDEO GRID`).
- 🪟 **4 modos de UI** cicleables por teclado: `FULL`, `XY_ONLY`, `PADS_ONLY`, `STEALTH` (solo video, para proyección).
- ▶️ **Autoplay** secuencial que ajusta la duración por `playbackRate`.
- 🛑 **Panic button** (`.`) corta todo instantáneo.
- ❓ **Modal de ayuda** (`?`) con shortcuts y links.
- 📡 **Consolidación automática** de clips faltantes: si un video no existe, no deja hueco — corre los siguientes.
- 🖥 Estética **ANSI BBS** (paleta CGA/EGA, fuente monoespaciada, box-drawing).

---

## Quick start

Requiere **Node 18+** y **npm**.

```bash
git clone https://github.com/vlasvlasvlas/botovejero.git
cd botovejero
npm install
npm run dev        # → http://localhost:3000
```

Al arrancar, la app detecta qué clips están efectivamente presentes en `public/media/` (filtra los faltantes) y pre-carga todos en paralelo. Cuando la barra ANSI llega al 100%, los pads se habilitan.

Si no bajaste los `.mp4` todavía, ver [Descarga de media](#descarga-de-media).

---

## Controles

### Teclado

| Tecla             | Acción                                              |
|-------------------|------------------------------------------------------|
| `1`–`9`, `0`      | Disparar pads 1–10 de la página actual              |
| `↑` / `↓`         | Cambiar página                                       |
| `←` / `→`         | Efecto visual anterior / siguiente                  |
| `SPACE`           | Toggle autoplay secuencial                          |
| `TAB`             | Ciclar modo UI (`FULL` · `XY` · `PADS` · `STEALTH`) |
| `W`               | Toggle onda de audio sobre el video                 |
| `.`               | **PANIC** — detiene todo y resetea XY               |
| `?`               | Abrir modal de ayuda                                |
| `ESC`             | Cerrar modal de ayuda                               |
| `F11` (navegador) | Pantalla completa                                   |

### Mouse / touch

| Zona    | Acción                                                                                  |
|---------|------------------------------------------------------------------------------------------|
| Pad     | Click o touch dispara el clip                                                           |
| XY pad  | Drag para modular rate (X: reverse ←→ normal ←→ fast) y filter (Y). Al soltar vuelve al centro (neutro = 1× normal). |
| Top bar | Botones equivalentes a los shortcuts (autoplay, FX, paginación, UI mode, help)          |

---

## Modos de UI

Cicleable con `Tab`:

| Modo         | Qué se ve                                  | Pensado para…                          |
|--------------|---------------------------------------------|-----------------------------------------|
| `FULL`       | Top bar + pads + XY + bottom bar           | Sesión normal, armar y ajustar         |
| `XY_ONLY`    | Solo XY pad (pads ocultos)                 | Modular finamente un clip ya disparado |
| `PADS_ONLY`  | Solo grilla de pads (XY oculto)            | Disparo rápido con teclado             |
| `STEALTH`    | Solo el video de fondo (todo oculto)       | Proyección pura, performance en vivo   |

En `STEALTH` el waveform está off por default — prendé con `W` si lo querés ver.

---

## Configuración (`config.yaml`)

Todo lo estético y la lista de efectos viven en `public/config.yaml`. Editás, recargás, sin rebuild.

```yaml
ui:
  defaultMode: FULL       # FULL | XY_ONLY | PADS_ONLY | STEALTH
  defaultEffect: 0        # índice del efecto inicial
  showWaveform: false     # onda de audio sobre el video (toggle: W)

info:
  title: "BOTOVEJERO"
  subtitle: "Lo que quieren las wachas"
  github: "https://github.com/vlasvlasvlas/botovejero"
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
  # ... ver config.yaml completo para la lista por defecto
```

El parámetro `ghost: 0..1` de cada efecto controla cuánto del frame anterior se preserva (0 = sin rastro, 0.9 = ghost largo tipo cámara lenta).

---

## Efectos disponibles

| Tipo            | Parámetros                                                                      | Qué hace                                                |
|-----------------|----------------------------------------------------------------------------------|---------------------------------------------------------|
| `css`           | `filter` (CSS string), `ghost`                                                  | Filtros CSS nativos (`blur`, `contrast`, `invert`, …)   |
| `pixelate`      | `size` (px), `ghost`                                                            | Downsample + upscale sin smoothing (pixel art)         |
| `scanlines`     | `thickness`, `gap`, `intensity` (0..1), `ghost`                                 | Líneas horizontales tipo CRT                            |
| `rgbShift`      | `offset` (px), `ghost`                                                          | Desfase cromático R / G / B                             |
| `ascii`         | `cellSize`, `charset`, `color`, `background`, `ghost`                           | Arte ASCII renderizado por luminancia                   |
| `ansiBlocks`    | `cellSize`, `palette` (`CGA` / `AMIGA` / `MONO`), `ghost`                       | Bloques de color cuantizados a paleta retro             |
| `blend`         | `composite` (`difference` / `exclusion` / `multiply` / `screen` / …), `ghost`   | Canvas compositing entre videos — shine con varios pads |
| `channelSplit`  | `channels` (array de CSS filters), `ghost`                                      | Cada video al canal R/G/B, sumados con `lighter`        |
| `weave`         | `bandHeight` (px), `ghost`                                                      | Bandas horizontales alternando entre videos activos     |
| `videoGrid`     | `ghost`                                                                         | Auto-grilla dinámica según cantidad de videos           |

Los 4 últimos (`blend`, `channelSplit`, `weave`, `videoGrid`) están diseñados para cuando hay **varios pads sonando al mismo tiempo** — aprovechan la polifonía visualmente.

---

## Playlist (`playlist.yaml`)

Define los clips disponibles. Vive en `public/media/playlist.yaml`. Formato:

```yaml
- index: 001
  title: "Vendedor ambulante argentino"
  file: "001.mp4"
- index: 002
  title: "Oferta de verdura para los guampa en el barrio"
  file: "002.mp4"
```

La app filtra en runtime los `file:` que no existen en disco, así que podés tener declarados los 322 y solo bajar algunos — la grilla se compacta automática sin dejar huecos.

---

## Descarga de media

Requiere [`yt-dlp`](https://github.com/yt-dlp/yt-dlp) instalado y Python 3.10+.

```bash
bash scripts/download_clips.sh
```

Esto baja los primeros 100 videos de la playlist fuente a `public/media/` en 360p y genera `playlist.yaml`.

> ⚠️ Algunos videos de la playlist pueden estar privados o borrados. Esos quedan fuera y la app los salta sin mostrar hueco.

---

## Deploy a GitHub Pages

El workflow `.github/workflows/deploy.yml` ya está incluido y usa el flujo oficial de Pages.

### Primera vez

1. Push del repo a GitHub.
2. **Settings → Pages → Build and deployment → Source: "GitHub Actions"**.
3. Si querés disparar el primer deploy manualmente: **Actions → Deploy to GitHub Pages → Run workflow**.
4. URL final: **<https://vlasvlasvlas.github.io/botovejero/>**.

### Cómo funciona el workflow

- Se dispara en cada push a `main` o manualmente (`workflow_dispatch`).
- Usa Node 20 + cache de npm.
- Corre `npm ci && npm run build`.
- Sube `dist/` como artifact de Pages y lo publica con `actions/deploy-pages@v4`.
- `concurrency: pages` evita deploys solapados.

### Sobre el `base` de Vite

`vite.config.js` usa `base: './'` — rutas relativas que funcionan tanto en `vlasvlasvlas.github.io/` como en subpaths tipo `vlasvlasvlas.github.io/botovejero/`. Si cambiás el nombre del repo o lo servís desde otra ruta, no tenés que tocar nada.

### Peso del repo

GitHub Pages tiene un límite **soft** de 1 GB por repo y 100 GB/mes de ancho de banda. Los 86 clips en 360p pesan ~500 MB. Si excedés:

- Subí los `.mp4` a otro host (S3, Cloudflare R2, Bunny CDN) y poné URL absoluta en cada `clip.file` del `playlist.yaml`.
- Bajá aún más la resolución a 240p (editá `-f "best[height<=240]"` en `scripts/download_clips.sh`).
- Sacá clips que no uses de `playlist.yaml`.

---

## Estructura del proyecto

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

## Arquitectura

### Audio

```
┌──────────────┐    ┌─────────────┐    ┌────────┐    ┌──────────┐    ┌─────────────┐
│ Tone.Player  │───▶│ master      │───▶│ master │───▶│ master   │───▶│ destination │
│ (por clip,   │    │ Filter      │    │ Gain   │    │ Analyser │    │             │
│ fadeOut 30ms)│    │ (Y = freq)  │    │        │    │ (wave)   │    │             │
└──────────────┘    └─────────────┘    └────────┘    └──────────┘    └─────────────┘
       ▲
       │ X axis: reverse -2× ←→ normal 1× (centro) ←→ fast 3×
       │           (reverse usa `player.reverse = true` sobre el buffer)
```

- Cada `Tone.Player` pre-carga su buffer al arranque.
- Release envelope de 30 ms en `fadeOut` evita clicks al `stop()`.
- El eje Y del XY Pad controla el cutoff del lowpass master con rampa de 50 ms.
- El eje X modifica el `playbackRate` del player y el del `<video>` en sincronía (pitch natural de vinilo, sin compensación).

### Video

- Canvas 2D fullscreen (`#main-canvas`) de fondo.
- Cada trigger crea un `<video>` mudo, `playsInline`, añadido a un `Map<padIndex, video>`.
- `requestAnimationFrame` dibuja el efecto actual sobre el canvas.
- Cada efecto decide cómo combinar los videos activos (los multi-video aprovechan cuando hay más de uno sonando).
- Ghost-trail por efecto: al inicio de cada frame, `fillRect` con alpha `1 - ghost` "aclara" el frame anterior.

---

## Stack

| Componente   | Tecnología                               |
|--------------|-------------------------------------------|
| Build        | [Vite](https://vitejs.dev/) vanilla JS   |
| Audio        | [Tone.js](https://tonejs.github.io/) 15  |
| YAML         | `js-yaml` 4                               |
| Video        | Canvas 2D + filtros/efectos               |
| Descarga     | `yt-dlp` (bash script)                    |
| Deploy       | GitHub Actions + GitHub Pages             |
| Fuentes      | VT323, IBM Plex Mono (Google Fonts)       |

---

## Licencia y uso

**MIT License** — libre para usar, modificar, redistribuir y mezclar, con o sin fines comerciales. Ver [`LICENSE`](./LICENSE).

Además del texto legal, pido amistosamente (sin ser vinculante):

- 📩 **Si lo usás o lo adaptás, avisame.** Me copa saber dónde termina viviendo esto — podés escribirme por [GitHub](https://github.com/vlasvlasvlas).
- 🔗 **Citá la fuente** (este repo) en tu proyecto.
- 🛠 **Rehaciéndolo, forkéandolo, remixándolo**: bienvenido. Es para eso.

> ⚠️ La licencia MIT cubre **solo el código y la infraestructura** del instrumento. El material audiovisual (los `.mp4` de pregoneros en `public/media/`) NO es mío — pertenece a sus autores originales en la [playlist fuente de YouTube](https://www.youtube.com/playlist?list=PLqY0WHGqeB2tdEn_quF2paebPOI70NQhj). Si usás los clips en un trabajo público, respetá los derechos de cada autor original.

---

## Créditos

- **Fuente audiovisual**: [Playlist YouTube — 322 videos de ropavejeros/pregoneros](https://www.youtube.com/playlist?list=PLqY0WHGqeB2tdEn_quF2paebPOI70NQhj).
- **Autor**: [@vlasvlasvlas](https://github.com/vlasvlasvlas).
- **Asistencia técnica**: Claude (Anthropic).

---

*Hecho con amor por los que venden cosas gritando por la calle.* 🗣️📢
