import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from "@angular/core";
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
  EmptyStateComponent,
  OrderLinesComponent,
  OrderProgressComponent,
  ReceiptNextComponent,
  ReceiptThanksComponent,
} from "./order-extras/order-extras";
import { AdminComponent } from "./admin/admin.component";
import { emptyAddress, shippingFollowUp, shippingSummary } from "./shipping";
import { CheckoutComponent } from "./checkout/checkout.component";
@Component({
  selector: "app-commerce",
  standalone: true,
  imports: [
    WhatsappIconComponent,
    AdminComponent,
    AccountComponent,
    CheckoutComponent,
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
        "Cuando se acreditan los fondos, el pedido pasa a pagado.",
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
  /** Delivery address and phone of the checkout; kept here while the buyer visits /envios/. */
  address = emptyAddress();
  /** The buyer's celular in E.164 (T71); null while the field has no valid number. */
  readonly contactPhone = signal<string | null>(null);
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
