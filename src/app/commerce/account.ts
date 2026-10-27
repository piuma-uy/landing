// Checks of the account forms (T61), the same in AWS (Cognito) and in Docker (local accounts).
// Framework-free so node --test can load it.

export interface PasswordRule {
  id: string;
  label: string;
  /** What the field says when this rule stops the form. */
  problem: string;
  ok: (password: string) => boolean;
  /** Listed only while it fails: rare enough not to lengthen the list. */
  quiet?: boolean;
}

/** Cognito's policy (infra/auth.tf) and the Docker API: length only, no composition rules (T74). */
export const PASSWORD_MIN_LENGTH = 8;

const LENGTH: PasswordRule = {
  id: "length",
  label: `Mínimo ${PASSWORD_MIN_LENGTH} caracteres`,
  problem: `La contraseña necesita ${PASSWORD_MIN_LENGTH} caracteres o más.`,
  ok: (p) => p.length >= PASSWORD_MIN_LENGTH,
};

/**
 * What a new password needs: 8 characters, any of them (NIST SP 800-63B: length over complexity).
 * Cognito also refuses spaces at either end; the Docker API takes them.
 */
export function passwordRules(cognito: boolean): PasswordRule[] {
  if (!cognito) return [LENGTH];
  return [
    LENGTH,
    {
      id: "edges",
      label: "Sin espacios al principio ni al final",
      problem: "Sacá los espacios del principio y del final de la contraseña.",
      ok: (p) => p === p.trim(),
      quiet: true,
    },
  ];
}

/** The message for the first rule the password breaks; "" when it meets them all. */
export const passwordProblem = (rules: PasswordRule[], password: string) =>
  rules.find((r) => !r.ok(password))?.problem ?? "";

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
