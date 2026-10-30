import { test } from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import {
  CLOCK_TOLERANCE_MS,
  CognitoAuth,
  base64Url,
  callbackErrorMessage,
  challengeFor,
  decodeJwt,
} from "../src/app/commerce/cognito.ts";

const LOGIN = "https://piuma-dev.auth.us-east-1.amazoncognito.com";
const CLIENT = "client123";
const ORIGIN = "https://piuma-landing.vercel.app";
const ISSUER = "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_abc";

function jwt(claims: Record<string, unknown>) {
  const enc = (o: unknown) =>
    base64Url(new TextEncoder().encode(JSON.stringify(o)));
  return `${enc({ alg: "none" })}.${enc(claims)}.sig`;
}

function setup(config: Record<string, unknown> = {}) {
  const store = new Map<string, string>();
  const calls: { url: string; body: URLSearchParams }[] = [];
  const responses: unknown[] = [];
  let clock = 1_000_000;
  const auth = new CognitoAuth(
    { loginUrl: LOGIN + "/", clientId: CLIENT, ...config },
    {
      fetch: (async (url: string, init: RequestInit) => {
        calls.push({ url, body: init.body as URLSearchParams });
        // A pushed promise keeps the request in flight until the test settles it.
        const next = await responses.shift();
        if (next instanceof Error) throw next;
        return new Response(JSON.stringify(next ?? {}), {
          status: next ? 200 : 400,
        });
      }) as typeof fetch,
      storage: {
        getItem: (k) => store.get(k) ?? null,
        setItem: (k, v) => void store.set(k, v),
        removeItem: (k) => void store.delete(k),
      },
      crypto: webcrypto as Crypto,
      now: () => clock,
    },
    ORIGIN,
  );
  return {
    auth,
    store,
    calls,
    responses,
    tick: (ms: number) => (clock += ms),
  };
}

function tokens(nonce: string, extra: Record<string, unknown> = {}) {
  return {
    access_token: "access-1",
    refresh_token: "refresh-1",
    expires_in: 900,
    id_token: jwt({
      sub: "u-1",
      aud: CLIENT,
      iss: ISSUER,
      // setup() starts its clock at 1 000 000 ms: issued then, valid for an hour.
      iat: 1000,
      exp: 1000 + 3600,
      nonce,
      email: "ana@example.com",
      name: "Ana",
      ...extra,
    }),
  };
}

async function login(s: ReturnType<typeof setup>, extra = {}) {
  const authorize = new URL(await s.auth.authorizeUrl());
  const state = authorize.searchParams.get("state")!;
  const nonce = authorize.searchParams.get("nonce")!;
  s.responses.push(tokens(nonce, extra));
  const callback = new URL(`${ORIGIN}/?code=abc&state=${state}`);
  return { user: await s.auth.handleCallback(callback), authorize };
}

test("S256 challenge matches the RFC 7636 example", async () => {
  assert.equal(
    await challengeFor(
      webcrypto as Crypto,
      "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",
    ),
    "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
  );
});

test("authorize URL carries code + PKCE S256 parameters", async () => {
  const s = setup();
  const url = new URL(await s.auth.authorizeUrl());
  assert.equal(url.origin + url.pathname, LOGIN + "/oauth2/authorize");
  const p = url.searchParams;
  assert.equal(p.get("client_id"), CLIENT);
  assert.equal(p.get("response_type"), "code");
  assert.equal(p.get("redirect_uri"), ORIGIN + "/");
  assert.equal(
    p.get("scope"),
    "openid email profile piuma/api aws.cognito.signin.user.admin",
  );
  assert.equal(p.get("code_challenge_method"), "S256");
  assert.ok(p.get("state")!.length >= 43);
  assert.ok(p.get("nonce")!.length >= 43);
  assert.equal(p.get("identity_provider"), null);
  const attempt = JSON.parse(s.store.get("piuma-oauth")!);
  assert.equal(attempt.state, p.get("state"));
  assert.equal(
    p.get("code_challenge"),
    await challengeFor(webcrypto as Crypto, attempt.verifier),
  );
  assert.match(attempt.verifier, /^[A-Za-z0-9_-]{43,128}$/);
});

test("signup and Google variants", async () => {
  const s = setup();
  assert.equal(
    new URL(await s.auth.authorizeUrl({ signup: true })).pathname,
    "/signup",
  );
  const google = new URL(await s.auth.authorizeUrl({ provider: "Google" }));
  assert.equal(google.searchParams.get("identity_provider"), "Google");
});

