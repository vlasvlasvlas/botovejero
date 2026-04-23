# Plan de Implementación: Botovejero V1

Este plan describe la arquitectura técnica y los pasos de ejecución para construir la V1 de **Botovejero**, un instrumento audiovisual web proyectable y controlado por el teclado de la computadora, utilizando los primeros 100 videos de la playlist de ropavejeros.

## Consideraciones Clave

- **Proyección + Performance:** La interfaz debe ser atractiva y pensada para ser vista en pantalla completa (proyectada). El performer interactúa con el teclado de la PC.
- **Sin MIDI:** Control exclusivo por teclado QWERTY.
- **100 Clips:** Vamos a descargar los primeros 100 videos con `yt-dlp`. Como un teclado no tiene 100 teclas de fácil acceso al mismo tiempo, organizaremos los clips en "Páginas" o "Bancos", mapeando teclas como letras (A-Z) y números (0-9) a los clips activos de la página actual.

## Cambios Propuestos

### 1. Inicialización y Dependencias
Se inicializará el proyecto usando Vite con una plantilla de Vanilla JS puro (sin frameworks reactivos) para garantizar el máximo rendimiento y menor sobrecarga.
- **Directorio Raíz:** `./`
- **Comando:** `npx -y create-vite@latest . --template vanilla`

### 2. Descarga de Recursos (Media)
Se creará un script bash automatizado (`scripts/download_clips.sh`) utilizando `yt-dlp` para:
- Extraer los enlaces de los primeros 100 videos de la playlist.
- Descargarlos en formato MP4 con baja resolución (ej. 360p) para asegurar que el peso total sea manejable (estimado < 200MB en total).
- Guardarlos en el directorio `public/media/` con nombres indexados (`001.mp4`, `002.mp4`, etc.).
- Generar un archivo JSON (`public/media/index.json`) con la metadata básica de cada clip.

### 3. Motor Audiovisual (Core)
El corazón del instrumento se construirá en Vanilla JS:
- **Audio/Video Trigger:** En lugar de cargar todo en memoria, utilizaremos elementos `<video>` pre-creados. Al presionar una tecla, el video asignado se asigna a un pool de reproductores activos y se le da `play()`.
- **Canvas Processing:** Los videos que estén reproduciéndose dibujarán sus frames en un `<canvas>` central usando `requestAnimationFrame`.
- **Shaders Visuales (V1):** Implementaremos filtros de procesamiento en 2D Canvas (y WebGL si es necesario para performance) para lograr la "estética vernácula" definida en el diseño conceptual. Ej: Posterizado, Filtros de color fuerte, Glitches rítmicos.

### 4. Interfaz de Usuario (UI)
- **Tema:** Premium, Oscuro, "Callejero/Vernáculo".
- **Layout:**
  - **Fondo:** El canvas principal abarcando gran parte de la pantalla (ideal para proyección).
  - **HUD (Head-Up Display):** Una capa superpuesta transparente que muestra qué tecla mapea a qué video en el "banco" actual.
  - **Controles Visuales:** Indicadores de Banco Activo (Ej: Banco 1 de 3) y el Efecto Visual actual.

### 5. Input Mapping
- **Disparadores (Triggers):** Teclas alfanuméricas (`A-Z`, `0-9`) mapeadas a los clips del banco actual.
- **Navegación:** Flechas `Arriba` / `Abajo` para cambiar de banco de clips (ej. Banco 1: clips 1-36, Banco 2: clips 37-72, etc.).
- **Efectos Visuales:** Teclas F (ej. `F1`, `F2`) o numéricas alternativas para cambiar el shader/efecto de la proyección.

## Pasos de Ejecución

1. Configurar el proyecto Vite.
2. Escribir y ejecutar el script `yt-dlp` para descargar y procesar los 100 videos a `public/media/`.
3. Desarrollar la estructura HTML/CSS base con la estética definida.
4. Implementar el motor de Input (Mapeo de teclado y bancos).
5. Implementar el motor de Renderizado (Canvas + Video elements).
6. Integrar los efectos visuales (shaders básicos).

## Plan de Verificación

### Verificación Manual
- Lanzar el servidor de desarrollo (`npm run dev`).
- Confirmar que al presionar las teclas se reproduzcan el audio y el video correspondientes sin latencia perceptible.
- Probar el cambio de bancos de clips.
- Activar el modo pantalla completa (F11) para simular la proyección y verificar la integridad estética y funcional de la interfaz.

---

> [!IMPORTANT]
> **Pregunta para el usuario:**
> ¿Estás de acuerdo con el enfoque de organizar los 100 videos en "Bancos" o "Páginas" (ej. 3 páginas de ~33 videos) que se cambian con las flechas, usando las letras A-Z y números 0-9 para dispararlos? (Esto es porque no hay suficientes teclas en el teclado para tener 100 botones activos simultáneamente).

