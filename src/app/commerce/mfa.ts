// Administrator second factor (T27 contract, option b): the API answers 403 MFA_REQUIRED on
// /admin/* until the user has a verified TOTP, and the panel enrolls it against the Cognito
// user pool API with the user's own access token (scope aws.cognito.signin.user.admin).
// Framework-free so node --test can load it.

/** 403 on /admin/*: administrator without a verified TOTP. */
export const MFA_REQUIRED = "MFA_REQUIRED";
/** 503 on /admin/*: the API could not ask Cognito; retry. */
export const MFA_CHECK_UNAVAILABLE = "MFA_CHECK_UNAVAILABLE";
export const MFA_UNAVAILABLE_MESSAGE =
  "No pudimos comprobar tu segundo factor. Probá de nuevo en unos segundos.";
export const RELOGIN_MESSAGE =
  "Tu sesión no permite activar el segundo factor. Volvé a ingresar y probá de nuevo.";

/**
 * Cognito user pool endpoint of the access token's issuer
 * (iss = https://cognito-idp.<region>.amazonaws.com/<pool id>); null for anything else.
 */
export function idpEndpoint(claims: Record<string, unknown>): string | null {
  const match =
    /^(https:\/\/cognito-idp\.[a-z0-9-]+\.amazonaws\.com)\/[\w-]+$/.exec(
      String(claims["iss"] ?? ""),
    );
  return match ? match[1] + "/" : null;
}

/** What authenticator apps read from the QR (and from the link on the same phone). */
export function otpauthUrl(email: string, secret: string) {
  return `otpauth://totp/Piuma:${encodeURIComponent(email)}?secret=${encodeURIComponent(secret)}&issuer=Piuma`;
}

/** Secret in groups of four, easier to type into the app by hand. */
export function groupSecret(secret: string) {
  return secret.replace(/(.{4})(?=.)/g, "$1 ");
}

/** Six digits, ignoring spaces the app shows in the middle; null otherwise. */
export function totpCode(input: string) {
  const code = input.replace(/\s+/g, "");
  return /^\d{6}$/.test(code) ? code : null;
}

/** Message for a Cognito error type (`__type`, with or without namespace). */
export function enrollmentError(type: string) {
  switch (type.split("#").pop()) {
    case "CodeMismatchException":
    case "EnableSoftwareTokenMFAException":
    case "InvalidParameterException":
      return "El código no coincide. Revisá que la hora del teléfono sea automática y probá con el código nuevo.";
    case "NotAuthorizedException":
      return RELOGIN_MESSAGE;
    case "TooManyRequestsException":
    case "LimitExceededException":
      return "Demasiados intentos. Esperá un minuto y probá de nuevo.";
    case "SoftwareTokenMFANotFoundException":
      return "El alta venció. Generá un código QR nuevo y probá de nuevo.";
    default:
      return "No pudimos activar el segundo factor. Probá de nuevo.";
  }
}

export class EnrollmentError extends Error {
  type: string;
  constructor(type: string) {
    super(enrollmentError(type));
    this.type = type;
  }
}

/** AssociateSoftwareToken → (QR) → VerifySoftwareToken → SetUserMFAPreference. */
export class TotpEnrollment {
  private readonly fetch: typeof fetch;
  private readonly decode: (token: string) => Record<string, unknown>;
  /** `decode` reads the JWT payload (decodeJwt from cognito.ts). */
  constructor(
    fetchFn: typeof fetch,
    decode: (token: string) => Record<string, unknown>,
  ) {
    this.fetch = fetchFn;
    this.decode = decode;
  }

  /** New secret for the user's authenticator app; replaces any unverified one. */
  async associate(accessToken: string): Promise<string> {
    const r = await this.call<{ SecretCode?: string }>(
      accessToken,
      "AssociateSoftwareToken",
      { AccessToken: accessToken },
    );
    if (!r.SecretCode) throw new EnrollmentError("");
    return r.SecretCode;
  }

  /** Checks the first code and makes TOTP the user's second factor. */
  async verify(accessToken: string, code: string) {
    const r = await this.call<{ Status?: string }>(
      accessToken,
      "VerifySoftwareToken",
      {
        AccessToken: accessToken,
        UserCode: code,
        FriendlyDeviceName: "Panel Piuma",
      },
    );
    if (r.Status !== "SUCCESS")
      throw new EnrollmentError("CodeMismatchException");
    await this.call(accessToken, "SetUserMFAPreference", {
      AccessToken: accessToken,
      SoftwareTokenMfaSettings: { Enabled: true, PreferredMfa: true },
    });
  }

  private async call<T>(
    accessToken: string,
    action: string,
    body: unknown,
  ): Promise<T> {
    let endpoint: string | null = null;
    try {
      endpoint = idpEndpoint(this.decode(accessToken));
    } catch {}
    if (!endpoint) throw new EnrollmentError("NotAuthorizedException");
    let response: Response;
    try {
      response = await this.fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-amz-json-1.1",
          "X-Amz-Target": "AWSCognitoIdentityProviderService." + action,
        },
        body: JSON.stringify(body),
      });
    } catch {
      throw new EnrollmentError("");
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new EnrollmentError(String(data.__type ?? ""));
    return data as T;
  }
}
