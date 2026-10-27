import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { CommerceService, Order } from "./commerce.service";
import { WhatsappService } from "../services/whatsapp.service";
import { WhatsappIconComponent } from "../shared/whatsapp-icon/whatsapp-icon.component";
import { AccountComponent } from "./account/account.component";
import { buyerCancellable, dateTime, reservedUntil } from "./orders";
import {
  CONFIRMATION_PROMISE,
  orderCode,
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
import { AdminComponent } from "./admin/admin.component";
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
    AdminComponent,
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
  styleUrls: ["./commerce.component.scss", "./transfers.component.scss"],
})
export class CommerceComponent {
  readonly shop = inject(CommerceService);
  /** Order of "Mis pedidos" whose cancellation is waiting for the buyer's confirmation. */
  readonly cancelling = signal<string | null>(null);
  readonly whatsapp = inject(WhatsappService);
  readonly dateTime = dateTime;
  readonly reservedUntil = reservedUntil;
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
  contactPhone = "";
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
  async cancelOwn(order: Order) {
    await this.shop.cancelOwn(order);
    this.cancelling.set(null);
  }
}
