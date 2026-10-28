# Campaña «Próximamente nueva web» · Piuma

Dos posts y un reel para Instagram (@piuma_uy) que anuncian que se viene la nueva web de Piuma. Material listo para
subir; **no se publicó nada**.

| Pieza | Archivo | Formato |
| --- | --- | --- |
| Post 1 · marca y hogar | `post-01-marca.png` | 1080 × 1350 PNG |
| Post 2 · anuncio de la web | `post-02-proximamente-web.png` | 1080 × 1350 PNG |
| Reel | `reel-proximamente-web.mp4` | 1080 × 1920, 30 fps, 20 s, H.264 High, yuv420p, +faststart, sin audio |
| Portada del reel | `reel-portada.png` | 1080 × 1920 PNG (título y logo dentro del recorte 3:4 de la grilla, 1080 × 1440, y también del 4:5) |
| Captions y textos alternativos | `captions.md` | |
| Vista de toda la campaña | `preview-campana.jpg` | posts, portada y nueve fotogramas del reel |

Dirección de arte: [`fuentes/hoja-de-estilo.md`](fuentes/hoja-de-estilo.md).

## Guion del reel (se entiende sin sonido)

| Tiempo | Plano | Texto |
| --- | --- | --- |
| 0–3,5 s | Dormitorio con la funda nórdica satén beige, acercamiento lento | «Algo nuevo *se está tendiendo.*» (desde el primer fotograma; se va a los 3,3 s, antes que la foto) |
| 3,5–8,5 s | Botón de madera de la funda de lino y algodón (sube) · relieve del cubrecama Chiara (se aleja, macro chico) · caída de la funda nórdica satén beige (a sangre, lateral) · cubrecama Charo con bandeja (se acerca) | — |
| 8,5–14,4 s | Teléfono entero (y 420–1500, dentro de la zona segura) con la captura real de la nueva web: inicio y desplazamiento hasta «Nuestra colección» con las cuatro primeras categorías; acercamiento leve | «PRÓXIMAMENTE · Nuestra nueva web» |
| 14,4–20 s | Cierre sobre blanco cálido, acercamiento muy leve (3 %) | Logo · «Muy pronto, *nuestra nueva web.*» · @piuma_uy |

## Material original usado (no duplicado)

Todo se referencia desde el repo, sin copiar:

- `src/assets/images/hero-piuma.webp` (1600 × 1067): post 1 (también aparece dentro de la captura de la web, que se
  muestra tal cual).
- `src/assets/images/productos/producto-funda-nordica-saten-beige.webp`: apertura del reel (distinta al post 1 para que
  no se repitan en la grilla).
- `src/assets/images/productos/producto-funda-nordica-lino.webp`: portada del reel (foto distinta a la del post 1 para
  que no se repita en la grilla).
- `src/assets/images/productos/producto-funda-nordica-lino-3.webp`, `producto-cubrecama-chiara-3.webp`,
  `producto-funda-nordica-saten-beige-3.webp`, `producto-cubrecama-charo.webp` (800 × 1000).
- `src/assets/images/logo/logo-piuma-terracota.webp`.
- Captura propia de la nueva web: `fuentes/capturas/web-inicio-catalogo.png`, tomada con Playwright del entorno dev
  (`https://d1tm58a521hftd.cloudfront.net`, rama `tienda-local`) en viewport de teléfono 390 × 2000 a 3×, esperando
  fuentes e imágenes. La app no se modificó. En las piezas sólo se muestra el tramo entre el encabezado y el catálogo:
  quedan afuera el encabezado (con el ícono del carrito), el rótulo fijo «Tienda de prueba · Sin cobros», el botón
  flotante de WhatsApp, los precios (que aparecen recién dentro de cada categoría), el panel y cualquier dato de prueba.
  **La captura guardada es la página completa e incluye el rótulo «Tienda de prueba · Sin cobros», el ícono del
  carrito y el botón de WhatsApp: no publicarla entera ni reutilizarla sin recortar** (las piezas usan sólo el tramo
  entre ~69 y ~1700 px CSS).

`brand-assets/` (originales en Drive, fuera de git) no estaba disponible en esta máquina; las fotos de mayor resolución
que se encontraron son las del repo. Por eso las fotos de producto se usan enmarcadas o a escala ≤ 1,4× y nunca se
amplía el logo.

