import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COMMERCE_OFF,
  isLocalUrl,
  parseRuntimeConfig,
} from "../src/app/commerce/runtime-config.ts";

const aws = {
  commerceEnabled: true,
  apiBaseUrl: "https://abc.execute-api.us-east-1.amazonaws.com",
  auth: "cognito",
  cognito: {
    loginUrl: "https://piuma-dev.auth.us-east-1.amazoncognito.com",
    clientId: "client123",
    issuer: "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_abc",
  },
};
const docker = { commerceEnabled: true, apiBaseUrl: "http://localhost:3000" };
const analytics = {
  provider: "umami",
  hostUrl: "https://cloud.umami.is",
  websiteId: "site-1",
};

function parse(raw: unknown) {
  const warnings: string[] = [];
  return { config: parseRuntimeConfig(raw, (m) => warnings.push(m)), warnings };
}

test("the published default and a missing flag keep commerce off", () => {
  assert.deepEqual(
    parse({ commerceEnabled: false, apiBaseUrl: "" }).config,
    COMMERCE_OFF,
  );
  // Truthy is not enough (FE-09): only the boolean true turns it on.
  for (const commerceEnabled of ["true", 1, "false", null, undefined])
    assert.equal(
      parse({ ...aws, commerceEnabled }).config.commerceEnabled,
      false,
    );
});

test("garbage is refused with a warning", () => {
  for (const raw of [null, "x", 42, [], undefined]) {
    const { config, warnings } = parse(raw);
    assert.deepEqual(config, COMMERCE_OFF);
    assert.equal(warnings.length, 1);
  }
});

test("the AWS config passes through with Cognito", () => {
  const { config, warnings } = parse(aws);
  assert.deepEqual(warnings, []);
  assert.deepEqual(config, { ...aws, testMode: false });
});

test("the Docker config uses cookies against a local API", () => {
  assert.deepEqual(parse(docker).config, {
    ...docker,
    auth: "cookie",
    testMode: false,
  });
  assert.equal(
    parse({ ...docker, apiBaseUrl: "http://127.0.0.1:3100", testMode: true })
      .config.testMode,
    true,
  );
});

test("incoherent commerce settings leave the shop off", () => {
  const cases: Record<string, unknown>[] = [
    // A deployed API without auth falls to cookie mode: refused.
    { commerceEnabled: true, apiBaseUrl: "https://api.piuma.uy" },
    { ...docker, auth: "oauth" },
    { ...aws, apiBaseUrl: "http://api.piuma.uy" },
    { ...aws, apiBaseUrl: "" },
    { ...aws, apiBaseUrl: undefined },
    { ...aws, cognito: undefined },
    { ...aws, cognito: { ...aws.cognito, loginUrl: "http://login.example" } },
    { ...aws, cognito: { ...aws.cognito, clientId: "" } },
    { ...aws, cognito: { ...aws.cognito, redirectUri: "javascript:alert(1)" } },
    { ...aws, cognito: { ...aws.cognito, logoutUri: "http://evil.example/" } },
    { ...aws, cognito: { ...aws.cognito, issuer: "http://cognito.example" } },
    { ...aws, cognito: { ...aws.cognito, google: "yes" } },
  ];
  for (const raw of cases) {
    const { config, warnings } = parse(raw);
    assert.equal(config.commerceEnabled, false, JSON.stringify(raw));
    assert.equal(warnings.length, 1);
  }
});

test("Cognito against the local API and localhost redirects work for e2e", () => {
  const { config } = parse({
    ...aws,
    apiBaseUrl: "http://localhost:3000",
    cognito: {
      ...aws.cognito,
      redirectUri: "http://localhost:4200/",
      google: true,
    },
  });
  assert.equal(config.commerceEnabled, true);
  assert.equal(config.cognito?.redirectUri, "http://localhost:4200/");
  assert.equal(config.cognito?.google, true);
});

test("analytics survives with commerce off and is dropped when malformed", () => {
  assert.deepEqual(parse({ commerceEnabled: false, analytics }).config, {
    ...COMMERCE_OFF,
    analytics,
  });
  assert.deepEqual(parse({ ...aws, analytics }).config.analytics, analytics);
  for (const bad of [
    { ...analytics, hostUrl: "http://cloud.umami.is" },
    { ...analytics, provider: "ga" },
    { ...analytics, websiteId: "" },
    "umami",
  ])
    assert.equal(parse({ ...aws, analytics: bad }).config.analytics, undefined);
});

test("local URLs are only this machine over http(s)", () => {
  assert.equal(isLocalUrl("http://localhost:3000"), true);
  assert.equal(isLocalUrl("http://127.0.0.1"), true);
  assert.equal(isLocalUrl("http://localhost.evil.example"), false);
  assert.equal(isLocalUrl("file://localhost/etc/passwd"), false);
  assert.equal(isLocalUrl(3000), false);
});

test("WhatsApp sale alerts are offered only with whatsappAlerts: true (T66)", () => {
  assert.equal(parse(docker).config.whatsappAlerts, undefined);
  for (const whatsappAlerts of ["true", 1, false, null])
    assert.equal(
      parse({ ...docker, whatsappAlerts }).config.whatsappAlerts,
      undefined,
    );
  assert.equal(
    parse({ ...docker, whatsappAlerts: true }).config.whatsappAlerts,
    true,
  );
  // With commerce off there is no panel to offer it in.
  assert.equal(
    parse({ ...docker, commerceEnabled: false, whatsappAlerts: true }).config
      .whatsappAlerts,
    undefined,
  );
});
