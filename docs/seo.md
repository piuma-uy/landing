# SEO y GEO de la tienda

Cómo se ve Piuma para buscadores y motores de IA (T88): qué genera el build, las decisiones sobre datos estructurados y qué
hacer al cambiar de dominio. La mecánica del prerender está en [`frontend.md`](frontend.md#seo-y-prerender).

## Qué genera `npm run build`

| URL                             | Title (≤ 60)                                      | Datos estructurados                                            | Imagen para compartir (1200×630)   |
| ------------------------------- | ------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------- |
| `/`                             | `Piuma \| Ropa de cama en Uruguay: sábanas y …`   | `OnlineStore`, `WebSite`, `WebPage` con la lista de categorías | `og/inicio.jpg` (la foto del hero) |
| `/envios/`                      | `Envío gratis en zonas de Montevideo y Canelones` | `FAQPage` con las preguntas de envío, `BreadcrumbList`         | `og/envios.jpg`                    |
| `/catalogo/<categoría>/`        | Uno por categoría (`CATEGORY_COPY`)               | `CollectionPage` con sus productos, `BreadcrumbList`           | `og/categoria-<id>.jpg`            |
| `/catalogo/<cat>/<producto>/`   | `<nombre completo> \| Piuma`                      | `ItemPage`, `ProductGroup` con variantes, `BreadcrumbList`     | `og/<producto>.jpg`                |
| `404.html` (cualquier otra URL) | `Página no encontrada \| Piuma`                   | ninguno; `noindex`                                             | —                                  |

Todas las páginas indexables llevan canonical, `hreflang="es-UY"` y `x-default`, Open Graph (`og:type` `product` en las
fichas) y Twitter `summary_large_image`. Las descriptions (≤ 155) se arman con frases enteras del catálogo, nunca cortadas:
[`catalog-seo.ts`](../src/app/core/catalog-seo.ts) (la app las usa también al navegar sin recargar) y
[`scripts/seo.ts`](../scripts/seo.ts). `tests/seo.test.ts` controla largos, que no se repitan, que cada imagen exista y
mida 1200×630, y que los `alt` no nombren materiales que el producto no tiene.

Además: `robots.txt` (bloquea `/cuenta`, `/checkout`, `/panel`, `/pago` y `/auth`; las vistas privadas viven en `/` y
llevan `noindex` mientras están abiertas), `sitemap.xml` (sólo URLs indexables, con fotos) y `llms.txt`.

## Variables del build

| Variable        | Default                    | Qué cambia                                                                                                     |
| --------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `SITE_URL`      | `https://piuma.uy`         | Canonical, `hreflang`, `og:url`, URLs absolutas de imágenes y JSON-LD, `sitemap.xml`, `robots.txt`, `llms.txt` |
| `SITE_LASTMOD`  | fecha del commit compilado | `<lastmod>` del sitemap (`AAAA-MM-DD`). Compilar dos veces el mismo commit da el mismo sitemap                 |
| `SITE_COMMERCE` | apagado                    | `1`: "cómo comprar" y "cómo pagar" dicen que se compra online (transferencia o Mercado Pago)                   |
| `SEO_OFFERS`    | apagado                    | `1`: precio por variante (`Offer` en UYU, con `availability` si hay stock) en el JSON-LD y en el texto         |
| `SITE_ENV`      | `prod`                     | `dev`: publica las páginas legales aunque sean borrador (`LEGAL_DRAFT`); ver abajo                             |

`SITE_COMMERCE` existe porque `commerceEnabled` está en `runtime-config.json`, que el deploy escribe **después** del build:
el HTML prerenderizado no lo puede leer. En AWS lo pasa el input `storefront_commerce` del workflow `Deploy` de
`piuma-backend` (apagado por defecto); se prende junto con `commerceEnabled` (paso 10 del checklist de apertura).

Con `LEGAL_DRAFT = true` ([`legal-pages.ts`](../src/app/core/legal-pages.ts)) y `SITE_ENV=prod`, `/privacidad/`,
`/terminos/` y `/cambios-y-devoluciones/` no se prerenderizan (caen en la 404), no están en el pie ni en el checkout y
no van a `sitemap.xml` ni a `llms.txt` (T99). `npm run build` le pasa el mismo valor al bundle (`ng build --define
PIUMA_SITE_ENV`); `ng serve` y los tests quedan en `dev`. El workflow `Deploy` compila con `SITE_ENV` igual al entorno
y borra del bucket las páginas prerenderizadas que el build ya no trae.

## Datos estructurados

Validados con el validador de Adobe (`@adobe/structured-data-validator`, reglas de schema.org y de los resultados
enriquecidos de Google), local:

```bash
mkdir -p /tmp/sdv && cd /tmp/sdv && npm init -y && npm i @adobe/structured-data-validator @marbec/web-auto-extractor
curl -sLO https://schema.org/version/latest/schemaorg-all-https.jsonld
# validate.mjs: extrae el JSON-LD de cada .html de dist con WebAutoExtractor y lo pasa por el Validator (ver el PR de T88)
node validate.mjs <landing>/dist/piuma-landing/browser
```

- **`OnlineStore`, no `LocalBusiness` ni `Store`.** Piuma vende online y no atiende en un local: sin dirección (la de
  Valdivia es fiscal y no se publica) ni horarios. `areaServed` es Uruguay más los departamentos con envío gratis
  (Montevideo y Canelones, de `FALLBACK_POLICY`). Contacto por WhatsApp (`ContactPoint` con el enlace `wa.me`); `sameAs`
  con Instagram y Linktree.
- **`ProductGroup` con una variante por medida y color** (`variesBy` `size` y, si hay más de uno, `color`), marca Piuma,
  material y fotos. Cada variante lleva sólo la foto de **su** color (`colorImages`): Petra azul, que todavía no tiene
  foto, va sin imagen antes que con la del blanco.
- **Sin precio ni disponibilidad** mientras `catalog.json` sea de demo: Google compara el precio con la página y los
  motores de IA lo repetirían. El validador marca `offers` como requerido para los resultados de comerciante: es lo
  esperado hasta B5. Con el catálogo real cargado (precios de `catalog.json` iguales a los del API), compilar con
  `SEO_OFFERS=1`.
- **`FAQPage` en `/envios/`**: las mismas secciones de la página, como pregunta y respuesta. Google ya no muestra FAQ
  enriquecidas a tiendas, pero es el formato que mejor citan los motores de IA.

## GEO (motores de IA y búsqueda local)

- El HTML prerenderizado del inicio responde en texto llano qué vende Piuma, dónde envía gratis, cómo comprar, cómo pagar
  y cómo contactarla; `/envios/` responde las preguntas de envío. Los crawlers de IA no ejecutan JavaScript y leen ese
  HTML; Google, que sí lo ejecuta, ve la app con el mismo contenido.
- [`/llms.txt`](https://llmstxt.org): la marca, el catálogo por categoría con enlaces, medidas y colores, los envíos y el
  contacto. Sin precios de demo, API, panel ni dirección fiscal.
- NAP igual en todos lados: **Piuma**, WhatsApp **+598 91 345 454**, Instagram **@piuma_uy** (un solo lugar:
  [`site-config.ts`](../src/app/core/site-config.ts)).
- `robots.txt` no bloquea a ningún crawler de IA.

## Rendimiento (Core Web Vitals)

- **LCP**: el inicio precarga la foto del hero (`<link rel="preload" imagesrcset>`) y `runtime-config.json` se pide desde
  el HTML en paralelo con los scripts (antes esperaba a `main.js`). En una entrada directa a una categoría o ficha, el
  scroll al catálogo espera al primer LCP: antes Chrome no llegaba a medirlo (Lighthouse `NO_LCP`).
- **CLS 0**: fuentes de reemplazo con las medidas de Playfair Display e Inter (`size-adjust` y `*-override` en
  `styles.scss`) mientras cargan las de Google; fotos con `width`/`height` y `srcset`.
- Presupuesto de 500 kB del bundle inicial sin tocar; la 404 se carga con `@defer`.

## Imágenes para compartir

`src/assets/images/og/*.jpg`, JPEG de 1200×630 (WhatsApp e Instagram no siempre muestran WebP en la vista previa). Al
sumar o cambiar un producto, una categoría o su foto, regenerarlas con las fuentes de Google Fonts y Pillow:

```bash
curl -sLo /tmp/PlayfairDisplay.ttf "https://github.com/google/fonts/raw/main/ofl/playfairdisplay/PlayfairDisplay%5Bwght%5D.ttf"
curl -sLo /tmp/Inter.ttf "https://github.com/google/fonts/raw/main/ofl/inter/Inter%5Bopsz,wght%5D.ttf"
python3 scripts/og-images.py /tmp/PlayfairDisplay.ttf /tmp/Inter.ttf
```

Como `/assets/` se cachea un año en CloudFront, una imagen que cambia de contenido con el mismo nombre tarda en verse:
invalidar `/assets/images/og/*` o cambiarle el nombre (y el de `shareImage` en `scripts/seo.ts`). Las imágenes dicen
"piuma.uy": con otro dominio, cambiar ese texto en el script.

## Con el dominio real (o si cambia)

`piuma.uy` ya es el dominio de prod y el default de `SITE_URL`. Lo que queda por hacer, y lo que cambia si algún día es
otro:

1. **Build**: `SITE_URL=https://<dominio>` (canonical, sitemap, `og:url`, JSON-LD, `llms.txt`). En `piuma-backend`,
   `frontend_domain_names` con el dominio primero (el resto redirige con 301) y `callback_urls`/`logout_urls` de Cognito.
2. **Google Search Console**: propiedad de **dominio** (`piuma.uy`, cubre `www` y subdominios), verificada con el registro
   TXT `google-site-verification=…` que da la consola, en la zona de Route 53 de prod. Después: enviar
   `https://piuma.uy/sitemap.xml`, revisar _Páginas_ (las URLs del sitemap indexadas, `/cuenta` y la 404 excluidas),
   _Mejoras_ (`Producto`, rutas de navegación) y pedir la indexación del inicio. Con `SEO_OFFERS=1`, revisar _Fichas de
   comerciante_.
3. **Bing Webmaster Tools** (también alimenta a Copilot y a otros motores): importar la propiedad desde Search Console.
4. **Prueba de resultados enriquecidos** (`search.google.com/test/rich-results`) y el depurador de Facebook/WhatsApp
   (`developers.facebook.com/tools/debug`) sobre el inicio, una categoría, una ficha y `/envios/`.
5. **Perfil de Instagram y Linktree** con el enlace a `https://piuma.uy` (NAP coherente).
6. dev (`*.cloudfront.net`) responde `X-Robots-Tag: noindex, nofollow` en todo: no compite con prod.
