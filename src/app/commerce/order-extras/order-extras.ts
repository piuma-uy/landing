// Carrito, confirmación y Mis pedidos (T69): componentes diferidos, juntos en un solo chunk.
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
} from "@angular/core";
import { CommerceService, type Product, type Order } from "../commerce.service";
import { MAX_UNITS } from "../cart";
import { WhatsappService } from "../../services/whatsapp.service";
import { WhatsappIconComponent } from "../../shared/whatsapp-icon/whatsapp-icon.component";
import { orderProgress } from "../order-progress";
import { PHOTO_SIZES, photoSrcset } from "../../core/photos";

/**
 * Líneas del carrito (T69) en el resumen del checkout (T72): foto, producto y su total; debajo la
 * cantidad con − y + y "Quitar". Diferidas con el checkout.
 */
@Component({
  selector: "app-cart-lines",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (line of shop.cartRows(); track line.sku) {
      <article class="line">
        @if (line.product; as p) {
          <img
            [src]="p.image"
            [attr.srcset]="photoSrcset(p.image)"
            [attr.sizes]="thumb"
            alt=""
            width="56"
            height="70"
          />
          <div>
            <h3>{{ p.name }}</h3>
            <p class="muted">{{ p.size }} · {{ p.color }}</p>
            @if (line.quantity > 1) {
              <p class="muted small">
                {{ shop.money(p.priceMinor, p.currency) }} c/u
              </p>
            }
          </div>
          <strong class="total">{{
            shop.money(p.priceMinor * line.quantity, p.currency)
          }}</strong>
        } @else {
          <div class="gone">
            <h3>Producto no disponible</h3>
            <p class="muted">Retiralo del carrito para continuar.</p>
          </div>
        }
        <!-- Cantidad con − y +: en el teléfono, sin teclado numérico ni flechitas. -->
        <div
          class="quantity"
          role="group"
          [attr.aria-label]="'Cantidad de ' + (line.product?.name ?? 'producto')"
        >
          <div class="stepper">
            <button
              type="button"
              [disabled]="shop.busy() || line.quantity < 2"
              aria-label="Una unidad menos"
              (click)="shop.quantity(line.sku, line.quantity - 1)"
            >
              −
            </button>
            <output aria-live="polite">{{ line.quantity }}</output>
            <button
              type="button"
              [disabled]="shop.busy() || !canAdd(line)"
              aria-label="Una unidad más"
              (click)="shop.quantity(line.sku, line.quantity + 1)"
            >
              +
            </button>
          </div>
          <button
            type="button"
            class="text-button"
            [disabled]="shop.busy()"
            (click)="shop.quantity(line.sku, 0)"
          >
            Quitar
          </button>
        </div>
      </article>
    }
  `,
  styleUrl: "./cart-lines.component.scss",
})
export class CartLinesComponent {
  readonly photoSrcset = photoSrcset;
  readonly thumb = PHOTO_SIZES.thumb;
  readonly shop = inject(CommerceService);
  /** "+" se frena en el stock y en el máximo por variante que aplica el API. */
  canAdd({ quantity, product }: { quantity: number; product?: Product }) {
    return !!product && quantity < Math.min(MAX_UNITS, product.stock);
  }
}

/** Carrito o pedidos vacíos: ícono, qué hacer ahora, la colección y WhatsApp (T69). */
@Component({
  selector: "app-empty-state",
  standalone: true,
  imports: [WhatsappIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" focusable="false">
        <path
          [attr.d]="
            icon() === 'bag'
              ? 'M6 7h12l-1 13H7L6 7Zm3 0V6a3 3 0 0 1 6 0v1'
              : 'M6 4h12v16H6zM9 8h6M9 12h6M9 16h3'
          "
        />
      </svg>
    </span>
    <h2>{{ title() }}</h2>
    <p>{{ text() }}</p>
    <div class="actions">
      <button type="button" class="btn btn--primary" (click)="action.emit()">
        {{ actionLabel() }}
      </button>
      <a
        class="btn btn--outline"
        [href]="whatsapp.generalLink()"
        target="_blank"
        rel="noopener noreferrer"
        ><app-whatsapp-icon />Consultar por WhatsApp</a
      >
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .icon {
      display: inline-grid;
      place-items: center;
      width: 4.5rem;
      height: 4.5rem;
      margin-bottom: 1rem;
      border-radius: 50%;
      background: var(--color-secondary);
    }
    svg {
      width: 2rem;
      height: 2rem;
      fill: none;
      stroke: var(--color-primary-dark);
      stroke-width: 1.5;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    h2 {
      font-size: 1.4rem;
    }
    p {
      max-width: 44ch;
      margin-inline: auto;
      color: var(--color-text-muted);
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 0.7rem;
      margin-top: 1.5rem;
    }
  `,
})
export class EmptyStateComponent {
  readonly whatsapp = inject(WhatsappService);
  readonly icon = input<"bag" | "list">("bag");
  readonly title = input.required<string>();
  readonly text = input.required<string>();
  readonly actionLabel = input.required<string>();
  readonly action = output<void>();
}

