# landing · guía para agentes

Front de Piuma: Angular 19 standalone + SCSS, sin librerías extra. Trabajar sobre la rama `tienda-local` (tienda
conectada al API). `main` es la landing pública en Vercel: no la toques ni mergees hacia ella.

## Comandos

- `npm ci`, `npm start` (http://localhost:4200), `npm run build`.
- Contra el API local: levantar `../piuma-backend` con `docker compose -f compose.dev.yaml up -d --build`.
- E2E: desde `../piuma-backend`, `npm run test:e2e` con el stack Docker encendido.

## Reglas

- Comercio controlado por `public/runtime-config.json` (`commerceEnabled`, `apiBaseUrl`); el default publicado es apagado.
- El API es la autoridad de precio, stock y roles; el front sólo muestra. Contrato: `../piuma-backend/openapi.yaml`
  (AWS, Cognito) y `openapi.local.yaml` (Docker, cookie). Precios en `priceMinor` (UYU × 100).
- Auth AWS: Cognito code + PKCE S256, access token en memoria (ver `../piuma-backend/docs/frontend-integration.md`).
- Checkout: generar y conservar la `Idempotency-Key` por intento; el pago se confirma sólo con el estado del backend.
- Tráfico casi todo mobile desde Instagram: probar en viewport de teléfono; mantener diseño y tokens de `src/styles/`.
- Una tarea = rama `feat/<id>-<slug>` desde `tienda-local` = un PR.

## Harness

Si te lanzó el coordinador de Orca: reportá con `orca orchestration send --type worker_done --outcome succeeded|failed`
y preguntá con `orca orchestration ask`. No esperes input en tu terminal.
