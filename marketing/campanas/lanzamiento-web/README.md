# Lanzamiento de la web · dos reels cortos

Reemplaza al reel de `marketing/proximamente-web`, que Guillermo descartó por largo y por frases que no son suyas.
De aquel se tomó sólo el estilo visual (colores y tipografía de la marca, teléfono de contorno mínimo, fotos
enmarcadas con el radio de las tarjetas); **ningún texto**. **No se publicó nada.** Sin música ni audio: los MP4 no
tienen pista de sonido (la pone Guillermo) y todo se entiende sin sonido.

| Pieza | Archivo | Formato |
| --- | --- | --- |
| A · «Ya está pronto» | `ya-esta-pronto.mp4` | 1080 × 1920, 30 fps, 9,5 s, H.264 High yuv420p, +faststart, sin audio |
| Portada A | `portada-ya-esta-pronto.png` | 1080 × 1920 PNG |
| B · «Comprá en 3 pasos» | `compra-3-pasos.mp4` | 1080 × 1920, 30 fps, 14,0 s, H.264 High yuv420p, +faststart, sin audio |
| Portada B | `portada-compra-3-pasos.png` | 1080 × 1920 PNG |
| Captions y textos alternativos | `captions.md` | |
| Vista general | `preview.jpg` | portada + 7 fotogramas de cada reel |

Portadas: todo lo que hay que leer queda dentro del recorte 4:5 de la grilla (y 285–1635), que también entra en el 3:4.
En los reels, títulos y toques quedan fuera de las zonas que tapa Instagram (arriba 220 px, abajo ~420 px, derecha ~120 px).

## A · «Ya está pronto» (9,5 s)

Una sola frase en pantalla, la de Guillermo: «Ya está *pronto.*». Nada más que eso, el logo y «piuma.uy».

| Tiempo | Plano | Texto |
| --- | --- | --- |
| 0–4,0 s | Tres fotos reales enmarcadas, cada una con un acercamiento lento: manos prendiendo el botón de la funda de lino (`producto-funda-nordica-lino-3`), el paquete de Piuma sobre la cama (`producto-funda-nordica-saten-beige-4`) y la cama tendida con satén beige (`producto-funda-nordica-saten-beige`). Fundidos de 0,3 s | «Ya está *pronto.*» desde el primer fotograma |
| 3,65–7,4 s | Teléfono con **https://piuma.uy real** (grabación de pantalla): inicio y baja suave hasta «Nuestra colección» | «Ya está *pronto.*» |
| 7,0–9,5 s | Cierre sobre blanco cálido | Logo · «piuma.uy» |

Las fotos son de `src/assets/images/productos/` (800 × 1000). Se ven a 1,03× y con el acercamiento llegan a **1,09×**
(tope pedido: 1,4×). El logo se usa a 440 px de ancho (original 600 px), nunca ampliado.

## B · «Comprá en 3 pasos» (14,0 s)

Grabación real de pantalla de teléfono (Playwright, 390 × 844 CSS, `deviceScaleFactor` 3 → 1170 × 2532 px), con
toques reales (eventos touch), **cuadro a cuadro a 30 fps con el tiempo controlado** (ver «Fluidez» abajo). Textos:
sólo «Elegí», «Agregá», «Pagá» (con el número en círculo, igual que los pasos del checkout del sitio) y el cierre.

| Tiempo | Paso | Lo que se ve |
| --- | --- | --- |
| 0–3,9 s | **1 Elegí** | Categoría Cubrecamas; baja hasta el Cubrecama Chiara ($ 4.500), toque con círculo y acercamiento al toque, se abre la ficha |
| 3,6–8,4 s | **2 Agregá** | Baja a medidas y color, toque en «Agregar al carrito», aviso «Producto agregado al carrito» y el carrito con 1; toque en el carrito y aparece «Tu carrito» con el Chiara |
| 8,1–11,9 s | **3 Pagá** | Paso «Pago» del checkout: se toca «Tarjeta con Mercado Pago» (la otra opción visible es «Transferencia bancaria»), la cámara sube y se toca «Pagar con Mercado Pago» |
| 11,5–14,0 s | Cierre | Logo · «piuma.uy» |

El cierre es **el mismo que el de A**: sólo logo, filete y «piuma.uy», en la misma posición (desde y = 700), con la
misma entrada escalonada y la misma duración (2,5 s). Sin oferta ni otro texto (pedido de Guillermo, T108c).

Entre «Agregá» y «Pagá» se saltean (corte con fundido) los datos de contacto y la entrega: están en la grabación,
pero no hacen falta para entender el flujo y mostrarían datos de prueba. La grabación termina **antes** de salir a
Mercado Pago, así que no aparece ningún número de pedido.

