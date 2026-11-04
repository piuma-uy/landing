// Administrar → Usuarios (T106): who administers the shop, add one by email, remove one.
// Framework-free so node --test can load it. Contract: ../piuma-backend/openapi.yaml
// (GET/POST /admin/admins, DELETE /admin/admins/{id}).
import { dateTime } from "./orders";
import type { Request } from "./transfer";

export interface Admin {
  /** Cognito Username: the id of DELETE /admin/admins/{id}. */
  id: string;
  email: string;
  /** CONFIRMED, or FORCE_CHANGE_PASSWORD while the invitation was not used. */
  status: string;
  enabled: boolean;
  /** When the panel added them; null for administrators assigned before T106. */
  since: string | null;
  lastAccessAt: string | null;
  /** The one using the panel. */
  self: boolean;
}
export interface AdminChange {
  action: "added" | "removed";
  at: string;
  byEmail: string;
  targetEmail: string;
  invited: boolean;
}
export interface AdminList {
  items: Admin[];
  changes: AdminChange[];
}
export interface AdminAdded {
  admin: Pick<Admin, "id" | "email" | "status">;
  added: boolean;
  invited: boolean;
}

/** Same rule as the API (src/admins.ts): plain ASCII, lowercase, a dotted domain. */
export const EMAIL_PATTERN =
  /^[a-z0-9](?:[a-z0-9._%+-]{0,62}[a-z0-9_%+-])?@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;
export const normalizeEmail = (value: string) => value.trim().toLowerCase();
export const validEmail = (value: string) => {
  const email = normalizeEmail(value);
  return (
    email.length <= 254 && !email.includes("..") && EMAIL_PATTERN.test(email)
  );
};
export const EMAIL_HINT =
  "Escribí un mail completo, por ejemplo nombre@gmail.com (sin espacios ni tildes).";

export class AdminUsersApi {
  private readonly request: Request;
  constructor(request: Request) {
    this.request = request;
  }
  list() {
    return this.request<AdminList>("/admin/admins");
  }
  add(email: string) {
    return this.request<AdminAdded>("/admin/admins", "POST", {
      email: normalizeEmail(email),
    });
  }
  remove(admin: Pick<Admin, "id">) {
    return this.request<{ removed: boolean }>(
      "/admin/admins/" + encodeURIComponent(admin.id),
      "DELETE",
    );
  }
}

/** The line under each email: invitation pending, or since when. */
export function sinceLabel(admin: Admin) {
  if (admin.status === "FORCE_CHANGE_PASSWORD")
    return "Invitación enviada: todavía no eligió su contraseña";
  if (!admin.enabled) return "Cuenta deshabilitada";
  return admin.since
    ? "Administrador desde el " + dateTime(admin.since)
    : "Administrador desde antes de esta lista";
}
export const accessLabel = (admin: Admin) =>
  admin.lastAccessAt
    ? "Último acceso al panel: " + dateTime(admin.lastAccessAt)
    : "Todavía no entró al panel";

/** "guille@… le dio permisos a ana@…" for the list of latest changes. */
export function changeText(change: AdminChange) {
  return change.action === "added"
    ? `${change.byEmail} le dio permisos a ${change.targetEmail}${change.invited ? " (cuenta nueva, con invitación)" : ""}`
    : `${change.byEmail} le quitó los permisos a ${change.targetEmail}`;
}

/** What Piuma reads after adding someone. */
export function addedNotice(r: AdminAdded) {
  if (!r.added) return `${r.admin.email} ya era administrador`;
  return r.invited
    ? `Listo: ${r.admin.email} ya es administrador. Le enviamos un mail con una contraseña temporal para entrar (vence en 3 días)`
    : `Listo: ${r.admin.email} ya es administrador. Va a ver Administrar cuando vuelva a ingresar`;
}
export const removedNotice = (admin: Pick<Admin, "email">) =>
  `Listo: ${admin.email} ya no es administrador`;
