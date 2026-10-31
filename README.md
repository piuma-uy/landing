# Piuma · tienda (frontend)

Piuma es una tienda online de ropa de cama de Uruguay (sábanas, acolchados, fundas, cubrecamas) que vende en pesos
uruguayos. La mayoría de los compradores llega desde Instagram y compra desde el teléfono. Este repositorio tiene la
interfaz: una aplicación Angular estática que en AWS se sirve desde **S3 privado + CloudFront** y habla con la API
serverless de [`piuma-uy/piuma-backend`](https://github.com/piuma-uy/piuma-backend). Ese repositorio tiene también la
infraestructura (Terraform) y el pipeline que publica esta tienda.

- **Rama `tienda-local`** (esta): la tienda con cuenta, carrito, checkout y panel de administración. Es la que se despliega
  en AWS:
  - **prod**: <https://piuma.uy> (`www.piuma.uy` redirige). En línea con el catálogo; el comercio sigue apagado hasta
    completar el [checklist de apertura](https://github.com/piuma-uy/piuma-backend#checklist-para-abrir-al-público).
  - **dev**: <https://d1tm58a521hftd.cloudfront.net> (tienda de prueba con Mercado Pago sandbox, no cobra).
- **Rama `main`**: la landing original de Vercel, sin comercio. `piuma.uy` sirve `tienda-local` desde AWS.
- **Rama `marketing/proximamente-web`**: campaña de Instagram «Próximamente nueva web» (dos posts, reel y portada) en
  [`marketing/campanas/proximamente-web/`](https://github.com/piuma-uy/landing/tree/marketing/proximamente-web/marketing/campanas/proximamente-web).

> **Informe del proyecto** (diagrama interactivo, decisiones y defensa):
> [`piuma-backend/docs/informe/README.md`](https://github.com/piuma-uy/piuma-backend/blob/main/docs/informe/README.md).

## Índice

- [Qué hace](#qué-hace)
- [Cómo encaja en AWS](#cómo-encaja-en-aws)
- [Despliegue](#despliegue)
- [Pruebas](#pruebas)
- [Seguridad](#seguridad)
- [Costos](#costos)
- [Operación y mantenimiento](#operación-y-mantenimiento)
- [Correrlo local](#correrlo-local)
- [Documentación](#documentación)

## Qué hace

- Página única con scroll (inicio, catálogo, sobre nosotros, contacto) y fichas de producto con URL propia,
  prerenderizadas para SEO y motores de IA: metadatos, datos estructurados, `sitemap.xml`, `llms.txt` y una 404 real
  ([`docs/seo.md`](docs/seo.md)).
- Catálogo por categoría → producto → medida y color, con precio y stock del API.
- Cuenta (ingreso, registro, recuperación de contraseña), carrito, checkout con envío o retiro, y pago por transferencia o
  con tarjeta (Mercado Pago).
- "Mis pedidos" para el comprador; panel de administración con stock, métricas y ajustes de la tienda.
- WhatsApp como canal principal de contacto.

El front sólo muestra: precio, stock, roles y estado del pago los decide el backend.

## Cómo encaja en AWS

```
navegador ──HTTPS──▶ CloudFront ──OAC──▶ S3 privado (este build)
    │                   └─ CloudFront Function: rutas de la SPA y /catalogo/…/index.html
    ├──USER_SRP_AUTH / PKCE──▶ Cognito (user pool)
    └──Bearer access token───▶ API Gateway HTTP ──▶ Lambda ──▶ DynamoDB
```

| Pieza                         | Qué hace con el front                                                                                                                                                                                                                                                                                |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **S3 + CloudFront (OAC)**     | Sirven `dist/piuma-landing/browser`. El bucket es privado y sólo CloudFront lo lee. HTML y `runtime-config.json` van con `no-cache`; los bundles con hash, cacheados un año. CloudFront agrega HSTS y una CSP estricta (`script-src 'self'` más el hash del único script inline que genera Angular). |
| **Cognito**                   | Ingreso y registro con formularios propios: `USER_SRP_AUTH` implementado sin librerías (`src/app/commerce/srp.ts`), así la contraseña no sale del navegador. Google, si se habilita, por hosted UI con code + PKCE S256. Los tokens quedan en memoria.                                               |
| **API Gateway HTTP + Lambda** | Toda la lógica de la tienda. El front manda el access token como `Authorization: Bearer` y una `Idempotency-Key` por intento de compra.                                                                                                                                                              |
| **`runtime-config.json`**     | Configuración pública que se lee al arrancar: URL del API, user pool, cliente, `issuer`. En AWS la escribe el deploy con los outputs de Terraform; el archivo del repo deja el comercio apagado.                                                                                                     |

Arquitectura completa (DynamoDB, SQS, SES, EventBridge, SSM, CloudWatch, IAM, OIDC, Organizations):
[README de piuma-backend](https://github.com/piuma-uy/piuma-backend#arquitectura-en-aws).

## Despliegue

Este repo no tiene credenciales de AWS ni pipeline de deploy propio. Lo publica el workflow **`Deploy`** de
`piuma-backend`, que se lanza a mano desde `main` con el entorno (`dev` o `prod`, este último con `confirm=PRODUCCION`) y
el SHA completo de un commit de `tienda-local`:

1. El job `build-frontend` hace checkout de ese SHA y corre `npm ci --ignore-scripts` y `npm run build`. Corre **sin
   credenciales AWS** ni secretos.
2. `check-frontend-csp` verifica que cada `<script>` inline del build esté permitido por la CSP de CloudFront.
3. `apply` asume por OIDC el rol de deploy y aplica Terraform. Después sube los assets (inmutables) y el HTML a S3, escribe
   `runtime-config.json` e invalida CloudFront.

Detalle: [`piuma-backend/docs/deployment.md`](https://github.com/piuma-uy/piuma-backend/blob/main/docs/deployment.md#6-cicd-con-github-actions-oidc).
La landing de `main` sigue en Vercel (`vercel.json`).

## Pruebas

| Suite     | Comando                               | Qué cubre                                                                                                                                                            |
| --------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unitarias | `npm test`                            | Lógica sin Angular con `node --test`: catálogo, carrito, checkout e `Idempotency-Key`, SRP y PKCE contra vectores de AWS y un user pool simulado, envíos, pagos, SEO |
| Build     | `npm run build`                       | Compilación Angular y prerender del catálogo; lo corre CI (`Validate frontend`) en cada push                                                                         |
| E2E       | `npm run test:e2e` en `piuma-backend` | Playwright contra el stack Docker, en teléfono y desktop: login, checkout, transferencia, tarjeta, envíos, panel                                                     |

Resultados: [informe de tests](https://github.com/piuma-uy/piuma-backend/blob/main/docs/harness/test-report.md).

## Seguridad

- Sin secretos en el front: `runtime-config.json` sólo lleva valores públicos y se valida al arrancar. Si es incoherente,
  el comercio queda apagado.
- Tokens en memoria. Sólo el refresh token va a `sessionStorage` (se borra al cerrar la pestaña). El `id_token` se valida
  (`iss`, `aud`, `exp`).
- CSP sin `unsafe-inline` en scripts: cada script inline del build tiene que estar en la CSP por hash, y el pipeline lo
  verifica antes de publicar.
- El build de producción corre aislado de las credenciales AWS.
- Escaneo de secretos: el workflow `Secret scan` corre gitleaks (`.gitleaks.toml`, mismas reglas que piuma-backend:
  Mercado Pago, Google OAuth, AWS, Twilio y las de gitleaks) sobre todo el historial en cada PR y push a `main` o
  `tienda-local`, y falla si encuentra algo. La allowlist sólo admite fixtures de test falsos, valor por valor;
  `scripts/gitleaks-selftest.sh` prueba cada regla. Si falla, no pegar el hallazgo en el PR: rotar y avisar. Hook
  opcional antes de cada commit (`brew install gitleaks`):

  ```sh
  printf '#!/bin/sh\nexec gitleaks git --pre-commit --staged --config .gitleaks.toml --redact --no-banner\n' > "$(git rev-parse --git-path hooks)/pre-commit"
  chmod +x "$(git rev-parse --git-path hooks)/pre-commit"
  ```

Auditoría del front: [`docs/security/audit-claude-front.md`](docs/security/audit-claude-front.md). Lista única de hallazgos
abiertos de ambos repos:
[`piuma-backend/docs/security/open-findings.md`](https://github.com/piuma-uy/piuma-backend/blob/main/docs/security/open-findings.md).

## Costos

El hosting del front (CloudFront + S3) cuesta alrededor de **USD 1 al mes** en el escenario de poco tráfico. Toda la tienda
en AWS ronda **USD 3,28 al mes** calculado, con un presupuesto de USD 4–6:
[`piuma-backend/docs/costs.md`](https://github.com/piuma-uy/piuma-backend/blob/main/docs/costs.md).

## Operación y mantenimiento

Todo lo que hay que mantener (dominio `piuma.uy` en NIC Uruguay y su vencimiento, DNS, certificados, correo, cuentas AWS,
presupuestos, GitHub, secretos, monitoreo) y lo que falta para abrir al público está en un solo lugar, el
[README de piuma-backend](https://github.com/piuma-uy/piuma-backend#runbook-de-mantenimiento). Lo propio de este repo:

- La configuración del front en AWS es la variable `FRONTEND_RUNTIME_CONFIG` de cada environment de `piuma-backend`
  (`commerceEnabled`, `testMode`). En prod sigue sin definir, así que el comercio está apagado; `testMode` nunca en prod.
- Al subir Angular, actualizar el hash del script inline en la CSP (`piuma-backend/infra/frontend-script-hashes.json`).
- Variables del build para SEO (T88, detalle en [`docs/seo.md`](docs/seo.md)): `SITE_URL` (por defecto
  `https://piuma.uy`), `SITE_COMMERCE=1` cuando se encienda `commerceEnabled` (el texto de "cómo comprar" y "cómo pagar"
  del HTML prerenderizado y de `llms.txt`; en AWS es el input `storefront_commerce` del workflow `Deploy`, apagado por
  defecto) y `SEO_OFFERS=1` con el catálogo real cargado (precios en los datos estructurados, B5).
- `SITE_ENV` (`prod` por defecto, o `dev`; T99): mientras las páginas legales sean borrador (`LEGAL_DRAFT` en
  [`legal-pages.ts`](src/app/core/legal-pages.ts)), el build de prod no las publica ni las enlaza. El workflow `Deploy`
  pasa el entorno; `npm start` las muestra. Al aprobarlas, `LEGAL_DRAFT = false` y salen en prod sin más cambios.
- Cambios de catálogo, textos y fotos: [`docs/frontend.md`](docs/frontend.md).

## Correrlo local

Sólo la interfaz, con el comercio apagado:

```bash
npm ci
npm start        # http://localhost:4200
npm run build    # dist/piuma-landing/browser
npm test
```

Tienda completa con API y base de datos (Docker), con `piuma-backend` clonado como carpeta hermana:

```bash
cd ../piuma-backend
docker compose -f compose.dev.yaml up -d --build   # http://localhost:4200
```

Más detalle en
[`piuma-backend/docs/desarrollo-local.md`](https://github.com/piuma-uy/piuma-backend/blob/main/docs/desarrollo-local.md).

## Documentación

- [`docs/frontend.md`](docs/frontend.md): referencia técnica del front (configuración en runtime, Cognito, panel,
  navegación, SEO, analytics, estructura, cómo editar marca y catálogo).
- [`docs/security/audit-claude-front.md`](docs/security/audit-claude-front.md): auditoría de seguridad del front.
- [`piuma-backend`](https://github.com/piuma-uy/piuma-backend): API, infraestructura AWS, despliegue y
  [contrato OpenAPI](https://github.com/piuma-uy/piuma-backend/blob/main/openapi.yaml).
- [Conexión del front con AWS](https://github.com/piuma-uy/piuma-backend/blob/main/docs/frontend-integration.md).
