import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BUSY_MESSAGE,
  FALLBACK_MESSAGE,
  NETWORK_ERROR,
  NETWORK_MESSAGE,
  PROVIDER_MESSAGE,
  SERVER_ERROR,
  SERVER_MESSAGE,
  SESSION_MESSAGE,
  UNEXPECTED_MESSAGE,
  guardedFetch,
  isNetworkError,
  networkFailure,
  responseFailure,
  retryable,
  shownMessage,
} from "../src/app/commerce/errors.ts";

const envelope = (code: string, message: string) => ({
  error: { code, message, requestId: "r-1" },
});

test("4xx with the API's own code keep its message", () => {
  assert.deepEqual(
    responseFailure(
      409,
      envelope("INSUFFICIENT_STOCK", "No hay stock suficiente"),
    ),
    {
      message: "No hay stock suficiente",
      status: 409,
      code: "INSUFFICIENT_STOCK",
    },
  );
  assert.equal(
    responseFailure(400, envelope("VALIDATION_ERROR", "Datos inválidos"))
      .message,
    "Datos inválidos",
  );
});

test("4xx bodies from the gateway or a proxy never reach the screen", () => {
  // API Gateway JWT authorizer, throttling and CloudFront answer in English or in HTML.
  assert.deepEqual(responseFailure(401, { message: "Unauthorized" }), {
    message: SESSION_MESSAGE,
    status: 401,
    code: undefined,
  });
  assert.equal(
    responseFailure(429, { message: "Too Many Requests" }).message,
    BUSY_MESSAGE,
  );
  assert.equal(
    responseFailure(403, { message: "Forbidden" }).message,
    FALLBACK_MESSAGE,
  );
  assert.equal(responseFailure(404, {}).message, FALLBACK_MESSAGE);
  assert.equal(responseFailure(400, null).message, FALLBACK_MESSAGE);
  assert.equal(
    responseFailure(400, { error: { code: 42, message: ["x"] } }).message,
    FALLBACK_MESSAGE,
  );
});

test("5xx show the outage message, never the server's text", () => {
  assert.deepEqual(
    responseFailure(500, envelope("INTERNAL_ERROR", "Error interno")),
    { message: SERVER_MESSAGE, status: 500, code: "INTERNAL_ERROR" },
  );
  assert.deepEqual(responseFailure(502, "<html>Bad Gateway</html>"), {
    message: SERVER_MESSAGE,
    status: 502,
    code: SERVER_ERROR,
  });
  assert.equal(
    responseFailure(504, { message: "Endpoint request timed out" }).message,
    SERVER_MESSAGE,
  );
});

test("5xx the shop explains keep their meaning", () => {
  for (const code of [
    "PROVIDER_ERROR",
    "PROVIDER_TIMEOUT",
    "PROVIDER_UNAVAILABLE",
  ])
    assert.equal(
      responseFailure(503, envelope(code, "Mercado Pago respondió 500"))
        .message,
      PROVIDER_MESSAGE,
    );
  assert.equal(
    responseFailure(
      503,
      envelope("PAYMENTS_NOT_READY", "El pago todavía no está disponible"),
    ).message,
    "El pago todavía no está disponible",
  );
  // The front reacts to this code (reloads the payment methods): it must survive.
  assert.equal(
    responseFailure(
      503,
      envelope("CARD_PROVIDER_NOT_CONFIGURED", "Pasarela no configurada"),
    ).code,
    "CARD_PROVIDER_NOT_CONFIGURED",
  );
});

test("no answer at all is a network failure", () => {
  assert.deepEqual(networkFailure(), {
    message: NETWORK_MESSAGE,
    status: 0,
    code: NETWORK_ERROR,
  });
  assert.equal(
    NETWORK_MESSAGE,
    "No pudimos conectar con la tienda. Revisá tu conexión y probá de nuevo.",
  );
});

