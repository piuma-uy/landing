// What the buyer reads when a request to the API fails (T58). Framework-free so node --test can load it.
// The browser's own texts ("Failed to fetch", "Load failed", "NetworkError when attempting…") and
// gateway bodies in English ({"message":"Unauthorized"}) never reach the screen: the technical
// detail goes to the console of a development build only.

/** No answer at all: offline, DNS, CORS refused, connection reset or the request timed out. */
export const NETWORK_ERROR = "NETWORK_ERROR";
/** 5xx without a code the shop explains on its own. */
export const SERVER_ERROR = "SERVER_ERROR";
export const NETWORK_MESSAGE =
  "No pudimos conectar con la tienda. Revisá tu conexión y probá de nuevo.";
export const SERVER_MESSAGE =
  "La tienda no está respondiendo en este momento. Probá de nuevo en unos minutos.";
export const PROVIDER_MESSAGE =
  "Mercado Pago no está respondiendo. Probá de nuevo en unos minutos.";
export const SESSION_MESSAGE = "Tu sesión venció. Ingresá de nuevo.";
export const BUSY_MESSAGE =
  "Hay muchas consultas en este momento. Esperá unos segundos y probá de nuevo.";
export const FALLBACK_MESSAGE = "No se pudo completar la operación";
export const UNEXPECTED_MESSAGE = "Algo salió mal. Probá de nuevo.";
/** A phone on a weak signal still answers well before this; past it the request is dropped. */
export const REQUEST_TIMEOUT_MS = 20000;

/** Mercado Pago did not answer the API (its text says "respondió 500"). */
const PROVIDER_CODES = ["PROVIDER_ERROR", "PROVIDER_TIMEOUT", "PROVIDER_UNAVAILABLE"];
/** 5xx whose message is already written for the buyer: a setting, not an outage. */
const CONFIG_CODES = ["CARD_PROVIDER_NOT_CONFIGURED", "PAYMENTS_NOT_READY"];

export interface Failure {
  message: string;
  /** 0 when no response arrived. */
  status: number;
  code?: string;
}

const record = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;

/**
 * A response that is not ok. Only the API's own envelope ({ error: { code, message } }) is shown
 * as is; anything else (API Gateway, CloudFront, a proxy) gets a message by status.
 */
export function responseFailure(status: number, body: unknown): Failure {
  const error = record(record(body)?.["error"]);
  const code = typeof error?.["code"] === "string" ? error["code"] : undefined;
  const message =
    typeof error?.["message"] === "string" ? error["message"] : "";
  if (status >= 500) {
    if (code && PROVIDER_CODES.includes(code))
      return { message: PROVIDER_MESSAGE, status, code };
    if (code && CONFIG_CODES.includes(code) && message)
      return { message, status, code };
    return { message: SERVER_MESSAGE, status, code: code ?? SERVER_ERROR };
  }
  if (code && message) return { message, status, code };
  if (status === 401) return { message: SESSION_MESSAGE, status, code };
  if (status === 429) return { message: BUSY_MESSAGE, status, code };
  return { message: FALLBACK_MESSAGE, status, code };
}

export const networkFailure = (): Failure => ({
  message: NETWORK_MESSAGE,
  status: 0,
  code: NETWORK_ERROR,
});

/** How fetch rejects when nothing came back, in Chrome, Safari and Firefox, or on our timeout. */
export function isNetworkError(e: unknown): boolean {
  const name = record(e)?.["name"];
  if (name === "AbortError" || name === "TimeoutError" || name === "NetworkError")
    return true;
  return (
    e instanceof TypeError &&
    /fetch|network|load failed|connection/i.test(e.message)
  );
}

/** Worth a "Reintentar": nothing came back, the API is down or busy, or the 5xx says to retry. */
export function retryable(status: number, code?: string): boolean {
  if (status === 0 || status === 429) return true;
  return status >= 500 && !(code && CONFIG_CODES.includes(code));
}

/**
 * The text for any error that reaches the screen. Errors the shop throws (Error, ApiError and
 * the like) are written in Spanish for the buyer; the platform's own (TypeError, SyntaxError,
 * DOMException…) are not, and are never shown.
 */
export function shownMessage(e: unknown): string {
  if (isNetworkError(e)) return NETWORK_MESSAGE;
  if (
    !(e instanceof Error) ||
    !e.message ||
    e instanceof TypeError ||
    e instanceof SyntaxError ||
    e instanceof RangeError ||
    e instanceof ReferenceError ||
    e instanceof URIError ||
    e instanceof EvalError ||
    (typeof DOMException !== "undefined" && e instanceof DOMException)
  )
    return UNEXPECTED_MESSAGE;
  return e.message;
}

/**
 * fetch that never hangs and never rejects with the browser's text: a request without an answer
 * in `timeoutMs` is dropped, and a rejection becomes `onNetworkError(cause)` (ApiError NETWORK_ERROR).
 */
export function guardedFetch(
  fetchFn: typeof fetch,
  onNetworkError: (cause: unknown, input: RequestInfo | URL) => Error,
  timeoutMs = REQUEST_TIMEOUT_MS,
): typeof fetch {
  return async (input, init = {}) => {
    const signal = init.signal ?? AbortSignal.timeout(timeoutMs);
    try {
      return await fetchFn(input, { ...init, signal });
    } catch (e) {
      throw onNetworkError(e, input);
    }
  };
}
