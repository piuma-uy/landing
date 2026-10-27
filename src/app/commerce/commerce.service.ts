import { Injectable, computed, inject, isDevMode, signal } from "@angular/core";
import { RUNTIME_CONFIG } from "./config";
import { CognitoAuth, decodeJwt } from "./cognito";
import { AnalyticsService } from "../services/analytics.service";
import {
  ApiError,
  OrderTransfer,
  PaymentMethods,
  Settings,
  TransferApi,
  orderCode,
  statusLabel,
  transferOffered,
  transferSearch,
} from "./transfer";
import {
  Address,
  addressMismatch,
  Fulfillment,
  SHIPPING_CHANGED,
  ShippingOptions,
  ShippingQuote,
  defaultChoice,
  destinations,
  orderFulfillment,
  quoteBody,
  sameChoice,
  shippingInput,
} from "./shipping";
import {
  SHIPPING_PATH,
  isShippingPath,
  shippingPolicy,
} from "../core/shipping-policy";
import {
  CardApi,
  Checkout,
  cardOffered,
  checkoutUrl,
  paymentReturn,
  paymentState,
  pollOrder,
} from "./card";
import {
  addUnit,
  estimateMinor,
  guestCart,
  mergeGuest,
  orderLimitProblem,
  setQuantity,
  unitCount,
} from "./cart";
import {
  CheckoutAttempts,
  clearSession,
  defaultPayWith,
  paymentMethodFor,
} from "./checkout";
import {
  EnrollmentError,
  MFA_CHECK_UNAVAILABLE,
  MFA_REQUIRED,
  MFA_UNAVAILABLE_MESSAGE,
  TotpEnrollment,
  otpauthUrl,
  totpCode,
} from "./mfa";
import {
  SettingsHistoryEntry,
  SettingsHistoryPage,
  bankChange,
  needsOlder,
  ALERT_MAX_PAGES,
} from "./settings-history";
import {
  SECTION_CONFLICT,
  SECTION_SAVED,
  applySection,
  sameForm,
  sectionForm,
  type Forms,
  type SectionId,
} from "./settings-form";
import {
  ORDERS_LINK_CODES,
  ORDER_CANCELLED,
  cancelErrorMessage,
  PAYMENT_METHOD_REQUIRED,
  checkoutLimitMessage,
} from "./orders";
import {
  Failure,
  guardedFetch,
  networkFailure,
  responseFailure,
  retryable,
  shownMessage,
} from "./errors";
const SESSION_EXPIRED =
  "Tu sesión terminó. Ingresá de nuevo para seguir con tu compra.";
const apiError = (f: Failure) => new ApiError(f.message, f.status, f.code);
/** The technical detail of a failure: only in the console of a development build. */
function devLog(...detail: unknown[]) {
  if (isDevMode()) console.error("[tienda]", ...detail);
}
/** Every request of the shop (API, Cognito): with a timeout, and without the browser's texts. */
const safeFetch = guardedFetch(
  (...args) => fetch(...args),
  (cause, input) => {
    devLog("Sin respuesta de", String(input), cause);
    return apiError(networkFailure());
  },
);
export interface User {
  id: string;
  email: string;
  name: string;
  admin: boolean;
}
export interface Product {
  sku: string;
  productId: string;
  categoryId: string;
  name: string;
  size: string;
  color: string;
  description: string;
  image: string;
  priceMinor: number;
  stock: number;
  active: boolean;
  currency: string;
  version: number;
}
export interface Line {
  sku: string;
  quantity: number;
}
export interface Order {
  id: string;
  userId: string;
  contact?: { name: string; email: string; phone: string };
  fulfillment?: string;
  items: (Line & {
    name: string;
    priceMinor: number;
    size: string;
    color: string;
  })[];
  /** Absent on orders created before shipping existed (pickup, no charge). */
  subtotalMinor?: number;
  shipping?: ShippingQuote;
  totalMinor: number;
  currency: string;
  paymentMethod: string;
  status: string;
  createdAt: string;
  cancelledBy?: string;
  cancelReason?: string;
  transfer?: OrderTransfer;
  /** Card, unpaid only: last Mercado Pago state the webhook reported. */
  cardStatus?: "pending" | "failed";
  checkout?: Checkout;
  /** Card orders: the reservation is released after this moment unless Mercado Pago paid. */
  cardExpiresAt?: string;
  /** Orders without payment method: the reservation is released after this moment. */
  pendingExpiresAt?: string;
  paidAt?: string;
}
/** "pending" keeps the order reserved without a payment method (nothing to charge yet). */
export type PayWith = "transfer" | "card" | "pending";
export interface Metric {
  month: string;
  paidOrders: number;
  grossSalesMinor: number;
  unitsSold: number;
  currency: string;
}
export interface Quote {
  items: (Line & {
    name: string;
    priceMinor: number;
    size: string;
    color: string;
  })[];
  subtotalMinor: number;
  /** null only when the quote was asked without a fulfillment choice. */
  shipping: ShippingQuote | null;
  totalMinor: number;
  currency: string;
}
const payWithDefault = (methods: PaymentMethods) =>
  defaultPayWith(transferOffered(methods), cardOffered(methods));
