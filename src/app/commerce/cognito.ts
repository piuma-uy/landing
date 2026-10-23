// Cognito hosted UI: authorization code + PKCE S256 for a public client (no secret).
// Framework-free so it can be unit tested with `node --test` (see tests/cognito.test.ts).
// Tokens live only in memory; sessionStorage keeps the verifier/state/nonce of the
// attempt in flight, because the browser leaves the page to log in.

export interface CognitoConfig {
  loginUrl: string;
  clientId: string;
  redirectUri?: string;
  logoutUri?: string;
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
}

// aws.cognito.signin.user.admin lets an administrator enroll TOTP from the panel (T27/T28).
export const SCOPE =
  "openid email profile piuma/api aws.cognito.signin.user.admin";
const ATTEMPT_KEY = "piuma-oauth";
const ADMIN_GROUP = "admins";
// Refresh a bit before expiry so a request never leaves with a stale token.
const SKEW_MS = 60_000;

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

export class CognitoAuth {
  private accessToken = "";
  private refreshToken = "";
  private expiresAt = 0;
  private refreshing: Promise<boolean> | null = null;
  private profile: CognitoUser | null = null;
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
    this.redirectUri = config.redirectUri || origin + "/";
    this.logoutUri = config.logoutUri || this.redirectUri;
  }

  get user(): CognitoUser | null {
    return this.profile;
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
    return this.accept(tokens, attempt.nonce);
  }

  /** Current access token, renewed with the refresh token when about to expire. */
  async getAccessToken(): Promise<string> {
    if (!this.accessToken) return "";
    if (this.deps.now() < this.expiresAt - SKEW_MS) return this.accessToken;
    return (await this.refresh()) ? this.accessToken : "";
  }

  /** Renews the session once; concurrent callers share the same request. */
  refresh(): Promise<boolean> {
    if (!this.refreshToken) {
      this.clear();
      return Promise.resolve(false);
    }
    this.refreshing ??= this.token({
      grant_type: "refresh_token",
      client_id: this.config.clientId,
      refresh_token: this.refreshToken,
    })
      .then((tokens) => {
        this.accept(tokens);
        return true;
      })
      .catch(() => {
        this.clear();
        return false;
      })
      .finally(() => (this.refreshing = null));
    return this.refreshing;
  }

  /** Revokes the refresh token and returns the Cognito logout URL to navigate to. */
  async logout(): Promise<string> {
    const refreshToken = this.refreshToken;
    this.clear();
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
    this.accessToken = "";
    this.refreshToken = "";
    this.expiresAt = 0;
    this.profile = null;
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
      if (claims["aud"] !== this.config.clientId)
        throw new Error("Token de otra aplicación");
      if (nonce !== undefined && claims["nonce"] !== nonce)
        throw new Error("El ingreso no es válido. Probá de nuevo.");
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
