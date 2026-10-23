# T51b · Auditoría de seguridad del front (landing / tienda)

- **Alcance:** rama `tienda-local` @ `00676f3` (Angular 19 standalone, `src/`, `scripts/`, `public/`, `vercel.json`,
  `netlify.toml`) y su compatibilidad con la CSP de `piuma-backend/infra/frontend.tf` @ `origin/main` `89234f6`.
- **Tipo:** sólo lectura. No se modificó código de producto ni infra; los arreglos van en **T52**.
- **Método:** lectura completa de `src/app/commerce/*`, servicios, plantillas y prerender; `grep` de sumideros
  (innerHTML, bypassSecurityTrust*, `[href]`, `target=_blank`, storage, `location.*`, `console.*`); `npm run build` y
  revisión del `dist/` (scripts/handlers inline, hash CSP, sourcemaps); `npm audit` (total y `--omit=dev`) y
  revisión de cada advisory de producción contra el uso real del código.
- **Sin cuenta AWS (B8):** nada de `plan`/`apply`. Lo que depende del entorno desplegado se marca
  **verificar tras T41**.
- Datos estructurados: [`findings-claude-front.json`](./findings-claude-front.json).

## Resumen

| Severidad | Cantidad | IDs |
| --- | --- | --- |
| Crítica | 0 | — |
| Alta | 0 | — |
| Media | 3 | FE-01, FE-02, FE-03 |
| Baja | 6 | FE-04 … FE-09 |
| Informativa | 6 | FE-10 … FE-15 |

No hay hallazgos críticos ni altos. El flujo Cognito code + PKCE S256 está bien armado (state, nonce y verifier
aleatorios, state validado antes que nada, tokens sólo en memoria, URL limpiada), no hay sumideros de XSS, y el
navegador no decide precio, total, estado pagado ni rol. Lo más relevante:

1. **FE-01 (Media):** la `Idempotency-Key` del checkout sobrevive al pedido exitoso; repetir la misma compra en la misma
   pestaña reenvía la clave vieja y puede mostrar el pedido anterior (quizá ya pagado) como si fuera el nuevo.
2. **FE-02 (Media):** el runtime de producción es Angular 19.2.25, fuera de soporte, con 5 paquetes afectados
   (3 high). Ninguno es explotable con el código actual (análisis abajo), pero ya no habrá parches 19.x.
3. **FE-03 (Media):** `vercel.json`/`netlify.toml` no envían ninguna cabecera de seguridad (CSP, `frame-ancestors`,
   HSTS…). Si la tienda se sirve ahí con comercio encendido, el panel admin queda expuesto a clickjacking.

## Hallazgos

### FE-01 · Media · La Idempotency-Key del checkout no se descarta tras crear el pedido

- **Evidencia:** `src/app/commerce/commerce.service.ts:563-574` genera/reusa la clave por *fingerprint*
  (`[user.id, payload]`) y la guarda en `sessionStorage["piuma-checkout"]`; tras el éxito
  (`commerce.service.ts:589-603`) se vacía el carrito con `request("/cart","PUT")` directo, no con `saveCart()`
  (`:467-474`, el único sitio que hace `removeItem("piuma-checkout")`), y `logout()` (`:447-466`) tampoco la borra.
- **Escenario:** el comprador paga un pedido y en la misma pestaña vuelve a comprar exactamente lo mismo (mismo
  ítem, método de pago, entrega y teléfono). El fingerprint coincide, se reenvía la clave vieja y el API responde la
  repetición idempotente del **pedido anterior**. La UI muestra ese pedido como "completado" (o directamente
  `paid`) y el comprador cree haber hecho una segunda compra que no existe. La ventana depende del TTL de
  idempotencia del API (**verificar en piuma-backend**).
- **Recomendación:** `sessionStorage.removeItem("piuma-checkout")` en cuanto `POST /orders` responde 2xx (antes de
  ir a Mercado Pago) y también en `logout()`. Mantener la clave sólo mientras el resultado es desconocido (timeout,
  red, 5xx), como pide `frontend-integration.md` §5.

