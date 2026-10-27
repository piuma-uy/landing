// Cognito for a public client (no secret), in two ways that share one session:
// - the shop's own forms (T61) against the user pool API: USER_SRP_AUTH (srp.ts), sign-up with
//   the emailed code, forgotten password and the NEW_PASSWORD_REQUIRED / SOFTWARE_TOKEN_MFA steps;
// - the hosted UI with authorization code + PKCE S256, kept for Google and for configs without
//   the issuer (it names the user pool). sessionStorage keeps the verifier/state/nonce of that
//   attempt, because the browser leaves the page to log in.
// Access and id tokens live only in memory. The refresh token alone is kept in sessionStorage
// (this tab only, gone when it closes), so a reload or the way back from Mercado Pago renews the
// session instead of asking for the password again (T61b). Framework-free so it can be unit tested with `node --test`
// (see tests/cognito.test.ts).
import type * as Srp from "./srp";

export interface CognitoConfig {
  loginUrl: string;
  clientId: string;
  redirectUri?: string;
  logoutUri?: string;
  /** `https://cognito-idp.<region>.amazonaws.com/<userPoolId>`: the id_token's `iss` must match. */
  issuer?: string;
  google?: boolean;
}

export interface CognitoUser {
  id: string;
  email: string;
  name: string;
  admin: boolean;
}

interface Attempt {
  state: string;
  nonce: string;
  verifier: string;
}

/** What the forms ask next after a correct password. */
export type SignInStep = "newPassword" | "totp";
export type SignInResult = { user: CognitoUser } | { next: SignInStep };

/** A user pool API error, with the text the buyer reads. */
export class AuthError extends Error {
  readonly type: string;
  constructor(type: string, awsMessage = "") {
    super(authErrorMessage(type, awsMessage));
    this.type = type.split("#").pop() ?? "";
  }
}

/** Spanish text for a Cognito error (`__type`, with or without namespace, and its message). */
export function authErrorMessage(type: string, awsMessage = ""): string {
  switch (type.split("#").pop()) {
    case "NotAuthorizedException":
      if (/attempts exceeded/i.test(awsMessage)) return TOO_MANY_MESSAGE;
      if (/session/i.test(awsMessage))
        return "Pasó demasiado tiempo. Empezá de nuevo, por favor.";
      if (/disabled/i.test(awsMessage))
        return "Tu cuenta está deshabilitada. Escribinos por WhatsApp y lo vemos.";
      return "El correo o la contraseña no coinciden. Revisalos y probá de nuevo.";
    case "UserNotFoundException":
      return "El correo o la contraseña no coinciden. Revisalos y probá de nuevo.";
    case "UserNotConfirmedException":
      return "Tu cuenta todavía no está confirmada. Te mandamos un código por correo.";
    case "PasswordResetRequiredException":
      return "Tenés que crear una contraseña nueva. Te mandamos un código por correo.";
    case "UsernameExistsException":
    case "AliasExistsException":
      return "Ya hay una cuenta con ese correo. Ingresá o recuperá tu contraseña.";
    case "InvalidPasswordException":
      return passwordMessage(awsMessage);
    case "PasswordHistoryPolicyViolationException":
      return "Esa contraseña ya la usaste antes. Elegí una distinta.";
    case "CodeMismatchException":
      return "El código no coincide. Revisá el último correo que te mandamos.";
    case "ExpiredCodeException":
      return "El código venció. Pedí uno nuevo y probá otra vez.";
    case "TooManyRequestsException":
    case "TooManyFailedAttemptsException":
    case "LimitExceededException":
      return TOO_MANY_MESSAGE;
    case "CodeDeliveryFailureException":
      return "No pudimos mandarte el correo. Probá de nuevo en unos minutos.";
    case "InvalidParameterException":
      // Cognito's own pattern for passwords: no whitespace at either end.
      if (/'password'|password.*pattern/i.test(awsMessage))
        return EDGES_MESSAGE;
      return "Revisá los datos e intentá de nuevo.";
    case "EnableSoftwareTokenMFAException":
      return "El código de tu app autenticadora no coincide. Probá con el código nuevo.";
    case "MFAMethodNotFoundException":
    case "SoftwareTokenMFANotFoundException":
      return "Tu cuenta no tiene app autenticadora configurada. Escribinos por WhatsApp y lo vemos.";
    case "ForbiddenException":
      return "No pudimos procesar el pedido desde esta conexión. Probá de nuevo en unos minutos.";
    case "UserLambdaValidationException":
    case "InvalidLambdaResponseException":
    case "UnexpectedLambdaException":
    case "InvalidUserPoolConfigurationException":
    case "InvalidEmailRoleAccessPolicyException":
    case "ResourceNotFoundException":
    case "InternalErrorException":
      return UNAVAILABLE_MESSAGE;
    case "NetworkError":
      return "No pudimos conectar. Revisá tu conexión y probá de nuevo.";
    default:
      return "No pudimos completar el ingreso. Probá de nuevo en unos minutos.";
  }
}

