import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { DomSanitizer } from "@angular/platform-browser";
import { CommerceService, Order, Product } from "./commerce.service";
import { WhatsappService } from "../services/whatsapp.service";
import { WhatsappIconComponent } from "../shared/whatsapp-icon/whatsapp-icon.component";
import { AccountComponent } from "./account/account.component";
import { buyerCancellable, dateTime, reservedUntil } from "./orders";
import {
  CONFIRMATION_PROMISE,
  orderCode,
  phoneCounts,
  phoneKey,
  phoneReference,
  reservationText,
} from "./transfer";
import {
  CartLinesComponent,
  CheckoutStepsComponent,
  EmptyStateComponent,
  OrderLinesComponent,
  OrderProgressComponent,
  ReceiptNextComponent,
  ReceiptThanksComponent,
} from "./order-extras/order-extras";
import { groupSecret } from "./mfa";
import { qrPath } from "./qr";
import { AdminSettingsComponent } from "./admin-settings.component";
import {
  emptyAddress,
  shippingCost,
  shippingFollowUp,
  shippingSummary,
} from "./shipping";
import { DeliveryComponent } from "./delivery/delivery.component";
@Component({
  selector: "app-commerce",
  standalone: true,
  imports: [
    FormsModule,
    WhatsappIconComponent,
    AdminSettingsComponent,
    AccountComponent,
    DeliveryComponent,
    CheckoutStepsComponent,
    CartLinesComponent,
    EmptyStateComponent,
    OrderProgressComponent,
    OrderLinesComponent,
    ReceiptThanksComponent,
    ReceiptNextComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./commerce.component.html",
  styleUrls: [
    "./commerce.component.scss",
    "./admin-security.component.scss",
    "./transfers.component.scss",
  ],
})
export class CommerceComponent {
  readonly shop = inject(CommerceService);
  readonly adminTab = signal<
    "overview" | "products" | "transfers" | "settings"
  >("overview");
  /** Transfer row with an open confirmation step, and which action it confirms. */
  readonly reviewing = signal<{
    id: string;
    action: "confirm" | "cancel";
  } | null>(null);
  /** Order of "Mis pedidos" whose cancellation is waiting for the buyer's confirmation. */
  readonly cancelling = signal<string | null>(null);
  private readonly sanitizer = inject(DomSanitizer);
  /** TOTP enrollment: QR of the otpauth URL, drawn here (no image leaves the browser). */
  readonly totpQr = computed(() => {
    const t = this.shop.totp();
    return t && qrPath(t.url);
  });
  // Angular drops non-http(s) links; this one is built by mfa.ts with a fixed otpauth: scheme,
  // so the authenticator app opens on the same phone that shows the panel.
  readonly totpLink = computed(() => {
    const t = this.shop.totp();
    return t && this.sanitizer.bypassSecurityTrustUrl(t.url);
  });
  readonly totpSecret = computed(() =>
    groupSecret(this.shop.totp()?.secret ?? ""),
  );
  totpInput = "";
  bankReference = "";
  cancelReason = "Transferencia no recibida";
  readonly whatsapp = inject(WhatsappService);
  readonly dateTime = dateTime;
  readonly reservedUntil = reservedUntil;
  readonly orderCode = orderCode;
  readonly phoneReference = phoneReference;
  readonly reservationText = reservationText;
  readonly confirmationPromise = CONFIRMATION_PROMISE;
  readonly buyerCancellable = buyerCancellable;
  readonly shippingSummary = shippingSummary;
  readonly shippingFollowUp = shippingFollowUp;
  /** 0 cart, 1 reviewed (shipping and payment on screen), 2 order created. */
  readonly checkoutStep = computed(() =>
    this.shop.completed() ? 2 : this.shop.quote() ? 1 : 0,
  );
  /** "Qué pasa ahora" de la confirmación, según cómo se paga. */
  nextSteps(order: Order) {
    const handover = `Te escribimos por WhatsApp para coordinar ${
      order.shipping?.method === "delivery" ? "la entrega" : "el retiro"
    }.`;
    if (order.transfer)
      return [
        phoneReference(order.transfer)
          ? `Transferí el monto exacto con tu teléfono ${order.transfer.reference} como referencia.`
          : `Transferí el monto exacto con la referencia ${order.transfer.reference}.`,
        "Mandanos el comprobante por WhatsApp.",
        CONFIRMATION_PROMISE,
        handover,
      ];
    if (order.paymentMethod === "card")
      return [
        "Pagás en el sitio seguro de Mercado Pago.",
        "Te avisamos por mail cuando se apruebe el pago.",
        handover,
      ];
    return [];
  }
  /** Delivery address; sent only when the buyer picks a delivery zone. */
  address = emptyAddress();
  /** "Gratis (Pocitos)", "A coordinar", "Sin costo"… for the summary. */
  readonly shippingCost = computed(() => {
    const q = this.shop.quote();
    return shippingCost(
      q?.shipping,
      this.shop.delivering(),
      this.shop.destination()?.label ?? null,
      (minor) => this.shop.money(minor, q?.currency),
    );
  });
  readonly sales = computed(() =>
    this.shop.metrics().reduce((s, m) => s + m.grossSalesMinor, 0),
  );
  readonly activeCount = computed(
    () => this.shop.adminProducts().filter((p) => p.active).length,
  );
  readonly paidCount = computed(() =>
    this.shop.metrics().reduce((s, m) => s + m.paidOrders, 0),
  );
  contactPhone = "";
  search = "";
  editing: Product | null = null;
  price = 0;
  readonly productGroups = computed(() => {
    const groups = new Map<
      string,
      { id: string; name: string; variants: Product[]; stock: number }
    >();
    for (const p of this.shop.adminProducts()) {
      const id = `${p.categoryId}/${p.productId}`;
      let group = groups.get(id);
      if (!group) {
        group = { id, name: p.name, variants: [], stock: 0 };
        groups.set(id, group);
      }
      group.variants.push(p);
      group.stock += p.stock;
    }
    return [...groups.values()];
  });
  edit(p: Product) {
    this.editing = { ...p };
    this.price = p.priceMinor / 100;
  }
  createProduct() {
    this.editing = {
      sku: "",
      productId: "",
      categoryId: "",
      name: "",
      size: "",
      color: "",
      description: "",
      image: "assets/images/hero-piuma.webp",
      priceMinor: 0,
      stock: 0,
      active: false,
      currency: "UYU",
      version: 0,
    };
    this.price = 0;
  }
  async save() {
    if (!this.editing) return;
    await this.shop.saveProduct({
      ...this.editing,
      priceMinor: Math.round(this.price * 100),
    });
    if (!this.shop.error()) this.editing = null;
  }
  openTab(tab: "overview" | "products" | "transfers" | "settings") {
    this.adminTab.set(tab);
    this.reviewing.set(null);
  }
  async confirmTotp() {
    await this.shop.confirmTotp(this.totpInput);
    if (!this.shop.error()) this.totpInput = "";
  }
  showHistory() {
    this.openTab("settings");
    // Configuración loads on demand: wait (up to ~2 s) for the history to be on screen.
    let frames = 120;
    const scroll = () => {
      const history = document.getElementById("settings-history");
      if (history) history.scrollIntoView({ behavior: "smooth" });
      else if (--frames) requestAnimationFrame(scroll);
    };
    requestAnimationFrame(scroll);
  }
  /** Code Piuma knows the order by; since T70 the transfer reference is the buyer's phone. */
  orderRef(order: Order) {
    return orderCode(order);
  }
  receiptLink(order: Order) {
    const t = order.transfer;
    return (
      t &&
      this.whatsapp.receiptLink(
        orderCode(order),
        t,
        this.shop.money(t.amountMinor, t.currency),
      )
    );
  }
  /** "Transferencias por confirmar": the search result while there is one, else every row. */
  readonly transferRows = computed(
    () => this.shop.transferSearch()?.items ?? this.shop.pendingTransfers(),
  );
  /** Pending transfers per phone (all of them, not only the search result). */
  private readonly phoneCounts = computed(() =>
    phoneCounts(this.shop.pendingTransfers()),
  );
  samePhone(order: Order) {
    return this.phoneCounts().get(phoneKey(order.contact?.phone)) ?? 1;
  }
  transferQuery = "";
  async searchTransfers() {
    this.reviewing.set(null);
    await this.shop.searchTransfers(this.transferQuery);
  }
  clearTransferSearch() {
    this.transferQuery = "";
    this.reviewing.set(null);
    this.shop.clearTransferSearch();
  }
  review(order: Order, action: "confirm" | "cancel") {
    this.reviewing.set({ id: order.id, action });
    this.bankReference = "";
    this.cancelReason = "Transferencia no recibida";
  }
  async confirmTransfer(order: Order) {
    await this.shop.confirmTransfer(order, this.bankReference);
    if (!this.shop.error()) this.reviewing.set(null);
  }
  async cancelOwn(order: Order) {
    await this.shop.cancelOwn(order);
    this.cancelling.set(null);
  }
  async cancelTransfer(order: Order) {
    await this.shop.cancelTransfer(order, this.cancelReason);
    if (!this.shop.error()) this.reviewing.set(null);
  }
  matches(p: Product) {
    return `${p.name} ${p.sku} ${p.size} ${p.color}`
      .toLowerCase()
      .includes(this.search.toLowerCase());
  }
  readonly matchesSearch = (p: Product) => this.matches(p);
  readonly groupMatches = (group: { variants: Product[] }) =>
    group.variants.some(this.matchesSearch);
}