export type View = "shop" | "account" | "cart" | "orders" | "admin" | "payment";
@Injectable({ providedIn: "root" })
export class CommerceService {
  readonly config = inject(RUNTIME_CONFIG);
  readonly enabled = this.config.commerceEnabled;
  private readonly analytics = inject(AnalyticsService);
  // AWS mode (Cognito hosted UI + bearer token); null keeps the local cookie session.
  readonly cognito =
    this.config.auth === "cognito" && this.config.cognito
      ? new CognitoAuth(
          this.config.cognito,
          {
            fetch: safeFetch,
            storage: sessionStorage,
            crypto,
            now: Date.now,
            srp: () => import("./srp"),
          },
          location.origin,
        )
      : null;
  readonly view = signal<View>("shop");
  /** /envios/ (shipping policy) instead of the home sections; same document, no reload (T68). */
  readonly shippingPage = signal(isShippingPath(location.pathname));
  /** The view /envios/ was opened from ("¿Cómo funcionan los envíos?" in the checkout). */
  readonly shippingFrom = signal<View | null>(null);
  /** GET /shipping-options for the policy page and the product line; null until it answers. */
  private readonly publicShipping = signal<ShippingOptions | null>(null);
  private publicShippingAsked = false;
  readonly policy = computed(() =>
    shippingPolicy(this.shippingOptions() ?? this.publicShipping()),
  );
  readonly user = signal<User | null>(null);
  readonly products = signal<Product[] | null>(null);
  readonly cart = signal<Line[]>([]);
  readonly orders = signal<Order[]>([]);
  readonly adminProducts = signal<Product[]>([]);
  readonly adminOrders = signal<Order[]>([]);
  readonly pendingTransfers = signal<Order[]>([]);
  /** Search of "Transferencias por confirmar" (T70): what was searched and what the API found. */
  readonly transferSearch = signal<{ query: string; items: Order[] } | null>(
    null,
  );
  readonly settings = signal<Settings | null>(null);
  /** The API refused /admin/* with MFA_REQUIRED: the panel shows only the TOTP enrollment. */
  readonly mfaRequired = signal(false);
  /** Enrollment in progress: secret and otpauth URL for the authenticator app (memory only). */
  readonly totp = signal<{ secret: string; url: string } | null>(null);
  /** GET /admin/settings/history read so far, newest first, and the cursor for older ones. */
  readonly history = signal<SettingsHistoryEntry[]>([]);
  readonly historyCursor = signal<string | undefined>(undefined);
  /** Bank details changed in the last 7 days: when and by whom. */
  readonly bankAlert = computed(() => bankChange(this.history(), Date.now()));
  readonly paymentMethods = signal<PaymentMethods | null>(null);
  readonly payWith = signal<PayWith>("pending");
  readonly transferEnabled = computed(() =>
    transferOffered(this.paymentMethods()),
  );
  readonly cardEnabled = computed(() => cardOffered(this.paymentMethods()));
  /** Order the buyer came back to from Mercado Pago, as GET /orders/{id} reports it. */
  readonly paymentReturn = signal<{
    orderId: string;
    order: Order | null;
    checking: boolean;
  } | null>(null);
  readonly paymentState = computed(() => {
    const order = this.paymentReturn()?.order;
    return order ? paymentState(order) : null;
  });
  readonly shippingOptions = signal<ShippingOptions | null>(null);
  /** Pickup or a delivery zone; the API prices it in the quote. */
  readonly shipTo = signal<Fulfillment | null>(null);
  /**
   * Checkout "Entrega" (T68): Envío or Retiro first, then one select of places. A place is a
   * zone, or half of the catch-all coordinate zone, so its key is kept apart from the zoneId.
   */
  readonly destinations = computed(() => destinations(this.shippingOptions()));
  private readonly place = signal("");
  /** "Envío" pressed while the quote is still for pickup (no place chosen yet). */
  private readonly wantsDelivery = signal(false);
  readonly delivering = computed(() => {
    const options = this.shippingOptions();
    if (!options) return false;
    return (
      !options.pickup.enabled ||
      this.shipTo()?.method === "delivery" ||
      this.wantsDelivery()
    );
  });
  readonly destination = computed(() => {
    const to = this.shipTo();
    if (to?.method !== "delivery") return null;
    const all = this.destinations().filter((d) => d.zoneId === to.zoneId);
    return all.find((d) => d.key === this.place()) ?? all[0] ?? null;
  });
  readonly metrics = signal<Metric[]>([]);
  /** What "Pedidos pagados" counts, one row per order (T76); null when the API does not list them. */
  readonly paidOrders = signal<Order[] | null>(null);
  private readonly paidCursor = signal<string | undefined>(undefined);
  readonly morePaid = computed(() => !!this.paidCursor());
  readonly quote = signal<Quote | null>(null);
  readonly completed = signal<Order | null>(null);
  readonly error = signal("");
  /** API code of the last error, for errors that offer a way out (TOO_MANY_OPEN_ORDERS). */
  readonly errorCode = signal("");
  /** The token cannot enroll TOTP (session older than the scope, or revoked): log in again. */
  readonly needsRelogin = computed(
    () => this.errorCode() === "NotAuthorizedException",
  );
  /** The error is a reservation limit the buyer gets past from "Mis pedidos". */
  readonly ordersLink = computed(
    () => !!this.error() && ORDERS_LINK_CODES.includes(this.errorCode()),
  );
  readonly notice = signal("");
  /** The action that failed for lack of connection or a down API: "Reintentar" runs it again. */
  private readonly retryFn = signal<(() => Promise<void>) | null>(null);
  readonly canRetry = computed(() => !!this.error() && !!this.retryFn());
  /**
   * The API did not answer the product list: the catalog falls back to the static one (prices
   * and WhatsApp, no cart) until a retry loads it.
   */
  readonly offline = signal(false);
  /** Stock, cart and checkout are on: commerce enabled and the API answering. */
  readonly selling = computed(() => this.enabled && !this.offline());
  readonly busy = signal(false);
  readonly ready = signal(false);
  readonly cartCount = computed(() => unitCount(this.cart()));
  readonly cartRows = computed(() =>
    this.cart().map((l) => ({
      ...l,
      product: this.products()?.find((p) => p.sku === l.sku),
    })),
  );
  readonly subtotal = computed(() =>
    estimateMinor(this.cart(), this.products()),
  );
  private readonly base = this.config.apiBaseUrl
    .replace(
      "localhost",
      location.hostname === "127.0.0.1" ? "127.0.0.1" : "localhost",
    )
    .replace(/\/$/, "");
  private async request<T>(
    path: string,
    method = "GET",
    body?: unknown,
    headers: Record<string, string> = {},
    retried = false,
  ): Promise<T> {
    const token = await this.cognito?.getAccessToken();
    const response = await safeFetch(this.base + path, {
      method,
      credentials: this.cognito ? "omit" : "include",
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: "Bearer " + token } : {}),
        ...headers,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if (response.status === 401 && token && !retried) {
      // Expired or revoked access token: renew once and repeat (same Idempotency-Key).
      if (await this.cognito!.refresh())
        return this.request(path, method, body, headers, true);
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401) {
        this.cognito?.clear();
        this.user.set(null);
        this.clearAdmin();
      }
      const code = data.error?.code;
      // Second factor missing (or turned off meanwhile): hide the panel until it is enrolled.
      if (response.status === 403 && code === MFA_REQUIRED) {
        this.clearAdmin();
        this.mfaRequired.set(true);
      }
      const failure = responseFailure(response.status, data);
      if (retryable(failure.status, failure.code))
        devLog(method, path, response.status, data);
      throw apiError(
        code === MFA_CHECK_UNAVAILABLE
          ? { ...failure, message: MFA_UNAVAILABLE_MESSAGE }
          : failure,
      );
    }
    return data;
  }
  /** Everything the panel loaded; nothing of it survives a lost session or a missing factor. */
  private clearAdmin() {
    this.orders.set([]);
    this.adminOrders.set([]);
    this.adminProducts.set([]);
    this.metrics.set([]);
    this.paidOrders.set(null);
    this.paidCursor.set(undefined);
    this.pendingTransfers.set([]);
    this.transferSearch.set(null);
    this.settings.set(null);
    this.history.set([]);
    this.historyCursor.set(undefined);
  }
  private readonly enrollment = new TotpEnrollment(safeFetch, decodeJwt);
  private readonly transfers = new TransferApi((path, method, body) =>
    this.request(path, method, body),
  );
  private readonly cards = new CardApi(
    (path, method, body, headers) => this.request(path, method, body, headers),
    sessionStorage,
    () => crypto.randomUUID(),
  );
  private readonly attempts = new CheckoutAttempts(sessionStorage, () =>
    crypto.randomUUID(),
  );
  private async pages<T>(path: string): Promise<T[]> {
    const rows: T[] = [];
    let cursor: string | undefined;
    do {
      const p: { items: T[]; nextCursor?: string } = await this.request(
        path + (cursor ? "?cursor=" + encodeURIComponent(cursor) : ""),
      );
      rows.push(...p.items);
      cursor = p.nextCursor;
    } while (cursor);
    return rows;
  }
  private running: Promise<void> = Promise.resolve();
  /** One action at a time: a second click while one is in flight is ignored. */
  async run(fn: () => Promise<void>) {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set("");
    this.errorCode.set("");
    this.notice.set("");
    this.retryFn.set(null);
    this.running = (async () => {
      try {
        await fn();
      } catch (e) {
        // ApiError already logged its detail where it was built.
        if (!(e instanceof ApiError)) devLog(e);
        this.error.set(shownMessage(e));
        if (e instanceof ApiError && retryable(e.status, e.code))
          this.retryFn.set(fn);
        this.errorCode.set(
          (e instanceof ApiError && e.code) ||
            (e instanceof EnrollmentError && e.type) ||
            "",
        );
      } finally {
        this.busy.set(false);
      }
    })();
    await this.running;
  }
  /** "Reintentar": the failed action again (a checkout keeps its Idempotency-Key). */
  retry() {
    const fn = this.retryFn();
    if (fn) void this.run(fn);
  }
  /**
   * The data a view needs is never dropped like a repeated click: "Mis pedidos" or the panel
   * opened while the session or a checkout is still loading waits for it, then loads (T54).
   */
  private async load(fn: () => Promise<void>) {
    while (this.busy()) await this.running;
    await this.run(fn);
  }
  constructor() {
    // Back and forward between /envios/ and the page it was opened from.
    addEventListener("popstate", () => {
      const shipping = isShippingPath(location.pathname);
      if (shipping === this.shippingPage()) return;
      this.shippingPage.set(shipping);
      const from = this.shippingFrom();
      if (!shipping && from) this.view.set(from);
      if (!shipping) this.shippingFrom.set(null);
    });
  }
  async initialize() {
    if (!this.enabled) return;
    await this.run(async () => {
      if (this.cognito) {
        const url = new URL(location.href);
        if (this.cognito.isCallback(url)) {
          // Remove code/state from the history before anything can fail or log it.
          history.replaceState(history.state, "", url.pathname + url.hash);
          await this.reloadProducts();
          await this.signedIn(await this.cognito.handleCallback(url));
          return;
        }
        this.noteReturn(url);
        // The public catalog first, without a token: with the API down nothing below runs and
        // "Reintentar" repeats it all, with this tab's session still kept.
        await this.reloadProducts();
        // A reload or the way back from Mercado Pago: this tab's refresh token renews the
        // session without the password (T61b).
        const restored = await this.cognito.restore();
        if (restored === "expired") {
          this.view.set("account");
          this.notice.set(SESSION_EXPIRED);
          this.cart.set(this.readGuest());
        } else if (restored) await this.signedIn(restored, { restored: true });
        else this.cart.set(this.readGuest());
        return;
      }
      this.noteReturn(new URL(location.href));
      await this.reloadProducts();
      const r = await this.request<{ user: User | null }>("/auth/me");
      this.user.set(r.user);
      if (r.user)
        this.cart.set((await this.request<{ items: Line[] }>("/cart")).items);
      else this.cart.set(this.readGuest());
    });
    this.ready.set(true);
    this.resumeReturn();
  }
  /**
   * Back from Mercado Pago: remember the order (the Cognito login leaves the page) and drop
   * the provider's query params, which are never trusted.
   */
  private noteReturn(url: URL) {
    const orderId = paymentReturn(url);
    if (!orderId) return;
    sessionStorage.setItem("piuma-payment-return", orderId);
    history.replaceState(history.state, "", "/");
  }
  private resumeReturn() {
    const orderId = sessionStorage.getItem("piuma-payment-return");
    if (!orderId) return;
    this.paymentReturn.set({ orderId, order: null, checking: false });
    this.view.set("payment");
    if (this.user()) {
      sessionStorage.removeItem("piuma-payment-return");
      void this.followPayment();
    }
  }
  /** Polls the order until the webhook settles it (or ~30 s pass); never decides by itself. */
  async followPayment() {
    const current = this.paymentReturn();
    if (!current || current.checking) return;
    const set = (patch: Partial<NonNullable<typeof current>>) =>
      this.paymentReturn.update((p) => p && { ...p, ...patch });
    set({ checking: true });
    // A rejected card can continue by transfer when the shop offers it.
    if (!this.paymentMethods())
      this.transfers.paymentMethods().then(
        (m) => this.paymentMethods.set(m),
        () => {},
      );
    try {
      await pollOrder(() => this.cards.order<Order>(current.orderId), {
        onUpdate: (order) => set({ order }),
      });
    } catch (e) {
      if (!(e instanceof ApiError)) devLog(e);
      this.error.set(
        e instanceof ApiError && e.status === 404
          ? "No encontramos ese pedido en tu cuenta."
          : "No pudimos consultar el estado del pago. Probá actualizar en unos segundos.",
      );
      if (e instanceof ApiError && retryable(e.status, e.code))
        this.retryFn.set(() => this.followPayment());
    } finally {
      set({ checking: false });
    }
  }
  /** Leaves for Mercado Pago's hosted checkout of this order (same preference every time). */
  private async goToCheckout(order: Order) {
    const url = checkoutUrl(
      await this.cards.checkout(order.id),
      this.config.apiBaseUrl,
    );
    if (!url) throw new Error("No pudimos abrir el pago. Probá de nuevo.");
    this.analytics.event("pago_tarjeta", {});
    location.assign(url);
  }
  async payWithCard(order: Order) {
    await this.run(() => this.goToCheckout(order));
  }
  /** Card rejected: the same order and reservation continue by bank transfer. */
  async switchToTransfer(order: Order) {
    let stale = false;
    await this.run(async () => {
      let updated: Order;
      try {
        updated = await this.cards.switchToTransfer<Order>(order.id);
      } catch (e) {
        // Paid or cancelled meanwhile, or transfer switched off: show what the API has now.
        stale = e instanceof ApiError && e.status === 409;
        throw e;
      }
      this.paymentReturn.set(null);
      this.completed.set(updated);
      this.view.set("cart");
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    if (stale) {
      this.paymentMethods.set(null);
      void this.followPayment();
    }
  }
  /**
   * Cognito mode: the shop's own forms (T61), or the hosted UI for Google and for a config
   * without the issuer. A session that cannot do what was asked (needsRelogin) ends first.
   */
  async redirectToLogin(options: { signup?: boolean; provider?: string } = {}) {
    if (!this.cognito) return;
    if (this.cognito.forms && !options.provider) {
      if (this.user()) await this.logout();
      this.open("account");
      return;
    }
    await this.run(async () => {
      location.assign(await this.cognito!.authorizeUrl(options));
    });
  }
  async reloadProducts() {
    try {
      this.products.set(await this.pages<Product>("/products"));
      this.offline.set(false);
    } catch (e) {
      this.offline.set(e instanceof ApiError && retryable(e.status, e.code));
      this.products.set([]);
      throw e;
    }
  }
  private readGuest(): Line[] {
    return guestCart(localStorage.getItem("piuma-cart"));
  }
  section(fragment: string) {
    // Con <base href="/">, "#seccion" apunta a "/#seccion": desde una URL del catálogo eso
    // recargaría la página. Volver antes a "/" lo deja en un salto dentro del mismo documento.
    if (location.pathname !== "/")
      history.replaceState(history.state, "", "/" + location.search);
    this.shippingPage.set(false);
    this.view.set("shop");
    requestAnimationFrame(() =>
      document.getElementById(fragment)?.scrollIntoView({ behavior: "smooth" }),
    );
  }
  open(view: View) {
    if (view === "orders" && this.user()?.admin) view = "admin";
    if (this.shippingPage()) {
      history.replaceState(history.state, "", "/" + location.search);
      this.shippingPage.set(false);
    }
    this.view.set(view);
    this.error.set("");
    this.notice.set("");
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (view === "orders" && this.user())
      void this.load(async () =>
        this.orders.set(await this.pages<Order>("/orders")),
      );
    if (view === "admin" && this.user()?.admin)
      void this.load(() => this.loadAdmin());
  }
  /**
   * Docker (cookie) mode: local account. Errors are thrown, not shown in the banner, so the
   * account form shows them next to its fields (T61).
   */
  async login(
    input: { email: string; password: string; name?: string },
    register = false,
  ) {
    const r = await this.request<{ user: User }>(
      register ? "/auth/register" : "/auth/login",
      "POST",
      input,
    );
    await this.enter(r.user);
  }
  /** A session started by the account forms (either mode): cart, panel and pending payment. */
  async enter(user: User) {
    await this.load(() => this.signedIn(user));
  }
  // Shared by both modes: keeps the server cart and merges the guest one into it. A restored
  // session (reload) stays on the page the buyer was looking at.
  private async signedIn(user: User, options: { restored?: boolean } = {}) {
    this.user.set(user);
    const remote = (await this.request<{ items: Line[] }>("/cart")).items;
    const merged = mergeGuest(remote, this.readGuest());
    if (!merged) {
      this.cart.set(remote);
      this.notice.set(
        "Ingresaste. Tu carrito anterior tiene prioridad; revisá los productos antes de agregar otros.",
      );
    } else {
      await this.saveCart(merged);
      localStorage.removeItem("piuma-cart");
    }
    if (options.restored) return;
    this.view.set(user.admin ? "admin" : "cart");
    if (user.admin) await this.loadAdmin();
    if (sessionStorage.getItem("piuma-payment-return")) this.resumeReturn();
  }
  async logout() {
    await this.run(async () => {
      // Checkout attempt, switch keys, payment return and OAuth attempt (FE-06).
      clearSession(sessionStorage);
      if (this.cognito) {
        // The hosted UI (Google) also ends its own cookie; the shop's forms have none (T61).
        const url = await this.cognito.logout();
        if (url) location.assign(url);
      } else await this.request("/auth/logout", "POST", {});
      this.user.set(null);
      this.cart.set([]);
      this.clearAdmin();
      this.mfaRequired.set(false);
      this.totp.set(null);
      this.paymentMethods.set(null);
      this.completed.set(null);
      this.paymentReturn.set(null);
      this.quote.set(null);
      this.view.set("shop");
    });
  }
  private async saveCart(items: Line[]) {
    if (this.user()) await this.request("/cart", "PUT", { items });
    else localStorage.setItem("piuma-cart", JSON.stringify(items));
    this.cart.set(items);
    this.quote.set(null);
    this.completed.set(null);
    this.attempts.end();
  }
  async add(sku: string) {
    await this.run(async () => {
      await this.saveCart(addUnit(this.cart(), this.products(), sku));
      this.notice.set("Producto agregado al carrito");
      this.analytics.event("carrito", { sku });
    });
  }
  async quantity(sku: string, value: number) {
    await this.run(async () => {
      await this.saveCart(setQuantity(this.cart(), sku, value));
    });
  }
  async review() {
    await this.run(async () => {
      const problem = orderLimitProblem(this.cart());
      if (problem) throw new Error(problem);
      await this.reloadProducts();
      const [options, methods] = await Promise.all([
        this.loadShippingOptions(),
        this.transfers.paymentMethods(),
      ]);
      this.paymentMethods.set(methods);
      this.payWith.set(payWithDefault(methods));
      this.quote.set(await this.priceChoice(options));
      this.analytics.event("checkout", { items: this.cartCount() });
    });
  }
  /** Pickup or another zone: the API prices it again; the browser never adds shipping. */
  async chooseShipping(choice: Fulfillment) {
    await this.run(async () => {
      this.shipTo.set(choice);
      try {
        this.quote.set(
          await this.request<Quote>(
            "/cart/quote",
            "POST",
            quoteBody(this.cart(), choice),
          ),
        );
      } catch (e) {
        // Never leave a price on screen that does not match the choice.
        this.quote.set(null);
        await this.shippingChanged(e);
        throw e;
      }
    });
  }
  chooseDelivery(delivery: boolean) {
    this.wantsDelivery.set(delivery);
    if (!delivery && this.shipTo()?.method !== "pickup")
      void this.chooseShipping({ method: "pickup" });
  }
  /** A place from the select; the zone is priced again only when it changes. */
  chooseDestination(key: string) {
    const to = this.destinations().find((d) => d.key === key);
    if (!to) return;
    this.place.set(key);
    const choice = { method: "delivery" as const, zoneId: to.zoneId };
    if (!sameChoice(this.shipTo(), choice)) void this.chooseShipping(choice);
  }
  private async loadShippingOptions() {
    const options = await this.request<ShippingOptions>("/shipping-options");
    this.shippingOptions.set(options);
    this.shipTo.set(defaultChoice(options, this.shipTo()));
    return options;
  }
  private priceChoice(options: ShippingOptions) {
    return this.request<Quote>(
      "/cart/quote",
      "POST",
      quoteBody(this.cart(), defaultChoice(options, this.shipTo())),
    );
  }
  /** Zone or method withdrawn meanwhile: reload the options and price the new default. */
  private async shippingChanged(e: unknown) {
    if (
      !(e instanceof ApiError) ||
      (e.code !== "FULFILLMENT_UNAVAILABLE" &&
        e.code !== "SHIPPING_ZONE_UNAVAILABLE")
    )
      return;
    this.quote.set(null);
    this.quote.set(await this.priceChoice(await this.loadShippingOptions()));
    throw new Error(SHIPPING_CHANGED);
  }
  async checkout(phone: string, address: Address) {
    await this.run(async () => {
      if (!this.user())
        throw new Error("Ingresá a tu cuenta para crear el pedido");
      if (!this.quote())
        throw new Error("Revisá el pedido antes de confirmarlo");
      const shipTo = this.shipTo();
      if (!shipTo) throw new Error("Elegí retiro o adónde te lo llevamos");
      // Same check as the API (409 ADDRESS_ZONE_MISMATCH), before reserving anything.
      const mismatch =
        shipTo.method === "delivery" &&
        addressMismatch(this.shippingOptions(), shipTo.zoneId, address);
      if (mismatch) throw new Error(mismatch);
      const payload = {
        items: this.cart(),
        paymentMethod: paymentMethodFor(
          this.payWith(),
          this.transferEnabled(),
          this.cardEnabled(),
        ),
        ...orderFulfillment(shipTo, address),
        contact: { name: this.user()!.name, email: this.user()!.email, phone },
      };
      const key = await this.attempts.key(
        JSON.stringify([this.user()!.id, payload]),
      );
      let order: Order;
      try {
        order = await this.request<Order>("/orders", "POST", payload, {
          "Idempotency-Key": key,
        });
      } catch (e) {
        // Transfer or card switched off (or on) meanwhile: refresh the options so the buyer can choose again.
        if (
          e instanceof ApiError &&
          (e.code === "TRANSFER_UNAVAILABLE" ||
            e.code === "CARD_PROVIDER_NOT_CONFIGURED" ||
            e.code === PAYMENT_METHOD_REQUIRED)
        ) {
          const methods = await this.transfers.paymentMethods();
          this.paymentMethods.set(methods);
          this.payWith.set(payWithDefault(methods));
        }
        await this.shippingChanged(e);
        // Reservation limits reserve nothing: say how to continue (pay, wait or buy fewer).
        const limit =
          e instanceof ApiError && checkoutLimitMessage(e.code, e.message);
        if (limit) throw new ApiError(limit, e.status, e.code);
        throw e;
      }
      // Created: a later purchase of the same cart is a new order, never a replay of this one.
      this.attempts.end();
      this.completed.set(order);
      this.quote.set(null);
      this.cart.set([]);
      try {
        await this.request("/cart", "PUT", { items: [] });
      } catch {
        this.notice.set(
          "Pedido creado. No se pudo vaciar el carrito guardado; revisalo antes de otra compra.",
        );
      }
      await this.reloadProducts();
      // The order (and its reservation) exists: from here on only its own checkout is paid.
      if (order.paymentMethod === "card" && order.status === "pending_payment")
        await this.goToCheckout(order);
    });
  }
  async payment(order: Order) {
    if (order.paymentMethod === "card") return this.payWithCard(order);
    await this.run(async () => {
      await this.request(
        "/orders/" + encodeURIComponent(order.id) + "/payment",
        "POST",
        {},
      );
    });
  }
  /**
   * The buyer cancels an own unpaid order: the API releases its stock and its place in the
   * open-order limits. The list shows what the API answers; refusals reload it.
   */
  async cancelOwn(order: Order) {
    await this.run(async () => {
      let updated: Order;
      try {
        updated = await this.request<Order>(
          "/orders/" + encodeURIComponent(order.id) + "/cancel",
          "POST",
          {},
        );
      } catch (e) {
        const message = e instanceof ApiError && cancelErrorMessage(e.code);
        if (!message) throw e;
        // Paid or settled meanwhile: show the order as the API has it now.
        this.orders.set(await this.pages<Order>("/orders"));
        throw new ApiError(message, e.status, e.code);
      }
      this.orders.update((rows) =>
        rows.map((o) => (o.id === updated.id ? updated : o)),
      );
      await this.reloadProducts();
      this.notice.set(ORDER_CANCELLED);
    });
  }
  /** Loads the panel; without a second factor it only leaves the enrollment on screen. */
  async loadAdmin() {
    try {
      const [p, m, paid, t, s] = await Promise.all([
        this.pages<Product>("/admin/products"),
        this.pages<Metric>("/admin/metrics"),
        this.loadPaidOrders(),
        this.transfers.pending<Order>(),
        this.transfers.settings(),
        this.loadHistory(),
      ]);
      this.mfaRequired.set(false);
      this.adminProducts.set(p);
      this.metrics.set(m);
      this.setPaid(paid);
      this.pendingTransfers.set(t);
      this.settings.set(s);
    } catch (e) {
      if (e instanceof ApiError && e.code === MFA_REQUIRED) return;
      throw e;
    }
  }
  /** Newest page of paid orders for the Resumen; null from an API without status=paid
   * (deployed before T76). */
  private async loadPaidOrders(cursor?: string) {
    try {
      return await this.request<{ items: Order[]; nextCursor?: string }>(
        "/admin/orders?status=paid" +
          (cursor ? "&cursor=" + encodeURIComponent(cursor) : ""),
      );
    } catch (e) {
      if (e instanceof ApiError && e.code === "INVALID_STATUS_FILTER")
        return null;
      throw e;
    }
  }
  private setPaid(page: { items: Order[]; nextCursor?: string } | null) {
    this.paidOrders.set(page && page.items);
    this.paidCursor.set(page?.nextCursor);
  }
  /** "Ver más pedidos pagados": the next page, after the ones on screen. */
  async loadMorePaid() {
    await this.run(async () => {
      const cursor = this.paidCursor();
      if (!cursor) return;
      const page = await this.loadPaidOrders(cursor);
      if (!page) return;
      this.paidOrders.update((rows) => [...(rows ?? []), ...page.items]);
      this.paidCursor.set(page.nextCursor);
    });
  }
  /**
   * First page of the settings history, plus older ones while they could still hold a bank
   * details change of the alert window (the alert never depends on scrolling the list).
   */
  private async loadHistory() {
    const now = Date.now();
    const rows: SettingsHistoryEntry[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page = await this.historyPage(cursor);
      rows.push(...page.items);
      cursor = page.nextCursor;
    } while (++pages < ALERT_MAX_PAGES && needsOlder(rows, cursor, now));
    this.history.set(rows);
    this.historyCursor.set(cursor);
  }
  private historyPage(cursor?: string) {
    return this.request<SettingsHistoryPage>(
      "/admin/settings/history" +
        (cursor ? "?cursor=" + encodeURIComponent(cursor) : ""),
    );
  }
  async moreHistory() {
    await this.run(async () => {
      const cursor = this.historyCursor();
      if (!cursor) return;
      const page = await this.historyPage(cursor);
      this.history.update((rows) => [...rows, ...page.items]);
      this.historyCursor.set(page.nextCursor);
    });
  }
  /** AWS: asks Cognito for a new TOTP secret and shows it as QR, link and text. */
  async startTotp() {
    await this.run(async () => {
      const user = this.user();
      if (!this.cognito || !user) return;
      const secret = await this.enrollment.associate(
        await this.cognito.getAccessToken(),
      );
      this.totp.set({ secret, url: otpauthUrl(user.email, secret) });
    });
  }
  /** Verifies the first code, makes TOTP the second factor and opens the panel. */
  async confirmTotp(input: string) {
    await this.run(async () => {
      if (!this.cognito || !this.totp()) return;
      const code = totpCode(input);
      if (!code) throw new Error("Escribí los 6 números que muestra la app.");
      await this.enrollment.verify(await this.cognito.getAccessToken(), code);
      this.totp.set(null);
      await this.loadAdmin();
      if (this.mfaRequired())
        throw new Error(
          "Activamos el segundo factor, pero el panel todavía no lo ve. Probá de nuevo en unos segundos.",
        );
      this.notice.set(
        "Segundo factor activado. Desde el próximo ingreso te vamos a pedir el código de la app.",
      );
    });
  }

  /** Searches pending transfers by phone (digits) or name; an empty box shows them all. */
  async searchTransfers(input: string) {
    if (!input.trim()) return this.clearTransferSearch();
    const search = transferSearch(input);
    // Enter while the panel still loads: search once it finishes instead of dropping it.
    await this.load(async () => {
      if (!search)
        throw new Error(
          "Escribí al menos 4 números del teléfono o 2 letras del nombre.",
        );
      this.transferSearch.set({
        query: input.trim(),
        items: await this.transfers.pending<Order>(search),
      });
    });
  }
  clearTransferSearch() {
    this.transferSearch.set(null);
  }
  /** After a confirmation or cancellation: the full list and the open search. */
  private async reloadTransfers() {
    const query = this.transferSearch()?.query;
    const search = query ? transferSearch(query) : null;
    const [all, found] = await Promise.all([
      this.transfers.pending<Order>(),
      search ? this.transfers.pending<Order>(search) : null,
    ]);
    this.pendingTransfers.set(all);
    if (query && found) this.transferSearch.set({ query, items: found });
  }
  async confirmTransfer(order: Order, bankReference: string) {
    await this.run(async () => {
      await this.transfers.confirm(order, bankReference);
      await this.reloadTransfers();
      const [metrics, paid] = await Promise.all([
        this.pages<Metric>("/admin/metrics"),
        this.loadPaidOrders(),
      ]);
      this.metrics.set(metrics);
      this.setPaid(paid);
      this.notice.set(
        "Acreditación confirmada. Pedido " + orderCode(order) + " pagado",
      );
    });
  }
  async cancelTransfer(order: Order, reason: string) {
    await this.run(async () => {
      await this.transfers.cancel(order, reason);
      await this.reloadTransfers();
      await this.reloadProducts();
      this.notice.set("Pedido cancelado y stock restituido");
    });
  }
  /**
   * Saves one section of Configuración on top of the stored settings (T62). A 409 from a change
   * to another section is retried once on the new copy, keeping what Piuma typed; when that same
   * section changed, the form shows the stored values and the section explains why. Returns the
   * message for the section, or "" when the failure went to the usual error notice.
   */
  async saveSettingsSection<K extends SectionId>(id: K, form: Forms[K]) {
    let result = { ok: false, message: "" };
    await this.run(async () => {
      let base = this.settings();
      if (!base) return;
      for (let attempt = 0; ; attempt++) {
        const next = applySection(id, form, base);
        let r: Awaited<ReturnType<TransferApi["saveSettings"]>>;
        try {
          r = await this.transfers.saveSettings({
            ...next,
            shipping: shippingInput(next.shipping),
          });
        } catch (e) {
          if (e instanceof ApiError && e.code === "VALIDATION_ERROR")
            throw new ApiError(
              "No pudimos guardar: revisá los datos de esta sección y probá de nuevo.",
              e.status,
              e.code,
            );
          throw e;
        }
        if (!r.conflict) {
          this.settings.set(r.settings);
          result = { ok: true, message: SECTION_SAVED[id] };
          break;
        }
        const fresh = r.settings;
        if (
          attempt === 0 &&
          sameForm(sectionForm(id, base), sectionForm(id, fresh))
        ) {
          base = fresh;
          continue;
        }
        this.settings.set(fresh);
        result = { ok: false, message: SECTION_CONFLICT };
        break;
      }
      // Saved already: a history that does not reload now stays as it was until the next visit.
      await this.loadHistory().catch(devLog);
    });
    return result;
  }
  async saveProduct(product: Product) {
    await this.run(async () => {
      const { sku, currency, version, ...fields } = product;
      await this.request("/admin/products/" + encodeURIComponent(sku), "PUT", {
        ...fields,
        expectedVersion: version,
      });
      await this.loadAdmin();
      await this.reloadProducts();
      this.notice.set("Producto guardado");
    });
  }
  async cancel(order: Order, reason: string) {
    await this.run(async () => {
      await this.request(
        "/admin/orders/" + encodeURIComponent(order.id) + "/cancel",
        "POST",
        { reason },
      );
      await this.loadAdmin();
      await this.reloadProducts();
      this.notice.set("Pedido cancelado y stock restituido");
    });
  }
  /**
   * "Envíos" links: /envios/ in the same document (a modified click opens it like any link).
   * From the checkout, the browser's back button returns to it with the cart as it was.
   */
  showShipping(event?: MouseEvent) {
    const modified =
      event &&
      (event.button || event.metaKey || event.ctrlKey || event.shiftKey);
    if (modified) return;
    event?.preventDefault();
    if (!this.shippingPage()) {
      this.shippingFrom.set(this.view() === "shop" ? null : this.view());
      history.pushState(null, "", SHIPPING_PATH + location.search);
    }
    this.shippingPage.set(true);
    this.view.set("shop");
    window.scrollTo({ top: 0 });
  }
  /** Zones for the policy page and the product line, asked once (static policy meanwhile). */
  loadPolicy() {
    if (!this.enabled || this.publicShippingAsked || this.shippingOptions())
      return;
    this.publicShippingAsked = true;
    this.request<ShippingOptions>("/shipping-options").then(
      (options) => this.publicShipping.set(options),
      () => (this.publicShippingAsked = false),
    );
  }
  money(minor: number, currency = "UYU") {
    return new Intl.NumberFormat("es-UY", {
      style: "currency",
      currency,
    }).format(minor / 100);
  }
  status(order: Order) {
    return statusLabel(order);
  }
}
