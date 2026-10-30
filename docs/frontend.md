# Frontend: referencia técnica

Detalle del código Angular que antes estaba en el README: configuración en runtime, autenticación, panel, navegación,
SEO, analytics y dónde tocar marca y catálogo. El panorama general (AWS, despliegue, pruebas) está en el
[README](../README.md).

## Configuración en runtime (`public/runtime-config.json`)

Por defecto el comercio está apagado (`{"commerceEnabled":false,"apiBaseUrl":""}`). En AWS el workflow `Deploy dev` de
`piuma-backend` reemplaza el archivo con los outputs de Terraform; en Docker lo monta `compose.dev.yaml`. Con
`commerceEnabled: true`, `auth` elige cómo se inicia sesión:

- `"cookie"` (o ausente): API local de Docker (`http://localhost` o `127.0.0.1`), formulario propio y cookie de sesión
  (`openapi.local.yaml`).
- `"cognito"`: API en AWS. Ingreso, registro con código, contraseña olvidada y cambio de la contraseña temporal con los
  formularios de la tienda (`commerce/account/`, T61) contra la API del user pool: `USER_SRP_AUTH` (`commerce/srp.ts`, sin
  librerías; la contraseña no sale del navegador). Google, si está habilitado, sigue por la UI alojada de Cognito con
  code + PKCE S256. Access e id token quedan sólo en memoria y el access viaja como `Authorization: Bearer`. Sólo el
  refresh token se guarda en `sessionStorage` (esta pestaña; se borra al cerrarla o al salir): al recargar o volver de
  Mercado Pago la sesión se renueva sin la contraseña (T61b). Si Cognito ya no la renueva, se borra y la tienda pide
  ingresar de nuevo. Sin `issuer` (nombra el user pool) el botón "Ingresar" vuelve a la UI alojada.

```json
{
  "commerceEnabled": true,
  "apiBaseUrl": "<api_url>",
  "auth": "cognito",
  "cognito": {
    "loginUrl": "<login_url>",
    "clientId": "<client_id>",
    "redirectUri": "https://<origen>/",
    "logoutUri": "https://<origen>",
    "issuer": "<cognito_issuer>",
    "google": false
  }
}
```

Todos son valores públicos (outputs de Terraform); nunca va un secreto. `redirectUri`/`logoutUri` son opcionales (por
defecto, el origen con `/` y el origen sin `/`) y deben estar registrados **tal cual** en `callback_urls`/`logout_urls` del
cliente Cognito: con otro carácter, la salida de la hosted UI termina en su página de error (T61c). Con `issuer`
(`https://cognito-idp.<región>.amazonaws.com/<pool>`) el `iss` del `id_token` tiene que coincidir; además se exige `aud`
(string o lista con el `clientId`) y `exp` vigente, con 5 min de tolerancia de reloj.

El archivo se valida al arrancar (`commerce/runtime-config.ts`): `commerceEnabled` tiene que ser `true` (no basta un valor
"verdadero"), `auth: "cookie"` sólo con un API local, y con `cognito` el API, `loginUrl`, `issuer` y las URIs tienen que
ser https (o locales). Si algo no cierra, el comercio queda apagado y la consola dice por qué. `testMode: true` muestra el
rótulo "Tienda de prueba · Sin cobros"; no va en una tienda que cobra de verdad. `whatsappAlerts: true` ofrece en
Configuración "Avisarme también por WhatsApp cuando hay una venta": apagado por defecto mientras el API no mande WhatsApp
(el API no expone si lo hace); sin él el panel dice "Los avisos de venta llegan por mail" y conserva el valor guardado
(T66).

## Seguridad del panel (T27/T28)

