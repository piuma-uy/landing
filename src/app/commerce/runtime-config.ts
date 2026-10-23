// Validation of /runtime-config.json (FE-09). Framework-free so node --test can load it.
// The file is same-origin and written by the deploy, but a typo there must leave the shop
// off instead of half on: anything unexpected turns commerce off and keeps the landing.
import type { CognitoConfig } from "./cognito";

export interface AnalyticsConfig {
  provider: "umami";
  hostUrl: string;
  websiteId: string;
}

export interface RuntimeConfig {
  commerceEnabled: boolean;
  apiBaseUrl: string;
  /** "cookie" (default) talks to the local Docker API; "cognito" to AWS. */
  auth?: "cookie" | "cognito";
  cognito?: CognitoConfig;
  /** Analytics sin cookies (ver AnalyticsService); sin esta clave no se envía nada. */
  analytics?: AnalyticsConfig;
  /** Shows "Tienda de prueba · Sin cobros"; only for stores that never charge (FE-10). */
  testMode?: boolean;
}

export const COMMERCE_OFF: RuntimeConfig = {
  commerceEnabled: false,
  apiBaseUrl: "",
};

const LOCAL_HOSTS = ["localhost", "127.0.0.1"];

function url(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/** True for an http(s) URL on this machine: the Docker API, its simulators and the dev server. */
export function isLocalUrl(value: unknown) {
  const u = url(value);
  return (
    !!u &&
    (u.protocol === "http:" || u.protocol === "https:") &&
    LOCAL_HOSTS.includes(u.hostname)
  );
}

function https(value: unknown) {
  return url(value)?.protocol === "https:";
}

const text = (value: unknown) =>
  typeof value === "string" && value.trim() !== "";

function analyticsOf(raw: unknown): AnalyticsConfig | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const a = raw as Record<string, unknown>;
  return a["provider"] === "umami" &&
    https(a["hostUrl"]) &&
    text(a["websiteId"])
    ? {
        provider: "umami",
        hostUrl: a["hostUrl"] as string,
        websiteId: a["websiteId"] as string,
      }
    : undefined;
}

/** Why the commerce part of the config is refused, or null when it can be used. */
function commerceProblem(c: Record<string, unknown>): string | null {
  const auth = c["auth"] ?? "cookie";
  if (auth !== "cookie" && auth !== "cognito") return "auth desconocido";
  const api = c["apiBaseUrl"];
  // Cookie sessions only exist in the Docker API; a deployed API is always Cognito over https.
  if (auth === "cookie")
    return isLocalUrl(api) ? null : "auth cookie sólo con un API local";
  if (!https(api) && !isLocalUrl(api)) return "apiBaseUrl debe ser https";
  const cognito = c["cognito"] as Record<string, unknown> | undefined;
  if (!cognito || typeof cognito !== "object") return "falta cognito";
  if (!https(cognito["loginUrl"])) return "cognito.loginUrl debe ser https";
  if (!text(cognito["clientId"])) return "falta cognito.clientId";
  for (const key of ["redirectUri", "logoutUri"])
    if (
      cognito[key] !== undefined &&
      !https(cognito[key]) &&
      !isLocalUrl(cognito[key])
    )
      return `cognito.${key} debe ser https`;
  if (cognito["issuer"] !== undefined && !https(cognito["issuer"]))
    return "cognito.issuer debe ser https";
  if (cognito["google"] !== undefined && typeof cognito["google"] !== "boolean")
    return "cognito.google debe ser booleano";
  return null;
}

/**
 * The config the app boots with. Commerce is on only with `commerceEnabled: true` and a
 * coherent API/auth pair; otherwise it stays off (analytics, if valid, still works).
 */
export function parseRuntimeConfig(
  raw: unknown,
  warn: (message: string) => void = () => {},
): RuntimeConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    warn("runtime-config.json inválido: comercio apagado");
    return { ...COMMERCE_OFF };
  }
  const c = raw as Record<string, unknown>;
  const analytics = analyticsOf(c["analytics"]);
  const off: RuntimeConfig = {
    ...COMMERCE_OFF,
    ...(analytics && { analytics }),
  };
  if (c["commerceEnabled"] !== true) return off;
  const problem = commerceProblem(c);
  if (problem) {
    warn(`runtime-config.json: ${problem}; comercio apagado`);
    return off;
  }
  const config: RuntimeConfig = {
    commerceEnabled: true,
    apiBaseUrl: c["apiBaseUrl"] as string,
    auth: c["auth"] === "cognito" ? "cognito" : "cookie",
    testMode: c["testMode"] === true,
    ...(analytics && { analytics }),
  };
  if (config.auth === "cognito") {
    const cognito = c["cognito"] as Record<string, unknown>;
    config.cognito = {
      loginUrl: cognito["loginUrl"] as string,
      clientId: cognito["clientId"] as string,
      ...(text(cognito["redirectUri"]) && {
        redirectUri: cognito["redirectUri"] as string,
      }),
      ...(text(cognito["logoutUri"]) && {
        logoutUri: cognito["logoutUri"] as string,
      }),
      ...(text(cognito["issuer"]) && { issuer: cognito["issuer"] as string }),
      ...(cognito["google"] === true && { google: true }),
    };
  }
  return config;
}
