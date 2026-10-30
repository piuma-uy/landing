#!/usr/bin/env bash
# Self-test of .gitleaks.toml (T84): each custom rule must flag a synthetic credential, and the formats it must not
# confuse (plain hashes, the allowlisted fixtures) must pass. The fake values are assembled at runtime so that this
# file itself never contains anything that looks like a secret. Requires gitleaks on PATH.
set -euo pipefail
config="${1:-.gitleaks.toml}"
hex32=0123456789abcdef0123456789abcdef
hex64=$hex32$hex32
b40=Zq8vN3kR7tLw2YbH5mXc
b40=$b40$(printf %s "$b40" | rev)
hex32b=9f3c1a7e5b2d8046
hex32b=$hex32b$(printf %s "$hex32b" | rev)
failures=0

scan() {
  printf '%s\n' "$1" | gitleaks stdin --config "$config" --no-banner --redact --log-level error --exit-code 9 >/dev/null
}

expect_leak() {
  local status=0
  scan "$2" || status=$?
  if [[ $status -ne 9 ]]; then
    echo "FAIL: $1 was not detected (exit $status)"
    failures=$((failures + 1))
  else
    echo "ok: $1 detected"
  fi
}

expect_clean() {
  local status=0
  scan "$2" || status=$?
  if [[ $status -ne 0 ]]; then
    echo "FAIL: $1 was flagged (exit $status)"
    failures=$((failures + 1))
  else
    echo "ok: $1 not flagged"
  fi
}

expect_leak "Mercado Pago production access token" "MP_ACCESS_TOKEN=APP""_USR-4829173650192837-102614-${hex32}-918273645"
expect_leak "Mercado Pago test access token" "token: \"TEST""-4829173650192837-102614-${hex32}-918273645\""
expect_leak "Mercado Pago webhook secret" "MERCADOPAGO_WEBHOOK_SECRET=${hex64}"
expect_leak "Google OAuth client secret" "GOOGLE_CLIENT_SECRET=GOCS""PX-Zq8vN3kR7tLw2YbH5mXc9JpD4fGa"
expect_leak "AWS access key id" "aws_access_key_id = AKI""AQ7XK2M4N6P3R5T6V"
expect_leak "AWS secret access key" "aws_secret_access_key = ${b40}"
expect_leak "Twilio auth token" "TWILIO_AUTH_TOKEN=${hex32b}"
expect_leak "Twilio API key" "TWILIO_API_KEY=S""K${hex32b}"

expect_clean "sha256 digest without secret context" "sha256: ${hex64}"
expect_clean "Mercado Pago public key" "MP_PUBLIC_KEY=APP""_USR-1f2e3d4c-5b6a-4978-8a9b-0c1d2e3f4a5b"
expect_clean "PostHog placeholder fixture" "const KEY = \"phc_0123456789abcdefABCDEF0123456789abcdef\";"
expect_clean "test password fixture" "assert.equal(user.password, \"Mi-Clave-Propia-99\");"

if [[ $failures -ne 0 ]]; then
  echo "$failures gitleaks self-test case(s) failed"
  exit 1
fi