### Dónde se grabó y qué se ocultó

`piuma.uy` todavía no vende (`commerceEnabled: false` en su `runtime-config.json` al 2026-11-04). El plan era la
tienda de prueba de CloudFront (`d1tm58a521hftd.cloudfront.net`), pero para pagar ahí hay que entrar con Cognito y
la contraseña de la cuenta de prueba de los workers no está guardada en ningún lado (a propósito), y cada intento
dejaría pedidos en dev. Se grabó entonces **el mismo front** (rama `tienda-local`, `ng serve`) contra **el mismo código
de la API** corriendo en esta Mac sin Docker (`produccion/api-local.sh`: `src/local.ts` de piuma-backend con el
almacenamiento en memoria, el simulador de Mercado Pago del repo y la política de envíos real). Precios: los del
catálogo real (`catalog.snapshot.json` = `src/assets/data/catalog.json`: Chiara Dos plazas $ 4.500). Nada sale de la
máquina.

Rastros de prueba ocultos durante la grabación (CSS inyectado sólo en el navegador que graba; la app no se tocó):

- «N disponibles» (stock de demo) en la ficha.
- Nombre y correo de la cuenta descartable en «Tus datos».
- El rótulo «Tienda de prueba · Sin cobros» (no aparece en local, pero queda oculto por si se graba en dev).
- El resaltado azul de toque de Chromium (el toque lo dibuja el montaje).
- La salida a Mercado Pago (simulador local) se corta: la grabación termina en Piuma.

**Pendiente: regrabar B el viernes sobre https://piuma.uy con la tienda abierta y precios reales.** Pasos: en
`grabar-compra.cjs`, `FRONT_URL=https://piuma.uy`, sacar el `route` de `runtime-config.json` y el registro de la
cuenta local, entrar con una cuenta real (sin datos personales a la vista; revisar «Tus datos») y volver a correr
`render.cjs compra-3-pasos`, `render-portadas.cjs` y `preview.sh`, y medir la fluidez (ver «Fluidez»).

## Herramientas (todas gratis, locales, sin cuentas)

Elegida: **Playwright + HTML/CSS + FFmpeg**, lo mismo que hacen por dentro Remotion y Revideo (componer en un
navegador, capturar cada fotograma y codificar con FFmpeg), sin sumar dependencias ni licencias.

- **Grabación** (`produccion/grabador.cjs`): cuadro a cuadro a 1170 × 2532 con tiempo virtual (relojes de la
  página con `page.clock`, animaciones CSS con la línea de tiempo de Chromium detenida y llevadas al instante de cada
  cuadro, desplazamientos calculados por cuadro), toques con `touchscreen.tap`; FFmpeg arma el MP4 de 30 fps con
  las capturas tal cual. Guarda al lado un JSON con marcas y toques (posición en CSS px).
- **Montaje** (`fuentes/*.html` + `fuentes/motor.js` + `produccion/render.cjs`): una página por reel con
  `render(t)`; teléfono con la pantalla real, círculo y anillo en cada toque, acercamiento suave al toque, fundidos
  entre tramos, cámara que sube para el botón fijo de pago. Tipografías Playfair Display e Inter (OFL, en
  `fuentes/fonts/`) y colores de `src/styles/_tokens.scss`, sin colores nuevos.
- **Codificación**: FFmpeg 8 (libx264 High, CRF 18, yuv420p, `+faststart`, `-an`).

Evaluadas y descartadas:

| Herramienta | Licencia | Resultado |
| --- | --- | --- |
| «Open Higgsfield AI» (`Anil-matcha/Open-Higgsfield-AI` → hoy `Anil-matcha/Open-Generative-AI`, el clon open source de Higgsfield) | MIT | **Descartada.** La app es gratis pero genera con la API paga de MuAPI (créditos); lo local en Mac es sólo imagen (sd.cpp), y el video local exige Wan2GP con GPU NVIDIA/AMD. Además inventa imágenes: acá hacía falta la web y los productos reales |
| Remotion 4.0.540 | Propia: gratis para personas, empresas con **hasta 3 empleados** y ONG; si no, licencia paga | **Descartada.** No sabemos cuántos empleados tiene la empresa de Piuma; con más de 3 haría falta pagar. No aporta nada que no dé el navegador |
| Revideo 0.11 (`midrender/revideo`) | MIT | Se instaló en una carpeta temporal (≈1 min). Trae su propio Chrome (puppeteer), binarios de FFmpeg y un paquete de telemetría con `postinstall`; dibuja en canvas, así que la grabación real igual entraría como video. **No se usó**: suma dependencias sin mejorar el resultado |
| Motion Canvas 3.17.2 | MIT | **Descartada** sin instalar: última versión de feb. 2025, editor propio en Vite, mismo enfoque canvas que Revideo |