### FE-02 · Media · Runtime Angular 19.2.25 fuera de soporte con advisories sin parche en 19.x

- **Evidencia:** `package.json:12-18` (`^19.0.0`, resuelto a 19.2.25). `npm audit --omit=dev`: 5 paquetes
  (`@angular/common`, `compiler`, `core` high; `forms`, `platform-browser` moderate por dependencia). `fixAvailable`
  sólo en 21.x (major). Angular 19 dejó de recibir parches LTS en mayo de 2026.
- **Explotabilidad hoy (ninguna):**

  | Advisory | Requiere | En este código |
  | --- | --- | --- |
  | GHSA-48r7-hpm6-gfxm `formatDate` OOM | *format* controlado por el atacante | `DatePipe` sólo con formatos literales (`commerce.component.html:159,637,715,1000,1003,1332`) |
  | GHSA-39pv / GHSA-jhpw / GHSA-p297 `HttpTransferCache` | SSR + hydration | SPA sin SSR ni `provideClientHydration` (`src/main.ts`) |
  | GHSA-jfgx-762w-99vr fuga de token XSRF | `HttpClient` + cookie XSRF a URLs absolutas | `HttpClient` sólo lee `assets/data/catalog.json` relativo; el API se llama con `fetch` |
  | GHSA-58w9-8g37-x9v5 two-way binding sin sanitizar | `[(innerHTML)]`, `[(href)]`, `[(src)]`… | sólo `[(ngModel)]` en inputs |
  | GHSA-jj27-h5hq-8x99 i18n XSS | `i18n-*` / `$localize` | no se usa i18n |
  | GHSA-hh8m-fm6v-7cvg host bindings | `host`/`@HostBinding` en sumideros | no hay host bindings |
  | GHSA-rgjc-h3x7-9mwg hydration DOM clobbering | hydration | no hay hydration |

- **Recomendación:** planificar la subida a Angular 20/21 (tarea propia, no T52 si excede el alcance). Mientras
  tanto, regla de revisión: no introducir SSR/hydration, i18n, two-way bindings a propiedades sensibles, host
  bindings sobre `href`/`src`, ni formatos de fecha que vengan de datos.

### FE-03 · Media · Hosting Vercel/Netlify sin cabeceras de seguridad

- **Evidencia:** `vercel.json:1-6` y `netlify.toml:1-8` sólo definen build y rewrite SPA. Ninguna CSP,
  `frame-ancestors`/`X-Frame-Options`, HSTS, `X-Content-Type-Options`, `Referrer-Policy` ni `Permissions-Policy`.
  Las cabeceras completas existen sólo en CloudFront (`piuma-backend/infra/frontend.tf:128-171`).
- **Escenario:** un preview o el sitio de Vercel con `commerceEnabled: true` permite enmarcar la tienda y el panel
  admin (confirmar transferencias, cancelar pedidos) en un sitio ajeno → clickjacking; sin CSP, cualquier XSS
  futuro no tiene contención. Hoy el sitio publicado en Vercel tiene comercio apagado, por eso no es alta.
- **Recomendación:** si la tienda sólo se publica en AWS, dejarlo explícito y nunca encender comercio en
  Vercel/Netlify. Si no, replicar en `vercel.json` `headers` la misma política de `frontend.tf`.
  **Verificar tras T41** que CloudFront devuelva las cabeceras en `/`, `/pago` y `/catalogo/*`.

### FE-04 · Baja · `checkoutUrl` acepta cualquier origen https (y `http://localhost` en producción)

- **Evidencia:** `src/app/commerce/card.ts:56-66`; se usa en `commerce.service.ts:345-348` con `location.assign`.
- **Escenario:** el front sigue cualquier `redirectUrl` https que devuelva el API. Sólo es explotable si el API está
  mal configurado o comprometido (el `init_point` lo genera Mercado Pago del lado servidor), pero la validación de
  origen que pide el brief no existe: sólo se valida el esquema.
