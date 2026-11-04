#!/usr/bin/env bash
# API local SIN Docker para grabar «Comprá en 3 pasos» (el pedido de Guillermo 2026-10-30 es no abrir Docker).
# Corre el mismo código de piuma-backend (src/local.ts) con cuentas locales (cookie) y el MemoryStore en lugar de
# DynamoDB Local, el simulador de Mercado Pago del repo (scripts/fake-mercadopago.mjs) y la política de envíos real
# (data/shipping.piuma.json). El catálogo es data/catalog.snapshot.json (precios reales).
# Nada sale de esta máquina; al cortar el proceso se pierde todo (memoria).
#
# Uso: produccion/api-local.sh <carpeta de piuma-backend con npm ci hecho> [carpeta de trabajo]
# Puertos propios: API 3108, simulador 8108, front 4308 (el front se levanta aparte con `npx ng serve --port 4308`).
set -euo pipefail
B=$(cd "$1" && pwd)
W=${2:-$(mktemp -d -t piuma-api-video)}
mkdir -p "$W"
cd "$W"
ln -sfn "$B/node_modules" node_modules
ln -sfn "$B/data" data

# Copia de src/local.ts con imports absolutos, MemoryStore y puerto propio. No toca el repo del backend.
sed -e "s#\"\./#\"$B/src/#g" \
    -e 's/const store = await localStore(process.env.DYNAMODB_ENDPOINT);/const store = await localStore(undefined);/' \
    -e 's/if (isLocal \&\& !process.env.DYNAMODB_ENDPOINT)/if (false)/' \
    -e 's/listen(3000,/listen(Number(process.env.API_PORT),/' \
    "$B/src/local.ts" > local-video.mts
grep -q 'localStore(undefined)' local-video.mts || { echo "local.ts cambió: revisar el sed" >&2; exit 1; }

# Valores del simulador: NO son credenciales de Mercado Pago (los mismos de compose.mp-fake.yaml).
export MERCADOPAGO_COLLECTOR_ID=100000001 MERCADOPAGO_ACCESS_TOKEN=fake-local-not-a-secret \
  MERCADOPAGO_WEBHOOK_SECRET=fake-local-not-a-secret
PORT=8108 FAKE_MP_PUBLIC_URL=http://localhost:8108 node "$B/scripts/fake-mercadopago.mjs" > mp.log 2>&1 &
export LOCAL_AUTH=enabled PAYMENT_MODE=transfer CURRENCY=UYU API_PORT=3108 ALLOWED_ORIGINS=http://localhost:4308 \
  MERCADOPAGO_API_BASE=http://localhost:8108 MERCADOPAGO_NOTIFICATION_URL=http://localhost:3108/webhooks/mercadopago \
  MERCADOPAGO_RETURN_URL=http://localhost:4308/pago
"$B/node_modules/.bin/tsx" local-video.mts > api.log 2>&1 &
for _ in $(seq 1 60); do curl -sf localhost:3108/products > /dev/null && break; sleep 1; done

# Envíos reales + transferencia habilitada (pide datos bancarios y WhatsApp: se cargan valores de relleno que el
# video NO muestra, porque la grabación termina al tocar «Confirmar y pagar»).
PASS=$(node -e 'console.log(require("./.local/admin-initial.json").password)')
TOKEN=$(curl -s -i -X POST localhost:3108/auth/login -H 'Origin: http://localhost:4308' -H 'Content-Type: application/json' \
  -d "{\"email\":\"admin@piuma.local\",\"password\":\"$PASS\"}" | sed -nE 's/^[Ss]et-[Cc]ookie: piuma_session=([^;]*);.*/\1/p')
sed -e 's#Authorization: `Bearer ${token}`,#Cookie: `piuma_session=${token}`, Origin: "http://localhost:4308",#' \
    -e 's#^const body = replaceShipping(current, policy);#current.transfer.instructions = { bank: "-", accountType: "-", accountNumber: "-", holder: "-", currency: "UYU", note: "" };\n(current as { contact: { whatsappNumber: string } }).contact.whatsappNumber = "+59891345454";\nconst body = replaceShipping(current, policy);#' \
    -e "s#from \"\.\./src/#from \"$B/src/#g" -e "s#\"\.\./data/#\"$B/data/#g" \
    "$B/scripts/apply-shipping.ts" > apply-shipping-video.mts
(cd "$B" && API_URL=http://localhost:3108 ADMIN_ACCESS_TOKEN=$TOKEN node_modules/.bin/tsx "$W/apply-shipping-video.mts" --apply)
echo "API local lista en http://localhost:3108 (carpeta $W). Cortar con: pkill -f local-video.mts; pkill -f fake-mercadopago.mjs"
