// A new screen or checkout step starts at its top (T72c): smooth, or a jump when the system
// asks for less motion. Framework-free so the service and the checkout share it.
export const scrollBehavior = (): ScrollBehavior =>
  matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";

/** The screen's title takes the focus, so a screen reader starts there; a field keeps it. */
export function focusTitle() {
  if (document.activeElement?.matches("input, select, textarea")) return;
  const title = document.querySelector<HTMLElement>(".commerce h1");
  if (!title) return;
  if (!title.hasAttribute("tabindex")) title.setAttribute("tabindex", "-1");
  title.focus({ preventScroll: true });
}
