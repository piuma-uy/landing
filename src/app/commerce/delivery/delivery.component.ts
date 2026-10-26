import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from "@angular/core";
import { ControlContainer, FormsModule, NgForm } from "@angular/forms";
import { CommerceService } from "../commerce.service";
import {
  Address,
  DEPARTMENTS,
  deliveryResult,
  destinationGroups,
  pickupLabel,
  prefillAddress,
} from "../shipping";

/**
 * Checkout "Entrega" (T68): Envío or Retiro, "¿Adónde querés que te lo llevemos?" as one
 * select, one result line and, once a place is chosen, the address. Its fields belong to the
 * checkout form, so they count for its validity.
 */
@Component({
  selector: "app-delivery",
  standalone: true,
  imports: [FormsModule],
  viewProviders: [{ provide: ControlContainer, useExisting: NgForm }],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./delivery.component.html",
  styleUrl: "./delivery.component.scss",
})
export class DeliveryComponent {
  readonly shop = inject(CommerceService);
  /** The checkout's address object, prefilled here when a place is chosen. */
  readonly address = input.required<Address>();
  readonly departments = DEPARTMENTS;
  readonly pickupLabel = pickupLabel;
  readonly destinationGroups = computed(() =>
    destinationGroups(this.shop.destinations()),
  );
  /** The one line under the select: free, priced or arranged over WhatsApp. */
  readonly result = computed(() => {
    const id = this.shop.destination()?.zoneId;
    const options = this.shop.shippingOptions();
    const zone = options?.delivery.zones.find((z) => z.id === id);
    const quoted = this.shop.quote()?.shipping;
    // The API quoted this zone with the free-shipping threshold applied.
    const free =
      quoted?.method === "delivery" &&
      quoted.zoneId === id &&
      quoted.freeShipping;
    return zone && options
      ? deliveryResult(
          zone,
          free,
          this.shop.money(zone.priceMinor, options.currency),
        )
      : "";
  });

  chooseDestination(key: string) {
    const to = this.shop.destinations().find((d) => d.key === key);
    if (!to) return;
    Object.assign(
      this.address(),
      prefillAddress(this.address(), to, this.shop.destination()),
    );
    this.shop.chooseDestination(key);
  }
}
