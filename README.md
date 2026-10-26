# Piuma — Landing page

Landing page estática para Piuma (ropa de cama). Angular 19 con componentes standalone, SCSS y
cero dependencias fuera de Angular. Sin backend, sin carrito y sin pasarela de pago: las consultas
se derivan a WhatsApp.

## Cómo correrlo

```bash
npm install
npm start        # http://localhost:4200
npm run build    # genera dist/piuma-landing/browser
npm test         # typecheck de tests/ + unitarios (node --test, requiere Node.js 22.18+ o 24)
```

Los unitarios (`tests/*.test.ts`) cubren la lógica sin Angular: catálogo (`core/catalog-adapter.ts`), carrito
(`commerce/cart.ts`), login Cognito con SRP y PKCE (`commerce/cognito.ts`, `commerce/srp.ts`, contra vectores de
`AuthenticationHelper` de AWS y un user pool simulado en `tests/fake-user-pool.ts`), checkout e `Idempotency-Key`
(`commerce/checkout.ts`), envíos, transferencia, tarjeta, segundo factor, QR e historial de ajustes. Los componentes y el flujo completo en navegador (login,
checkout aprobado/pendiente/rechazado, teléfono y desktop) se prueban con los e2e de `../piuma-backend`.

> Requiere Node.js 20 o superior.

### Tienda y autenticación (`public/runtime-config.json`)

Por defecto el comercio está apagado (`{"commerceEnabled":false,"apiBaseUrl":""}`). Con `commerceEnabled: true`,
`auth` elige cómo se inicia sesión:

- `"cookie"` (o ausente): API local de Docker (`http://localhost` o `127.0.0.1`), formulario propio y cookie de
  sesión (`openapi.local.yaml`).
- `"cognito"`: API en AWS. Ingreso, registro con código, contraseña olvidada y cambio de la contraseña temporal
  con los formularios de la tienda (`commerce/account/`, T61) contra la API del user pool: `USER_SRP_AUTH`
  (`commerce/srp.ts`, sin librerías; la contraseña no sale del navegador). Google, si está habilitado, sigue por la
  UI alojada de Cognito con code + PKCE S256. Access e id token quedan sólo en memoria y el access viaja como
  `Authorization: Bearer`. Sólo el refresh token se guarda en `sessionStorage` (esta pestaña; se borra al cerrarla o
  al salir): al recargar o volver de Mercado Pago la sesión se renueva sin la contraseña (T61b). Si Cognito ya no la
  renueva, se borra y la tienda pide ingresar de nuevo. Sin `issuer` (nombra el user pool) el
  botón "Ingresar" vuelve a la UI alojada.

Los formularios son los mismos en Docker (`"cookie"`), con sólo ingreso y registro.

```json
{
  "commerceEnabled": true,
  "apiBaseUrl": "<api_url>",
  "auth": "cognito",
  "cognito": {
    "loginUrl": "<login_url>",
    "clientId": "<client_id>",
    "redirectUri": "https://<origen>/",
    "logoutUri": "https://<origen>/",
    "issuer": "<cognito_issuer>",
    "google": false
  }
}
```

Todos son valores públicos (outputs de Terraform); nunca va un secreto. `redirectUri`/`logoutUri` son opcionales
(por defecto, el origen con `/`) y deben estar registrados en `callback_urls`/`logout_urls` del cliente Cognito.
Con `issuer` (`https://cognito-idp.<región>.amazonaws.com/<pool>`) el `iss` del `id_token` tiene que coincidir;
además se exige `aud` (string o lista con el `clientId`) y `exp` vigente, con 5 min de tolerancia de reloj.

El archivo se valida al arrancar (`commerce/runtime-config.ts`): `commerceEnabled` tiene que ser `true` (no basta
un valor "verdadero"), `auth: "cookie"` sólo con un API local, y con `cognito` el API, `loginUrl`, `issuer` y las
URIs tienen que ser https (o locales). Si algo no cierra, el comercio queda apagado y la consola dice por qué.
`testMode: true` muestra el rótulo "Tienda de prueba · Sin cobros"; no va en una tienda que cobra de verdad.

### Seguridad del panel (T27/T28)

- **Segundo factor**: la tienda no tiene (decisión del dueño, 2026-10-26, T59): por defecto el API no lo exige y
  el panel muestra todo directo. Sólo si el backend se despliega con `admin_mfa_required = true`, el API responde
  403 `MFA_REQUIRED` en `/admin/*` a un administrador sin TOTP; ante esa respuesta (y sólo entonces) el panel no
  muestra ninguna sección y guía el alta contra el API de Cognito con el access token (scope
  `aws.cognito.signin.user.admin`, pedido siempre en el login para que el flag se pueda prender sin otro deploy del
  front): QR (dibujado en `commerce/qr.ts`, sin librerías), botón para abrir la app autenticadora en el mismo
  teléfono, clave en texto y el primer código de 6 dígitos (`commerce/mfa.ts`). Desde el siguiente ingreso Cognito
  pide el código. En Docker no hay segundo factor salvo que el API corra con `LOCAL_ADMIN_MFA=enrolled` (el login
  local lo reemplaza) o `LOCAL_ADMIN_MFA=missing` (muestra la explicación en lugar del alta).
