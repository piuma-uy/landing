import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { qrModules, qrPath } from "../src/app/commerce/qr.ts";

const OTPAUTH =
  "otpauth://totp/Piuma:admin%40piuma.local?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=Piuma";
const fingerprint = (m: boolean[][]) =>
  createHash("sha256")
    .update(m.map((row) => row.map((d) => (d ? "1" : "0")).join("")).join("\n"))
    .digest("hex");

// Expected values come from the reference `qrcode` package (byte mode, level M, same mask).
test("qrModules matches a reference encoder module by module", () => {
  const otp = qrModules(OTPAUTH, 2);
  assert.equal(otp.length, 41); // version 6
  assert.equal(
    fingerprint(otp),
    "f410767ebec03fe2f95cd030b114e2b2d953ed41ed0380bf06e6e5237550300e",
  );
  const long = qrModules("y".repeat(160), 5);
  assert.equal(long.length, 53); // version 9: version information blocks
  assert.equal(
    fingerprint(long),
    "4b598c46bcde5499f49c646a2c5995d44d51b732d1341dbec0c60f8243963278",
  );
});

test("qrModules draws finder patterns and picks the smallest version", () => {
  const m = qrModules("a");
  assert.equal(m.length, 21);
  // Finder: 7×7 dark ring, light ring, 3×3 dark centre, in three corners.
  for (const [x, y] of [
    [0, 0],
    [14, 0],
    [0, 14],
  ]) {
    assert.ok(m[y][x] && m[y + 6][x + 6] && m[y + 3][x + 3]);
    assert.ok(!m[y + 1][x + 1] && !m[y + 5][x + 5]);
  }
  assert.equal(qrModules("y".repeat(213)).length, 57); // version 10
  assert.throws(() => qrModules("y".repeat(214)), /demasiado largo/);
});

test("qrPath draws one unit square per dark module inside a quiet zone", () => {
  const { d, size } = qrPath(OTPAUTH);
  assert.equal(size, 41 + 8);
  const dark = qrModules(OTPAUTH).flat().filter(Boolean).length;
  assert.equal(d.match(/M/g)?.length, dark);
  assert.ok(d.startsWith("M4 4h1v1h-1z"));
});
