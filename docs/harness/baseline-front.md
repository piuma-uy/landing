# Línea base del front (T02)

Fecha: 2026-10-22. Resultado: **build OK, 3/3 e2e en verde**.

## Versiones

| Componente     | Versión                                                        |
| -------------- | -------------------------------------------------------------- |
| landing        | `tienda-local` @ `3730c9c` (chore/harness #1)                  |
| piuma-backend  | `origin/main` @ `d4c2aae` (clon temporal, sólo lectura)        |
| Node / npm     | v24.8.0 / 11.6.0 (host)                                        |
| Angular        | 19.2.25 (CLI 19.2.27)                                          |
| Docker         | Engine 28.3.3, Compose v2.39.2-desktop.1                       |
| Playwright     | 1.63.0, Chromium                                               |
| Imágenes stack | `node:22-bookworm-slim` (frontend), `amazon/dynamodb-local`, `piuma-backend:local` (target `development`) |

## Landing

```sh
npm ci          # 985 paquetes, 32 s
npm run build   # ng build, 2.6 s
```

- Build OK, **sin warnings** de compilación ni de budgets.
- Bundle inicial: 339.12 kB raw / 89.41 kB transfer (main 301.39 kB, polyfills 34.59 kB, styles 3.14 kB).
- `npm ci` reporta `51 vulnerabilities (2 low, 14 moderate, 31 high, 4 critical)` en `npm audit`. No se tocaron
  dependencias en esta tarea.

## E2E del backend contra Docker

Desde un clon de `piuma-backend` (fuera del checkout del coordinador), con un override de compose que monta este
worktree de landing en `/app` del servicio `frontend` (equivalente a `../landing`):

```yaml
# compose.t02.yaml
services:
  frontend:
    volumes:
      - <worktree de landing>:/app
```

```sh
docker compose -p piuma-t02 -f compose.dev.yaml -f compose.t02.yaml up -d --build --wait   # ~75 s hasta healthy
npm ci && npx playwright install chromium
COMPOSE_PROJECT_NAME=piuma-t02 npm run test:e2e
docker compose -p piuma-t02 -f compose.dev.yaml -f compose.t02.yaml down -v
```

```
Running 3 tests using 1 worker
  ✓ storefront.spec.ts:7   customer checkout, payment refusal, persistent session, admin edit/cancel and ownership (6.9s)
  ✓ storefront.spec.ts:238 mobile menu, account form and original collection fit the viewport (1.0s)
  ✓ storefront.spec.ts:272 administrator creates, publishes and hides a new product from the UI (2.5s)
  3 passed (11.0s)
```

## Observaciones

- **Puertos fijos.** `compose.dev.yaml` publica `127.0.0.1:3000` (api) y `127.0.0.1:4200` (frontend), y los e2e usan
  `http://localhost:3000` y `baseURL` `http://localhost:4200`. No se pueden correr dos stacks a la vez: hubo que
  detener el stack local `piuma-client` (`docker compose -p piuma-client stop`) durante la corrida y reiniciarlo al
  final (`start`), sin `down` ni tocar sus volúmenes. Verificado después con `docker ps`: `piuma-client-api-1` y
  `piuma-client-frontend-1` healthy, `piuma-client-dynamodb-1` up, volúmenes `piuma-client_*` intactos.
- **Nombre de proyecto implícito en los e2e.** Los tests leen la credencial admin con
  `docker compose -f compose.dev.yaml exec -T api cat .local/admin-initial.json`, sin `-p`, así que apuntan al
  proyecto `piuma-client` (el `name:` del compose). Con `-p piuma-t02` la primera corrida falló 2/3 con
  `service "api" is not running`; exportar `COMPOSE_PROJECT_NAME=piuma-t02` al correr `npm run test:e2e` lo resuelve.
  Con el nombre por defecto no hace falta.
- El contenedor `frontend` monta `docker/runtime-config.json` del backend sobre `public/runtime-config.json`
  (`commerceEnabled: true`, `apiBaseUrl: http://localhost:3000`); el archivo del repo no se modifica.
