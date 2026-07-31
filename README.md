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

> Requiere Node.js 20 o superior (todavía no está instalado en esta máquina).

## Arquitectura: una sola página con scroll

Es **single page con anclas** (`#inicio`, `#catalogo`, `#sobre-nosotros`, `#contacto`), no rutas.
El motivo: el tráfico va a llegar mayormente desde el link de Instagram, y en ese contexto el
recorrido natural es un scroll continuo hasta el CTA de WhatsApp. Además evita cargar el Router,
elimina el riesgo de 404 en el hosting estático y permite que Google indexe todo el contenido en
una sola URL. Si más adelante hacés falta una ficha por producto o un blog, ahí sí conviene
agregar `provideRouter` y convertir cada sección en una ruta.

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
├─ assets/data/products.json       CATÁLOGO (10 productos de ejemplo)
└─ app/
   ├─ app.component.ts             arma la página completa
   ├─ core/site-config.ts          WHATSAPP, email y redes sociales
   ├─ models/product.model.ts
   ├─ services/
   │  ├─ product.service.ts        lee el JSON del catálogo
   │  └─ whatsapp.service.ts       arma los links wa.me
   ├─ shared/social-links/         íconos SVG de Instagram / WhatsApp / Facebook
   └─ components/
      ├─ header/                   nav fija con menú hamburguesa en mobile
      ├─ hero/
      ├─ catalog/
      │  └─ product-card/
      ├─ about/
      ├─ contact/                  formulario reactivo + CTA de WhatsApp
      └─ footer/
```

## Qué reemplazar cuando tengas el contenido real

### 1. Número de WhatsApp

Un solo lugar: [`src/app/core/site-config.ts`](src/app/core/site-config.ts).

```ts
whatsappNumber: '59899999999',      // sólo dígitos, sin + ni espacios
whatsappDisplay: '+598 99 999 999', // lo que se ve en pantalla
```

Los mensajes predefinidos ("¡Hola Piuma! Quiero consultar sobre…") están en
[`src/app/services/whatsapp.service.ts`](src/app/services/whatsapp.service.ts).

### 2. Imágenes

Hoy son placeholders de `picsum.photos`. Bajá las fotos de tu Drive a `src/assets/images/` y:

| Imagen | Dónde se define |
| --- | --- |
| Hero | `heroImage` en [`hero.component.ts`](src/app/components/hero/hero.component.ts) |
| Sobre nosotros | `image` en [`about.component.ts`](src/app/components/about/about.component.ts) |
| Productos | campo `image` de cada objeto en `products.json` |
| Open Graph (link preview) | `og:image` en [`index.html`](src/index.html) |

Las rutas quedan como `assets/images/hero.jpg` (sin barra inicial). Actualizá también el texto
`alt` de cada una: es lo que lee Google y los lectores de pantalla.

### 3. Colores y tipografías

Todo en el `:root` de [`src/styles/_tokens.scss`](src/styles/_tokens.scss). Cambiando
`--color-primary`, `--color-secondary`, `--color-accent` y `--color-text` cambia el sitio entero,
sin tocar ningún componente. Para las fuentes, cambiá `--font-heading` / `--font-body` y el `<link>`
de Google Fonts en `index.html`.

### 4. Productos

[`src/assets/data/products.json`](src/assets/data/products.json). Es un array; cada producto tiene
`id`, `name`, `category`, `price`, `currency`, `shortDescription`, `image`, `alt` y `featured`.
Agregá, sacá o reordená libremente: el grid se adapta solo. Los precios son números sin formato
(`4890`); el símbolo y los separadores los aplica `Intl.NumberFormat` según el campo `currency`.

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
