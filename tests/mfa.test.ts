import { test } from "node:test";
import assert from "node:assert/strict";
import { base64Url, decodeJwt } from "../src/app/commerce/cognito.ts";
import {
  EnrollmentError,
  RELOGIN_MESSAGE,
  TotpEnrollment,
  enrollmentError,
  groupSecret,
  idpEndpoint,
  otpauthUrl,
  totpCode,
} from "../src/app/commerce/mfa.ts";

const ISS = "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_AbC123";
const jwt = (claims: Record<string, unknown>) => {
  const enc = (o: unknown) =>
    base64Url(new TextEncoder().encode(JSON.stringify(o)));
  return `${enc({ alg: "none" })}.${enc(claims)}.sig`;
};
const TOKEN = jwt({ iss: ISS, scope: "aws.cognito.signin.user.admin" });

function setup(responses: { status?: number; body: unknown }[]) {
  const calls: {
    url: string;
    target: string;
    body: Record<string, unknown>;
  }[] = [];
  const enrollment = new TotpEnrollment(
    (async (url: string, init: RequestInit) => {
      const headers = init.headers as Record<string, string>;
      calls.push({
        url,
        target: headers["X-Amz-Target"],
        body: JSON.parse(init.body as string),
      });
      const next = responses.shift() ?? { status: 500, body: {} };
      return new Response(JSON.stringify(next.body), {
        status: next.status ?? 200,
      });
    }) as typeof fetch,
    decodeJwt,
  );
  return { enrollment, calls };
}

test("idpEndpoint only accepts a Cognito user pool issuer", () => {
  assert.equal(
    idpEndpoint({ iss: ISS }),
    "https://cognito-idp.us-east-1.amazonaws.com/",
  );
  assert.equal(idpEndpoint({ iss: "https://evil.example/us-east-1_x" }), null);
  assert.equal(
    idpEndpoint({
      iss: "https://cognito-idp.us-east-1.amazonaws.com.evil.example/p",
    }),
    null,
  );
  assert.equal(idpEndpoint({}), null);
});

test("otpauthUrl, groupSecret and totpCode", () => {
  assert.equal(
    otpauthUrl("ana+admin@piuma.uy", "JBSWY3DPEHPK3PXP"),
    "otpauth://totp/Piuma:ana%2Badmin%40piuma.uy?secret=JBSWY3DPEHPK3PXP&issuer=Piuma",
  );
  assert.equal(groupSecret("JBSWY3DPEHPK3PXPAB"), "JBSW Y3DP EHPK 3PXP AB");
  assert.equal(totpCode(" 123 456 "), "123456");
  assert.equal(totpCode("12345"), null);
  assert.equal(totpCode("12345a"), null);
  assert.equal(totpCode("1234567"), null);
});

test("enrollment: associate, verify and make TOTP the preferred factor", async () => {
  const { enrollment, calls } = setup([
    { body: { SecretCode: "SECRET234", Session: "s" } },
    { body: { Status: "SUCCESS" } },
    { body: {} },
  ]);
  assert.equal(await enrollment.associate(TOKEN), "SECRET234");
  await enrollment.verify(TOKEN, "123456");
  assert.deepEqual(
    calls.map((c) => c.target),
    [
      "AWSCognitoIdentityProviderService.AssociateSoftwareToken",
      "AWSCognitoIdentityProviderService.VerifySoftwareToken",
      "AWSCognitoIdentityProviderService.SetUserMFAPreference",
    ],
  );
  assert.ok(
    calls.every(
      (c) => c.url === "https://cognito-idp.us-east-1.amazonaws.com/",
    ),
  );
  assert.ok(calls.every((c) => c.body["AccessToken"] === TOKEN));
  assert.equal(calls[1].body["UserCode"], "123456");
  assert.deepEqual(calls[2].body["SoftwareTokenMfaSettings"], {
    Enabled: true,
    PreferredMfa: true,
  });
});

test("enrollment: a wrong code never sets the preference", async () => {
  const { enrollment, calls } = setup([
    { status: 400, body: { __type: "CodeMismatchException", message: "x" } },
  ]);
  await assert.rejects(enrollment.verify(TOKEN, "000000"), /no coincide/);
  assert.equal(calls.length, 1);
  const status = setup([{ body: { Status: "ERROR" } }]);
  await assert.rejects(
    status.enrollment.verify(TOKEN, "000000"),
    /no coincide/,
  );
  assert.equal(status.calls.length, 1);
});

test("enrollment: token without scope or from elsewhere asks to log in again", async () => {
  const { enrollment, calls } = setup([
    {
      status: 400,
      body: {
        __type: "NotAuthorizedException",
        message: "Access Token does not have required scopes",
      },
    },
  ]);
  await assert.rejects(
    enrollment.associate(TOKEN),
    (e) => e instanceof EnrollmentError && e.type === "NotAuthorizedException",
  );
  const foreign = jwt({ iss: "https://evil.example/pool" });
  await assert.rejects(enrollment.associate(foreign), {
    message: RELOGIN_MESSAGE,
  });
  await assert.rejects(enrollment.associate(""), { message: RELOGIN_MESSAGE });
  assert.equal(calls.length, 1, "never sends the token to another host");
});

test("enrollmentError messages", () => {
  assert.match(
    enrollmentError("com.amazonaws#LimitExceededException"),
    /Esperá un minuto/,
  );
  assert.match(
    enrollmentError("SoftwareTokenMFANotFoundException"),
    /QR nuevo/,
  );
  assert.match(enrollmentError(""), /No pudimos activar/);
});
