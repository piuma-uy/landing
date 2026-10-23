import { Injectable, computed, inject, signal } from "@angular/core";
import { RUNTIME_CONFIG } from "./config";
import { CognitoAuth } from "./cognito";
import { AnalyticsService } from "../services/analytics.service";
import {
  ApiError,
  OrderTransfer,
  PaymentMethods,
  SETTINGS_CONFLICT,
  Settings,
  TransferApi,
  statusLabel,
  transferOffered,
} from "./transfer";
import {
  Address,
  Fulfillment,
  SHIPPING_CHANGED,
  ShippingOptions,
  ShippingQuote,
  defaultChoice,
  orderFulfillment,
  quoteBody,
} from "./shipping";
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
  setQuantity,
  unitCount,
} from "./cart";
import { CheckoutAttempts, defaultPayWith, paymentMethodFor } from "./checkout";
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
            fetch: (...args) => fetch(...args),
            storage: sessionStorage,
            crypto,
            now: Date.now,
          },
          location.origin,
        )
      : null;
  readonly view = signal<View>("shop");
  readonly user = signal<User | null>(null);
  readonly products = signal<Product[] | null>(null);
  readonly cart = signal<Line[]>([]);
  readonly orders = signal<Order[]>([]);
  readonly adminProducts = signal<Product[]>([]);
  readonly adminOrders = signal<Order[]>([]);
  readonly pendingTransfers = signal<Order[]>([]);
  readonly settings = signal<Settings | null>(null);
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
  readonly metrics = signal<Metric[]>([]);
  readonly quote = signal<Quote | null>(null);
  readonly completed = signal<Order | null>(null);
  readonly error = signal("");
  readonly notice = signal("");
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
    const response = await fetch(this.base + path, {
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
        this.orders.set([]);
        this.adminOrders.set([]);
        this.adminProducts.set([]);
        this.metrics.set([]);
        this.pendingTransfers.set([]);
        this.settings.set(null);
      }
      throw new ApiError(
        data.error?.message ??
          data.message ??
          "No se pudo completar la operación",
        response.status,
        data.error?.code,
      );
    }
    return data;
  }
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
  async run(fn: () => Promise<void>) {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set("");
    this.notice.set("");
    try {
      await fn();
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : "Ocurrió un error");
    } finally {
      this.busy.set(false);
    }
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
        await this.reloadProducts();
        this.cart.set(this.readGuest());
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
      this.error.set(
        e instanceof ApiError && e.status === 404
          ? "No encontramos ese pedido en tu cuenta."
          : "No pudimos consultar el estado del pago. Probá actualizar en unos segundos.",
      );
    } finally {
      set({ checking: false });
    }
  }
  /** Leaves for Mercado Pago's hosted checkout of this order (same preference every time). */
  private async goToCheckout(order: Order) {
    const url = checkoutUrl(await this.cards.checkout(order.id));
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
  /** Cognito mode: leaves the page for the hosted UI (login, signup or Google). */
  async redirectToLogin(options: { signup?: boolean; provider?: string } = {}) {
    if (!this.cognito) return;
    await this.run(async () => {
      location.assign(await this.cognito!.authorizeUrl(options));
    });
  }
  async reloadProducts() {
    try {
      this.products.set(await this.pages<Product>("/products"));
    } catch (e) {
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
    this.view.set("shop");
    requestAnimationFrame(() =>
      document.getElementById(fragment)?.scrollIntoView({ behavior: "smooth" }),
    );
  }
  open(view: View) {
    if (view === "orders" && this.user()?.admin) view = "admin";
    this.view.set(view);
    this.error.set("");
    this.notice.set("");
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (view === "orders" && this.user())
      void this.run(async () =>
        this.orders.set(await this.pages<Order>("/orders")),
      );
    if (view === "admin" && this.user()?.admin)
      void this.run(() => this.loadAdmin());
  }
  async login(
    input: { email: string; password: string; name?: string },
    register = false,
  ) {
    await this.run(async () => {
      const r = await this.request<{ user: User }>(
        register ? "/auth/register" : "/auth/login",
        "POST",
        input,
      );
      await this.signedIn(r.user);
    });
  }
  // Shared by both modes: keeps the server cart and merges the guest one into it.
  private async signedIn(user: User) {
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
    this.view.set(user.admin ? "admin" : "cart");
    if (user.admin) await this.loadAdmin();
    if (sessionStorage.getItem("piuma-payment-return")) this.resumeReturn();
  }
  async logout() {
    await this.run(async () => {
      this.attempts.end();
      if (this.cognito) {
        location.assign(await this.cognito.logout());
      } else await this.request("/auth/logout", "POST", {});
      this.user.set(null);
      this.cart.set([]);
      this.orders.set([]);
      this.adminOrders.set([]);
      this.adminProducts.set([]);
      this.metrics.set([]);
      this.pendingTransfers.set([]);
      this.settings.set(null);
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
      if (!shipTo) throw new Error("Elegí retiro o envío");
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
      const key = this.attempts.key(JSON.stringify([this.user()!.id, payload]));
      let order: Order;
      try {
        order = await this.request<Order>("/orders", "POST", payload, {
          "Idempotency-Key": key,
        });
      } catch (e) {
        // Transfer or card switched off meanwhile: refresh the options so the buyer can choose again.
        if (
          e instanceof ApiError &&
          (e.code === "TRANSFER_UNAVAILABLE" ||
            e.code === "CARD_PROVIDER_NOT_CONFIGURED")
        ) {
          const methods = await this.transfers.paymentMethods();
          this.paymentMethods.set(methods);
          this.payWith.set(payWithDefault(methods));
        }
        await this.shippingChanged(e);
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
      await this.request("/orders/" + order.id + "/payment", "POST", {});
    });
  }
  async loadAdmin() {
    const [p, m, t, s] = await Promise.all([
      this.pages<Product>("/admin/products"),
      this.pages<Metric>("/admin/metrics"),
      this.transfers.pending<Order>(),
      this.transfers.settings(),
    ]);
    this.adminProducts.set(p);
    this.metrics.set(m);
    this.pendingTransfers.set(t);
    this.settings.set(s);
  }
  async confirmTransfer(order: Order, bankReference: string) {
    await this.run(async () => {
      await this.transfers.confirm(order, bankReference);
      this.pendingTransfers.set(await this.transfers.pending<Order>());
      this.metrics.set(await this.pages<Metric>("/admin/metrics"));
      this.notice.set(
        "Acreditación confirmada. Pedido " +
          (order.transfer?.reference ?? order.id.slice(0, 8)) +
          " pagado",
      );
    });
  }
  async cancelTransfer(order: Order, reason: string) {
    await this.run(async () => {
      await this.transfers.cancel(order, reason);
      this.pendingTransfers.set(await this.transfers.pending<Order>());
      await this.reloadProducts();
      this.notice.set("Pedido cancelado y stock restituido");
    });
  }
  async saveSettings(settings: Settings) {
    await this.run(async () => {
      const r = await this.transfers.saveSettings(settings);
      this.settings.set(r.settings);
      if (r.conflict) throw new Error(SETTINGS_CONFLICT);
      this.notice.set("Configuración guardada");
    });
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
      await this.request("/admin/orders/" + order.id + "/cancel", "POST", {
        reason,
      });
      await this.loadAdmin();
      await this.reloadProducts();
      this.notice.set("Pedido cancelado y stock restituido");
    });
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
