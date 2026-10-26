import { test } from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import {
  AuthError,
  CognitoAuth,
  SESSION_KEY,
  authErrorMessage,
  userPoolOf,
} from "../src/app/commerce/cognito.ts";
import {
  codeOf,
  emailOk,
  passwordOk,
  passwordRules,
} from "../src/app/commerce/account.ts";
import { CODE, FakeUserPool } from "./fake-user-pool.ts";

const LOGIN = "https://piuma-dev.auth.us-east-2.amazoncognito.com";
const CLIENT = "client123";
const ISSUER = "https://cognito-idp.us-east-2.amazonaws.com/us-east-2_AbC123";
const ENDPOINT = "https://cognito-idp.us-east-2.amazonaws.com/";
const PASSWORD = "Sábanas-de-lino-42";

function setup(
  issuer: string | undefined = ISSUER,
  pool = new FakeUserPool(ISSUER, CLIENT),
  // sessionStorage of the tab: a second setup() with the same map is the page after a reload.
  store = new Map<string, string>(),
) {
  const bodies: string[] = [];
  const auth = new CognitoAuth(
    { loginUrl: LOGIN, clientId: CLIENT, issuer },
    {
      fetch: (async (url: string, init: RequestInit) => {
        assert.equal(url, ENDPOINT);
        assert.equal(
          (init.headers as Record<string, string>)["Content-Type"],
          "application/x-amz-json-1.1",
        );
        bodies.push(String(init.body));
        const [status, body] = pool.handle(
          (init.headers as Record<string, string>)["X-Amz-Target"]!,
          JSON.parse(String(init.body)),
        );
        return new Response(JSON.stringify(body), { status });
      }) as typeof fetch,
      storage: {
        getItem: (k) => store.get(k) ?? null,
        setItem: (k, v) => void store.set(k, v),
        removeItem: (k) => void store.delete(k),
      },
      crypto: webcrypto as Crypto,
      now: Date.now,
      srp: () => import("../src/app/commerce/srp.ts"),
    },
    "https://piuma.uy",
  );
  return { auth, pool, bodies, store };
}

test("the user pool API comes from the issuer; without it, the hosted UI", () => {
  assert.deepEqual(userPoolOf(ISSUER), {
    endpoint: ENDPOINT,
    poolName: "AbC123",
  });
  assert.equal(userPoolOf("https://evil.example/us-east-2_AbC123"), null);
  assert.equal(userPoolOf(undefined), null);
  assert.equal(setup().auth.forms, true);
  assert.equal(setup("").auth.forms, false);
});

test("SRP sign-in: the password is never sent and the access token stays in memory", async () => {
  const s = setup();
  s.pool.add("ana@example.com", { password: PASSWORD, name: "Ana" });
  const result = await s.auth.signIn("ana@example.com", PASSWORD);
  assert.ok("user" in result);
  assert.equal(result.user.name, "Ana");
  assert.equal(result.user.email, "ana@example.com");
  assert.deepEqual(
    s.pool.calls.map((c) => c.action),
    ["InitiateAuth", "RespondToAuthChallenge"],
  );
  assert.equal(s.pool.calls[0]!.body.AuthFlow, "USER_SRP_AUTH");
  for (const body of s.bodies) assert.ok(!body.includes(PASSWORD));
  assert.match(await s.auth.getAccessToken(), /\.sig$/);
});

test("a wrong password is refused with a message in Spanish", async () => {
  const s = setup();
  s.pool.add("ana@example.com", { password: PASSWORD });
  await assert.rejects(
    s.auth.signIn("ana@example.com", "Sabanas-de-lino-43"),
    (e: unknown) =>
      e instanceof AuthError &&
      e.type === "NotAuthorizedException" &&
      /no coinciden/.test(e.message),
  );
  assert.equal(s.auth.user, null);
});