const UNAVAILABLE_MESSAGE =
  "El ingreso no está disponible en este momento. Probá de nuevo en unos minutos.";
const EDGES_MESSAGE =
  "La contraseña no puede empezar ni terminar con un espacio. Sacalo y probá de nuevo.";

/**
 * InvalidPasswordException says which part of the pool's policy failed ("Password did not conform
 * with policy: Password not long enough"). The policy only asks for 8 characters (T74, as
 * PASSWORD_MIN_LENGTH in account.ts); the other parts only show up while a pool has the old rules.
 */
function passwordMessage(awsMessage: string): string {
  if (/long enough/i.test(awsMessage))
    return "La contraseña es muy corta: tiene que tener 8 caracteres o más.";
  if (/uppercase/i.test(awsMessage)) return "La contraseña necesita al menos una mayúscula.";
  if (/lowercase/i.test(awsMessage)) return "La contraseña necesita al menos una minúscula.";
  if (/numeric/i.test(awsMessage)) return "La contraseña necesita al menos un número.";
  if (/symbol/i.test(awsMessage)) return "La contraseña necesita al menos un símbolo, como ! ? # o -.";
  if (/whitespace|pattern/i.test(awsMessage)) return EDGES_MESSAGE;
  return "Esa contraseña no sirve. Usá 8 caracteres o más, sin espacios al principio ni al final.";
}

const TOO_MANY_MESSAGE =
  "Demasiados intentos seguidos. Esperá unos minutos y probá de nuevo.";

/**
 * User pool API endpoint and pool name of the issuer
 * (`https://cognito-idp.<region>.amazonaws.com/<region>_<name>`); null for anything else.
 */
export function userPoolOf(
  issuer?: string,
): { endpoint: string; poolName: string } | null {
  const match =
    /^https:\/\/(cognito-idp\.[a-z0-9-]+\.amazonaws\.com)\/[a-z0-9-]+_(\w+)\/?$/.exec(
      issuer ?? "",
    );
  return match ? { endpoint: `https://${match[1]}/`, poolName: match[2]! } : null;
}

interface AuthenticationResult {
  AccessToken?: string;
  IdToken?: string;
  RefreshToken?: string;
  ExpiresIn?: number;
}

interface AuthResponse {
  AuthenticationResult?: AuthenticationResult;
  ChallengeName?: string;
  ChallengeParameters?: Record<string, string>;
  Session?: string;
}

interface TokenResponse {
  access_token: string;
  id_token?: string;
  refresh_token?: string;
  expires_in: number;
}

export interface CognitoDeps {
  fetch: typeof fetch;
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  crypto: Crypto;
  now: () => number;
  /** srp.ts, loaded on the first sign-in so the math stays out of the initial bundle. */
  srp?: () => Promise<typeof Srp>;
}

// aws.cognito.signin.user.admin lets an administrator enroll TOTP from the panel (T27/T28) when
// the API requires it (admin_mfa_required, off by default since T59). Requested always, so the
// backend flag can flip without a new frontend.
export const SCOPE =
  "openid email profile piuma/api aws.cognito.signin.user.admin";
const ATTEMPT_KEY = "piuma-oauth";
// Refresh token and where it came from; never the access or id token. The "piuma-" prefix makes
// clearSession (checkout.ts) drop it with the rest of the session on logout.
export const SESSION_KEY = "piuma-session";
const ADMIN_GROUP = "admins";
// Refresh a bit before expiry so a request never leaves with a stale token.
const SKEW_MS = 60_000;
// Clock difference tolerated between the device and Cognito when reading exp/iat.
export const CLOCK_TOLERANCE_MS = 5 * 60_000;