test("fetch rejections of every browser count as network errors", () => {
  assert.ok(isNetworkError(new TypeError("Failed to fetch"))); // Chrome, CORS too
  assert.ok(isNetworkError(new TypeError("Load failed"))); // Safari
  assert.ok(
    isNetworkError(
      new TypeError("NetworkError when attempting to fetch resource."),
    ),
  ); // Firefox
  assert.ok(isNetworkError(new DOMException("timed out", "TimeoutError")));
  assert.ok(isNetworkError(new DOMException("aborted", "AbortError")));
  assert.ok(!isNetworkError(new TypeError("x is undefined")));
  assert.ok(!isNetworkError(new Error("Elegí retiro o envío")));
  assert.ok(!isNetworkError(undefined));
});

test("Reintentar is offered only when trying again can help", () => {
  assert.ok(retryable(0, NETWORK_ERROR));
  assert.ok(retryable(500, "INTERNAL_ERROR"));
  assert.ok(retryable(502));
  assert.ok(retryable(503, "MFA_CHECK_UNAVAILABLE"));
  assert.ok(retryable(503, "PROVIDER_TIMEOUT"));
  assert.ok(retryable(429));
  assert.ok(!retryable(503, "CARD_PROVIDER_NOT_CONFIGURED"));
  assert.ok(!retryable(503, "PAYMENTS_NOT_READY"));
  assert.ok(!retryable(409, "INSUFFICIENT_STOCK"));
  assert.ok(!retryable(401));
});

test("only the shop's own messages are shown", () => {
  class ApiLike extends Error {
    status = 409;
  }
  assert.equal(
    shownMessage(new ApiLike("No hay stock suficiente")),
    "No hay stock suficiente",
  );
  assert.equal(
    shownMessage(new Error("Elegí retiro o envío")),
    "Elegí retiro o envío",
  );
  assert.equal(shownMessage(new TypeError("Failed to fetch")), NETWORK_MESSAGE);
  assert.equal(shownMessage(new TypeError("Load failed")), NETWORK_MESSAGE);
  for (const platform of [
    new TypeError("Cannot read properties of undefined (reading 'items')"),
    new SyntaxError("Unexpected token '<', \"<html>\" is not valid JSON"),
    new RangeError("Invalid time value"),
    new DOMException("The operation is insecure.", "SecurityError"),
    new Error(""),
    "boom",
    undefined,
  ])
    assert.equal(shownMessage(platform), UNEXPECTED_MESSAGE);
});

test("guardedFetch turns a rejection into the shop's error and adds a timeout", async () => {
  let seen: RequestInit | undefined;
  const ok = guardedFetch(
    async (_input, init) => {
      seen = init;
      return new Response("{}");
    },
    () => new Error("no"),
  );
  await ok("https://api.example/products", { method: "GET" });
  assert.equal(seen?.method, "GET");
  assert.ok(seen?.signal instanceof AbortSignal);

  const causes: unknown[] = [];
  const down = guardedFetch(
    async () => {
      throw new TypeError("Failed to fetch");
    },
    (cause, input) => {
      causes.push(cause, input);
      return new Error(NETWORK_MESSAGE);
    },
  );
  await assert.rejects(down("https://api.example/products"), {
    message: NETWORK_MESSAGE,
  });
  assert.equal((causes[0] as Error).message, "Failed to fetch");
  assert.equal(causes[1], "https://api.example/products");
});

test("a request without an answer is dropped after the timeout", async () => {
  const hung = guardedFetch(
    (_input, init) =>
      new Promise<Response>((_resolve, reject) =>
        init?.signal?.addEventListener("abort", () =>
          reject(init.signal!.reason),
        ),
      ),
    (cause) =>
      new Error(isNetworkError(cause) ? NETWORK_MESSAGE : "otro error"),
    20,
  );
  await assert.rejects(hung("https://api.example/products"), {
    message: NETWORK_MESSAGE,
  });
});