## Investigación de marca

- Repo `landing`: tokens (`_tokens.scss`), `site-config.ts`, `catalog.json`, componentes de inicio, catálogo y
  «Sobre nosotros», `docs/frontend.md`. Colores y tipografías verificados: terracota `#b07a5c`, beige `#efe6da`, blanco
  cálido `#fbf8f4`, texto `#2f2c29`, Playfair Display + Inter.
- Contradicción de materiales: el sitio dice «toda nuestra línea es 100% algodón», pero `catalog.json` tiene el relleno
  nórdico 100% poliéster. La campaña no menciona materiales en los textos (ver tabla de verificación en `captions.md`).
- Instagram (`instagram.com/piuma_uy`): sin sesión sólo se pudo leer el encabezado público (≈11 mil seguidores, 395
  publicaciones). La grilla de publicaciones pide iniciar sesión: **no se vieron las publicaciones**.
- Linktree (`linktr.ee/piuma_uy`): «Ropa de Cama: Acolchados | Fundas Nórdicas | Cubrecamas | Almohadas Piuma», enlace
  a WhatsApp y «Catálogo 2026».
- La web nueva en dev: textos y estructura reales del inicio y del catálogo.

## Cómo regenerar

Requisitos: Node 20+, [FFmpeg](https://ffmpeg.org) (`brew install ffmpeg`) y el paquete `playwright` con Chromium.
El repo `landing` no lo tiene como dependencia (y la campaña no la agrega): se usa el de `piuma-backend` o cualquier
instalación local, indicando la ruta con `PLAYWRIGHT_MODULE`. Los scripts la resuelven desde el directorio de trabajo
(`path.resolve`), así que sirve relativa o absoluta; la forma más segura es absoluta, como abajo.

```sh
cd marketing/campanas/proximamente-web
# piuma-backend como hermano del repo landing (ajustar si está en otro lado):
export PLAYWRIGHT_MODULE="$PWD/../../../../piuma-backend/node_modules/playwright"
# alternativa: npm i -g playwright && npx playwright install chromium && unset PLAYWRIGHT_MODULE
node produccion/capturar-web.cjs            # opcional: vuelve a capturar la web (por defecto el entorno dev)
node produccion/render-imagenes.cjs         # post-01, post-02 y portada (o pasar: post-01 post-02 portada)
node produccion/render-reel.cjs             # reel: 600 fotogramas por tubería a FFmpeg, ~5 min
bash produccion/preview.sh                  # preview-campana.jpg
```

- Los diseños editables son HTML/CSS en `fuentes/` (`post-01-marca.html`, `post-02-proximamente-web.html`,
  `reel.html`, `reel-portada.html`, estilos comunes en `campana.css`). Se abren en cualquier navegador.
- El reel es una línea de tiempo determinista (`render(t)` en `reel.html`): tiempos, fundidos y movimientos están en
  el arreglo `CAPAS`; el desplazamiento de la captura en `scrollWeb(t)`.
- `render-reel.cjs --cuadros 0,9.5,18` exporta fotogramas sueltos para revisar sin renderizar todo.
- Los renders esperan `document.fonts` (con acentos) y la decodificación de todas las imágenes, y fallan si algo no
  cargó.
- No se guardan secuencias de fotogramas: van directo de Chromium a FFmpeg.

## Música

El reel va sin música: no se encontró una pista con licencia comercial gratuita comprobable. Al publicarlo se puede
sumar audio desde Instagram (Agregar audio → biblioteca de audio de Instagram). Como @piuma_uy es una cuenta de
empresa, Instagram sólo ofrece su catálogo de audio con licencia para uso comercial; elegir algo tranquilo,
instrumental y a volumen bajo. El reel funciona igual sin sonido.

## Licencias externas

- **Playfair Display** (Claus Eggers Sørensen) e **Inter** (Rasmus Andersson): SIL Open Font License 1.1. Archivos
  `.woff2` de Fontsource (subconjunto latino, sin modificar) en `fuentes/fonts/`, con sus licencias
  `OFL-PlayfairDisplay.txt` y `OFL-Inter.txt`.
- Fotos y logo: material propio de Piuma (repo).
- Herramientas: Chromium vía Playwright (Apache 2.0), FFmpeg con x264 (GPL) instalado con Homebrew.

## Costo

Cero servicios pagos: sin APIs de imagen, video, voz o texto, sin IA generativa, sin recursos premium, sin marcas de
agua, sin render ni alojamiento pagos. Todo se hizo localmente con herramientas gratuitas y material propio.

## QA realizado (autor)

- Fuentes e imágenes: los scripts esperan `document.fonts` con acentos y la decodificación de cada imagen, y fallan si
  algo no cargó. Tildes y signos revisados en todas las piezas («Próximamente», «colección», «está», «Muy pronto»).
- Imágenes abiertas a tamaño real y reducidas a ancho de teléfono (~390 px): titulares ≥ 23 px efectivos, bajada del
  post 2 ≈ 12 px efectivos, logo nunca ampliado.
- Reel (entrega original): `ffprobe` → 1080 × 1920, H.264 High, yuv420p, 30 fps, 630 fotogramas, 21,0 s, `moov` al inicio (+faststart);
  `blackdetect` sin fotogramas negros; revisado completo a 1 fps y en fotogramas clave (aperturas, fundidos,
  desplazamiento de la web y cierre). El desplazamiento de la captura nunca llega al rótulo de prueba.
- Fidelidad: fotos sin filtros ni cambios de color; recortes elegidos para no cortar botones, costuras ni bordes de
  producto; la web se muestra tal cual se capturó (sólo recorte).
- Anuncio: siempre «próximamente / muy pronto»; sin dominio, fecha, precios, compra online, pagos ni envíos.
- Corregido durante la revisión: bajada del post 2 que no tomaba su tamaño; teléfono del post 2 que cortaba un texto
  a la mitad (ahora sale por el borde); plano de satén que mostraba un empaque en lugar de la tela; portada que
  repetía la foto del post 1; texto del cierre del reel bajado al centro óptico.

## Revisión independiente y correcciones (T86 → T85b)

Otro agente revisó la entrega original (`produccion/revision.md`): un bloqueante (la receta de regeneración con
`PLAYWRIGHT_MODULE` relativo fallaba), dos mejoras altas, cuatro medias y seis bajas. Se corrigieron todas, salvo la
ampliación de la foto de la portada (L2), que queda justificada; el detalle punto por punto está al final de
`produccion/revision.md` («Correcciones del autor»). En resumen:

- Regeneración: los scripts resuelven `PLAYWRIGHT_MODULE` con `path.resolve` y el README usa ruta absoluta;
  verificado regenerando todo desde cero en un directorio temporal.
- Reel: apertura con otra foto (satén beige, ya no la del post 1); el texto de apertura se va antes que su foto;
  revelación recompuesta con el teléfono entero dentro de la zona segura (y 420–1500), volanta «PRÓXIMAMENTE» de
  40 px, desplazamiento que termina en «Nuestra colección» con las cuatro primeras categorías sin cortes; cierre con
  acercamiento leve y duración total 20 s.
- Post 2: volanta de 30 px y logo de 220 px. Caption del post 2 sin «últimas puntadas».
- Notas: advertencia sobre la captura completa, recorte 3:4 de la grilla en la portada, comentario de `preview.sh`.

QA después de las correcciones: `ffprobe` → 1080 × 1920, H.264 High, yuv420p, 30 fps, 600 fotogramas, 20,0 s, `moov`
en el byte 36 (antes de `mdat`); `blackdetect` sin fotogramas negros; `freezedetect` (1,5 s) sin planos quietos;
`scene > 0,15` sin cortes bruscos; fotogramas cada 0,5 s revisados con las zonas de UI marcadas (220 px arriba, 420 px
abajo, 120 px a la derecha) y a 390 px de ancho: volanta del reel ≈ 14 px efectivos, del post 2 ≈ 11 px.

## Limitaciones

- Las fotos más grandes disponibles son de 800 × 1000 (producto) y 1600 × 1067 (ambiente); en el reel algunas se
  amplían hasta ~1,45× y se ven algo más suaves que una foto nativa.
- No se vio la grilla de Instagram (requiere sesión).
- La captura es del entorno dev; si la web cambia antes del lanzamiento, volver a correr `capturar-web.cjs` y los
  renders.
