# Revisión independiente · Campaña «Próximamente nueva web» (T86)

Revisión del commit `d257429` (T85) contra el brief `brief-campana-proximamente-web.md`. El revisor no corrigió
ninguna pieza: los hallazgos quedan para el autor.

## Veredicto

Las tres piezas son utilizables y coherentes entre sí. **No hay bloqueantes en las piezas**; hay **un bloqueante en
el README** (la receta para regenerar, tal como está escrita, falla) y varias mejoras, dos de ellas de prioridad
alta para el reel (volanta «PRÓXIMAMENTE» ilegible en el teléfono y catálogo tapado por la UI de Instagram).

## Qué se verificó

| Chequeo | Resultado |
| --- | --- |
| `ffprobe` del reel | 1080 × 1920, H.264 High, yuv420p, 30/1 fps, 630 fotogramas, 21,000 s, sin audio. `moov` en el byte 36, antes de `mdat` (+faststart OK) |
| Fotogramas negros (`blackdetect d=0.03 pix_th=0.10`) | Ninguno |
| Cortes bruscos (`select gt(scene,0.15)`) | Ninguno: todas las transiciones son fundidos |
| Planos quietos (`freezedetect`) | 8,8–10,2 s (pantalla de la web antes del desplazamiento) y 16,2–21,0 s (cierre, 4,8 s sin movimiento) |
| Fotogramas cada 0,5 s y en cada fundido, con las zonas de UI marcadas (220 px arriba, 420 px abajo, 120 px a la derecha) | Revisados a tamaño real y a 390 px de ancho |
| Tildes y fuentes | «Próximamente», «colección», «está», «nórdicas», «Elegí», «categoría» bien renderizadas en todas las piezas; Playfair e Inter cargadas (no hay fuente de reemplazo en ningún fotograma) |
| Regeneración | En un directorio temporal con `src/assets/images` y la carpeta de la campaña: `render-imagenes.cjs` reproduce los tres PNG **idénticos** (PSNR = inf), `preview.sh` reproduce `preview-campana.jpg` idéntico, `render-reel.cjs --cuadros 0,9.5,18` funciona. Con `PLAYWRIGHT_MODULE` absoluto |
| Atributos de producto contra `src/assets/data/catalog.json` | Ver § Fidelidad: todos correctos |
| Alcance del commit | Sólo `marketing/campanas/proximamente-web/` (28 archivos, ~10,6 MB). Nada en `src/`, `public/` ni configuración. Sin temporales, cachés, `node_modules` ni secuencias de fotogramas |

## Bloqueante

**B1 · README: el comando documentado para regenerar falla.**
`export PLAYWRIGHT_MODULE=../../../../piuma-backend/node_modules/playwright` y después
`node produccion/render-imagenes.cjs` da `Error: Cannot find module '../../../../piuma-backend/node_modules/playwright'`
aunque la ruta exista desde el directorio actual (lo probé con `piuma-backend` como hermano del repo). `require()`
resuelve las rutas relativas desde el archivo que lo llama (`produccion/`), no desde el directorio de trabajo: desde
ahí `../../../../` apunta a la raíz de `landing`, no a su carpeta padre. Arreglo sugerido: en el README usar ruta
absoluta (`export PLAYWRIGHT_MODULE="$PWD/../../../../piuma-backend/node_modules/playwright"`) o, en los tres
scripts, `require(path.resolve(process.env.PLAYWRIGHT_MODULE))` cuando la variable esté definida.

## Mejoras · prioridad alta

**A1 · Reel 8,7–15 s: la volanta «PRÓXIMAMENTE» es ilegible en el teléfono.**
`#revelacion .volanta { font-size: 26px }` sobre 1080 → ≈ 9 px efectivos a 390 px de ancho, en mayúsculas espaciadas
y terracota oscuro sobre beige. Es la única vez que la palabra «próximamente» aparece en la revelación; sin ella el
titular «Nuestra nueva web» se puede leer como «ya está». Subirla a ≥ 36–40 px (≥ 13 px efectivos) o integrar
«Próximamente» al titular. (El cierre «Muy pronto, nuestra nueva web.» salva el mensaje, pero recién en el segundo 15.)

**A2 · Reel 10,5–15 s: la mitad baja del teléfono queda debajo de la UI de Instagram.**
El teléfono va de y = 484 a y = 2084 (sale por el borde). Las tarjetas «Cubrecamas» y «Fundas nórdicas» y sus
rótulos quedan entre y ≈ 1500 y 1920, la zona que tapan el caption, el nombre de cuenta y el audio. Es justo el
contenido concreto de la revelación. Sugerencia: achicar el teléfono (~640 px de ancho) o subirlo y detener el
desplazamiento donde se vean las cuatro categorías por encima de y = 1500.

## Mejoras · prioridad media

**M1 · Reel 14,2–15,4 s: «Nuestra colección» queda cortado por el borde del teléfono.** El último tramo de
`scrollWeb` (835 → 1000 px entre 13,4 y 15,4 s) sube el título hasta pegarlo al marco (a 14,4 s ya toca la esquina
redondeada) justo mientras la capa se funde. La revelación termina en un recorte pobre; conviene cerrar el
desplazamiento en ~835–900 o dejar quieto el plano final.

**M2 · Reel 16,2–21 s: cierre de 4,8 s completamente quieto** (confirmado con `freezedetect`). Funciona como placa
final, pero en un reel que se repite en bucle se siente muerto. Opciones: un acercamiento muy leve (1–2 %) del logo y
la frase, o recortar el reel a ~19,5–20 s (sigue dentro de 18–22 s).

