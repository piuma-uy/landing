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

## Correcciones del autor (T85b)

Todas las piezas se re-exportaron después de los cambios (posts, portada, reel y `preview-campana.jpg`).

| Punto | Estado | Qué se hizo |
| --- | --- | --- |
| **B1** · `PLAYWRIGHT_MODULE` relativo falla | Resuelto | Los tres scripts (`capturar-web.cjs`, `render-imagenes.cjs`, `render-reel.cjs`) hacen `require(path.resolve(PLAYWRIGHT_MODULE))`, así que la variable se resuelve desde el directorio de trabajo, relativa o absoluta. El README usa la forma absoluta (`"$PWD/../../../../piuma-backend/node_modules/playwright"`). Verificado regenerando desde cero en un directorio temporal (copia de `src/assets/images` + la campaña sin PNG/MP4/JPG, `piuma-backend` como hermano): con la ruta absoluta del README y con la relativa salen los tres PNG, el reel y la preview; ver § Verificación |
| **A1** · volanta «PRÓXIMAMENTE» del reel a ≈ 9 px | Resuelto | 26 px → 40 px y Inter 600: ≈ 14,4 px efectivos a 390 px de ancho, mismo terracota oscuro |
| **A2** · catálogo bajo la UI de Instagram | Resuelto | La revelación se recompuso: teléfono entero de 540 × 1080 entre y = 420 y y = 1500 (antes 760 × 1600, salía por el borde). El desplazamiento termina con «Catálogo · Nuestra colección» y las cuatro primeras tarjetas (Acolchados, Almohadas, Cubrecamas, Fundas nórdicas) enteras, todo por encima de y = 1500 y lejos de la franja derecha |
| **M1** · «Nuestra colección» cortado contra el marco | Resuelto | Un solo tramo de desplazamiento (69 → 880 px CSS entre 10,0 y 12,4 s) y después quieto: el título queda con aire bajo el borde de la pantalla, sin moverse mientras la capa se funde |
| **M2** · cierre de 4,8 s quieto | Resuelto | Reel recortado a 20 s (dentro de 18–22 s) y acercamiento muy leve (3 %) de logo y frase durante todo el cierre; el teléfono también tiene un acercamiento de 2 % mientras está quieto |
| **M3** · `hero-piuma.webp` repetida | Resuelto | La apertura del reel ahora es `producto-funda-nordica-saten-beige.webp` (dormitorio con la funda satén beige), distinta de post 1 y de la portada. La foto hero sigue apareciendo dentro de la captura de la web (es la web real, no se retoca) y como miniatura de «Acolchados»; la satén beige aparece también como miniatura de «Fundas nórdicas» dentro del teléfono, a tamaño chico |
| **M4** · volanta del post 2 a ≈ 8 px | Resuelto | 22 px → 30 px, Inter 600 (≈ 10,8 px efectivos, en negrita media y mayúsculas espaciadas). El logo pasó de 176 a 220 px de ancho (nativo 600 px, no se amplía) para que «ROPA DE CAMA» se distinga mejor |
| **L1** · fundidos con doble exposición | Resuelto | El texto de apertura se va entre 2,8 y 3,3 s, antes que su foto; en la revelación primero entra el fondo beige y el titular (8,6 s) y el teléfono recién a 8,9 s, así no se superpone a la cama del Charo |
| **L2** · portada ampliada 1,35× | Justificado | No hay foto de mayor resolución en el repo y `brand-assets/` no está disponible en esta máquina; a tamaño de teléfono no se nota. Si aparece el original, alcanza con cambiar el `src` de `reel-portada.html` y re-renderizar |
| **L3** · «las últimas puntadas» | Resuelto | Caption del post 2: «La estamos terminando de coser. Muy pronto, nuestra nueva web.» |
| **L4** · comentario de `preview.sh` | Resuelto | Dice «nueve fotogramas» |
| **L5** · captura completa con rótulo de prueba | Resuelto | Se deja la captura completa (la usan los renders y conviene poder re-recortar), con una advertencia explícita en el README: no publicarla entera ni reutilizarla sin recortar |
| **L6** · nota de la portada (4:5 vs 3:4) | Resuelto | Comentario de `reel-portada.html` y hoja de estilo actualizados al recorte 3:4 (1080 × 1440, y 240–1680), que también se verificó |

### Verificación posterior

| Chequeo | Resultado |
| --- | --- |
| `ffprobe` del reel | 1080 × 1920, H.264 High, yuv420p, 30/1 fps, 600 fotogramas, 20,000 s, sin audio; `moov` en el byte 36, antes de `mdat` |
| `blackdetect d=0.03 pix_th=0.10` | Ningún fotograma negro |
| `select gt(scene,0.15)` | Ningún corte brusco |
| `freezedetect n=0.001 d=1.5` | Ningún plano quieto (antes: 8,8–10,2 s y 16,2–21,0 s) |
| Fotogramas cada 0,5 s con zonas de UI marcadas (220 arriba, 420 abajo, 120 derecha) y a 390 px de ancho | Titulares, volanta, teléfono y las cuatro tarjetas fuera de las zonas tapadas; «Nuestra colección» sin cortes; sin texto fantasma en los fundidos |
| Post 2 y portada a 390 px | Volanta del post 2 legible (≈ 11 px); portada sin cambios de diseño (título y logo dentro de 3:4 y 4:5) |
| Regeneración desde cero (B1) | Directorio temporal con `landing/src/assets/images`, `landing/marketing/campanas/proximamente-web` sin PNG/MP4/JPG y `piuma-backend` como hermano; `export PLAYWRIGHT_MODULE="$PWD/../../../../piuma-backend/node_modules/playwright"` y los cuatro comandos del README: los tres PNG, el reel y `preview-campana.jpg` salen **idénticos byte a byte** a los commiteados. La variante relativa (`../../../../piuma-backend/...`) también funciona |

— Guille jugueteando con el chatbot
