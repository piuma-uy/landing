import { ErrorHandler, Injectable, inject } from "@angular/core";
import { RUNTIME_CONFIG } from "../commerce/config";
import {
  exceptionProperties,
  optedOut,
  referrerOrigin,
  uuidv7,
} from "./analytics-privacy";

type Properties = Record<string, string | number | boolean>;
interface CapturedEvent {
  event: string;
  properties: Record<string, unknown>;
  timestamp: string;
}

const VISIT_KEY = "piuma-visit";
/** Una sesión que entra en un bucle de errores no gasta la cuota gratuita (100k/mes). */
const MAX_EXCEPTIONS = 10;

/**
 * Uso y errores del front en PostHog Cloud (T97), detrás de `posthog` en runtime-config.json
 * (apagado si falta). Ver piuma-backend/docs/monitoreo.md.
 *
 * Sin SDK: cada evento se encola y se manda con fetch (keepalive) a `<host>/batch/`, así la CSP
 * sólo suma ese origen a connect-src y script-src queda en 'self'. Sin cookies ni identificadores
 * persistentes: distinct_id es un id al azar de esta pestaña (sessionStorage) y los eventos son
 * anónimos (`$process_person_profile: false`). Nunca viajan mail, teléfono, dirección ni nombres;
 * de la URL sólo la ruta y del referrer sólo el origen. Respeta Do Not Track y Global Privacy
 * Control (FE-08).
 */
@Injectable({ providedIn: "root" })
export class AnalyticsService {
  private readonly config = inject(RUNTIME_CONFIG).posthog;
  private readonly endpoint =
    this.config && !optedOut(navigator) ? this.config.host + "/batch/" : null;
  private readonly visit = this.endpoint ? visitId() : "";
  private queue: CapturedEvent[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;
  private exceptions = new Set<string>();

  constructor() {
    if (!this.endpoint) return;
    // Lo encolado sale antes de que el navegador congele o cierre la pestaña (p. ej. al ir a Mercado Pago).
    addEventListener("pagehide", () => this.flush());
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") this.flush();
    });
  }

  get enabled(): boolean {
    return this.endpoint !== null;
  }

  /** Página vista: al arrancar y en cada cambio de URL del catálogo. */
  pageview(): void {
    this.capture("$pageview", {
      $referrer: referrerOrigin(document.referrer, location.origin) || "$direct",
      title: document.title,
    });
  }

  /** Eventos del embudo (docs/monitoreo.md). Sólo ids de catálogo, cantidades y medios de pago. */
  event(name: string, data: Properties = {}): void {
    this.capture(name, data);
  }

  /** Error no atrapado del front como `$exception` de PostHog Error Tracking. */
  exception(error: unknown): void {
    if (!this.endpoint) return;
    const properties = exceptionProperties(error, location.origin);
    const key = properties.$exception_list[0]!.value;
    if (this.exceptions.has(key) || this.exceptions.size >= MAX_EXCEPTIONS) return;
    this.exceptions.add(key);
    this.capture("$exception", properties);
    this.flush();
  }

  /** Clicks a WhatsApp desde cualquier parte de la landing: el contacto es la conversión principal. */
  trackWhatsappClicks(): void {
    if (!this.enabled) return;
    document.addEventListener(
      "click",
      (e) => {
        const link = (e.target as Element | null)?.closest?.('a[href^="https://wa.me/"]');
        if (link) this.event("whatsapp_clicked");
      },
      { capture: true },
    );
  }

  private capture(event: string, data: Record<string, unknown>): void {
    if (!this.endpoint) return;
    this.queue.push({
      event,
      timestamp: new Date().toISOString(),
      properties: {
        ...data,
        distinct_id: this.visit,
        $session_id: this.visit,
        $process_person_profile: false,
        $lib: "piuma-web",
        // Sin query ni hash: el callback de Cognito trae code/state y la vuelta de Mercado Pago, ids de pago.
        $current_url: location.origin + location.pathname,
        $host: location.host,
        $pathname: location.pathname,
        $screen_width: screen.width,
        $screen_height: screen.height,
      },
    });
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 2000);
  }

  private flush(): void {
    clearTimeout(this.timer);
    if (!this.endpoint || !this.queue.length) return;
    const batch = this.queue;
    this.queue = [];
    void fetch(this.endpoint, {
      method: "POST",
      keepalive: true,
      credentials: "omit",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: this.config!.key, batch }),
    }).catch(() => {
      /* Analytics nunca rompe la tienda. */
    });
  }
}

function visitId(): string {
  const fresh = () => uuidv7(Date.now(), crypto.getRandomValues(new Uint8Array(16)));
  try {
    const stored = sessionStorage.getItem(VISIT_KEY);
    if (stored && /^[0-9a-f-]{36}$/.test(stored)) return stored;
    const id = fresh();
    sessionStorage.setItem(VISIT_KEY, id);
    return id;
  } catch {
    return fresh();
  }
}

/** Errores no atrapados (también los globales, vía provideBrowserGlobalErrorListeners) a PostHog. */
@Injectable()
export class ReportingErrorHandler extends ErrorHandler {
  private readonly analytics = inject(AnalyticsService);
  override handleError(error: unknown): void {
    super.handleError(error);
    try {
      this.analytics.exception(error);
    } catch {
      /* Reportar nunca agrega otro error. */
    }
  }
}