-------------------




# Plan de Implementación: Sampler / VJ Tool Interactivo (Botovejero)

Este documento detalla la arquitectura y los pasos para construir la aplicación web interactiva que funcionará como un sampler de audio/video con capacidades de modulación en tiempo real (estilo Kaoss Pad).

## User Review Required

> [!IMPORTANT]
> **Sobre la lista de videos**: Mencionaste "tomar los top 100 videos de esa lista". ¿A qué lista te refieres exactamente? ¿Es una lista de reproducción de YouTube? Necesitaré la URL para armar el script que los descargue automáticamente.
> 
> **Sobre el Stack Frontend**: Propongo utilizar **Vite + React** para la interfaz. React hará que la botonera paginada y el manejo de estado de múltiples audios simultáneos sea muy fluido y robusto. ¿Te parece bien esta elección de stack?

## Open Questions

1. **Efectos del "Kaoss Pad" (Pad XY)**: 
   - El eje X (izquierda/derecha) controlará la **velocidad de reproducción** (ralentizar / acelerar).
   - El eje Y (arriba/abajo): ¿Prefieres que controle el **Pitch** (hacer la voz más aguda/grave independientemente de la velocidad) o un **Filtro** (ej. Lowpass, que hace que suene "debajo del agua")?
2. **Modo Play Automático**: Cuando dices "modo play y que pasen todos los clips", ¿te refieres a que al presionar un botón maestro se reproduzca una secuencia automática, o que cada botón disparado reproduzca su video en loop de fondo?

## Arquitectura y Tecnologías Propuestas

* **Motor de Audio (SOTA)**: **Tone.js**. Es la librería de JavaScript más avanzada y estándar de la industria (State of the Art) para síntesis, manipulación de samples, efectos en tiempo real, cambio de pitch y polifonía en el navegador usando la Web Audio API.
* **Interfaz y Lógica**: **React (via Vite)**. Para manejar el pad de 12 botones, la paginación, el multi-touch (poder tocar varios a la vez) y la interacción del mouse para el Pad XY.
* **Estilos**: **CSS puro moderno** con animaciones fluidas, un diseño oscuro premium y efectos visuales reactivos al audio (glassmorphism, brillos al presionar botones).
* **Descarga de Media**: Un script en **Python usando `yt-dlp`** para descargar automáticamente los videos de la lista, extraer el audio en alta calidad y generar el archivo `config.yaml` inicial.
* **Configuración**: El frontend leerá un archivo `config.yaml` (usando `js-yaml`) para saber qué media cargar por cada pad.

## Proposed Changes

### Script de Descarga (Backend/Tooling)
Se creará un script de Python para automatizar el ingreso de media.
#### [NEW] `scripts/download_media.py`
Script que tomará una URL de playlist, descargará los 100 primeros videos a la carpeta `/public/media/`, y construirá un `media_config.yaml` base.

### Frontend Web App (Vite + React)
#### [NEW] `package.json` & Configuración Vite
Se inicializará un proyecto Vite en la raíz.
#### [NEW] `public/media_config.yaml`
Archivo YAML que mapea cada ID/Botón con su archivo de audio y video correspondiente.
#### [NEW] `src/audio/AudioEngine.js`
Clase/Módulo encapsulando Tone.js. Manejará los `Tone.Player`, el `Tone.PitchShift` y la modulación del `playbackRate` vinculada a las coordenadas del mouse.
#### [NEW] `src/components/SamplerGrid.jsx`
Componente que renderiza los 12 botones actuales. Soporte para eventos `onPointerDown` (para polifonía en pantallas táctiles o mouse).
#### [NEW] `src/components/XYPad.jsx`
La zona de la pantalla (o fondo interactivo) que capturará el movimiento del mouse/dedo para deformar el audio general en tiempo real.
#### [NEW] `src/App.css`
Diseño premium y moderno, animaciones para el estado "Playing", layout responsivo.

## Verification Plan

### Automated Tests
- Ejecutar el script de Python con una lista de prueba pequeña (2-3 videos) para verificar descargas y generación de YAML.
- Correr el servidor Vite y verificar que no haya errores de compilación y que Tone.js se inicialice al interactuar.

### Manual Verification
- Cargar la interfaz en el navegador.
- Probar la polifonía: presionar múltiples botones a la vez.
- Mover el cursor por el XY Pad mientras suenan clips para verificar la deformación del tiempo y pitch/filtro sin cortes.
- Cambiar de página (1 a 2) y confirmar que los siguientes 12 botones carguen correctamente.