test("sign up, confirm with the emailed code and sign in", async () => {
  const s = setup();
  assert.equal(
    await s.auth.signUp({ email: "eva@example.com", password: PASSWORD, name: "Eva" }),
    "e***@e***",
  );
  await assert.rejects(
    s.auth.signIn("eva@example.com", PASSWORD),
    (e: unknown) => e instanceof AuthError && e.type === "UserNotConfirmedException",
  );
  await assert.rejects(
    s.auth.confirmSignUp("eva@example.com", "000000"),
    /código no coincide/,
  );
  await s.auth.confirmSignUp("eva@example.com", CODE);
  const result = await s.auth.signIn("eva@example.com", PASSWORD);
  assert.ok("user" in result && result.user.name === "Eva");
  const signUp = s.pool.calls.find((c) => c.action === "SignUp")!.body;
  assert.deepEqual(signUp["UserAttributes"], [
    { Name: "email", Value: "eva@example.com" },
    { Name: "name", Value: "Eva" },
  ]);
});

test("forgotten password: code and new password, then sign in", async () => {
  const s = setup();
  s.pool.add("ana@example.com", { password: PASSWORD });
  await s.auth.forgotPassword("ana@example.com");
  await assert.rejects(
    s.auth.confirmForgotPassword("ana@example.com", CODE, "corta"),
    (e: unknown) => e instanceof AuthError && e.type === "InvalidPasswordException",
  );
  await s.auth.confirmForgotPassword("ana@example.com", CODE, "Otra-Clave-Nueva-7");
  assert.ok("user" in (await s.auth.signIn("ana@example.com", "Otra-Clave-Nueva-7")));
});

test("temporary password: NEW_PASSWORD_REQUIRED, then the panel", async () => {
  const s = setup();
  s.pool.add("admin@example.com", {
    password: "Temporal-123456!",
    temporary: true,
    admin: true,
  });
  assert.deepEqual(await s.auth.signIn("admin@example.com", "Temporal-123456!"), {
    next: "newPassword",
  });
  const result = await s.auth.completeNewPassword("Mi-Clave-Propia-99");
  assert.ok("user" in result && result.user.admin);
  assert.equal(s.pool.users.get("admin@example.com")!.password, "Mi-Clave-Propia-99");
});

test("TOTP step when the pool asks for it, and a stale step fails clearly", async () => {
  const s = setup();
  s.pool.add("admin@example.com", { password: PASSWORD, totp: true });
  assert.deepEqual(await s.auth.signIn("admin@example.com", PASSWORD), {
    next: "totp",
  });
  await assert.rejects(s.auth.completeNewPassword(PASSWORD), /Empezá de nuevo/);
  await assert.rejects(s.auth.completeTotp("111111"), /código no coincide/);
  // Cognito spends the session on a wrong code: the buyer starts over.
  await assert.rejects(s.auth.completeTotp(CODE), /Empezá de nuevo/);
  assert.deepEqual(await s.auth.signIn("admin@example.com", PASSWORD), {
    next: "totp",
  });
  assert.ok("user" in (await s.auth.completeTotp(CODE)));
});

test("refresh with REFRESH_TOKEN_AUTH and logout with RevokeToken, no redirect", async () => {
  const s = setup();
  s.pool.add("ana@example.com", { password: PASSWORD });
  await s.auth.signIn("ana@example.com", PASSWORD);
  assert.equal(await s.auth.refresh(), true);
  const refresh = s.pool.calls.at(-1)!;
  assert.equal(refresh.body.AuthFlow, "REFRESH_TOKEN_AUTH");
  assert.match(refresh.body.AuthParameters.REFRESH_TOKEN, /^refresh:/);
  assert.equal(await s.auth.logout(), null);
  assert.deepEqual(s.pool.revoked, [refresh.body.AuthParameters.REFRESH_TOKEN]);
  assert.equal(s.auth.user, null);
  assert.equal(await s.auth.getAccessToken(), "");
});

