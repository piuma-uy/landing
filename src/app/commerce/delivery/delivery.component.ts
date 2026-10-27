import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
} from "@angular/core";
import { ControlContainer, FormsModule, NgForm } from "@angular/forms";
import { CommerceService } from "../commerce.service";
import {
  Address,
  addressFor,
  addressMismatch,
  deliveryResult,
  destinationGroups,
  OTHER_PLACE,
  pickupLabel,
} from "../shipping";

/**
 * Checkout "Entrega" (T68): Envío or Retiro, "¿Adónde querés que te lo llevemos?" as one
 * select, one result line and, once a place is chosen, the address. The place decides
 * department and barrio (T73): fixed ones are shown as text, Montevideo barrios are a select
 * with "Otro", the interior a department select and a locality. Its fields belong to the
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
  readonly pickupLabel = pickupLabel;
  readonly other = OTHER_PLACE;
  /** "Otro" chosen in the barrio select: the buyer types the barrio. */
  readonly otherPlace = signal(false);
  /** Edits to the address object (not a signal) re-run the coherence check. */
  private readonly edits = signal(0);
  /** Same check as the API (409 ADDRESS_ZONE_MISMATCH), as the buyer types. */
  readonly mismatch = computed(() => {
    this.edits();
    const to = this.shop.destination();
    return to
      ? addressMismatch(this.shop.shippingOptions(), to.zoneId, this.address())
      : "";
  });
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
      addressFor(this.address(), to, this.shop.destination()),
    );
    this.otherPlace.set(false);
    this.edited();
    this.shop.chooseDestination(key);
  }

  /** Barrio select: a listed barrio, or "Otro" to type it. */
  choosePlace(value: string) {
    this.otherPlace.set(value === OTHER_PLACE);
    this.address().city = value === OTHER_PLACE ? "" : value;
    this.edited();
  }

  edited() {
    const before = this.mismatch();
    this.edits.update((n) => n + 1);
    // The checkout's error was this mismatch: it goes once the address changes.
    if (before && this.shop.error() === before) this.shop.error.set("");
  }
}
