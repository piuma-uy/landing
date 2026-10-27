import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  input,
  linkedSignal,
  model,
  signal,
  viewChild,
} from "@angular/core";
import { FormsModule, NgForm } from "@angular/forms";
import { CommerceService } from "../commerce.service";
import {
  CHECKOUT_STEPS,
  type CheckoutStep,
  deliveryLine,
  stepAfterReview,
  unitsLabel,
} from "../checkout";
import { type Address, addressMismatch, shippingCost } from "../shipping";
import { phoneDisplay } from "../transfer";
import { scrollBehavior } from "../screen";
import { DeliveryComponent } from "../delivery/delivery.component";
import { CartLinesComponent } from "../order-extras/order-extras";
import { PhoneFieldComponent } from "../phone-field/phone-field.component";

/** $bp-lg of src/styles/_variables.scss: two columns with the sticky summary. */
const DESKTOP = 1024;

/**
 * Checkout (T72): Tus datos · Entrega · Pago, one open at a time; a finished step folds into one
 * line with "Editar". The order summary folds at the top on the phone and is a sticky column on
 * desktop; the step's action sits in a bar fixed at the bottom of the phone. Lazy chunk: only
 * a cart with products needs it.
 */
@Component({
  selector: "app-checkout",
  standalone: true,
  imports: [
    FormsModule,
    DeliveryComponent,
    CartLinesComponent,
    PhoneFieldComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./checkout.component.html",
  styleUrl: "./checkout.component.scss",
})
export class CheckoutComponent {
  readonly shop = inject(CommerceService);
  /** The checkout's address, kept by the page while the buyer visits /envios/. */
  readonly address = input.required<Address>();
  /** "Tu celular" in E.164 (T71); null while the field has no valid number. */
  readonly phone = model.required<string | null>();
  private readonly form = viewChild.required(NgForm);
  private readonly delivery = viewChild(DeliveryComponent);
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly injector = inject(Injector);
  /** The step the buyer is on; a reviewed cart (back from /envios/) resumes at Entrega. */
  private readonly chosen = signal<CheckoutStep>(
    this.shop.quote() ? "entrega" : "datos",
  );
  /** Without a session or a quote only "Tus datos" is open; Pago needs a place to deliver. */
  readonly step = computed<CheckoutStep>(() => {
    if (!this.shop.user() || !this.shop.quote()) return "datos";
    const step = this.chosen();
    return step === "pago" && this.shop.delivering() && !this.shop.destination()
      ? "entrega"
      : step;
  });
  /** Phone: unfolded while the cart is being looked at, folded once it is reviewed. */
  readonly summaryOpen = linkedSignal(() => !this.shop.quote());
  readonly units = computed(() => unitsLabel(this.shop.cartCount()));
  readonly total = computed(() =>
    this.shop.money(this.shop.quote()?.totalMinor ?? this.shop.subtotal()),
  );
  readonly thumbs = computed(() =>
    this.shop
      .cartRows()
      .flatMap((r) => (r.product ? [r.product.image] : []))
      .slice(0, 3),
  );
  readonly canPay = computed(
    () => this.shop.transferEnabled() || this.shop.cardEnabled(),
  );
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
  /** Pago's button: card goes to Mercado Pago from this click and only from it (T72c). */
  readonly payLabel = computed(() => {
    const card = this.shop.payWith() === "card" && this.shop.cardEnabled();
    if (this.shop.busy())
      return card ? "Te llevamos a Mercado Pago…" : "Guardando…";
    if (card) return "Pagar con Mercado Pago";
    return this.canPay()
      ? "Confirmar y pagar " + this.total()
      : "Confirmar pedido";
  });
  /** "Elegí adónde te lo llevamos" when Continuar is pressed without a place. */
  readonly placeError = signal("");
  /** The phone's keyboard is open on a field: the bar steps aside until it closes. */
  readonly keyboard = signal(false);

  constructor() {
    // The visual viewport shrinks under the keyboard (iOS and Android); focus alone is not enough:
    // Android's back button hides the keyboard and leaves the field focused.
    const viewport = window.visualViewport;
    if (!viewport) return;
    const check = () =>
      this.keyboard.set(
        window.innerHeight - viewport.height * viewport.scale > 150 &&
          !!document.activeElement?.matches(
            "input:not([type=radio]):not([type=checkbox]), textarea",
          ),
      );
    viewport.addEventListener("resize", check);
    addEventListener("focusout", check);
    inject(DestroyRef).onDestroy(() => {
      viewport.removeEventListener("resize", check);
      removeEventListener("focusout", check);
    });
  }

  index(step: CheckoutStep) {
    return CHECKOUT_STEPS.indexOf(step);
  }
  done(step: CheckoutStep) {
    return this.index(step) < this.index(this.step());
  }
  /** "Ana · 091 813 234" on the folded Tus datos. */
  phoneLine() {
    return phoneDisplay(this.phone() ?? undefined);
  }
  entregaLine() {
    return deliveryLine(
      this.shop.delivering() ? (this.shop.destination()?.label ?? "") : null,
      this.address(),
      this.shop.shippingOptions()?.pickup.details,
    );
  }

  /** The bar's button, also Enter in any field: the open step's action. */
  async primary() {
    if (this.shop.busy()) return;
    if (!this.shop.user()) return this.shop.open("account");
    const step = this.step();
    if (step === "datos") await this.continueDatos();
    else if (step === "entrega") this.continueEntrega();
    else await this.confirm();
  }

  /** "Editar" of a folded step. */
  edit(step: CheckoutStep) {
    this.go(step);
  }

  private async continueDatos() {
    if (!this.phone()) return this.showInvalid("datos");
    if (!this.shop.quote()) await this.shop.review();
    if (this.shop.quote())
      this.go(stepAfterReview(this.shop.shippingOptions()));
  }

  private continueEntrega() {
    this.placeError.set("");
    if (this.shop.delivering() && !this.shop.destination()) {
      this.placeError.set("Elegí adónde te lo llevamos.");
      this.section("entrega")?.querySelector<HTMLElement>("select")?.focus();
      return;
    }
    if (this.form().invalid) return this.showInvalid("entrega");
    // Same check as the API (409 ADDRESS_ZONE_MISMATCH), with the same words.
    const to = this.shop.shipTo();
    const mismatch =
      to?.method === "delivery" &&
      addressMismatch(this.shop.shippingOptions(), to.zoneId, this.address());
    if (mismatch) {
      this.shop.error.set(mismatch);
      return;
    }
    this.go("pago");
  }

  private async confirm() {
    const phone = this.phone();
    if (!phone) return this.showInvalid("datos");
    if (this.form().invalid) return this.showInvalid("entrega");
    await this.shop.checkout(phone, this.address());
  }

  /** Opens the step with the problem, shows every field's message and focuses the first one. */
  private showInvalid(step: CheckoutStep) {
    this.form().form.markAllAsTouched();
    // The address fields (OnPush) re-render their messages on an edit.
    this.delivery()?.edited();
    this.chosen.set(step);
    afterNextRender(
      () =>
        this.section(step)
          ?.querySelector<HTMLElement>(
            "input.ng-invalid, select.ng-invalid, textarea.ng-invalid, input[aria-invalid=true], #contact-phone",
          )
          ?.focus(),
      { injector: this.injector },
    );
  }

  private go(step: CheckoutStep) {
    this.chosen.set(step);
    this.placeError.set("");
    // The new step's title takes the focus and the top of the screen (below the header). On
    // desktop the page starts from the top: the steps fit, and the sticky summary stays whole.
    afterNextRender(
      () => {
        const section = this.section(step);
        section
          ?.querySelector<HTMLElement>("h2")
          ?.focus({ preventScroll: true });
        const behavior = scrollBehavior();
        if (matchMedia(`(min-width: ${DESKTOP}px)`).matches)
          window.scrollTo({ top: 0, behavior });
        else section?.scrollIntoView({ block: "start", behavior });
      },
      { injector: this.injector },
    );
  }

  private section(step: CheckoutStep) {
    return this.host.nativeElement.querySelector<HTMLElement>(`#step-${step}`);
  }
}