export function base64Url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function randomString(crypto: Crypto, bytes = 32): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function challengeFor(
  crypto: Crypto,
  verifier: string,
): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return base64Url(new Uint8Array(digest));
}

export function decodeJwt(token: string): Record<string, unknown> {
  const part = token.split(".")[1];
  if (!part) throw new Error("Token inválido");
  const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function groupsOf(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {}
  return raw
    .replace(/^\[|\]$/g, "")
    .split(/[ ,]+/)
    .filter(Boolean);
}

/**
 * Why the id_token's claims are refused, or null (FE-05). Signature is not checked here: the
 * token only feeds the display, and the API authorizes with the access token.
 */
export function idTokenProblem(
  claims: Record<string, unknown>,
  expected: { clientId: string; issuer?: string; nonce?: string; now: number },
): string | null {
  const aud = claims["aud"];
  if (
    !(Array.isArray(aud)
      ? aud.includes(expected.clientId)
      : aud === expected.clientId)
  )
    return "aud";
  if (expected.issuer && claims["iss"] !== expected.issuer.replace(/\/$/, ""))
    return "iss";
  const exp = claims["exp"];
  if (typeof exp !== "number" || exp * 1000 < expected.now - CLOCK_TOLERANCE_MS)
    return "exp";
  const iat = claims["iat"];
  if (
    iat !== undefined &&
    (typeof iat !== "number" || iat * 1000 > expected.now + CLOCK_TOLERANCE_MS)
  )
    return "iat";
  if (expected.nonce !== undefined && claims["nonce"] !== expected.nonce)
    return "nonce";
  return null;
}

export class CognitoAuth {
  private accessToken = "";
  private refreshToken = "";
  private expiresAt = 0;
  private refreshing: Promise<boolean> | null = null;
  private profile: CognitoUser | null = null;
  /** Where the session came from: the refresh and the logout differ. */
  private source: "forms" | "hosted" = "hosted";
  /** Step after the password (NEW_PASSWORD_REQUIRED, SOFTWARE_TOKEN_MFA), only in memory. */
  private challenge: { name: string; session: string; username: string } | null =
    null;
  private readonly pool: { endpoint: string; poolName: string } | null;
  private readonly config: CognitoConfig;
  private readonly deps: CognitoDeps;
  private readonly base: string;
  readonly redirectUri: string;
  readonly logoutUri: string;

  // Plain fields instead of parameter properties: Node's type stripping rejects them.
  constructor(config: CognitoConfig, deps: CognitoDeps, origin: string) {
    this.config = config;
    this.deps = deps;
    this.base = config.loginUrl.replace(/\/$/, "");
    this.pool = userPoolOf(config.issuer);
    this.redirectUri = config.redirectUri || origin + "/";
    // Cognito compares logout_uri with the client's sign-out URLs character by character, and
    // those are the bare origin (infra `logout_urls`): with "/" it shows its error page (T61c).
    this.logoutUri = config.logoutUri || origin;
  }

  get user(): CognitoUser | null {
    return this.profile;
  }

  /** The shop's own forms work: the issuer names the user pool. Otherwise, the hosted UI. */
  get forms(): boolean {
    return !!this.pool;
  }

  /** USER_SRP_AUTH: the password only signs Cognito's challenge, it is never sent. */
  async signIn(email: string, password: string): Promise<SignInResult> {
    const pool = this.pool;
    if (!pool || !this.deps.srp) throw new AuthError("");
    let srp: typeof Srp;
    try {
      srp = await this.deps.srp();
    } catch {
      // A deploy replaced the chunk, or the connection dropped while loading it.
      throw new AuthError("NetworkError");
    }
    const client = srp.srpClient(this.deps.crypto);
    const start = await this.idp<AuthResponse>("InitiateAuth", {
      AuthFlow: "USER_SRP_AUTH",
      ClientId: this.config.clientId,
      AuthParameters: { USERNAME: email, SRP_A: client.A },
    });
    const p = start.ChallengeParameters ?? {};
    if (
      start.ChallengeName !== "PASSWORD_VERIFIER" ||
      !p["USER_ID_FOR_SRP"] ||
      !p["SALT"] ||
      !p["SRP_B"] ||
      !p["SECRET_BLOCK"]
    )
      throw new AuthError("");
    const timestamp = srp.srpTimestamp(new Date(this.deps.now()));
    const signature = await srp.passwordSignature(this.deps.crypto, client, {
      poolName: pool.poolName,
      userId: p["USER_ID_FOR_SRP"],
      password,
      salt: p["SALT"],
      srpB: p["SRP_B"],
      secretBlock: p["SECRET_BLOCK"],
      timestamp,
    });
    return this.respond(
      "PASSWORD_VERIFIER",
      {
        USERNAME: p["USER_ID_FOR_SRP"],
        PASSWORD_CLAIM_SECRET_BLOCK: p["SECRET_BLOCK"],
        TIMESTAMP: timestamp,
        PASSWORD_CLAIM_SIGNATURE: signature,
      },
      start.Session,
    );
  }

  /** NEW_PASSWORD_REQUIRED: an account created by an administrator picks its own password. */
  completeNewPassword(password: string): Promise<SignInResult> {
    return this.continueChallenge("NEW_PASSWORD_REQUIRED", {
      NEW_PASSWORD: password,
    });
  }

  /** SOFTWARE_TOKEN_MFA: only when the pool requires TOTP (admin_mfa_required). */
  completeTotp(code: string): Promise<SignInResult> {
    return this.continueChallenge("SOFTWARE_TOKEN_MFA", {
      SOFTWARE_TOKEN_MFA_CODE: code,
    });
  }

  /** Creates the account; Cognito emails a code to confirm it. Returns the masked address. */
  async signUp(input: {
    email: string;
    password: string;
    name: string;
  }): Promise<string> {
    const r = await this.idp<{
      CodeDeliveryDetails?: { Destination?: string };
    }>("SignUp", {
      ClientId: this.config.clientId,
      Username: input.email,
      Password: input.password,
      UserAttributes: [
        { Name: "email", Value: input.email },
        { Name: "name", Value: input.name },
      ],
    });
    return r.CodeDeliveryDetails?.Destination ?? input.email;
  }

  async confirmSignUp(email: string, code: string) {
    await this.idp("ConfirmSignUp", {
      ClientId: this.config.clientId,
      Username: email,
      ConfirmationCode: code,
    });
  }

  async resendSignUpCode(email: string) {
    await this.idp("ResendConfirmationCode", {
      ClientId: this.config.clientId,
      Username: email,
    });
  }

  /** Emails a code to set a new password (same answer whether the account exists or not). */
  async forgotPassword(email: string) {
    await this.idp("ForgotPassword", {
      ClientId: this.config.clientId,
      Username: email,
    });
  }

  async confirmForgotPassword(email: string, code: string, password: string) {
    await this.idp("ConfirmForgotPassword", {
      ClientId: this.config.clientId,
      Username: email,
      ConfirmationCode: code,
      Password: password,
    });
  }

  /** Builds the hosted UI URL and stores the attempt; the caller navigates to it. */
  async authorizeUrl(
    options: { signup?: boolean; provider?: string } = {},
  ): Promise<string> {
    const attempt: Attempt = {
      state: randomString(this.deps.crypto),
      nonce: randomString(this.deps.crypto),
      verifier: randomString(this.deps.crypto, 48),
    };
    this.deps.storage.setItem(ATTEMPT_KEY, JSON.stringify(attempt));
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      response_type: "code",
      redirect_uri: this.redirectUri,
      scope: SCOPE,
      state: attempt.state,
      nonce: attempt.nonce,
      code_challenge_method: "S256",
      code_challenge: await challengeFor(this.deps.crypto, attempt.verifier),
    });
    if (options.provider) params.set("identity_provider", options.provider);
    const path = options.signup ? "/signup" : "/oauth2/authorize";
    return `${this.base}${path}?${params}`;
  }

  /** True when the URL carries an OAuth response meant for this app. */
  isCallback(url: URL): boolean {
    return (
      url.searchParams.has("state") &&
      (url.searchParams.has("code") || url.searchParams.has("error"))
    );
  }

  /** Validates state, exchanges the code and loads the session in memory. */
  async handleCallback(url: URL): Promise<CognitoUser> {
    let attempt: Attempt | null = null;
    try {
      attempt = JSON.parse(this.deps.storage.getItem(ATTEMPT_KEY) ?? "null");
    } catch {}
    this.deps.storage.removeItem(ATTEMPT_KEY);
    const state = url.searchParams.get("state");
    if (!attempt || !state || state !== attempt.state)
      throw new Error("El ingreso expiró o no es válido. Probá de nuevo.");
    if (url.searchParams.has("error"))
      throw new Error("No se pudo completar el ingreso. Probá de nuevo.");
    const tokens = await this.token({
      grant_type: "authorization_code",
      client_id: this.config.clientId,
      redirect_uri: this.redirectUri,
      code: url.searchParams.get("code") ?? "",
      code_verifier: attempt.verifier,
    });
    const user = this.accept(tokens, attempt.nonce);
    this.source = "hosted";
    this.persist();
    return user;
  }

  /** Current access token, renewed with the refresh token when about to expire. */
  async getAccessToken(): Promise<string> {
    if (!this.accessToken) return "";
    if (this.deps.now() < this.expiresAt - SKEW_MS) return this.accessToken;
    return (await this.refresh()) ? this.accessToken : "";
  }

  /**
   * On load: renews the session kept by this tab. "expired" when there was one and Cognito no
   * longer renews it (revoked, past its validity): it is forgotten and the buyer signs in again.
   */
  async restore(): Promise<CognitoUser | "expired" | null> {
    let saved: { refreshToken?: unknown; source?: unknown } | null = null;
    try {
      saved = JSON.parse(this.deps.storage.getItem(SESSION_KEY) ?? "null");
    } catch {}
    if (!saved) return null;
    if (typeof saved.refreshToken !== "string" || !saved.refreshToken) {
      this.clear();
      return "expired";
    }
    this.refreshToken = saved.refreshToken;
    this.source = saved.source === "forms" ? "forms" : "hosted";
    return (await this.refresh()) && this.profile ? this.profile : "expired";
  }

  /** Renews the session once; concurrent callers share the same request. */
  refresh(): Promise<boolean> {
    if (!this.refreshToken) {
      this.clear();
      return Promise.resolve(false);
    }
    if (this.refreshing) return this.refreshing;
    const renewed =
      this.source === "forms"
        ? this.idp<AuthResponse>("InitiateAuth", {
            AuthFlow: "REFRESH_TOKEN_AUTH",
            ClientId: this.config.clientId,
            AuthParameters: { REFRESH_TOKEN: this.refreshToken },
          }).then((r) => tokensOf(r.AuthenticationResult))
        : this.token({
            grant_type: "refresh_token",
            client_id: this.config.clientId,
            refresh_token: this.refreshToken,
          });
    this.refreshing = renewed
      .then((tokens) => {
        this.accept(tokens);
        this.persist();
        return true;
      })
      .catch(() => {
        this.clear();
        return false;
      })
      .finally(() => (this.refreshing = null));
    return this.refreshing;
  }

  /**
   * Revokes the refresh token (and the access tokens issued with it). A hosted UI session also
   * returns the Cognito logout URL to navigate to, which ends its cookie; the forms have none.
   */
  async logout(): Promise<string | null> {
    const refreshToken = this.refreshToken;
    const source = this.source;
    this.clear();
    if (source === "forms") {
      if (refreshToken)
        await this.idp("RevokeToken", {
          Token: refreshToken,
          ClientId: this.config.clientId,
        }).catch(() => undefined);
      return null;
    }
    if (refreshToken)
      await this.deps
        .fetch(this.base + "/oauth2/revoke", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            token: refreshToken,
            client_id: this.config.clientId,
          }),
        })
        .catch(() => undefined);
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      logout_uri: this.logoutUri,
    });
    return `${this.base}/logout?${params}`;
  }

  clear() {
    this.challenge = null;
    this.accessToken = "";
    this.refreshToken = "";
    this.expiresAt = 0;
    this.profile = null;
    this.deps.storage.removeItem(SESSION_KEY);
  }

  /** Keeps only the refresh token for this tab (see the top of the file). */
  private persist() {
    if (!this.refreshToken) return;
    this.deps.storage.setItem(
      SESSION_KEY,
      JSON.stringify({ refreshToken: this.refreshToken, source: this.source }),
    );
  }

  private continueChallenge(
    name: string,
    responses: Record<string, string>,
  ): Promise<SignInResult> {
    const challenge = this.challenge;
    if (!challenge || challenge.name !== name)
      return Promise.reject(new AuthError("NotAuthorizedException", "session"));
    return this.respond(
      name,
      { USERNAME: challenge.username, ...responses },
      challenge.session,
    );
  }

  private async respond(
    name: string,
    responses: Record<string, string>,
    session?: string,
  ): Promise<SignInResult> {
    const r = await this.idp<AuthResponse>("RespondToAuthChallenge", {
      ChallengeName: name,
      ClientId: this.config.clientId,
      ChallengeResponses: responses,
      ...(session && { Session: session }),
    });
    if (r.AuthenticationResult) {
      const user = this.accept(tokensOf(r.AuthenticationResult));
      this.source = "forms";
      this.challenge = null;
      this.persist();
      return { user };
    }
    const next: SignInStep | null =
      r.ChallengeName === "NEW_PASSWORD_REQUIRED"
        ? "newPassword"
        : r.ChallengeName === "SOFTWARE_TOKEN_MFA"
          ? "totp"
          : null;
    if (!next || !r.Session) throw new AuthError("");
    this.challenge = {
      name: r.ChallengeName!,
      session: r.Session,
      username: r.ChallengeParameters?.["USER_ID_FOR_SRP"] ?? responses["USERNAME"]!,
    };
    return { next };
  }

  /** Unauthenticated call to the user pool API (Cognito answers CORS for any origin). */
  private async idp<T = unknown>(action: string, body: unknown): Promise<T> {
    if (!this.pool) throw new AuthError("");
    let response: Response;
    try {
      response = await this.deps.fetch(this.pool.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-amz-json-1.1",
          "X-Amz-Target": "AWSCognitoIdentityProviderService." + action,
        },
        body: JSON.stringify(body),
      });
    } catch {
      throw new AuthError("NetworkError");
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new AuthError(String(data.__type ?? ""), String(data.message ?? ""));
    return data as T;
  }

  private async token(body: Record<string, string>): Promise<TokenResponse> {
    const response = await this.deps.fetch(this.base + "/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body),
    });
    if (!response.ok)
      throw new Error("No se pudo completar el ingreso. Probá de nuevo.");
    const tokens = (await response.json()) as TokenResponse;
    if (!tokens.access_token)
      throw new Error("No se pudo completar el ingreso. Probá de nuevo.");
    return tokens;
  }

  // The id_token is only read for display (name, email, admin menu); the API
  // authorizes with the access token, whose signature API Gateway verifies.
  private accept(tokens: TokenResponse, nonce?: string): CognitoUser {
    let profile = this.profile;
    if (tokens.id_token) {
      const claims = decodeJwt(tokens.id_token);
      const problem = idTokenProblem(claims, {
        clientId: this.config.clientId,
        issuer: this.config.issuer,
        nonce,
        now: this.deps.now(),
      });
      if (problem === "aud") throw new Error("Token de otra aplicación");
      if (problem) throw new Error("El ingreso no es válido. Probá de nuevo.");
      const email = typeof claims["email"] === "string" ? claims["email"] : "";
      profile = {
        id: String(claims["sub"] ?? ""),
        email,
        name:
          (typeof claims["name"] === "string" && claims["name"]) ||
          email.split("@")[0] ||
          "",
        admin: groupsOf(claims["cognito:groups"]).includes(ADMIN_GROUP),
      };
    }
    if (!profile) throw new Error("Falta el perfil del usuario");
    this.profile = profile;
    this.accessToken = tokens.access_token;
    if (tokens.refresh_token) this.refreshToken = tokens.refresh_token;
    this.expiresAt = this.deps.now() + tokens.expires_in * 1000;
    return profile;
  }
}

function tokensOf(result?: AuthenticationResult): TokenResponse {
  if (!result?.AccessToken) throw new AuthError("");
  return {
    access_token: result.AccessToken,
    id_token: result.IdToken,
    refresh_token: result.RefreshToken,
    expires_in: result.ExpiresIn ?? 3600,
  };
}
