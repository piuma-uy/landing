import { Injectable, computed, inject, signal } from "@angular/core";
import { RUNTIME_CONFIG } from "./config";
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
  totalMinor: number;
  currency: string;
  paymentMethod: string;
  status: string;
  createdAt: string;
  cancelReason?: string;
}
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
  totalMinor: number;
  currency: string;
}
export type View = "shop" | "account" | "cart" | "orders" | "admin";
@Injectable({ providedIn: "root" })
export class CommerceService {
  readonly config = inject(RUNTIME_CONFIG);
  readonly enabled = this.config.commerceEnabled;
  readonly view = signal<View>("shop");
  readonly user = signal<User | null>(null);
  readonly products = signal<Product[] | null>(null);
  readonly cart = signal<Line[]>([]);
  readonly orders = signal<Order[]>([]);
  readonly adminProducts = signal<Product[]>([]);
  readonly adminOrders = signal<Order[]>([]);
  readonly metrics = signal<Metric[]>([]);
  readonly quote = signal<Quote | null>(null);
  readonly completed = signal<Order | null>(null);
  readonly error = signal("");
  readonly notice = signal("");
  readonly busy = signal(false);
  readonly ready = signal(false);
  readonly cartCount = computed(() =>
    this.cart().reduce((s, l) => s + l.quantity, 0),
  );
  readonly cartRows = computed(() =>
    this.cart().map((l) => ({
      ...l,
      product: this.products()?.find((p) => p.sku === l.sku),
    })),
  );
  readonly subtotal = computed(() =>
    this.cartRows().reduce(
      (s, l) => s + (l.product?.priceMinor ?? 0) * l.quantity,
      0,
    ),
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
  ): Promise<T> {
    const response = await fetch(this.base + path, {
      method,
      credentials: "include",
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const data = await response.json();
    if (!response.ok) {
      if (response.status === 401) {
        this.user.set(null);
        this.orders.set([]);
        this.adminOrders.set([]);
        this.adminProducts.set([]);
        this.metrics.set([]);
      }
      throw new Error(
        data.error?.message ??
          data.message ??
          "No se pudo completar la operación",
      );
    }
    return data;
  }
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
      await this.reloadProducts();
      const r = await this.request<{ user: User | null }>("/auth/me");
      this.user.set(r.user);
      if (r.user)
        this.cart.set((await this.request<{ items: Line[] }>("/cart")).items);
      else this.cart.set(this.readGuest());
    });
    this.ready.set(true);
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
    try {
      const x = JSON.parse(localStorage.getItem("piuma-cart") ?? "[]");
      return Array.isArray(x)
        ? x
            .filter(
              (l: Line) =>
                typeof l.sku === "string" &&
                Number.isInteger(l.quantity) &&
                l.quantity > 0 &&
                l.quantity <= 20,
            )
            .slice(0, 20)
        : [];
    } catch {
      return [];
    }
  }
  section(fragment: string) {
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
      this.user.set(r.user);
      const remote = (await this.request<{ items: Line[] }>("/cart")).items;
      const merged = new Map(remote.map((l) => [l.sku, l.quantity]));
      for (const l of this.readGuest())
        merged.set(l.sku, Math.min(20, (merged.get(l.sku) ?? 0) + l.quantity));
      if (merged.size > 20) {
        this.cart.set(remote);
        this.notice.set(
          "Ingresaste. Tu carrito anterior tiene prioridad; revisá los productos antes de agregar otros.",
        );
      } else {
        await this.saveCart(
          [...merged].map(([sku, quantity]) => ({ sku, quantity })),
        );
        localStorage.removeItem("piuma-cart");
      }
      this.view.set(r.user.admin ? "admin" : "cart");
      if (r.user.admin) await this.loadAdmin();
    });
  }
  async logout() {
    await this.run(async () => {
      await this.request("/auth/logout", "POST", {});
      this.user.set(null);
      this.cart.set([]);
      this.orders.set([]);
      this.adminOrders.set([]);
      this.adminProducts.set([]);
      this.metrics.set([]);
      this.completed.set(null);
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
    sessionStorage.removeItem("piuma-checkout");
  }
  async add(sku: string) {
    await this.run(async () => {
      const product = this.products()?.find((p) => p.sku === sku);
      const existing = this.cart().find((l) => l.sku === sku);
      const quantity = (existing?.quantity ?? 0) + 1;
      if (!product || product.stock < quantity)
        throw new Error("No hay más stock disponible de esta variante");
      if (quantity > 20 || (!existing && this.cart().length >= 20))
        throw new Error(
          "Máximo 20 unidades por variante y 20 variantes por pedido",
        );
      await this.saveCart(
        existing
          ? this.cart().map((l) => (l.sku === sku ? { sku, quantity } : l))
          : [...this.cart(), { sku, quantity }],
      );
      this.notice.set("Producto agregado al carrito");
    });
  }
  async quantity(sku: string, value: number) {
    await this.run(async () => {
      if (!Number.isInteger(value) || value < 0 || value > 20)
        throw new Error("Cantidad válida: 0 a 20");
      await this.saveCart(
        value
          ? this.cart().map((l) =>
              l.sku === sku ? { sku, quantity: value } : l,
            )
          : this.cart().filter((l) => l.sku !== sku),
      );
    });
  }
  async review() {
    await this.run(async () => {
      await this.reloadProducts();
      this.quote.set(
        await this.request<Quote>("/cart/quote", "POST", {
          items: this.cart(),
        }),
      );
    });
  }
  async checkout(phone: string) {
    await this.run(async () => {
      if (!this.user())
        throw new Error("Ingresá a tu cuenta para crear el pedido");
      if (!this.quote())
        throw new Error("Revisá el pedido antes de confirmarlo");
      const payload = {
        items: this.cart(),
        paymentMethod: "pending",
        fulfillment: "pickup",
        contact: { name: this.user()!.name, email: this.user()!.email, phone },
      };
      const fingerprint = JSON.stringify([this.user()!.id, payload]);
      let attempt: { fingerprint: string; key: string } | null = null;
      try {
        attempt = JSON.parse(
          sessionStorage.getItem("piuma-checkout") ?? "null",
        );
      } catch {}
      if (attempt?.fingerprint !== fingerprint)
        attempt = { fingerprint, key: crypto.randomUUID() };
      sessionStorage.setItem("piuma-checkout", JSON.stringify(attempt));
      const order = await this.request<Order>("/orders", "POST", payload, {
        "Idempotency-Key": attempt!.key,
      });
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
    });
  }
  async payment(order: Order) {
    await this.run(async () => {
      await this.request("/orders/" + order.id + "/payment", "POST", {});
    });
  }
  async loadAdmin() {
    const [p, m] = await Promise.all([
      this.pages<Product>("/admin/products"),
      this.pages<Metric>("/admin/metrics"),
    ]);
    this.adminProducts.set(p);
    this.metrics.set(m);
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
  status(status: string) {
    return (
      (
        {
          pending_payment: "Pendiente de pago",
          pending_transfer: "Pendiente de transferencia",
          paid: "Pagado",
          cancelled: "Cancelado",
        } as Record<string, string>
      )[status] ?? status
    );
  }
}
