import { Injectable, inject } from "@angular/core";
import { RUNTIME_CONFIG } from "../commerce/config";

/**
 * Analytics sin cookies, detrás de `analytics` en runtime-config.json (apagado si falta).
 *
 * Proveedor: Umami (open source, sin cookies ni identificadores persistentes, self-hosted o
 * Umami Cloud). No se carga su script: se manda cada evento con fetch a `<hostUrl>/api/send`, así
 * la CSP sólo necesita sumar ese origen a connect-src (script-src queda en 'self').
 * Se respeta Do Not Track.
 */
@Injectable({ providedIn: "root" })
export class AnalyticsService {
  private readonly config = inject(RUNTIME_CONFIG).analytics;
  private readonly endpoint =
    this.config?.provider === "umami" &&
    /^https:\/\/[^/]+/.test(this.config.hostUrl) &&
    this.config.websiteId &&
    navigator.doNotTrack !== "1"
      ? this.config.hostUrl.replace(/\/+$/, "") + "/api/send"
      : null;

  get enabled(): boolean {
    return this.endpoint !== null;
  }

  /** Página vista: al arrancar y en cada cambio de URL del catálogo. */
  pageview(): void {
    this.send();
  }

  event(name: string, data?: Record<string, string | number>): void {
    this.send(name, data);
  }

  /** Clicks a WhatsApp desde cualquier parte de la landing: el contacto es la conversión principal. */
  trackWhatsappClicks(): void {
    if (!this.enabled) return;
    document.addEventListener(
      "click",
      (e) => {
        const link = (e.target as Element | null)?.closest?.('a[href^="https://wa.me/"]');
        if (link) this.event("whatsapp");
      },
      { capture: true },
    );
  }

  private send(name?: string, data?: Record<string, string | number>): void {
    if (!this.endpoint) return;
    const payload = {
      website: this.config!.websiteId,
      hostname: location.hostname,
      language: navigator.language,
      referrer: document.referrer,
      screen: `${screen.width}x${screen.height}`,
      title: document.title,
      // Sin query ni hash: el callback de Cognito trae code/state en la URL.
      url: location.pathname,
      ...(name ? { name, data } : {}),
    };
    void fetch(this.endpoint, {
      method: "POST",
      keepalive: true,
      credentials: "omit",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "event", payload }),
    }).catch(() => {
      /* Analytics nunca rompe la tienda. */
    });
  }
}
