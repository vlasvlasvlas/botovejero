# BOTOVEJERO — Diseño Conceptual
## Instrumento audiovisual experimental basado en pregones callejeros

**Fuente:** [Playlist YouTube — 322 videos de ropavejeros/pregoneros](https://www.youtube.com/playlist?list=PLqY0WHGqeB2tdEn_quF2paebPOI70NQhj)

**Material:** Clips cortos (15-50 seg promedio) de vendedores ambulantes, chatarrerxs, verduleros, ropavejeros de Argentina, México, Chile, Uruguay, Colombia, Perú, Rep. Dominicana, Puerto Rico, Nicaragua, El Salvador. Audio Lo-Fi de bocina/megáfono. Altamente rítmico y repetitivo.

---

## Panel de Expertxs

| Rol | Nombre | Enfoque |
|-----|--------|---------|
| 🎛️ **Luthier Digital** | MARA | Diseño de instrumentos digitales, interfaces tangibles, arquitectura de software para performance en vivo |
| 🎨 **VJ / Artista Visual** | RENZO | Video en tiempo real, shaders, Processing/TouchDesigner, intervención de imagen, arte generativo |
| 🔊 **Sound Designer** | LUPE | Diseño sonoro experimental, sampling, síntesis granular, secuenciación, live performance |

---

## ITERACIÓN 1 — Mapeo del Terreno

### 🎛️ MARA (Luthier Digital)

Lo primero que me interesa es definir **qué tipo de instrumento es esto**. Veo tres arquetipos posibles:

1. **Botonera / Sampler Pad** — Estilo MPC/Launchpad. Cada botón = un clip. Tocás y dispara audio+video. Simple, directo, performático.
2. **Secuenciador de Pregones** — Un step sequencer donde cada paso puede tener un clip distinto. Armás patrones rítmicos con pregones.
3. **Instrumento Generativo** — El sistema elige, corta, mezcla y secuencia clips autónomamente con reglas/azar, y vos intervenís con controles.

Con 322 videos, la **curación** es clave. No podés tener 322 botones. Necesitamos un sistema de **bancos/categorías**:
- Por país/región
- Por tipo de vendedor (ropavejero, verdulero, chatarrero, etc.)
- Por cualidad sonora (agudo, grave, rítmico, melódico, caótico)
- Por duración

**Pregunta clave:** ¿Esto corre en browser? Si sí, la YouTube IFrame API nos da acceso a los videos, pero con latencia. Para performance en vivo necesitamos **latencia cercana a cero**. Esto implica potencialmente pre-descargar y cachear los clips.

---

### 🎨 RENZO (VJ / Artista Visual)

Lo que hace especial a este material visualmente es la **estética vernácula**: calles rotas, camiones destruidos, caballos tirando carros, megáfonos atados con alambre. Eso **no se debe limpiar, se debe amplificar**.

Pienso en capas de intervención visual, tipo Processing/TouchDesigner:

**Nivel 1 — Filtros cromáticos:**
- Desaturar todo a escala de grises excepto un color (ej: solo los rojos del camión)
- Posterizar (reducir paleta de color a 4-6 tonos)
- Inversión de color / solarización

**Nivel 2 — Deformación geométrica:**
- Feedback visual (el frame anterior se superpone con opacidad)
- Pixelado extremo → el video se vuelve abstracción
- Slitscan (cada línea horizontal del frame viene de un momento distinto en el tiempo)
- Kaleidoscopio / espejo

**Nivel 3 — Generativo:**
- Análisis FFT del audio → las frecuencias del pregón deforman la imagen
- El audio controla parámetros del shader (amplitud → zoom, frecuencia → hue rotation)
- Partículas que nacen del contorno del video

Todo esto es posible en **WebGL/GLSL** dentro del browser. Canvas + shaders. No necesitás TouchDesigner si el engine está bien armado.

---

### 🔊 LUPE (Sound Designer)

El pregón ya ES música. Tiene melodía (la entonación), ritmo (la repetición de frases), timbre (la distorsión del megáfono). Lo que necesitamos es **hacerlo tocable**.

Ideas de procesamiento sonoro:

1. **Chopping** — Cortar cada clip en segmentos de 1-2 segundos. "Se compran" | "colchones" | "tambores" | "refrigeradores". Cada pedazo es un pad.
2. **Granular** — Tomar un clip y descomponerlo en granos de 50-200ms. Podés "congelar" un momento, estirarlo, hacer texturas.
3. **Pitch shifting** — Todos los pregones a la misma nota fundamental → armás acordes con pregones.
4. **Looping inteligente** — Detectar los puntos de repetición natural del pregón y hacer loops perfectos.
5. **Layering** — 3-4 pregones simultáneos a distintas velocidades = polifonía de calle.

Para live, lo importante es: **¿cómo disparo?** Opciones:
- Teclado QWERTY (cada tecla = un clip/grano)
- MIDI controller externo (Launchpad, Akai, etc.)
- Touch en pantalla (para instalaciones)
- Gestos / cámara (conectar con tu proyecto de geometrysound?)

---

## ITERACIÓN 2 — Profundizando los Modelos

### 🎛️ MARA (Luthier Digital)

Escuchando a Renzo y Lupe, veo que hay **dos modos de uso** que deberíamos soportar:

**MODO A — "PREGONERO" (Botonera en Vivo)**
- Grilla de pads (4x4 o 6x6)
- Cada pad tiene un clip pre-asignado (o un fragmento choppeado)
- Tocás → suena + se ve el video con efecto
- Controles laterales: efecto visual activo, volumen, velocidad de reproducción
- Pensado para **performance en vivo con MIDI controller**

**MODO B — "BARRIO" (Secuenciador Generativo)**
- Vista tipo ciudad/mapa/calle
- Los pregones circulan como vendedores por la pantalla
- Vos controlás: densidad (cuántos a la vez), velocidad, zona geográfica
- El sistema genera la secuencia, vos modulás parámetros
- Pensado para **instalación / ambientación / impro larga**

Ambos modos comparten el mismo **motor de clips** por debajo. La diferencia es la interfaz y la lógica de triggering.

**Arquitectura propuesta:**
```
┌─────────────────────────────────────┐
│          CAPA DE INTERFAZ           │
│   Modo Pregonero  │  Modo Barrio    │
├─────────────────────────────────────┤
│         MOTOR DE EFECTOS            │
│   WebGL Shaders  │  Web Audio API   │
├─────────────────────────────────────┤
│          MOTOR DE CLIPS             │
│   Pool de clips │ Chopper │ Cache   │
├─────────────────────────────────────┤
│         CAPA DE DATOS               │
│   Catálogo │ Metadata │ Categorías  │
└─────────────────────────────────────┘
```

---

### 🔊 LUPE (Sound Designer)

Me gusta la dualidad Pregonero/Barrio. Pero quiero agregar una tercera capa que es la que lo hace realmente SOTA:

**MODO C — "REMIX EN VIVO"**

Imaginá esto: el sistema **analiza el audio del clip en tiempo real** y extrae:
- Envolvente (cuándo hay sonido vs. silencio)
- Tono estimado (pitch tracking)
- Onset detection (cuándo arranca cada palabra/frase)

Con eso podés:
- **Auto-chop:** el sistema corta donde detecta silencios → fragmentos musicalizables
- **Quantize:** los fragmentos se alinean a una grilla rítmica (BPM) → el pregón se vuelve beat
- **Re-pitch:** transponer los fragmentos a una escala musical → el pregón canta en Do Mayor

Esto convertiría al Botovejero en algo entre un **Ableton Live** y un **instrumento de Plunderphonics**. Tocar música con los residuos sonoros de la calle.

Para la conexión con tu proyecto de **música experimental en vivo**, pienso en:
- Un reloj maestro (BPM) al que se sincronizan los clips
- MIDI sync para que Botovejero siga el tempo de otros instrumentos
- Outputs separados de audio (para mezclar en una interfaz de audio)

---

### 🎨 RENZO (VJ / Artista Visual)

Expandiendo sobre el Modo Barrio: la idea de **ciudad como interfaz** es potentísima.

Pero quiero proponer algo distinto para los visuales. En vez de simplemente proyectar el video con un filtro, propongo un sistema de **capas composicionales:**

```
CAPA 4 — OVERLAY GENERATIVO
  Partículas, formas geométricas reactivas al audio
  
CAPA 3 — SHADER DE PROCESAMIENTO  
  El efecto visual activo (pixelado, slit-scan, feedback, etc.)
  
CAPA 2 — VIDEO FUENTE
  El clip de YouTube corriendo
  
CAPA 1 — FONDO CONTINUO 
  Un loop lento de textura urbana / ruido visual
```

Cada capa tiene opacidad y blending mode independiente. Esto da una profundidad visual tipo **collage digital en movimiento**.

Ideas adicionales:
- **Modo Ghost:** cuando un clip termina, su última imagen queda como fantasma semi-transparente, y se van acumulando. La pantalla se llena de espectros de pregoneros.
- **Modo Glitch:** cada trigger de pad introduce un glitch visual (datamosh, scan lines, corrupeción de pixeles). Más energía en la música = más caos visual.
- **Modo Espejo:** la cámara del performer se mezcla con el video del pregonero. Vos sos el ropavejero.

---

## ITERACIÓN 3 — Convergencia y Decisiones

### 🎛️ MARA (Luthier Digital)

OK, tenemos mucho sobre la mesa. Necesito converger. Propongo la siguiente jerarquía de complejidad para implementar:

**V1 — MVP Performático (arrancamos acá)**
- Botonera 4x4 con clips pre-seleccionados de la playlist
- Video se muestra en un canvas con 3-4 shaders seleccionables
- Audio: Web Audio API, reprodución directa, controles de volumen y velocidad
- Input: teclado + mouse. MIDI como bonus.
- Los clips se pre-descargan (no se streamean de YT en vivo por latencia)

**V2 — Auto-chop + Secuenciador**
- Análisis de audio para auto-corte en fragmentos
- Step sequencer de 8/16 pasos
- Cuantización a BPM
- Sistema de bancos/categorías para navegar los 322 clips

**V3 — Motor Visual Completo**  
- Sistema de 4 capas composicionales de Renzo
- Audio-reactivo (FFT → shaders)
- Modos Ghost/Glitch/Espejo
- MIDI mapping completo

**V4 — Modo Barrio / Generativo**
- Interfaz espacial/cartográfica
- Comportamiento autónomo de clips
- IA simple para secuenciación (Markov chains, reglas de proximidad geográfica)

**Sobre la fuente de datos (YouTube vs. local):**

> [!IMPORTANT]
> La YouTube IFrame API tiene **~300-800ms de latencia** para arrancar un video. Inaceptable para performance en vivo. Las opciones son:
> 1. **Pre-descargar clips** (yt-dlp) y servir localmente → latencia ~10ms ✅
> 2. **Streamear de YouTube** pero con pre-buffering agresivo → latencia ~100-200ms ⚠️
> 3. **Modelo híbrido:** browsear/previsualizar desde YT, pero performar con clips locales ✅✅

Recomiendo el **modelo híbrido (3)**: una interfaz de curación que te muestra la playlist de YT, te deja elegir y categorizar clips, y los descarga al "kit local" para performance con latencia cero.

---

### 🔊 LUPE (Sound Designer)

De acuerdo con la jerarquía de Mara. Para V1, lo mínimo que necesitamos del audio:

- **Web Audio API** con `AudioBufferSourceNode` (latencia ~0)
- Cada pad guarda: buffer de audio, inicio/fin del fragmento interesante (trim), volumen
- **Polyphonic:** podés tener 4-6 clips sonando a la vez sin que se corten (no one-shot exclusivo)
- Controles inmediatos: Play/Stop, Volumen, Rate (velocidad/pitch combinados)

Para la V1 el procesamiento en vivo no es necesario. Con buen **curado manual** de los 16 clips del kit inicial, ya tenés un instrumento expresivo.

Mi recomendación de **kit inicial de 16 pads:**

| Pad | Tipo | Ejemplo |
|-----|------|---------|
| 1-4 | Pregón icónico completo | "Se compran colchones", "Fierro viejo", etc. |
| 5-8 | Fragmento rítmico | Palabras sueltas choppeadas, bocinas, arranques |
| 9-12 | Textura / ambiente | Motor de camión, ruido de calle, caballo |
| 13-16 | Melódico / tonal | Pregones con entonación marcada, sin megáfono |

---

### 🎨 RENZO (VJ / Artista Visual)

Para V1, los shaders mínimos que propongo (todos implementables en GLSL/WebGL sobre un `<canvas>`):

1. **PASS-THROUGH** — Video sin efecto (pero en el canvas, listo para procesar)
2. **POSTERIZE** — Reducir a 4 colores. El pregonero se vuelve afiche callejero.
3. **FEEDBACK** — Frame anterior al 85% de opacidad debajo del actual. Trail psicodélico.
4. **PIXEL-SORT** — Ordenar pixeles por brillo en cada fila. Efecto glitch estético.
5. **CHROMA-KEY invertido** — En vez de sacar un color, SOLO dejar un color. Todo lo demás a escala de grises.

Para la relación audio→visual en V1, algo simple pero efectivo:
- **Volume envelope** del audio controla el **brillo general** del shader
- Cuando un pad se activa, hay un **flash** blanco de 100ms (feedback visual del trigger)
- Cada pad tiene un **color asignado** que tiñe el borde del canvas al activarse

---

## ITERACIÓN 4 — Lo que lo Hace Único (SOTA)

### 🎛️ MARA (Luthier Digital)

Ahora pensemos qué hace que esto no sea "otra botonera más". ¿Qué lo hace SOTA?

**1. El Catálogo Vivo**
La playlist de YouTube es un **corpus viviente**. Crece. Otros suben videos. El instrumento podría tener un modo de "exploración" donde navegás la playlist en tiempo real, escuchás previews, y arrastrás clips a tus pads. Como un Spotify pero para armar tu kit de pregones.

**2. La Dimensión Cultural/Cartográfica**
Cada clip tiene un origen geográfico. Podríamos geo-referenciar los videos y tener un **mapa de Latinoamérica** donde cada punto es un pregón. Tocás en el mapa → disparás el pregón de ese lugar. La performance se vuelve un **viaje sonoro por el continente**.

**3. Compartir Kits**
Si la app es web, podés armar tu "kit de 16" y compartirlo con un link. Otros performers arman los suyos. Se crea una **comunidad de pregón experimental**. Cada kit es una "interpretación curatorial" de la playlist.

**4. Loop Station integrada**
Conectando con tu experiencia en MORSIMON: un modo de **overdub en vivo**. Grabás capas de pregones, las loopeás, y seguís tocando encima. El Botovejero se vuelve un **one-person-band de la calle**.

---

### 🎨 RENZO (VJ / Artista Visual)

Lo SOTA visualmente:

**5. Composición Automática con IA de Visión**
Usar un modelo ligero de detección (tipo MediaPipe/YOLO en browser) para detectar **personas/rostros** en los videos de pregoneros. Luego:
- Aislar la silueta del pregonero del fondo
- Componer múltiples pregoneros en una misma escena
- Crear un "coro visual" de ropavejeros de distintos países cantando juntos

**6. Estética como Identidad**
El look del instrumento debería reflejar su contenido: **estética de calle, vernácula, imperfecta**. Nada de neumorfismo o glassmorphism acá. Pienso en:
- Tipografía de cartel pintado a mano
- Colores de camión verdulero (verde, rojo, amarillo)
- Texturas de chapa oxidada, cartón, cinta de embalar
- Bordes irregulares, nada cuadradito

El instrumento mismo debería **sentirse como un objeto de la calle**, no como un producto de Silicon Valley.

---

### 🔊 LUPE (Sound Designer)

Lo SOTA sonoro:

**7. Síntesis por Concatenación de Pregones**
Esto es experimental de verdad: tomar **fonemas** de distintos pregones y concatenarlos para formar **nuevas palabras/frases**. "Col-CHO-nes" de México + "refRI-ge-ra" de Chile + "DOR-es" de Argentina = una palabra imposible hecha de 3 países. **Cadáver exquisito fonético**.

**8. Motor de Similitud Sonora**
Analizar los 322 clips y crear un mapa de similitud (por timbre, ritmo, tono). Cuando tocás un pad, el sistema te **sugiere clips similares** para los pads vecinos. O en modo generativo, hace transiciones suaves entre clips parecidos. Como un DJ automático de pregones.

**9. Reactive Tempo**
En vez de forzar un BPM, el sistema detecta el **tempo natural** de cada pregón (la cadencia del habla) y los sincroniza entre sí deformándolos suavemente. Los pregoneros se "encuentran" rítmicamente sin perder su carácter.

---

## ITERACIÓN 5 — Síntesis Final y Recomendación

### Consenso del Panel

Después de 4 iteraciones, convergemos en la siguiente visión:

---

### 🎯 BOTOVEJERO — Definición

> **Instrumento audiovisual web para performance experimental, que convierte una colección de pregones callejeros latinoamericanos en material sonoro y visual tocable, procesable y componible en tiempo real.**

---

### Principios de Diseño

1. **Latencia cero** — Pre-descarga de clips. No se depende de YouTube para la performance.
2. **Audio + Video son inseparables** — Cada trigger dispara ambos simultáneamente. El video no es decoración, es parte del instrumento.
3. **Curación como composición** — La selección y organización de clips es un acto creativo. El instrumento lo facilita.
4. **Estética vernácula** — El diseño visual refleja la calle, no la startup.
5. **Live-first** — Todo está pensado para performance en vivo, no para producción en estudio.

---

### Roadmap Recomendado

| Fase | Nombre | Alcance | Dificultad |
|------|--------|---------|------------|
| **V1** | **La Botonera** | 16 pads, 5 shaders, teclado+MIDI, clips locales | 🟢 Media |
| **V2** | **El Chopper** | Auto-chop, step sequencer, bancos, categorías | 🟡 Alta |
| **V3** | **El Proyector** | Sistema de capas visuales, audio-reactivo, modos Ghost/Glitch | 🟡 Alta |
| **V4** | **El Barrio** | Interfaz cartográfica, generativo, IA de secuenciación | 🔴 Muy Alta |

---

### Stack Técnico Recomendado

| Componente | Tecnología | Razón |
|-----------|-----------|-------|
| Audio | **Web Audio API** | Latencia ~0, granular control, FFT nativo |
| Video | **WebGL + GLSL shaders** | Procesamiento GPU en tiempo real, composición de capas |
| UI | **Vanilla JS + CSS** | Sin frameworks pesados, máximo control, mínima latencia |
| Input | **Web MIDI API** | Soporte nativo de controllers MIDI en browser |
| Clips | **Archivos locales** pre-descargados | Latencia cero, independencia de red |
| Curación | **YouTube IFrame API** | Solo para browsear/previsualizar la playlist, no para performance |

---

### Preguntas Abiertas para el Performer

1. **¿Qué controller usás en vivo?** (teclado, Launchpad, Akai, otro?) — define el layout de pads
2. **¿Proyectás los visuales?** — ¿pantalla aparte o mismo monitor? ¿fullscreen dedicado?
3. **¿Tocás solo o con otrxs?** — ¿necesitamos MIDI sync / clock externo?
4. **¿Querés curar vos los 16 clips iniciales o que propongamos un kit?**
5. **¿El nombre BOTOVEJERO te gusta o es placeholder?** (nos encanta, btw)
6. **Sobre los clips: ¿te sentís cómodo descargándolos con yt-dlp para uso performático/artístico?**