- **Recomendación:** lista blanca de hosts (`www.mercadopago.com.uy`, `sandbox.mercadopago.com.uy` y los que use la
  cuenta) y permitir `http://localhost|127.0.0.1` sólo cuando `apiBaseUrl` también es local.

### FE-05 · Baja · El id_token no se valida en `iss` ni `exp`; `aud` sólo como string

- **Evidencia:** `src/app/commerce/cognito.ts:245-252`.
- **Contexto:** el token llega directo del endpoint `/oauth2/token` por TLS (OIDC Core §3.1.3.7 permite omitir la
  firma en ese caso), y sólo alimenta la UI (nombre, email, menú admin); el API autoriza con el access token.
  Se validan `aud` y `nonce`. Falta `iss` (`https://cognito-idp.<region>.amazonaws.com/<poolId>`) y `exp`, y un
  `aud` en forma de array (válido en OIDC) haría fallar el ingreso. `frontend-integration.md` recomienda además una
  biblioteca OIDC mantenida; la implementación propia es correcta pero debe sostenerse con tests.
- **Recomendación:** validar `iss` (sumar `issuer` a `runtime-config`), `exp`/`iat` con tolerancia, y aceptar `aud`
  string o array que contenga el `clientId`.

### FE-06 · Baja · Datos personales en claro en `sessionStorage` y sin limpieza al cerrar sesión

- **Evidencia:** `commerce.service.ts:563-569` guarda como fingerprint el JSON con nombre, email, teléfono y
  dirección; `logout()` (`:447-466`) no borra `piuma-checkout`, `piuma-payment-return` (`:303`) ni
  `piuma-switch-<orderId>` (`card.ts:119-124`, nunca se borran).
- **Escenario:** en un equipo compartido, la pestaña conserva los datos de contacto del comprador anterior hasta
  cerrarla; cualquier XSS futuro los lee. No hay tokens en storage (correcto).
- **Recomendación:** guardar sólo un hash SHA-256 del fingerprint; en `logout()` borrar todas las claves `piuma-*`
  de `sessionStorage`; borrar `piuma-switch-<id>` al recibir la respuesta.

### FE-07 · Baja · CSP de `frontend.tf` incompatible con analytics y con un dominio propio del API

- **Evidencia:** `piuma-backend/infra/frontend.tf:16` (`connect-src 'self' <api_endpoint> <cognito_login>
  https://cognito-idp…`) frente a `src/app/services/analytics.service.ts:20,62` (fetch a `<hostUrl>/api/send`) y
  `src/app/commerce/commerce.service.ts:184-198` (fetch a `apiBaseUrl`).
- **Escenario:** al configurar `analytics` en `runtime-config.json` todos los eventos quedan bloqueados por la CSP en
  silencio (el `catch` los traga). Si `apiBaseUrl` pasa a un dominio propio en vez de `execute-api`, se rompe toda
  la tienda. No es un riesgo de seguridad sino de compatibilidad; la salida es `var.frontend_content_security_policy`.
- **Resto de la CSP, verificado contra el build:** el único handler inline es `onload="this.media='all'"` y su
  hash `sha256-MhtPZXr7+LpJUY5qtMutB+qWfQtMaPccfe7QXtCcEYc=` coincide con el de `frontend.tf:12`; no hay
  `<script>` inline ejecutable (el JSON-LD es `application/ld+json`, no se ejecuta); los `<style>` inline (fuentes y
  CSS crítico inlineados por Angular, `.prerender`) están cubiertos por `style-src 'unsafe-inline'`; las fuentes
  van a `fonts.gstatic.com` (`font-src`); `runtime-config.json`, `/oauth2/token` y `/oauth2/revoke` están en
  `connect-src`; Mercado Pago y Cognito son navegaciones (no las rige `connect-src`); no hay sourcemaps en `dist/`.