/** "Mis pedidos": recibido → pago → retiro o entrega, como una línea de tiempo (T69). */
@Component({
  selector: "app-order-progress",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ol class="progress" aria-label="Estado del pedido">
      @for (step of steps(); track step.label) {
        <li
          class="progress__step"
          [attr.data-state]="step.state"
          [attr.aria-current]="step.state === 'current' ? 'step' : null"
        >
          {{ step.label }}
        </li>
      }
    </ol>
  `,
  styleUrl: "./order-progress.component.scss",
})
export class OrderProgressComponent {
  readonly order = input.required<Order>();
  /** Lo que dice la etiqueta del pedido ("Cancelado", "Vencido"…), para el paso final. */
  readonly status = input.required<string>();
  readonly steps = computed(() => orderProgress(this.order(), this.status()));
}

/** Lo que tiene un pedido de "Mis pedidos", con la foto de cada producto (T69). */
@Component({
  selector: "app-order-lines",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul>
      @for (line of order().items; track line.sku) {
        <li>
          @if (imageOf(line.sku); as src) {
            <img
              [src]="src"
              [attr.srcset]="photoSrcset(src)"
              [attr.sizes]="thumb"
              alt=""
              width="48"
              height="60"
              loading="lazy"
            />
          }
          <span class="name"
            >{{ line.quantity }} × {{ line.name }} · {{ line.size }} ·
            {{ line.color }}</span
          ><strong>{{
            shop.money(line.priceMinor * line.quantity, order().currency)
          }}</strong>
        </li>
      }
    </ul>
  `,
  styles: `
    ul {
      margin: 1rem 0;
      padding: 0;
      list-style: none;
    }
    li {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 0.7rem 0;
      border-bottom: 1px solid var(--color-border);
      font-size: 0.9rem;
    }
    img {
      flex-shrink: 0;
      width: 48px;
      height: 60px;
      object-fit: cover;
      border-radius: var(--radius-sm);
      background: var(--color-secondary);
    }
    .name {
      flex: 1;
      min-width: 0;
    }
    strong {
      white-space: nowrap;
    }
  `,
})
export class OrderLinesComponent {
  readonly photoSrcset = photoSrcset;
  readonly thumb = PHOTO_SIZES.thumb;
  readonly shop = inject(CommerceService);
  readonly order = input.required<Order>();
  /** Foto de un SKU que sigue en el catálogo. */
  imageOf(sku: string) {
    return this.shop.products()?.find((p) => p.sku === sku)?.image;
  }
}

/** Arriba de la confirmación de compra: tilde y gracias con el nombre (T69). */
@Component({
  selector: "app-receipt-thanks",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="check" aria-hidden="true">
      <svg viewBox="0 0 24 24" focusable="false">
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    </span>
    <p class="thanks">
      ¡Gracias{{ firstName() ? ", " + firstName() : "" }}! Recibimos tu pedido
      #{{ order().id.slice(0, 8) }}.
    </p>
  `,
  styleUrl: "./receipt.component.scss",
})
export class ReceiptThanksComponent {
  private readonly shop = inject(CommerceService);
  readonly order = input.required<Order>();
  readonly firstName = computed(
    () => this.shop.user()?.name.trim().split(/\s+/)[0] ?? "",
  );
}

/** Abajo de la confirmación: qué pasa ahora, lo que se compró y a quién escribir (T69). */
@Component({
  selector: "app-receipt-next",
  standalone: true,
  imports: [WhatsappIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (steps().length) {
      <section class="next" aria-labelledby="next-title">
        <h3 id="next-title" class="next__title">Qué pasa ahora</h3>
        <ol class="next__list">
          @for (step of steps(); track $index) {
            <li>{{ step }}</li>
          }
        </ol>
      </section>
    }
    <ul class="items" aria-label="Tu compra">
      @for (line of order().items; track line.sku) {
        <li>
          @if (imageOf(line.sku); as src) {
            <img
              [src]="src"
              [attr.srcset]="photoSrcset(src)"
              [attr.sizes]="thumb"
              alt=""
              width="48"
              height="60"
            />
          }
          <span class="items__name"
            >{{ line.quantity }} × {{ line.name }}
            <small>{{ line.size }} · {{ line.color }}</small></span
          ><strong>{{
            shop.money(line.priceMinor * line.quantity, order().currency)
          }}</strong>
        </li>
      }
    </ul>
    <p class="help">
      ¿Alguna duda con tu pedido?
      <a [href]="helpLink()" target="_blank" rel="noopener noreferrer"
        ><app-whatsapp-icon />Escribinos por WhatsApp</a
      >
    </p>
  `,
  styleUrl: "./receipt.component.scss",
})
export class ReceiptNextComponent {
  readonly photoSrcset = photoSrcset;
  readonly thumb = PHOTO_SIZES.thumb;
  readonly shop = inject(CommerceService);
  private readonly whatsapp = inject(WhatsappService);
  readonly order = input.required<Order>();
  readonly steps = input<string[]>([]);
  /** Referencia con la que Piuma conoce el pedido: la de la transferencia o el id corto. */
  readonly helpLink = computed(() => {
    const o = this.order();
    const ref = o.transfer?.reference ?? "#" + o.id.slice(0, 8);
    return this.whatsapp.link(`Hola, tengo una consulta sobre mi pedido ${ref}.`);
  });
  imageOf(sku: string) {
    return this.shop.products()?.find((p) => p.sku === sku)?.image;
  }
}
