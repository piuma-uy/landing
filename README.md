# Piuma — Landing page

Landing page estática para Piuma (ropa de cama). Angular 19 con componentes standalone, SCSS y
cero dependencias fuera de Angular. Sin backend, sin carrito y sin pasarela de pago: las consultas
se derivan a WhatsApp.

## Cómo correrlo

```bash
npm install
npm start        # http://localhost:4200
npm run build    # genera dist/piuma-landing/browser
```

> Requiere Node.js 20 o superior.

## Arquitectura: una sola página con scroll

Es **single page con anclas** (`#inicio`, `#catalogo`, `#sobre-nosotros`, `#contacto`), no rutas.
El motivo: el tráfico va a llegar mayormente desde el link de Instagram, y en ese contexto el
recorrido natural es un scroll continuo hasta el CTA de WhatsApp. Además evita cargar el Router,
elimina el riesgo de 404 en el hosting estático y permite que Google indexe todo el contenido en
una sola URL. Si más adelante hacés falta una ficha por producto o un blog, ahí sí conviene
agregar `provideRouter` y convertir cada sección en una ruta.

### El catálogo tampoco usa rutas

Los 3 niveles (categorías → tipos → detalle) se manejan con **signals dentro de
`CatalogComponent`**, no con rutas tipo `/catalogo/acolchados`. Razones:

- El catálogo es **una sección** de una página de scroll único. Una ruta por categoría obligaría a
  partir la landing en páginas separadas (perdiendo el recorrido continuo hasta el CTA de WhatsApp)
  o a montar el Router sólo para recordar qué tarjeta está abierta.
- Lo único que las rutas aportarían es un link compartible por categoría. Para eso no hace falta el
  Router: alcanza con reflejar `selectedCategoryId` en un query param con la History API.
- Menos bundle y ningún riesgo de 404 en hosting estático.

**Cuándo reconsiderarlo**: si cada producto pasa a tener su propia ficha indexable por Google —ahí
el SEO de URLs propias sí justifica el Router, y conviene hacerlo junto con SSR/prerender.

## Estructura

```
src/
├─ index.html                      meta tags SEO + Open Graph + Google Fonts
├─ main.ts                         bootstrap de la app y HttpClient
├─ styles.scss                     reset, tipografía base y utilidades (.btn, .container)
├─ styles/
│  ├─ _tokens.scss                 COLORES, tipografías y espaciados (custom properties)
│  ├─ _variables.scss              breakpoints SCSS
│  └─ _mixins.scss                 from(), container, section
├─ assets/data/catalog.json        CATÁLOGO jerárquico (5 categorías, 13 tipos, 51 variantes)
├─ assets/images/                  fotos optimizadas en .webp (~712 KB en total)
│  ├─ productos/                   1 foto por producto
│  ├─ logo/                        logo terracota (header) y blanco (footer)
│  ├─ hero-piuma.webp
│  └─ sobre-nosotros-piuma.webp
└─ app/
   ├─ app.component.ts             arma la página completa
   ├─ core/
   │  ├─ site-config.ts            WHATSAPP, email y redes sociales
   │  └─ color-swatches.ts         hex aproximados de los colores (ver TODO adentro)
   ├─ models/catalog.model.ts      Category → ProductType → Variant
   ├─ services/
   │  ├─ catalog.service.ts        lee catalog.json
   │  └─ whatsapp.service.ts       arma los links wa.me (genérico y por variante)
   ├─ shared/social-links/         íconos SVG de Instagram / WhatsApp / Facebook
   └─ components/
      ├─ header/                   nav fija con menú hamburguesa en mobile
      ├─ hero/
      ├─ catalog/                  niveles 1 y 2 + estado de navegación
      │  └─ product-detail/        nivel 3: selectores de medida y color
      ├─ about/
      ├─ contact/                  formulario reactivo + CTA de WhatsApp
      └─ footer/
```

## Material de marca

`brand-assets/` guarda el material original bajado de Drive, ordenado y **fuera de git**
(pesa ~2 GB, casi todo video). La copia maestra sigue siendo Drive.

```
brand-assets/
├─ images/   ambiente-camas (37) · sabanas (24) · logos (9) · feed-instagram (7) · estudio (3)
├─ video/    18 archivos, 1.78 GB
└─ info/     lista-precios-2026.pdf · catalogo-2026-marzo.pdf   <- fuente de los datos
```

Las fotos que usa el sitio salen del **catálogo PDF** (cada producto tiene su foto en su propia
página), convertidas a `.webp` en `src/assets/images/`.

## Qué reemplazar / dónde tocar

### 1. Número de WhatsApp

Un solo lugar: [`src/app/core/site-config.ts`](src/app/core/site-config.ts). Hoy está el
**091 345 454**; el catálogo lista además 092 090 406 y 099 619 407.

```ts
whatsappNumber: '59891345454',  // sólo dígitos, sin + ni espacios
whatsappDisplay: '091 345 454', // lo que se ve en pantalla
```