- **Recomendación:** documentar en `frontend.tf`/README que activar analytics o un dominio del API exige sumar el
  origen a `connect-src`; recalcular el hash en cada subida de Angular. **Verificar tras T41** con la consola del
  navegador sin violaciones CSP en `/`, `/catalogo/…`, login y `/pago`.

### FE-08 · Baja · Analytics: `referrer` completo y sólo Do Not Track

- **Evidencia:** `src/app/services/analytics.service.ts:55` (`referrer: document.referrer`) y `:19`
  (`navigator.doNotTrack !== "1"`).
- **Contexto:** correcto: sin cookies, `credentials: "omit"`, `url` = sólo `pathname`, eventos sin PII (`sku`, cantidad
  de ítems). Pero `document.referrer` mismo-origen conserva query/hash (p. ej. una carga completa desde una URL con
  parámetros), y la `Referrer-Policy` sólo recorta los cross-origin. No se respeta Global Privacy Control.
- **Recomendación:** enviar sólo el origen del referrer (o vacío si es mismo origen) y desactivar también con
  `navigator.globalPrivacyControl === true`.

### FE-09 · Baja · `runtime-config.json` sin validación: falla abierto ante tipos inesperados

- **Evidencia:** `src/main.ts:7-10` acepta el JSON tal cual; `commerce.service.ts:123` usa
  `this.config.commerceEnabled` por veracidad (`"false"` como string enciende el comercio); `:184` hace
  `apiBaseUrl.replace(…)` (si falta, la app entera no arranca); `:126-127` cae al modo cookie si falta
  `auth: "cognito"` y muestra un formulario de contraseña que postea al API.
- **Contexto:** lo publicado por defecto es seguro (`public/runtime-config.json:1` = `commerceEnabled:false`,
  `apiBaseUrl:""`) y si el fetch falla queda apagado (`main.ts:7`). El archivo sólo expone valores públicos
  (URL del API, `clientId`, `loginUrl`, `websiteId`); no hay secretos.
- **Recomendación:** validar al arrancar: `commerceEnabled === true` estricto, `apiBaseUrl` URL https (o localhost en
  dev), `auth` obligatorio cuando hay `cognito`, `loginUrl` https; ante cualquier error, comercio apagado.

### FE-10 · Info · Rótulo fijo "Tienda de prueba · Sin cobros"

- **Evidencia:** `src/app/commerce/commerce.component.html:2`. Se muestra siempre que el comercio está encendido,
  también con Mercado Pago real. Atarlo a una clave de `runtime-config` antes de cobrar de verdad.

### FE-11 · Info · Total estimado en el navegador antes del presupuesto del API

- **Evidencia:** `commerce.component.html:361` muestra `quote()?.totalMinor ?? subtotal()` y `cart.ts:75-82`
  (`estimateMinor`). Sólo se muestra; `POST /orders` no lleva precios (`commerce.service.ts:553-562`), el pedido exige
  `quote()` (`:549`) y el total del resumen sale de `POST /cart/quote` (`:519,539`). Sugerencia: rotularlo "estimado".

### FE-12 · Info · Precios estáticos del catálogo en el prerender/JSON-LD

- **Evidencia:** `scripts/seo.ts:43,147-151` toma `variants[].price` de `src/assets/data/catalog.json`. Con comercio
  encendido el API es la autoridad y los precios pueden divergir de los de Google (rich results). No es un riesgo de
  seguridad; omitir `offers` o generarlos desde el API al publicar.

### FE-13 · Info · Prerender: `site.url` sin escapar en `canonical`/`og:url`

- **Evidencia:** `scripts/seo.ts:255-256`, `scripts/prerender.ts:14` (`SITE_URL` del entorno de build). Es entrada
  de confianza, pero validarla con `new URL()` y exigir `https:` evita romper el HTML por un valor mal puesto. El
  resto sí se escapa (`escapeHtml`, `jsonForScript` escapa `<`), y sólo entra contenido del catálogo estático y
  datos públicos de contacto (`site-config.ts`): no hay datos privados en el prerender.