**M3 · Repetición de la misma foto (`hero-piuma.webp`).** Es la foto del post 1, la apertura del reel (0–3,5 s), la
imagen grande del inicio dentro de la captura (8,5–10,5 s del reel) y la tarjeta «Acolchados» del post 2 y del reel.
En la grilla, post 1 y el primer fotograma del reel van a verse iguales. Sugerencia: abrir el reel con otra foto de
ambiente (p. ej. `producto-funda-nordica-saten-beige.webp` o `producto-cubrecama-charo-2.webp`), como ya se hizo con la
portada.

**M4 · Post 2 a 390 px: volanta «PRÓXIMAMENTE» de 22 px → ≈ 8 px efectivos** y «ROPA DE CAMA» del logo (176 px de
ancho) prácticamente ilegible. El anuncio se entiende igual por titular y cierre, pero la volanta merece ≥ 28–30 px.

## Mejoras · prioridad baja

- **L1 · Fundidos con doble exposición visible.** A 3,5 s el texto «Algo nuevo se está tendiendo» aparece fantasmal
  encima de la foto del botón; a 8,5 s el teléfono se superpone a la cama del Charo. Sacar el texto de apertura
  0,3 s antes que su foto (o fundir a beige) lo deja más limpio.
- **L2 · Portada: foto de 800 × 1000 ampliada 1,35×** (se nota algo blanda a tamaño real; en teléfono no) y la
  persona de la derecha queda cortada en brazo y rodilla (ya lo está en el original). Aceptable; si hay alternativa
  con mejor resolución, mejor.
- **L3 · Caption del post 2: «Le estamos dando las últimas puntadas».** Sugiere que el lanzamiento es inminente sin
  que haya fecha verificada. Es leve y está bien escrito; evaluar «La estamos terminando de coser» o similar si se
  quiere evitar cualquier promesa de plazo.
- **L4 · `produccion/preview.sh`:** el comentario dice «seis fotogramas del reel» y el script usa nueve (el README
  dice nueve, que es lo correcto).
- **L5 · `fuentes/capturas/web-inicio-catalogo.png`** (2,8 MB) incluye el rótulo «Tienda de prueba · Sin cobros», el
  ícono del carrito y el botón flotante de WhatsApp. Ninguno aparece en las piezas (verificado), pero si alguien
  reutiliza la captura completa los va a publicar: dejar una línea en el README o recortar la captura guardada.
- **L6 · Portada:** el comentario de `reel-portada.html` habla del recorte 1080 × 1350; la grilla de perfil de
  Instagram hoy usa 3:4 (1080 × 1440, y 240–1680). Verifiqué que título y logo entran en ambos; sólo actualizar la nota.

## Fidelidad de producto

Fotos sin filtros ni cambios de color visibles; recortes sin cortar botones ni costuras. Atributos contra `catalog.json`:

| Afirmación / plano | Catálogo | Estado |
| --- | --- | --- |
| Funda nórdica de lino y algodón con botón de madera (post 2, reel 3,5–4,9 s) | `funda-nordica-lino`: 55 % lino / 45 % algodón; galería «Detalle del botón de madera» | OK |
| Relieve del cubrecama Chiara, gris (reel 4,4–6,1 s) | `cubrecama-chiara`, color Gris; `-3` «Detalle del acolchado en relieve» | OK |
| Caída del satén beige (reel 5,6–7,3 s) | `funda-nordica-saten`, Beige; `-3` «Detalle del brillo del algodón satén beige» | OK |
| Cubrecama Charo con bandeja (reel 6,8–8,8 s) | `cubrecama-charo`, Blanco, «con bandeja de desayuno» | OK |
| Portada: funda de lino y algodón blanca | `producto-funda-nordica-lino.webp`, «en blanco» | OK |
| «Más de 20 años», «Elegimos cada tela» | `about.component.html:15`, `about.component.ts:15,24` | OK |
| Categorías (acolchados, fundas nórdicas, sábanas, cubrecamas, almohadas) | 5 categorías en `catalog.json` | OK |
| Materiales | Ningún texto menciona materiales (se evita bien la contradicción «100 % algodón» vs. relleno nórdico 100 % poliéster) | OK |

## Claridad del anuncio

«Próximamente» / «Muy pronto» explícito en las tres piezas y en los tres captions. Sin dominio, fecha, precios,
descuentos, compra online, pagos ni envíos; sin «link en bio» ni «ya disponible». Las capturas de la web no muestran
el rótulo «Tienda de prueba», precios, carrito, datos de prueba ni el botón flotante (desplazamiento máximo 1000 px,
el rótulo está a ~1900). La web se muestra real; el teléfono es sólo un contorno.

## Calidad editorial y captions

- Post 1 es el más fuerte: foto protagonista, banda clara con titular y logo, nada de plantilla.
- Post 2 resuelve bien producto + web, aunque el esquema «foto + teléfono» es el más previsible de la campaña.
- Reel: buen ritmo y escalas alternadas en 3,5–8,8 s; la revelación es clara pero ver A1, A2 y M1.
- Captions: rioplatense natural, sin grandilocuencia, 2–3 hashtags, sin promesas de salud ni testimonios. El emoji 🪶
  del reel va con la marca.

## Costo y licencias

README confirma cero servicios pagos; nada en el repo contradice eso (sin claves, sin llamadas a APIs, fuentes OFL
con sus licencias, FFmpeg y Chromium locales, sin música). Coincide con lo que se pudo verificar.

— Guille jugueteando con el chatbot
