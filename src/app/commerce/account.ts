// Checks of the account forms (T61), the same in AWS (Cognito) and in Docker (local accounts).
// Framework-free so node --test can load it.

export interface PasswordRule {
  id: string;
  label: string;
  ok: (password: string) => boolean;
  /** Listed only while it fails: rare enough not to lengthen the list. */
  quiet?: boolean;
}

// Cognito counts ASCII letters for upper/lower case, and these as special characters (password policy "require_symbols").
const SYMBOL = /[\^$*.[\]{}()?"!@#%&/\\,><':;|_~`=+\- ]/;

const LENGTH: PasswordRule = {
  id: "length",
  label: "12 caracteres o más",
  ok: (p) => p.length >= 12,
};

/**
 * What a new password needs. Cognito's policy (infra/auth.tf) asks for the four kinds of
 * character; the Docker API only for the length.
 */
export function passwordRules(cognito: boolean): PasswordRule[] {
  if (!cognito) return [LENGTH];
  return [
    LENGTH,
    { id: "upper", label: "Una mayúscula", ok: (p) => /[A-Z]/.test(p) },
    { id: "lower", label: "Una minúscula", ok: (p) => /[a-z]/.test(p) },
    { id: "number", label: "Un número", ok: (p) => /\d/.test(p) },
    {
      id: "symbol",
      label: "Un símbolo, como ! ? # o -",
      ok: (p) => SYMBOL.test(p),
    },
    {
      id: "edges",
      label: "Sin espacios al principio ni al final",
      ok: (p) => p === p.trim(),
      quiet: true,
    },
  ];
}

export const passwordOk = (rules: PasswordRule[], password: string) =>
  rules.every((r) => r.ok(password));

/** Lenient on purpose: the server has the last word; this only catches typos. */
export function emailOk(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/** The six digits of an emailed or authenticator code, ignoring spaces; null otherwise. */
export function codeOf(input: string): string | null {
  const code = input.replace(/\s+/g, "");
  return /^\d{6}$/.test(code) ? code : null;
}

/** Seconds before "Reenviar código" works again, so a tap does not burn Cognito's quota. */
export const RESEND_WAIT_S = 30;