## Cómo reproducir

```sh
# Playwright: cualquier node_modules con playwright (p. ej. el de piuma-backend).
export PLAYWRIGHT_MODULE=../piuma-backend/node_modules/playwright
cd marketing/campanas/lanzamiento-web/produccion

node grabar-piuma-uy.cjs                     # A: toma de https://piuma.uy → fuentes/grabaciones/piuma-uy-inicio.{mp4,json}

# B: API local sin Docker (puertos 3108 y 8108) + front en 4308
./api-local.sh <piuma-backend con npm ci>   # deja la API corriendo en segundo plano
(cd ../../../.. && npx ng serve --port 4308) &
node grabar-compra.cjs                       # → fuentes/grabaciones/compra-3-pasos.{mp4,json}

node render.cjs ya-esta-pronto               # → ../ya-esta-pronto.mp4
node render.cjs compra-3-pasos               # → ../compra-3-pasos.mp4
node render.cjs compra-3-pasos --cuadros 2,6,11   # PNG sueltos para revisar
node render-portadas.cjs                     # → ../portada-*.png
./preview.sh                                 # → ../preview.jpg
pkill -f local-video.mts; pkill -f fake-mercadopago.mjs
```

`grabador.cjs` sirve las fuentes de Google Fonts de la web (Inter 400/500/600, Playfair Display 500/600/700) desde
`fuentes/fonts/` (mismos archivos latinos, OFL): la toma no depende de la red (el 2026-11-04 fonts.gstatic.com
quedaba colgado) y ningún texto cambia de fuente a mitad de la grabación. Además lanza con `--disable-quic`.

**Las grabaciones crudas de `fuentes/grabaciones/` no se publican**: la de B incluye el paso de datos (teléfono y
dirección de relleno) y la pantalla «Te llevamos a Mercado Pago…» con un número de pedido local.

## Fluidez (T108c)

Guillermo vio B «un poco trancado» en un momento. Medición sobre el MP4 final (diferencia media absoluta entre
cuadros consecutivos en gris a 270 px; «repetido» = cuadro igual al anterior con movimiento antes y después):

| | Cuadros repetidos en movimiento | Dónde |
| --- | --- | --- |
| Antes (grabación por screencast) | **6** (+ 20 en la grabación cruda) | 1,80 y 2,00 s (baja a Chiara), 4,13 · 4,33 · 4,53 s (baja a «Agregar al carrito»), 7,33 s (apertura del carrito) |
| Después (cuadro a cuadro) | **0** | — |

Causa: el screencast de Chromium (CDP `Page.startScreencast`) no llega a 30 JPEG/s a 1170 × 2532 y en los
desplazamientos perdía uno de cada 4–6 cuadros; al pasar a 30 fps constantes los huecos quedaban como cuadros
repetidos (tirones cada ~0,2 s). No se interpoló nada: se cambió la forma de grabar (`grabador.cjs`). Además se
corrigió un cuadro suelto con el pie de página al abrir el carrito (la ruta nueva se veía un cuadro a la altura de la
anterior) y el montaje alinea los tramos a la grilla de 1/30 s, para que cada fotograma de salida avance exactamente
un cuadro de la grabación. El único «salto» que queda en la medición (3,03 s) es la transición propia de la web al
abrir la ficha del Chiara (fundido de unos 6 cuadros), no una pérdida.

`mpdecimate` (cuadros casi iguales, incluye pausas a propósito): 162 → 118. `freezedetect` (n = 0,0005, d = 0,06 s):
34 → 21 tramos quietos, todos pausas del guion (antes del toque, cierre).

A («Ya está pronto») usa una toma de piuma.uy hecha con el grabador viejo y tiene el mismo síntoma en la baja por el
inicio (9 cuadros repetidos entre 4,8 y 6,4 s); no se regrabó en T108c. Se arregla corriendo `grabar-piuma-uy.cjs`
con el grabador nuevo y `render.cjs ya-esta-pronto`.

## Revisión

- Formato verificado con `ffprobe`: 1080 × 1920, 30/1 fps, H.264 High, yuv420p, `moov` antes de `mdat`, sin audio.
- Fotogramas revisados a mano (ver `preview.jpg`): sin rótulo de prueba, sin stock de demo, sin nombre/correo ni
  número de pedido, textos sólo los pedidos.
- Pieza de marketing: no toca la app, el API ni la infraestructura; no aplican build, tests, CSP ni e2e. No se
  abrió Docker.
