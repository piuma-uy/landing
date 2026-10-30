// A Cognito user pool API good enough for the account forms (T61): the server half of SRP-6a
// written with node:crypto (not srp.ts), so a sign-in only passes if the browser's proof is
// right. Users, codes and tokens live in memory; codes are always 123456.
import { createHash, createHmac, hkdfSync, randomBytes } from "node:crypto";

const N = BigInt(
  "0x" +
    "FFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD129024E088A67CC74020BBEA63B139B22514A08798E3404DD" +
    "EF9519B3CD3A431B302B0A6DF25F14374FE1356D6D51C245E485B576625E7EC6F44C42E9A637ED6B0BFF5CB6F406B7ED" +
    "EE386BFB5A899FA5AE9F24117C4B1FE649286651ECE45B3DC2007CB8A163BF0598DA48361C55D39A69163FA8FD24CF5F" +
    "83655D23DCA3AD961C62F356208552BB9ED529077096966D670C354E4ABC9804F1746C08CA18217C32905E462E36CE3B" +
    "E39E772C180E86039B2783A2EC07A28FB5C55DF06F4C52C9DE2BCBF6955817183995497CEA956AE515D2261898FA0510" +
    "15728E5A8AAAC42DAD33170D04507A33A85521ABDF1CBA64ECFB850458DBEF0A8AEA71575D060C7DB3970F85A6E1E4C7" +
    "ABF5AE8CDB0933D71E8C94E04A25619DCEE3D2261AD2EE6BF12FFA06D98A0864D87602733EC86A64521F2B18177B200C" +
    "BBE117577A615D6C770988C0BAD946E208E24FA074E5AB3143DB5BFCE0FD108E4B82D120A93AD2CAFFFFFFFFFFFFFFFF",
);
const G = 2n;
export const CODE = "123456";

/**
 * The pool's password policy (infra/auth.tf, T74): 8 characters or more, nothing else; like
 * Cognito, leading or trailing whitespace fails the API's own pattern first.
 */
function checkPolicy(password: string, prefix: string) {
  // Same "type|message" error as answer()'s fail().
  if (!/^\S(.*\S)?$/s.test(password))
    throw new Error(
      "InvalidParameterException|1 validation error detected: Value at 'password' failed to satisfy constraint: Member must satisfy regular expression pattern: ^[\\S]+.*[\\S]+$",
    );
  if (password.length < 8)
    throw new Error(`InvalidPasswordException|${prefix}: Password not long enough`);
}

function pow(b: bigint, e: bigint, m: bigint) {
  let r = 1n;
  b %= m;
  for (; e > 0n; e >>= 1n, b = (b * b) % m) if (e & 1n) r = (r * b) % m;
  return r;
}
const pad = (n: bigint) => {
  const h = n.toString(16);
  return h.length % 2 ? "0" + h : /^[89a-f]/.test(h) ? "00" + h : h;
};
const H = (data: Buffer | string) => createHash("sha256").update(data).digest("hex");
const HH = (hex: string) => BigInt("0x" + H(Buffer.from(hex, "hex")));
const K = HH(pad(N) + pad(G));
const b64url = (o: unknown) =>
  Buffer.from(JSON.stringify(o)).toString("base64url");

export interface PoolUser {
  userId: string;
  name: string;
  password: string;
  confirmed: boolean;
  /** Created by an administrator: the first sign-in must choose a password. */
  temporary?: boolean;
  totp?: boolean;
  admin?: boolean;
}

export class FakeUserPool {
  readonly users = new Map<string, PoolUser>();
  readonly calls: { action: string; body: any }[] = [];
  readonly revoked: string[] = [];
  /** Refresh tokens handed out, so GlobalSignOut can revoke every one of a user. */
  private readonly issued: string[] = [];
  private readonly sessions = new Map<string, any>();
  readonly poolName: string;
  readonly issuer: string;
  readonly clientId: string;
  /** Replaces the tokens of a successful sign-in (the e2e use fixed ones the API routes expect). */
  tokensFor?: (email: string) => Record<string, unknown>;

  constructor(issuer: string, clientId: string) {
    this.issuer = issuer;
    this.clientId = clientId;
    this.poolName = issuer.split("_").pop()!;
  }