test("callback exchanges the code with the verifier, no secret", async () => {
  const s = setup();
  const { user, authorize } = await login(s);
  assert.deepEqual(user, {
    id: "u-1",
    email: "ana@example.com",
    name: "Ana",
    admin: false,
  });
  const verifier = s.calls[0].body.get("code_verifier")!;
  assert.equal(
    await challengeFor(webcrypto as Crypto, verifier),
    authorize.searchParams.get("code_challenge"),
  );
  assert.equal(s.calls[0].url, LOGIN + "/oauth2/token");
  const body = Object.fromEntries(s.calls[0].body);
  assert.deepEqual(body, {
    grant_type: "authorization_code",
    client_id: CLIENT,
    redirect_uri: ORIGIN + "/",
    code: "abc",
    code_verifier: verifier,
  });
  assert.equal(s.store.has("piuma-oauth"), false);
  assert.equal(await s.auth.getAccessToken(), "access-1");
});

test("wrong or missing state is rejected without calling /oauth2/token", async () => {
  const s = setup();
  await s.auth.authorizeUrl();
  await assert.rejects(
    s.auth.handleCallback(new URL(`${ORIGIN}/?code=abc&state=forged`)),
  );
  await assert.rejects(
    s.auth.handleCallback(new URL(`${ORIGIN}/?code=abc&state=x`)),
  );
  assert.equal(s.calls.length, 0);
});

test("nonce and audience of the id_token are checked", async () => {
  const s = setup();
  await assert.rejects(login(s, { nonce: "other" }));
  await assert.rejects(login(s, { aud: "other-client" }));
  assert.equal(s.auth.user, null);
});

test("issuer, expiry and audience list of the id_token are checked (FE-05)", async () => {
  const issuer = { issuer: ISSUER };
  // aud may be a list that includes the client.
  assert.equal(
    (await login(setup(issuer), { aud: ["other", CLIENT] })).user.email,
    "ana@example.com",
  );
  await assert.rejects(login(setup(issuer), { aud: ["other"] }));
  await assert.rejects(
    login(setup(issuer), {
      iss: "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_other",
    }),
  );
  await assert.rejects(login(setup(issuer), { iss: undefined }));
  // Without a configured issuer only aud/exp/nonce apply.
  assert.ok(await login(setup(), { iss: "https://elsewhere.example" }));
  await assert.rejects(login(setup(), { exp: undefined }));
  await assert.rejects(login(setup(), { exp: "9999999999" }));
  // Expired beyond the tolerance, or issued in the future beyond it.
  const tolerance = CLOCK_TOLERANCE_MS / 1000;
  await assert.rejects(login(setup(), { exp: 1000 - tolerance - 1 }));
  assert.ok(await login(setup(), { exp: 1000 - tolerance + 1 }));
  await assert.rejects(login(setup(), { iat: 1000 + tolerance + 1 }));
  assert.ok(await login(setup(), { iat: 1000 + tolerance - 1 }));
});

test("admins group from the id_token shows the admin menu", async () => {
  assert.equal(
    (await login(setup(), { "cognito:groups": ["admins"] })).user.admin,
    true,
  );
  assert.equal(
    (await login(setup(), { "cognito:groups": "notadmins" })).user.admin,
    false,
  );
});

test("OAuth error response is reported", async () => {
  const s = setup();
  const state = new URL(await s.auth.authorizeUrl({ provider: "Google" }))
    .searchParams.get("state");
  await assert.rejects(
    s.auth.handleCallback(
      new URL(`${ORIGIN}/?error=access_denied&state=${state}`),
    ),
    { message: /Cancelaste el ingreso con Google/ },
  );
  assert.equal(s.calls.length, 0);
  // The attempt is used up: the same callback again is not valid.
  assert.equal(s.store.has("piuma-oauth"), false);
});

test("hosted UI errors are shown in Spanish, never Cognito's description (T77)", async () => {
  assert.match(callbackErrorMessage("access_denied"), /^Cancelaste/);
  for (const error of ["invalid_request", "server_error", "", null])
    assert.equal(
      callbackErrorMessage(error),
      "No se pudo completar el ingreso. Probá de nuevo.",
    );
  const s = setup();
  const state = new URL(await s.auth.authorizeUrl()).searchParams.get("state");
  const description = encodeURIComponent("Llamá al 099 000 000 para recuperar tu cuenta");
  await assert.rejects(
    s.auth.handleCallback(
      new URL(
        `${ORIGIN}/?error=invalid_request&error_description=${description}&state=${state}`,
      ),
    ),
    (e: Error) => !e.message.includes("099"),
  );
});

test("access token is renewed before expiry with the refresh token", async () => {
  const s = setup();
  await login(s);
  s.tick(10 * 60_000);
  assert.equal(await s.auth.getAccessToken(), "access-1");
  s.tick(4.5 * 60_000);
  s.responses.push({ access_token: "access-2", expires_in: 900 });
  const [a, b] = await Promise.all([
    s.auth.getAccessToken(),
    s.auth.getAccessToken(),
  ]);
  assert.equal(a, "access-2");
  assert.equal(b, "access-2");
  assert.equal(s.calls.length, 2, "one shared refresh request");
  assert.deepEqual(Object.fromEntries(s.calls[1].body), {
    grant_type: "refresh_token",
    client_id: CLIENT,
    refresh_token: "refresh-1",
  });
  assert.equal(s.auth.user?.email, "ana@example.com");
});