test("a reload renews the session with this tab's refresh token, never the password (T61b)", async () => {
  const s = setup();
  s.pool.add("ana@example.com", { password: PASSWORD, name: "Ana" });
  await s.auth.signIn("ana@example.com", PASSWORD);
  // Only the refresh token is kept: no access or id token (JWT), no password.
  assert.deepEqual([...s.store.keys()], [SESSION_KEY]);
  const saved = s.store.get(SESSION_KEY)!;
  assert.deepEqual(Object.keys(JSON.parse(saved)), ["refreshToken", "source"]);
  assert.match(JSON.parse(saved).refreshToken, /^refresh:ana@example.com:/);
  assert.doesNotMatch(saved, /eyJ|lino/);

  const reloaded = setup(ISSUER, s.pool, s.store);
  assert.equal(await reloaded.auth.getAccessToken(), "", "nothing before restore");
  const user = await reloaded.auth.restore();
  assert.equal(user !== "expired" && user?.name, "Ana");
  assert.equal(s.pool.calls.at(-1)!.body.AuthFlow, "REFRESH_TOKEN_AUTH");
  assert.match(await reloaded.auth.getAccessToken(), /\.sig$/);
  assert.equal(reloaded.store.get(SESSION_KEY), saved);

  // Logout revokes it and forgets it; the next load has no session.
  assert.equal(await reloaded.auth.logout(), null);
  assert.equal(s.store.size, 0);
  assert.equal(await setup(ISSUER, s.pool, s.store).auth.restore(), null);
});

test("a refresh token Cognito no longer renews is forgotten and asks to sign in (T61b)", async () => {
  const s = setup();
  s.pool.add("ana@example.com", { password: PASSWORD });
  await s.auth.signIn("ana@example.com", PASSWORD);
  s.pool.revoked.push(JSON.parse(s.store.get(SESSION_KEY)!).refreshToken);
  const reloaded = setup(ISSUER, s.pool, s.store);
  assert.equal(await reloaded.auth.restore(), "expired");
  assert.equal(s.store.size, 0);
  assert.equal(reloaded.auth.user, null);
  // A damaged entry is dropped the same way.
  s.store.set(SESSION_KEY, '{"source":"forms"}');
  assert.equal(await setup(ISSUER, s.pool, s.store).auth.restore(), "expired");
  assert.equal(s.store.size, 0);
  s.store.set(SESSION_KEY, "{not json");
  assert.equal(await setup(ISSUER, s.pool, s.store).auth.restore(), null);
});

test("no connection or no SRP chunk: a message about the connection", async () => {
  const s = setup();
  const offline = new CognitoAuth(
    { loginUrl: LOGIN, clientId: CLIENT, issuer: ISSUER },
    {
      fetch: (async () => {
        throw new TypeError("Failed to fetch");
      }) as typeof fetch,
      storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
      crypto: webcrypto as Crypto,
      now: Date.now,
      srp: () => Promise.reject(new Error("chunk")),
    },
    "https://piuma.uy",
  );
  await assert.rejects(offline.signIn("a@b.co", PASSWORD), /conexión/);
  await assert.rejects(offline.forgotPassword("a@b.co"), /conexión/);
  assert.ok(s);
});

test("Cognito errors read in Spanish", () => {
  assert.match(
    authErrorMessage("NotAuthorizedException", "Password attempts exceeded"),
    /Demasiados intentos/,
  );
  assert.match(
    authErrorMessage("com.amazonaws#LimitExceededException"),
    /Demasiados intentos/,
  );
  assert.match(authErrorMessage("UsernameExistsException"), /Ya hay una cuenta/);
  assert.match(authErrorMessage("ExpiredCodeException"), /venció/);
  assert.match(authErrorMessage("Whatever"), /Probá de nuevo/);
});

test("password rules: Cognito's policy in AWS, the length in Docker", () => {
  const cognito = passwordRules(true);
  assert.equal(passwordOk(cognito, PASSWORD), true);
  assert.equal(passwordOk(cognito, "sabanas-de-lino-42"), false);
  assert.equal(passwordOk(cognito, "Sabanas de lino 42"), true);
  assert.equal(passwordOk(cognito, " Sabanas-lino-42"), false);
  assert.equal(passwordOk(cognito, "SabanasDeLino42"), false);
  assert.deepEqual(
    cognito.filter((r) => !r.ok("corta")).map((r) => r.id),
    ["length", "upper", "number", "symbol"],
  );
  const local = passwordRules(false);
  assert.equal(passwordOk(local, "doce-letras!"), true);
  assert.equal(passwordOk(local, "once-letra"), false);
});

test("email and code checks", () => {
  assert.equal(emailOk(" ana@example.com "), true);
  assert.equal(emailOk("ana@example"), false);
  assert.equal(codeOf("123 456"), "123456");
  assert.equal(codeOf("12345"), null);
});
