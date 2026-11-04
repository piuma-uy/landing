/**
 * El formulario del «Botón de arrepentimiento» (T109): validación, cuerpo de POST /withdrawal-requests
 * y errores del API. Sólo lo importa WithdrawalComponent, así queda fuera del bundle inicial.
 */
import type { WithdrawalForm } from "./withdrawal";
import { responseFailure, retryable, shownMessage } from "../commerce/errors";

export const WITHDRAWAL_REASON_MAX = 500;


export interface WithdrawalReceipt {
  number: string;
  orderCode: string;
  createdAt: string;
}

/** "#a1b2 c3d4" → "A1B2C3D4", como lo guarda el API. */
export const normalizeOrderCode = (code: string) => code.replace(/[\s#]/g, "").toUpperCase();

export type WithdrawalProblems = Partial<Record<keyof WithdrawalForm, string>>;

export const PROBLEMS = {
  orderCode: "Escribí el número de pedido: son 8 letras y números, como figura en el mail o en Mis pedidos.",
  contact: "Escribí el mail o el teléfono con el que hiciste la compra.",
  reason: `El motivo puede tener hasta ${WITHDRAWAL_REASON_MAX} caracteres.`,
} as const;

/**
 * Lo que se puede revisar sin cargar librerías; el API valida el teléfono y el mail con la misma
 * regla de siempre y su 400 vuelve al campo que corresponde (problemsFromApi).
 */
export function checkWithdrawal(form: WithdrawalForm): WithdrawalProblems {
  const problems: WithdrawalProblems = {};
  if (!/^[0-9A-F]{8}$/.test(normalizeOrderCode(form.orderCode))) problems.orderCode = PROBLEMS.orderCode;
  const contact = form.contact.trim();
  const looksLikeMail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact);
  const looksLikePhone = /^[+0-9 ()-]{6,30}$/.test(contact) && contact.replace(/\D/g, "").length >= 6;
  if (!looksLikeMail && !looksLikePhone) problems.contact = PROBLEMS.contact;
  if (form.reason.trim().length > WITHDRAWAL_REASON_MAX) problems.reason = PROBLEMS.reason;
  return problems;
}

/** El cuerpo de POST /withdrawal-requests: sin motivo vacío. */
export function withdrawalBody(form: WithdrawalForm) {
  const reason = form.reason.trim();
  return {
    orderCode: normalizeOrderCode(form.orderCode),
    contact: form.contact.trim(),
    ...(reason ? { reason } : {}),
  };
}

/** details[].path de un 400 VALIDATION_ERROR → el mensaje del campo. */
export function problemsFromApi(details: { path: string }[] | undefined): WithdrawalProblems {
  const problems: WithdrawalProblems = {};
  for (const d of details ?? []) {
    const field = d.path.split(".")[0] as keyof WithdrawalForm;
    if (field in PROBLEMS) problems[field] = PROBLEMS[field];
  }
  return problems;
}

/** "5/1/2027, 11:00" en hora de Uruguay. */
export const receiptTime = (iso: string) =>
  new Intl.DateTimeFormat("es-UY", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Montevideo",
  }).format(new Date(iso));

export type WithdrawalResult =
  | { receipt: WithdrawalReceipt }
  | { problems: WithdrawalProblems }
  | { error: string; retry: boolean };

/**
 * POST /withdrawal-requests (público): la constancia, los problemas por campo de un 400, o el mensaje
 * de cualquier otra falla. `key` es la Idempotency-Key del intento: reintentar con la misma.
 */
export async function sendWithdrawal(
  fetchFn: (path: string, init: RequestInit) => Promise<Response>,
  body: ReturnType<typeof withdrawalBody>,
  key: string,
): Promise<WithdrawalResult> {
  try {
    const response = await fetchFn("/withdrawal-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": key },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok) return { receipt: data as WithdrawalReceipt };
    if (response.status === 400 && data?.error?.code === "VALIDATION_ERROR") {
      const problems = problemsFromApi(data.error.details);
      if (Object.keys(problems).length) return { problems };
    }
    const failure = responseFailure(response.status, data);
    return { error: failure.message, retry: retryable(failure.status, failure.code) };
  } catch (e) {
    return { error: shownMessage(e), retry: true };
  }
}