- **Segundo factor**: la tienda no tiene (decisión del dueño, 2026-10-26, T59): por defecto el API no lo exige y el panel
  muestra todo directo. Sólo si el backend se despliega con `admin_mfa_required = true`, el API responde 403
  `MFA_REQUIRED` en `/admin/*` a un administrador sin TOTP; ante esa respuesta (y sólo entonces) el panel no muestra
  ninguna sección y guía el alta contra el API de Cognito con el access token (scope `aws.cognito.signin.user.admin`,
  pedido siempre en el login para que el flag se pueda prender sin otro deploy del front): QR (dibujado en
  `commerce/qr.ts`, sin librerías), botón para abrir la app autenticadora en el mismo teléfono, clave en texto y el primer
  código de 6 dígitos (`commerce/mfa.ts`). Desde el siguiente ingreso Cognito pide el código. En Docker no hay segundo
  factor salvo que el API corra con `LOCAL_ADMIN_MFA=enrolled` (el login local lo reemplaza) o `LOCAL_ADMIN_MFA=missing`
  (muestra la explicación en lugar del alta).
- **Secciones plegables** en Configuración (T66): las cuatro se pliegan con "Ver"/"Ocultar"; se abre sola sólo la primera
  con datos incompletos (sin datos bancarios, sin WhatsApp o mail, sin forma de recibir la compra) y cada una plegada
  muestra en una línea lo que tiene guardado (`sectionStatus` en `commerce/settings-form.ts`). Lo que el admin abre o
  cierra se recuerda en la pestaña (sessionStorage).
- **Historial de cambios** en Configuración (`GET /admin/settings/history`): fecha, quién y antes/ahora; del número de
  cuenta sólo los últimos 4 dígitos (`commerce/settings-history.ts`).
- **Aviso** arriba del panel si los datos bancarios cambiaron en los últimos 7 días, con fecha y usuario.

## Una sola página con scroll

Es **single page con anclas** (`#inicio`, `#catalogo`, `#sobre-nosotros`, `#contacto`), no rutas. El tráfico llega
mayormente desde el link de Instagram, y en ese contexto el recorrido natural es un scroll continuo hasta el CTA de
WhatsApp. Además evita cargar el Router y elimina el riesgo de 404 en el hosting estático.

El catálogo tampoco usa el Router: los 3 niveles (categorías → tipos → detalle) se manejan con **signals dentro de
`CatalogComponent`**. Rutas de Angular obligarían a partir la landing en páginas separadas o a montar el Router sólo para
recordar qué tarjeta está abierta.

Lo que sí hay son **URLs propias por categoría y producto**, reflejadas con la History API: `/catalogo/<categoría>/` y
`/catalogo/<categoría>/<producto>/` (ver [`catalog-seo.ts`](../src/app/core/catalog-seo.ts)). Entrar directo a una abre esa
categoría o ficha, y el botón atrás del navegador vuelve al nivel anterior. Son las páginas que se prerenderizan.

`/envios/` (política de envíos, T68) funciona igual: `CommerceService.shippingPage` la muestra en lugar de las secciones
de inicio, los enlaces del pie, la ficha y el checkout la abren con `pushState` y atrás vuelve a donde estaba (desde el
checkout, al carrito tal cual). El texto sale de [`shipping-policy.ts`](../src/app/core/shipping-policy.ts): las zonas de
`GET /shipping-options` cuando la tienda está conectada y, sin API o sin política guardada, la de Piuma.

## SEO y prerender

No hay SSR: el hosting es estático (S3 + CloudFront en AWS; Vercel para la landing pública de `main`). `npm run build` corre
`ng build` y después [`scripts/prerender.ts`](../scripts/prerender.ts), que a partir de `catalog.json` escribe en
`dist/piuma-landing/browser/`:

- `index.html` y `catalogo/<categoría>/[<producto>/]index.html`: el mismo index del build con title, description,
  canonical y Open Graph de cada página, datos estructurados JSON-LD (`Store`, `Product` con `AggregateOffer`,
  `ItemList`, `BreadcrumbList`) y el contenido como HTML semántico dentro de `<app-root>` para crawlers sin JavaScript. Ese
  HTML se oculta con CSS (sólo se ve en `<noscript>`) y Angular lo reemplaza al arrancar; no se agregan scripts inline
  (CSP `script-src 'self'`).