test("failed refresh ends the session", async () => {
  const s = setup();
  await login(s);
  s.responses.push(null);
  assert.equal(await s.auth.refresh(), false);
  assert.equal(s.auth.user, null);
  assert.equal(await s.auth.getAccessToken(), "");
  assert.equal(s.store.has("piuma-session"), false);
});

test("a refresh in flight during logout does not bring the session back (T87-03)", async () => {
  const s = setup();
  await login(s);
  let answer!: (r: unknown) => void;
  s.responses.push(new Promise((r) => (answer = r)));
  const renewing = s.auth.refresh();
  s.responses.push({ ok: true });
  await s.auth.logout();
  answer({ access_token: "access-2", expires_in: 900 });
  assert.equal(await renewing, false);
  assert.equal(s.auth.user, null);
  assert.equal(await s.auth.getAccessToken(), "");
  assert.equal(s.store.has("piuma-session"), false);
  // A stale refresh that fails leaves the session signed in after it alone.
  await login(s);
  s.responses.push(new Promise((r) => (answer = r)));
  const stale = s.auth.refresh();
  s.auth.clear();
  await login(s);
  answer(null);
  assert.equal(await stale, false);
  // Read again: the assertion above narrowed the getter to null.
  assert.equal((s.auth as CognitoAuth).user?.email, "ana@example.com");
  assert.equal(await s.auth.getAccessToken(), "access-1");
  assert.equal(JSON.parse(s.store.get("piuma-session")!).refreshToken, "refresh-1");
});

test("hosted UI: the refresh token alone stays in the tab and renews after a reload (T61b)", async () => {
  const s = setup({ issuer: ISSUER });
  await login(s);
  assert.deepEqual(JSON.parse(s.store.get("piuma-session")!), {
    refreshToken: "refresh-1",
    source: "hosted",
  });
  const reloaded = setup({ issuer: ISSUER });
  for (const [k, v] of s.store) reloaded.store.set(k, v);
  reloaded.responses.push({ ...tokens(""), refresh_token: undefined });
  const user = await reloaded.auth.restore();
  assert.equal(user !== "expired" && user?.email, "ana@example.com");
  assert.equal(reloaded.calls[0].url, LOGIN + "/oauth2/token");
  assert.equal(reloaded.calls[0].body.get("grant_type"), "refresh_token");
  assert.equal(reloaded.calls[0].body.get("refresh_token"), "refresh-1");
  // Refused by Cognito (revoked or expired): forgotten.
  const late = setup({ issuer: ISSUER });
  for (const [k, v] of s.store) late.store.set(k, v);
  late.responses.push(null);
  assert.equal(await late.auth.restore(), "expired");
  assert.equal(late.store.has("piuma-session"), false);
});

test("restore keeps a session signed in while the page was loading, without renewing it (T79)", async () => {
  const s = setup();
  await login(s);
  const calls = s.calls.length;
  const user = await s.auth.restore();
  assert.equal(user !== "expired" && user?.email, "ana@example.com");
  assert.equal(s.calls.length, calls);
  assert.equal(JSON.parse(s.store.get("piuma-session")!).refreshToken, "refresh-1");
});

test("logout returns to the bare origin, the sign-out URL the client registers (T61c)", async () => {
  const s = setup();
  await login(s);
  s.responses.push({ ok: true });
  const url = new URL((await s.auth.logout())!);
  assert.equal(url.searchParams.get("logout_uri"), ORIGIN);
});

test("logout revokes the refresh token and builds the Cognito logout URL", async () => {
  const s = setup({ logoutUri: ORIGIN + "/adios" });
  await login(s);
  s.responses.push({ ok: true });
  const url = new URL((await s.auth.logout())!);
  assert.equal(url.origin + url.pathname, LOGIN + "/logout");
  assert.equal(url.searchParams.get("client_id"), CLIENT);
  assert.equal(url.searchParams.get("logout_uri"), ORIGIN + "/adios");
  assert.equal(s.calls[1].url, LOGIN + "/oauth2/revoke");
  assert.deepEqual(Object.fromEntries(s.calls[1].body), {
    token: "refresh-1",
    client_id: CLIENT,
  });
  assert.equal(s.auth.user, null);
});

test("decodeJwt handles base64url and UTF-8", () => {
  assert.equal(decodeJwt(jwt({ name: "Ñandú ü" }))["name"], "Ñandú ü");
});

test("isCallback only matches OAuth responses", () => {
  const { auth } = setup();
  assert.equal(auth.isCallback(new URL(`${ORIGIN}/?code=a&state=b`)), true);
  assert.equal(auth.isCallback(new URL(`${ORIGIN}/?error=x&state=b`)), true);
  assert.equal(auth.isCallback(new URL(`${ORIGIN}/?code=a`)), false);
  assert.equal(auth.isCallback(new URL(`${ORIGIN}/#catalogo`)), false);
});