Los mensajes predefinidos ("¡Hola Piuma! Quiero consultar sobre…") están en
[`whatsapp.service.ts`](src/app/services/whatsapp.service.ts).

### 2. Imágenes

| Imagen | Dónde se define |
| --- | --- |
| Hero | `heroImage` en [`hero.component.ts`](src/app/components/hero/hero.component.ts) |
| Sobre nosotros | `image` en [`about.component.ts`](src/app/components/about/about.component.ts) |
| Productos | campo `image` de cada objeto en `products.json` |
| Logo header / footer | `header.component.html` y `footer.component.html` |
| Open Graph (link preview) | `og:image` en [`index.html`](src/index.html) |

Las rutas van sin barra inicial (`assets/images/...`). Si reemplazás una foto, actualizá también su
texto `alt`: es lo que leen Google y los lectores de pantalla.

### 3. Colores y tipografías

Todo en el `:root` de [`src/styles/_tokens.scss`](src/styles/_tokens.scss). Cambiando
`--color-primary`, `--color-secondary`, `--color-accent` y `--color-text` cambia el sitio entero,
sin tocar ningún componente. Para las fuentes, cambiá `--font-heading` / `--font-body` y el `<link>`
de Google Fonts en `index.html`.

### 4. Catálogo

[`src/assets/data/catalog.json`](src/assets/data/catalog.json) — 5 categorías, 13 tipos,
51 variantes. La forma está tipada en [`catalog.model.ts`](src/app/models/catalog.model.ts).

**Jerarquía: Categoría → Tipo → Variantes.** "Tipo" y "producto" son la misma entidad porque en
Piuma cada tipo ("Satén") es exactamente un producto ("Sábanas 300 hilos satén"). Si algún tipo
llega a tener dos productos, hay que insertar un nivel `products[]` entre `ProductType` y `Variant`.

**El precio vive en la variante y depende sólo de la medida.** Las sábanas satén Queen cuestan lo
mismo en beige, gris o azul. Lo que sí cambia por medida es **qué colores existen**: King y Super
King no vienen en azul. Por eso `colors` va dentro de cada variante y no a nivel producto.

```json
{
  "id": "sabanas",
  "name": "Sábanas",
  "image": "assets/images/productos/producto-sabanas-percal.webp",
  "alt": "…",
  "types": [
    {
      "id": "sabanas-saten",
      "name": "Satén",
      "fullName": "Sábanas 300 hilos satén",
      "material": "100% algodón, 300 hilos satén",
      "description": "Suave y brillante.",
      "includes": "Incluye 1 o 2 fundas de almohada según medida",
      "currency": "UYU",
      "image": "assets/images/productos/producto-sabanas-saten.webp",
      "alt": "…",
      "variants": [
        { "size": "Twin", "bedSize": "90x190 cm", "productSize": "160x240 cm",
          "colors": ["Beige", "Gris", "Azul"], "price": 3000 }
      ]
    }
  ]
}
```

- `name` es el nombre corto que se ve en el nivel 2; `fullName` es el que va al mensaje de WhatsApp.
- `bedSize` es opcional — la lista de precios sólo lo especifica en algunos productos.
- `material: null` significa que el dato falta; la UI oculta esa línea.
- `_todo` marca datos incompletos o contradicciones entre el catálogo y la lista de precios.
- El **"Desde $X"** de las tarjetas es el mínimo de `variants[].price`, calculado en
  [`catalog.component.ts`](src/app/components/catalog/catalog.component.ts). No hay ningún precio
  duplicado en el JSON.
- Los **colores de los swatches** NO están en el JSON: viven en
  [`color-swatches.ts`](src/app/core/color-swatches.ts) porque son aproximaciones visuales, no datos
  de los PDFs. El JSON sólo contiene lo verificable contra el catálogo y la lista de precios.

Los precios son números sin formato (`3000`); el símbolo y los separadores los aplica
`Intl.NumberFormat` según `currency`.

Cuando tengas un backend o un CMS, cambiá `PRODUCTS_URL` en
[`product.service.ts`](src/app/services/product.service.ts) por el endpoint real. Si la respuesta
mantiene la misma forma, no hay que tocar nada más.

### 5. Formulario de contacto

Hoy valida los campos y muestra un mensaje de confirmación, pero **no envía nada**. El punto exacto
donde conectar el servicio real está marcado con un bloque de comentarios en `onSubmit()` de
[`contact.component.ts`](src/app/components/contact/contact.component.ts), con el ejemplo de
código para Web3Forms y Formspree. Ambos son un `POST` con el body del formulario; el `HttpClient`
ya está provisto en `main.ts`, sólo hay que inyectarlo.

## Deploy

Listo para hosting estático, con la config ya incluida:

- **Vercel**: `vercel.json` (build `npm run build`, output `dist/piuma-landing/browser`)
- **Netlify**: `netlify.toml`

En ambos casos alcanza con conectar el repositorio; no hace falta configurar nada a mano.