### FE-14 · Info · `order.id` sin `encodeURIComponent` en dos rutas

- **Evidencia:** `commerce.service.ts:608` y `:665`. El id viene del API (64 hex) y `card.ts`/`transfer.ts` sí
  codifican; homogeneizar.

### FE-15 · Info · Dependencias dev/build (46 de 51)

Ver la sección siguiente. No llegan al bundle; el riesgo es para la máquina de desarrollo/CI.

## Dependencias: `npm audit` (51 = 2 low, 14 moderate, 31 high, 4 critical; igual que T02)

Comando: `npm ci && npm audit --json` y `npm audit --omit=dev --json` (23-10-2026).

**Llegan al bundle de producción (5):** `@angular/core`, `@angular/common`, `@angular/compiler` (high),
`@angular/forms`, `@angular/platform-browser` (moderate por dependencia). Análisis de explotabilidad en **FE-02**:
ninguno explotable con el código actual. `rxjs`, `tslib`, `zone.js` sin advisories.

**Sólo dev/build (46), no explotables desde el sitio publicado:**

| Grupo | Paquetes | Dónde corre | Riesgo real |
| --- | --- | --- | --- |
| Dev server (`ng serve`) | `webpack-dev-server`, `webpack-dev-middleware`, `http-proxy-middleware`, `express`, `body-parser`, `qs`, `proxy-addr` (critical), `compression`, `sockjs`, `selfsigned`, `node-forge`, `launch-editor`, `shell-quote` (critical), `vite`, `ip-address`, `follow-redirects`, `uuid` | sólo en `npm start` | exposición de código fuente a sitios abiertos en otro tab (no hay secretos en el repo) y path traversal/command injection en Windows; mitigar con `ng serve` sólo en `localhost` |
| Build | `@angular-devkit/build-angular`, `@angular/build`, `@ngtools/webpack`, `@angular/compiler-cli`, `piscina` (critical: gadget de prototype pollution), `postcss`, `postcss-selector-parser`, `source-map-js`, `serialize-javascript`, `copy-webpack-plugin`, `globby`, `fast-glob`, `micromatch`, `braces`, `brace-expansion`, `chokidar`, `nanoid`, `js-yaml`, `fast-uri`, `esbuild`, `@babel/core` | `ng build` en dev/CI | requieren entrada maliciosa en el propio build (código o deps comprometidas); DoS de CPU como mucho |
| CLI / instalación | `@angular/cli`, `pacote`, `tar` (critical), `sigstore`, `@sigstore/*`, `http-cache-semantics` | `ng add`/`ng update` | extracción de un paquete malicioso; no se usa en build ni deploy |

**Recomendación:** resolverlo con la subida de Angular (FE-02), que arrastra el toolchain; mientras tanto `npm ci`
con lockfile en CI y no exponer `ng serve` en la red.

## Controles verificados (sin hallazgo)

**Cognito / PKCE (`src/app/commerce/cognito.ts`)**
- `state` y `nonce` de 32 bytes y `verifier` de 48 bytes con `crypto.getRandomValues` (`:53-55,119-123`); challenge
  S256 base64url (`:57-66,132-133`).
- El intento vive en `sessionStorage` (sólo pestaña) y se borra al volver, sea válido o no (`:150-154`); el `state`
  se compara antes de mirar `error` (`:155-159`) → sin login CSRF; un callback forjado sin intento propio falla.
- `redirect_uri` fijo desde configuración u `origin + "/"` (`:107`), idéntico en authorize y token; Cognito lo valida
  contra `callback_urls`. No hay `returnTo`/`next`: **sin open redirect** en el callback.