  add(email: string, user: Partial<PoolUser> & { password: string }) {
    this.users.set(email, {
      userId: "uid-" + randomBytes(4).toString("hex"),
      name: email.split("@")[0]!,
      confirmed: true,
      ...user,
    });
  }

  /** Answers one `X-Amz-Target` call: [status, body]. */
  handle(target: string, body: any): [number, unknown] {
    const action = target.replace("AWSCognitoIdentityProviderService.", "");
    this.calls.push({ action, body });
    try {
      return [200, this.answer(action, body)];
    } catch (e) {
      const [type, message = ""] = String((e as Error).message).split("|");
      return [400, { __type: type, message }];
    }
  }

  private answer(action: string, body: any): unknown {
    const fail = (type: string, message?: string): never => {
      throw new Error(message ? `${type}|${message}` : type);
    };
    // Only the access token, no ClientId: every refresh token of its user stops renewing.
    if (action === "GlobalSignOut") {
      const sub = JSON.parse(Buffer.from(String(body.AccessToken).split(".")[1] ?? "", "base64url").toString() || "{}").sub;
      const email = [...this.users].find(([, u]) => u.userId === sub)?.[0];
      if (!email) fail("NotAuthorizedException", "Invalid Access Token");
      this.revoked.push(...this.issued.filter((t) => t.split(":")[1] === email));
      return {};
    }
    if (body.ClientId !== this.clientId) throw new Error("ResourceNotFoundException");
    switch (action) {
      case "InitiateAuth": {
        if (body.AuthFlow === "REFRESH_TOKEN_AUTH") {
          const token = body.AuthParameters.REFRESH_TOKEN;
          const email = token.split(":")[1];
          if (this.revoked.includes(token) || !this.users.has(email))
            fail("NotAuthorizedException", "Refresh Token has been revoked");
          return { AuthenticationResult: this.tokens(email, false) };
        }
        if (body.AuthFlow !== "USER_SRP_AUTH") fail("InvalidParameterException");
        if ("PASSWORD" in body.AuthParameters) fail("InvalidParameterException");
        const email = body.AuthParameters.USERNAME;
        const user = this.users.get(email);
        // prevent_user_existence_errors: an unknown user still gets a challenge.
        const userId = user?.userId ?? "uid-unknown";
        const salt = randomBytes(16).toString("hex");
        const bSmall = BigInt("0x" + randomBytes(32).toString("hex"));
        const v = user ? pow(G, this.x(salt, userId, user.password), N) : 7n;
        const B = (K * v + pow(G, bSmall, N)) % N;
        const session = randomBytes(12).toString("hex");
        this.sessions.set(session, {
          email,
          A: BigInt("0x" + body.AuthParameters.SRP_A),
          B,
          bSmall,
          v,
          salt,
          secretBlock: randomBytes(48).toString("base64"),
        });
        const s = this.sessions.get(session)!;
        return {
          ChallengeName: "PASSWORD_VERIFIER",
          Session: session,
          ChallengeParameters: {
            USER_ID_FOR_SRP: userId,
            SALT: salt,
            SRP_B: B.toString(16),
            SECRET_BLOCK: s.secretBlock,
            USERNAME: userId,
          },
        };
      }
      case "RespondToAuthChallenge": {
        const s = this.sessions.get(body.Session);
        if (!s) fail("NotAuthorizedException", "Invalid session for the user, session is expired.");
        this.sessions.delete(body.Session);
        const user = this.users.get(s!.email);
        const r = body.ChallengeResponses;
        if (body.ChallengeName === "PASSWORD_VERIFIER") {
          if (!user || r.USERNAME !== user.userId) fail("NotAuthorizedException", "Incorrect username or password.");
          const u = HH(pad(s!.A) + pad(s!.B));
          const S = pow((s!.A * pow(s!.v, u, N)) % N, s!.bSmall, N);
          const key = Buffer.from(
            hkdfSync("sha256", Buffer.from(pad(S), "hex"), Buffer.from(pad(u), "hex"), "Caldera Derived Key", 16),
          );
          const expected = createHmac("sha256", key)
            .update(
              Buffer.concat([
                Buffer.from(this.poolName),
                Buffer.from(user!.userId),
                Buffer.from(s!.secretBlock, "base64"),
                Buffer.from(r.TIMESTAMP),
              ]),
            )
            .digest("base64");
          if (r.PASSWORD_CLAIM_SIGNATURE !== expected || r.PASSWORD_CLAIM_SECRET_BLOCK !== s!.secretBlock)
            fail("NotAuthorizedException", "Incorrect username or password.");
          if (!user!.confirmed) fail("UserNotConfirmedException", "User is not confirmed.");
        } else if (body.ChallengeName === "NEW_PASSWORD_REQUIRED") {
          if (s!.next !== "NEW_PASSWORD_REQUIRED") fail("NotAuthorizedException", "Invalid session");
          checkPolicy(r.NEW_PASSWORD, "Password does not conform to policy");
          user!.password = r.NEW_PASSWORD;
          user!.temporary = false;
        } else if (body.ChallengeName === "SOFTWARE_TOKEN_MFA") {
          if (s!.next !== "SOFTWARE_TOKEN_MFA") fail("NotAuthorizedException", "Invalid session");
          if (r.SOFTWARE_TOKEN_MFA_CODE !== CODE) fail("CodeMismatchException");
          s!.totpDone = true;
        } else fail("InvalidParameterException");
        const next = user!.temporary
          ? "NEW_PASSWORD_REQUIRED"
          : user!.totp && !s!.totpDone
            ? "SOFTWARE_TOKEN_MFA"
            : null;
        if (next) {
          const session = randomBytes(12).toString("hex");
          this.sessions.set(session, { ...s, next });
          return {
            ChallengeName: next,
            Session: session,
            ChallengeParameters: next === "NEW_PASSWORD_REQUIRED" ? { requiredAttributes: "[]", userAttributes: "{}" } : {},
          };
        }
        return { AuthenticationResult: this.tokens(s!.email, true), ChallengeParameters: {} };
      }
      case "SignUp": {
        if (this.users.has(body.Username)) fail("UsernameExistsException", "User already exists");
        checkPolicy(body.Password, "Password did not conform with policy");
        const name = body.UserAttributes.find((a: any) => a.Name === "name")?.Value;
        this.add(body.Username, { password: body.Password, name, confirmed: false });
        return {
          UserConfirmed: false,
          CodeDeliveryDetails: { Destination: body.Username[0] + "***@e***", DeliveryMedium: "EMAIL" },
        };
      }
      case "ConfirmSignUp": {
        const user = this.users.get(body.Username);
        if (body.ConfirmationCode !== CODE || !user) fail("CodeMismatchException");
        user!.confirmed = true;
        return {};
      }
      case "ResendConfirmationCode":
      case "ForgotPassword":
        return { CodeDeliveryDetails: { Destination: "e***", DeliveryMedium: "EMAIL" } };
      case "ConfirmForgotPassword": {
        const user = this.users.get(body.Username);
        if (body.ConfirmationCode !== CODE || !user) fail("CodeMismatchException");
        checkPolicy(body.Password, "Password does not conform to policy");
        user!.password = body.Password;
        return {};
      }
      case "RevokeToken":
        this.revoked.push(body.Token);
        return {};
      default:
        return fail("InvalidActionException");
    }
  }

  private x(salt: string, userId: string, password: string) {
    return HH(pad(BigInt("0x" + salt)) + H(`${this.poolName}${userId}:${password}`));
  }

  private tokens(email: string, withRefresh: boolean) {
    if (this.tokensFor) return this.tokensFor(email);
    const user = this.users.get(email)!;
    const now = Math.floor(Date.now() / 1000);
    const refresh = `refresh:${email}:${randomBytes(4).toString("hex")}`;
    if (withRefresh) this.issued.push(refresh);
    const claims = { sub: user.userId, iss: this.issuer, iat: now, exp: now + 900 };
    return {
      AccessToken: `${b64url({ alg: "none" })}.${b64url({ ...claims, token_use: "access", client_id: this.clientId, scope: "aws.cognito.signin.user.admin" })}.sig`,
      IdToken: `${b64url({ alg: "none" })}.${b64url({ ...claims, token_use: "id", aud: this.clientId, email, name: user.name, ...(user.admin && { "cognito:groups": ["admins"] }) })}.sig`,
      ...(withRefresh && { RefreshToken: refresh }),
      ExpiresIn: 900,
      TokenType: "Bearer",
    };
  }
}
