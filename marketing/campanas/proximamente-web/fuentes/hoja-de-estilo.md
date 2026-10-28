# Hoja de estilo · «Próximamente nueva web»

Una sola campaña, tres composiciones distintas. Todo sale de la identidad real del sitio (`src/styles/_tokens.scss`)
y de las fotos del catálogo 2026 que ya están en `src/assets/images/`.

## Idea

Expectativa tranquila, de casa: la cama tendida como lugar propio y una web nueva que «se está tendiendo». Nada de
urgencia ni de efectos tecnológicos; la novedad se muestra con la página real, no con promesas.

## Color

| Uso | Token del sitio | Valor |
| --- | --- | --- |
| Fondo claro (post 1, apertura y cierre del reel, portada) | `--color-bg` blanco cálido | `#fbf8f4` |
| Fondo de anuncio (post 2, revelación del reel, planos de textura) | `--color-secondary` beige | `#efe6da` |
| Texto | `--color-text` | `#2f2c29` |
| Volantas y énfasis en cursiva | `--color-primary-dark` | `#8c5e44` |
| Filete de acento (64 × 2 px) | `--color-primary` terracota | `#b07a5c` |

La terracota se usa poco: un filete, una palabra en cursiva, el logo. Las fotos van sin filtros, sin sombras y sin
retoques de color: los productos conservan sus colores, tramas, costuras y botones.

## Tipografía

- **Playfair Display 500** para titulares; la segunda mitad de la frase en *cursiva* terracota oscuro.
- **Inter 500–600** en mayúsculas con 0,3 em de espaciado para volantas («PRÓXIMAMENTE»); Inter 400 para la bajada.
- Tamaños mínimos pensando en el teléfono (el post se ve a ~390 px de ancho): titulares ≥ 64 px, bajadas ≥ 32 px y volantas
  ≥ 30 px (Inter 600) sobre el lienzo de 1080.
- Texto siempre sobre fondo liso, nunca encima de la foto.

## Composición

- Post 1: foto de ambiente a sangre arriba, banda blanca cálida abajo con titular a la izquierda y logo a la derecha.
- Post 2: fondo beige, titular arriba; columna izquierda con detalle de textil, razón y cierre; a la derecha, un
  teléfono de contorno mínimo con la captura real que sale por el borde inferior.
- Reel: alterna foto a sangre, foto enmarcada con radio de 20 px (el de las tarjetas del sitio) y plano macro chico.
  Fundidos de 0,5 s en todas las transiciones; cada plano tiene un movimiento distinto (acercar, subir, alejar,
  desplazar lateral). Títulos y todo lo que hay que leer o ver (incluido el teléfono entero de la revelación) fuera de las zonas que tapa
  Instagram (arriba 220 px, abajo ~420 px, derecha ~120 px).
- Portada: título y logo dentro del recorte 3:4 de la grilla (1080 × 1440) y del 4:5 anterior (1080 × 1350).

## Logo

`src/assets/images/logo/logo-piuma-terracota.webp` (600 × 316, fondo transparente), siempre a ≤ 440 px de ancho para no
ampliarlo.