- Tokens sólo en campos privados en memoria (`:91-95`); nunca en storage, URL ni logs (el único `console.*` es
  `main.ts:21`, error de arranque). `Authorization: Bearer` con `credentials: "omit"` (`commerce.service.ts:200-204`).
- `code`/`state` se quitan del historial antes de cualquier otra cosa (`commerce.service.ts:274-275`); analytics
  manda sólo `pathname`; mensajes de error genéricos (no se refleja `error_description`).
- Refresh: una sola renovación concurrente, 60 s antes de vencer; si falla se limpia la sesión (`:170-198`). Un 401
  renueva una vez y repite con la misma `Idempotency-Key` (`commerce.service.ts:208-212`).
- Logout: limpia memoria, revoca el refresh token en `/oauth2/revoke` y navega al `/logout` de Cognito con
  `logout_uri` configurado (`:201-220`).

**Retorno de Mercado Pago (`/pago`)** — `card.ts:35-43` exige ruta `/pago[/aprobado|pendiente|rechazado]` y `order`
de 64 hex; se guarda sólo el id y se reemplaza la URL por `/` (`commerce.service.ts:300-305`); los parámetros de MP se
ignoran y el estado sale de `GET /orders/{id}` con polling (`card.ts:45-50,70-88`). Sin open redirect.

**XSS** — sin `innerHTML`, `bypassSecurityTrust*`, `DomSanitizer`, `document.write` ni `eval` en `src/`. Todo dato del
API se interpola (`{{ }}`) o se enlaza a propiedades que Angular sanea (`[src]="p.image"`). El enlace de WhatsApp del
API se acepta sólo si es `https://wa.me` (`transfer.ts:97-106`). Meta tags vía `Meta`/`Title` de Angular
(`catalog.component.ts:129-137`). JSON-LD con `<` escapado (`seo.ts:237`).

**Autoridad del API** — el carrito sólo envía `{sku, quantity}`; envío por `zoneId` (`shipping.ts:105-127`); pedido
sin precios ni roles; el método de pago se elige entre lo que ofrece `GET /payment-methods` (`checkout.ts:11-21`);
el estado "pagado" sólo sale de `GET /orders/{id}`; la UI admin es cosmética (`commerce.service.ts:404,413`,
`commerce.component.html:901`) y todas sus acciones pegan a `/admin/*`, que autoriza el API. La confirmación de
transferencia envía el importe del snapshot del pedido (`transfer.ts:153-163`); que el API lo valide contra el pedido
corresponde a la auditoría del backend (T51a).

**Idempotency-Key** — UUID por intento, persistida mientras el payload no cambie (`checkout.ts:32-44`), reutilizada
en reintentos y en el reintento tras 401; clave propia por pedido para pasar a transferencia (`card.ts:118-131`).
Ver FE-01 para su limpieza.

**Enlaces externos** — todos los `target="_blank"` llevan `rel="noopener noreferrer"`
(`commerce.component.html:206-207,721-722`, `social-links`, `contact`, `hero`, `product-detail`). Los `wa.me` del
front usan un número fijo de `site-config.ts` y el texto con `encodeURIComponent` (`whatsapp.service.ts:10-12`).

**Storage** — `localStorage` sólo guarda el carrito invitado (`sku`/`quantity`), validado al leer (`cart.ts:10-27`).

**Build** — sin sourcemaps en `dist/`; único handler inline cubierto por el hash de la CSP.

## Pendiente de verificar tras T41

- Cabeceras de CloudFront en todas las rutas (FE-03) y consola sin violaciones CSP (FE-07).
- `runtime-config.json` publicado en AWS: `auth: "cognito"`, `apiBaseUrl` https, `redirectUri`/`logoutUri` en las
  listas del cliente Cognito, comercio apagado hasta el go-live.
- Que Cognito tenga habilitada la revocación de tokens del cliente público (si no, `/oauth2/revoke` falla en
  silencio y el refresh token sigue vivo hasta vencer).
- TTL de idempotencia de `POST /orders` en el API (dimensiona FE-01).
