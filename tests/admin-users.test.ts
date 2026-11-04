import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AdminUsersApi,
  accessLabel,
  addedNotice,
  changeText,
  normalizeEmail,
  removedNotice,
  sinceLabel,
  validEmail,
  type Admin,
} from "../src/app/commerce/admin-users.ts";

// T106: Administrar → Usuarios.
const admin: Admin = {
  id: "uid-ana",
  email: "ana@piuma.test",
  status: "CONFIRMED",
  enabled: true,
  since: "2026-11-04T21:30:00.000Z",
  lastAccessAt: "2026-11-04T22:05:00.000Z",
  self: false,
};

test("the email is checked like the API does before asking", () => {
  for (const ok of [
    "ana@piuma.test",
    "  Ana.Perez+tienda@Gmail.com ",
    "a_b-c%d@sub.dominio.com.uy",
  ])
    assert.ok(validEmail(ok), ok);
  for (const bad of [
    "",
    "ana",
    "ana@piuma",
    "ana@@piuma.test",
    "ana perez@piuma.test",
    "ñandú@piuma.test",
    'ana"@piuma.test',
    "ana..perez@piuma.test",
    ".ana@piuma.test",
    "ana@piuma.test\nbcc@x.com",
    "a".repeat(250) + "@piuma.test",
  ])
    assert.ok(!validEmail(bad), bad);
  assert.equal(normalizeEmail("  Ana@Piuma.TEST "), "ana@piuma.test");
});

test("the API calls: list, add with the normalized email, remove by id", async () => {
  const calls: unknown[][] = [];
  const api = new AdminUsersApi(async <T>(...args: unknown[]) => {
    calls.push(args);
    return {} as T;
  });
  await api.list();
  await api.add(" Ana@Piuma.test ");
  await api.remove({ id: "google_123" });
  assert.deepEqual(calls, [
    ["/admin/admins"],
    ["/admin/admins", "POST", { email: "ana@piuma.test" }],
    ["/admin/admins/google_123", "DELETE"],
  ]);
});

test("each administrator reads since when, the pending invitation and the last access", () => {
  assert.equal(sinceLabel(admin), "Administrador desde el 04/11/2026 18:30");
  assert.equal(
    sinceLabel({ ...admin, since: null }),
    "Administrador desde antes de esta lista",
  );
  assert.equal(
    sinceLabel({ ...admin, status: "FORCE_CHANGE_PASSWORD" }),
    "Invitación enviada: todavía no eligió su contraseña",
  );
  assert.equal(sinceLabel({ ...admin, enabled: false }), "Cuenta deshabilitada");
  assert.equal(accessLabel(admin), "Último acceso al panel: 04/11/2026 19:05");
  assert.equal(
    accessLabel({ ...admin, lastAccessAt: null }),
    "Todavía no entró al panel",
  );
});

test("changes and notices in plain words", () => {
  const change = {
    action: "added" as const,
    at: admin.since!,
    byEmail: "guille@piuma.test",
    targetEmail: "ana@piuma.test",
    invited: true,
  };
  assert.equal(
    changeText(change),
    "guille@piuma.test le dio permisos a ana@piuma.test (cuenta nueva, con invitación)",
  );
  assert.equal(
    changeText({ ...change, action: "removed" }),
    "guille@piuma.test le quitó los permisos a ana@piuma.test",
  );
  assert.match(
    addedNotice({ admin, added: true, invited: true }),
    /contraseña temporal/,
  );
  assert.match(
    addedNotice({ admin, added: true, invited: false }),
    /cuando vuelva a ingresar/,
  );
  assert.equal(
    addedNotice({ admin, added: false, invited: false }),
    "ana@piuma.test ya era administrador",
  );
  assert.equal(removedNotice(admin), "Listo: ana@piuma.test ya no es administrador");
});