- **Historial de cambios** en Configuración (`GET /admin/settings/history`): fecha, quién y antes/ahora; del número
  de cuenta sólo los últimos 4 dígitos (`commerce/settings-history.ts`).
- **Aviso** arriba del panel si los datos bancarios cambiaron en los últimos 7 días, con fecha y usuario.

## Arquitectura: una sola página con scroll

Es **single page con anclas** (`#inicio`, `#catalogo`, `#sobre-nosotros`, `#contacto`), no rutas.
El motivo: el tráfico va a llegar mayormente desde el link de Instagram, y en ese contexto el
recorrido natural es un scroll continuo hasta el CTA de WhatsApp. Además evita cargar el Router y
elimina el riesgo de 404 en el hosting estático. Las fichas del catálogo sí tienen URL propia e
indexable (ver abajo), sin Router.

### El catálogo tampoco usa el Router

Los 3 niveles (categorías → tipos → detalle) se manejan con **signals dentro de
`CatalogComponent`**, no con el Router de Angular. Razones:

- El catálogo es **una sección** de una página de scroll único. Rutas de Angular obligarían a
  partir la landing en páginas separadas (perdiendo el recorrido continuo hasta el CTA de WhatsApp)
  o a montar el Router sólo para recordar qué tarjeta está abierta.
- Menos bundle y ningún riesgo de 404 en hosting estático.

Lo que sí hay son **URLs propias por categoría y producto**, reflejadas con la History API:
`/catalogo/<categoría>/` y `/catalogo/<categoría>/<producto>/` (ver
[`catalog-seo.ts`](src/app/core/catalog-seo.ts)). Entrar directo a una abre esa categoría o ficha, y
el botón atrás del navegador vuelve al nivel anterior. Son las páginas que se prerenderizan (abajo).

## SEO y prerender

No hay SSR: el hosting es estático (S3 + CloudFront, hoy Vercel). `npm run build` corre `ng build`
y después [`scripts/prerender.ts`](scripts/prerender.ts), que a partir de `catalog.json` escribe en
`dist/piuma-landing/browser/`:

- `index.html` y `catalogo/<categoría>/[<producto>/]index.html`: el mismo index del build con
  title, description, canonical y Open Graph de cada página, datos estructurados JSON-LD (`Store`,
  `Product` con `AggregateOffer`, `ItemList`, `BreadcrumbList`) y el contenido como HTML semántico
  dentro de `<app-root>` para crawlers sin JavaScript. Ese HTML se oculta con CSS (sólo se ve en
  `<noscript>`) y Angular lo reemplaza al arrancar; no se agregan scripts inline (CSP `script-src 'self'`).
- `robots.txt` y `sitemap.xml` (con imágenes).

El dominio sale de `SITE_URL` al compilar (por defecto `https://piuma.uy`):
`SITE_URL=https://piuma-landing.vercel.app npm run build`. `<base href="/">` en `index.html` es
necesario para que los assets relativos funcionen en las subrutas. Cuenta, carrito, pedidos y admin
son vistas en la misma URL y llevan `<meta name="robots" content="noindex">` mientras están abiertas.

El hosting tiene que servir `catalogo/.../index.html` en esas rutas (Vercel lo hace solo; la
CloudFront Function de `piuma-backend/infra/frontend.tf` necesita reescribirlas a su `index.html`).
Un producto que existe sólo en el API (no en `catalog.json`) no tiene página: se abre en la landing
sin cambiar la URL.

## Analytics

Apagado por defecto. Con la clave `analytics` en `runtime-config.json` se mandan eventos a
[Umami](https://umami.is) (open source, sin cookies, self-hosted o Umami Cloud), sin cargar su script:

```json
"analytics": { "provider": "umami", "hostUrl": "https://<umami>", "websiteId": "<uuid>" }
```

Envía páginas vistas (inicio y cada URL del catálogo) y los eventos `whatsapp`, `categoria`,
`producto`, `carrito` y `checkout`, sin query ni hash en la URL; del referrer manda sólo el origen (vacío si es la propia tienda). Respeta Do Not
Track y Global Privacy Control. Al activarlo, sumar el origen de `hostUrl` a `frontend_connect_src` de
`piuma-backend/infra` (CSP `connect-src`).

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
   │  ├─ catalog-seo.ts            URLs y title/description de las páginas del catálogo
   │  └─ color-swatches.ts         hex aproximados de los colores (ver TODO adentro)
   ├─ models/catalog.model.ts      Category → ProductType → Variant
   ├─ services/
   │  ├─ catalog.service.ts        lee catalog.json
   │  ├─ analytics.service.ts      eventos sin cookies (Umami), apagado por defecto
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
