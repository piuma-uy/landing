# Captions · Campaña «Próximamente nueva web»

Español rioplatense, sin precios, sin fechas, sin dominio y sin anunciar compra online, pagos ni envíos
(no está verificado que vayan a estar al lanzamiento). Nada de «link en bio» ni «ya disponible».

## Post 1 · `post-01-marca.png` (marca y hogar)

```
Hay un momento del día que es solo tuyo: cuando llegás a casa y la cama te está esperando.

Hace más de 20 años que trabajamos con ropa de cama, y elegimos cada tela pensando en ese momento. Para que tu dormitorio sea eso: tu lugar.

¿Cómo es el tuyo?

#Piuma #RopaDeCama #Hogar
```

Texto alternativo: Cama tendida con acolchado blanco de Piuma, almohadones en tonos tierra, respaldo de madera tallada y
un canasto de fibra, con luz natural. Abajo, el texto «Tu dormitorio, tu lugar.» y el logo de Piuma.

## Post 2 · `post-02-proximamente-web.png` (expectativa por la web)

```
Estamos preparando un nuevo espacio para Piuma.

Una web para recorrer con calma toda nuestra colección (acolchados, fundas nórdicas, sábanas, cubrecamas y almohadas) con sus medidas y colores, a tu ritmo.

La estamos terminando de coser. Muy pronto, nuestra nueva web.

Mientras tanto, seguimos acá y por WhatsApp para lo que necesites.

#Piuma #RopaDeCama
```

Texto alternativo: Manos cerrando el botón de madera de una funda nórdica de lino y algodón blanca, junto a un teléfono
que muestra la sección «Nuestra colección» de la nueva web de Piuma. Texto: «Estamos preparando un nuevo espacio para
Piuma. Toda nuestra colección en un solo lugar, con sus medidas y colores. Muy pronto, nuestra nueva web.»

## Reel · `reel-proximamente-web.mp4` (anuncio breve)

```
Algo nuevo se está tendiendo en Piuma 🪶

Próximamente, nuestra nueva web: toda la colección en un solo lugar.

#Piuma #RopaDeCama
```

Portada: `reel-portada.png`. Audio: el reel se exporta sin música (ver README, «Música»).

## Verificación de lo que se afirma

| Afirmación | Fuente |
| --- | --- |
| «Más de 20 años» con ropa de cama | Sección «Sobre nosotros» del sitio (`about.component.html`) |
| «Elegimos cada tela» | Valor «Empresa familiar» del sitio: «Elegimos cada tela nosotros mismos» |
| Categorías: acolchados, fundas nórdicas, sábanas, cubrecamas y almohadas | `src/assets/data/catalog.json` y la web en dev |
| «Medidas y colores» en la web | Texto real de la sección catálogo: «ver los productos, las medidas y los colores disponibles» |
| Funda nórdica de lino y algodón con botón de madera (foto post 2 y reel) | `catalog.json`: 55% lino / 45% algodón; galería «Detalle del botón de madera» |
| WhatsApp como canal actual | Sitio y Linktree de Piuma (`linktr.ee/piuma_uy`) |

No se menciona ningún material en los textos: el sitio dice «toda nuestra línea es 100% algodón», pero el catálogo
incluye un relleno nórdico 100% poliéster. Esa contradicción queda fuera de la campaña.