- `envios/index.html`: la política de Piuma (`FALLBACK_POLICY`, sin API en el build) con `Store` y `BreadcrumbList`.
- `robots.txt` y `sitemap.xml` (con imágenes).

El dominio sale de `SITE_URL` al compilar (por defecto `https://piuma.uy`): `SITE_URL=https://piuma-landing.vercel.app npm
run build`. `<base href="/">` en `index.html` es necesario para que los assets relativos funcionen en las subrutas.
Cuenta, carrito, pedidos y admin son vistas en la misma URL y llevan `<meta name="robots" content="noindex">` mientras
están abiertas.

El hosting tiene que servir `catalogo/.../index.html` en esas rutas: en AWS lo hace la CloudFront Function
`piuma-backend/infra/functions/spa-routing.js`; Vercel lo hace solo. Un producto que existe sólo en el API (no en
`catalog.json`) no tiene página: se abre en la landing sin cambiar la URL.

## Uso y errores (PostHog, T97)

Apagado por defecto. Con la clave `posthog` en `runtime-config.json` (en AWS, vía `FRONTEND_RUNTIME_CONFIG`) la tienda manda
uso y errores a [PostHog Cloud](https://posthog.com) región EU, sin cargar su SDK:

```json
"posthog": { "host": "https://eu.i.posthog.com", "key": "phc_…" }
```

`key` es la Project API key **pública** del proyecto (`phc_…`, no es un secreto); una clave personal `phx_…` se rechaza.
`AnalyticsService` encola los eventos y los manda con `fetch` (keepalive) a `<host>/batch/`: páginas vistas, el embudo
(`product_viewed`, `add_to_cart`, `checkout_started`, `payment_method_selected`, `order_created`, `mercadopago_opened`,
`payment_return`, `payment_approved`), `category_viewed`, `whatsapp_clicked` y los errores no atrapados como `$exception`
(`ReportingErrorHandler`, con `provideBrowserGlobalErrorListeners`; mensaje y stack recortados, sin mails ni números largos,
hasta 10 distintos por visita). Sin cookies: `distinct_id` es un UUIDv7 al azar de la pestaña (`sessionStorage`), eventos
anónimos, sólo la ruta de la URL y el origen del referrer. Respeta Do Not Track y Global Privacy Control. Al activarlo,
sumar `https://eu.i.posthog.com` a `frontend_connect_src` de `piuma-backend/infra` (CSP `connect-src`). Qué ver dónde,
alta de la cuenta y privacidad: [`piuma-backend/docs/monitoreo.md`](https://github.com/piuma-uy/piuma-backend/blob/main/docs/monitoreo.md).

## Estructura

```
src/
├─ index.html                      meta tags SEO + Open Graph + Google Fonts
├─ main.ts                         bootstrap de la app y HttpClient
├─ styles.scss                     reset, tipografía base y utilidades (.btn, .container)
├─ styles/                         _tokens (colores, tipografías, espaciados), _variables, _mixins
├─ assets/data/catalog.json        CATÁLOGO jerárquico (5 categorías, 13 tipos, 51 variantes)
├─ assets/images/                  fotos .webp: productos/, logo/, hero y sobre nosotros
└─ app/
   ├─ app.component.ts             arma la página completa
   ├─ commerce/                    tienda: API, Cognito (SRP/PKCE), carrito, checkout, pagos, envíos, panel
   ├─ core/                        site-config (WhatsApp, redes), catalog-seo, catalog-adapter, whatsapp, swatches
   ├─ models/catalog.model.ts      Category → ProductType → Variant
   ├─ services/                    catálogo, uso y errores (PostHog) y links wa.me
   ├─ shared/                      íconos y botón flotante de WhatsApp
   └─ components/                  header, hero, catalog (+ product-detail), about, contact, footer, shipping-policy
scripts/prerender.ts               páginas del catálogo y /envios/, robots.txt y sitemap.xml
tests/                             unitarios node --test (sin Angular)
```

`brand-assets/` guarda el material original bajado de Drive, **fuera de git** (~2 GB, casi todo video). Las fotos del
sitio salen del catálogo PDF, convertidas a `.webp` en `src/assets/images/`.

## Qué reemplazar / dónde tocar

- **WhatsApp:** un solo lugar, `whatsappNumber` en [`site-config.ts`](../src/app/core/site-config.ts) (sólo dígitos,
  formato internacional). Si el API tiene `settings.contact.whatsappNumber`, lo reemplaza. La versión legible y los
  mensajes predefinidos salen de [`core/whatsapp.ts`](../src/app/core/whatsapp.ts).
- **Imágenes:** hero en `heroImage` de [`hero.component.ts`](../src/app/components/hero/hero.component.ts), sobre nosotros
  en `image` de [`about.component.ts`](../src/app/components/about/about.component.ts), productos en el campo `image` de
  `catalog.json`, logos en `header.component.html`/`footer.component.html` y Open Graph en `og:image` de
  [`index.html`](../src/index.html). Rutas sin barra inicial (`assets/images/...`); al reemplazar una foto, actualizar su
  `alt` y, como `/assets/` se cachea un año en CloudFront, cambiarle el nombre.
- **Colores y tipografías:** el `:root` de [`_tokens.scss`](../src/styles/_tokens.scss) (`--color-primary`,
  `--color-secondary`, `--color-accent`, `--color-text`, `--font-heading`, `--font-body`) y el `<link>` de Google Fonts en
  `index.html`.
- **Formulario de contacto:** no envía nada a un servidor; `onSubmit()` de
  [`contact.component.ts`](../src/app/components/contact/contact.component.ts) arma un link de WhatsApp con el mensaje.

### Catálogo (`src/assets/data/catalog.json`)

Forma tipada en [`catalog.model.ts`](../src/app/models/catalog.model.ts). **Jerarquía: Categoría → Tipo → Variantes.**
"Tipo" y "producto" son la misma entidad porque en Piuma cada tipo ("Satén") es exactamente un producto ("Sábanas 300
hilos satén").

**El precio vive en la variante y depende sólo de la medida.** Lo que cambia por medida es **qué colores existen** (King y
Super King no vienen en azul), por eso `colors` va dentro de cada variante.

```json
{
  "id": "sabanas",
  "name": "Sábanas",
  "types": [
    {
      "id": "sabanas-saten",
      "name": "Satén",
      "fullName": "Sábanas 300 hilos satén",
      "material": "100% algodón, 300 hilos satén",
      "currency": "UYU",
      "variants": [
        {
          "size": "Twin",
          "bedSize": "90x190 cm",
          "productSize": "160x240 cm",
          "colors": ["Beige", "Gris", "Azul"],
          "price": 3000
        }
      ]
    }
  ]
}
```

- `name` es el nombre corto del nivel 2; `fullName` es el que va al mensaje de WhatsApp.
- `bedSize` es opcional; `material: null` significa que el dato falta y la UI oculta la línea.
- `_todo` marca datos incompletos o contradicciones entre el catálogo y la lista de precios.
- El **"Desde $X"** es el mínimo de `variants[].price`, calculado en el componente.
- Los **colores de los swatches** viven en [`color-swatches.ts`](../src/app/core/color-swatches.ts), no en el JSON, porque
  son aproximaciones visuales.

Con el comercio encendido, precio y stock vienen del API (`catalog-adapter.ts` combina el JSON con los productos del
backend); el JSON sigue aportando textos, fotos y las páginas prerenderizadas. En el backend, `data/catalog.snapshot.json`
es la copia de este catálogo que usa el importador de SKUs.
