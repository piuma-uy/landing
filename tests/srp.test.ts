import { test } from "node:test";
import assert from "node:assert/strict";
import { getDiffieHellman, webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  N_HEX,
  modPow,
  padHex,
  passwordSignature,
  srpClient,
  srpTimestamp,
} from "../src/app/commerce/srp.ts";

const crypto = webcrypto as Crypto;
// Generated with AWS's own AuthenticationHelper (amazon-cognito-identity-js 6.3.12, outside the
// repo) from fixed a, salt, B and secret block: an oracle independent of srp.ts.
const vectors: {
  a: string;
  A: string;
  poolName: string;
  userId: string;
  password: string;
  salt: string;
  srpB: string;
  secretBlock: string;
  timestamp: string;
  signature: string;
}[] = JSON.parse(
  readFileSync(new URL("./fixtures/srp-vectors.json", import.meta.url), "utf8"),
);

test("N is the 3072-bit group of RFC 3526/5054", () => {
  assert.equal(N_HEX.toLowerCase(), getDiffieHellman("modp15").getPrime("hex"));
});

test("padHex keeps the hash input Cognito expects", () => {
  assert.equal(padHex(0x1n), "01");
  assert.equal(padHex(0x7fn), "7f");
  assert.equal(padHex(0x80n), "0080");
  assert.equal(padHex(0xabcn), "0abc");
  assert.equal(padHex(0x1234n), "1234");
});

test("modPow", () => {
  assert.equal(modPow(4n, 13n, 497n), 445n);
  assert.equal(modPow(2n, 0n, 7n), 1n);
});

test("timestamp in Cognito's format: UTC, day without padding", () => {
  assert.equal(
    srpTimestamp(new Date(Date.UTC(2026, 9, 6, 9, 5, 3))),
    "Tue Oct 6 09:05:03 UTC 2026",
  );
  assert.equal(
    srpTimestamp(new Date(Date.UTC(2026, 11, 31, 23, 59, 59))),
    "Thu Dec 31 23:59:59 UTC 2026",
  );
});

test("A and the password signature match AWS's AuthenticationHelper", async () => {
  for (const v of vectors) {
    const client = srpClient(crypto, BigInt("0x" + v.a));
    assert.equal(client.A, v.A);
    assert.equal(await passwordSignature(crypto, client, v), v.signature);
  }
});

test("a wrong password gives another signature", async () => {
  const v = vectors[0]!;
  const client = srpClient(crypto, BigInt("0x" + v.a));
  assert.notEqual(
    await passwordSignature(crypto, client, { ...v, password: "otra" }),
    v.signature,
  );
});

test("a fresh client is random and refuses B = 0 mod N", async () => {
  const one = srpClient(crypto);
  const two = srpClient(crypto);
  assert.notEqual(one.A, two.A);
  assert.ok(one.a > 0n);
  await assert.rejects(
    passwordSignature(crypto, one, { ...vectors[0]!, srpB: N_HEX }),
    /SRP B/,
  );
});
