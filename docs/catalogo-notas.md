# Notas del catálogo

Notas internas sobre `src/assets/data/catalog.json` (datos pendientes de confirmar con la marca y decisiones ya
resueltas). Vivían como claves `_todo` dentro del JSON, pero ese archivo se publica tal cual en el sitio, así que se
movieron acá (T116). Un test (`tests/catalog-data.test.ts`) falla si vuelve a aparecer una clave que empiece con `_`.

## Acolchado de pluma sintética (`acolchados/acolchado-pluma-sintetica`)

- FALTA LA MEDIDA PLAZA Y MEDIA (180x240 cm): la tabla de pesos de la marca le asigna 2550 g, así que el producto existe, pero la lista de precios 2026 no tiene precio para esa medida en pluma sintética. No se carga la variante hasta tener el precio.
- Nota: la misma tabla de pesos confirma que Dos plazas / Full (220x240) existe, algo que el catálogo de marzo no listaba.

## Relleno nórdico (`acolchados/relleno-nordico-polyester`)

- Resuelto: el nombre pasó a 'Relleno nórdico' (sin 'de polyester'), así ya no choca con 'Poliéster' del título de la descripción. El id relleno-nordico-polyester no cambia (SKUs y URLs).
- Resuelto: el material pasó de '100% algodón' (catálogo 2026) a '100% poliéster', confirmado por el texto de la marca — quedaba contradictorio con el nombre del producto.

## Funda nórdica de lino y algodón (`fundas-nordicas/funda-nordica-lino`)

- Resuelto: la foto de la funda de lino BLANCA entera llegó en la carpeta PIUMA CLARA (lino/Piuma 2-76). También quedó cerrada la contradicción de material que traía el catálogo 2026 ('100% algodón'): el texto de la marca confirma 55% lino / 45% algodón.

## Cubrecama Petra (`cubrecamas/cubrecama-petra`)

- Petra viene en BLANCO y, en Twin y Plaza y media, también en AZUL (cambios del cliente 2026-10-30, mismo precio que el blanco). El azul todavía no tiene foto propia: la ficha muestra la del blanco como referencia y lo aclara. Se sacó de la galería la foto de los cubrecamas apilados en rosa, blanco y azul (producto-cubrecama-petra-2.webp) porque mostraba colores que ya no se venden.

## Cubrecama Charo (`cubrecamas/cubrecama-charo`)

- Resuelto: la marca indicó qué fotos corresponden al color Natural (IMG_0108, IMG_0110, IMG_0114) y cuáles al Blanco (IMG_0095, IMG_0098). A tener en cuenta: IMG_0114 (natural-3) muestra dos cubrecamas blancos doblados encima del natural, así que en esa foto conviven los dos tonos.
