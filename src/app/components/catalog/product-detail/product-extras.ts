// Partes de la ficha que no hacen falta al abrirla (T69): van juntas en un solo chunk diferido.
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  output,
  viewChild,
} from "@angular/core";
import { CommerceService } from "../../../commerce/commerce.service";
import { ProductType } from "../../../models/catalog.model";

/**
 * Teléfono: con el botón de compra de la ficha fuera de la pantalla, una barra fija con precio y
 * "Agregar" (T69). Oculta, queda inert y fuera del árbol de accesibilidad.
 */
@Component({
  selector: "app-buy-bar",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="buy-bar"
      [class.buy-bar--shown]="shown()"
      [attr.inert]="shown() ? null : ''"
    >
      <div class="buy-bar__text">
        <span class="buy-bar__name">{{ choice() }}</span>
        <strong class="buy-bar__price">{{ price() }}</strong>
      </div>
      <button
        type="button"
        class="btn btn--primary buy-bar__cta"
        [disabled]="disabled() || soldOut()"
        [attr.aria-label]="soldOut() ? 'Agotado' : 'Agregar ' + product() + ' al carrito'"
        (click)="add.emit()"
      >
        {{ soldOut() ? "Agotado" : "Agregar" }}
      </button>
    </div>
  `,
  styleUrl: "./buy-bar.component.scss",
})
export class BuyBarComponent {
  readonly shown = input.required<boolean>();
  readonly product = input.required<string>();
  /** "Queen · Blanco". */
  readonly choice = input.required<string>();
  readonly price = input.required<string>();
  readonly soldOut = input.required<boolean>();
  readonly disabled = input.required<boolean>();
  readonly add = output<void>();
}

/**
 * La foto de la ficha a pantalla completa (T69): un botón transparente sobre la foto, con la lupa
 * en la esquina, abre el diálogo; un toque, Esc o el × lo cierran.
 */
@Component({
  selector: "app-photo-zoom",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" class="trigger" (click)="dialog.showModal()">
      <span class="hint" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false">
          <circle cx="10.5" cy="10.5" r="6" />
          <path d="M15 15l5 5M10.5 8v5M8 10.5h5" />
        </svg>
      </span>
      <span class="sr-only">Ampliar foto</span>
    </button>
    <dialog #dialog class="zoom" aria-label="Foto ampliada" (click)="dialog.close()">
      <img [src]="src()" [alt]="alt()" />
      <button type="button" class="zoom__close" aria-label="Cerrar foto">×</button>
    </dialog>
  `,
  styleUrl: "./photo-zoom.component.scss",
})
export class PhotoZoomComponent {
  readonly src = input.required<string>();
  readonly alt = input.required<string>();
}

/**
 * Lo que hace falta saber antes de comprar, debajo de los botones de la ficha (T69). Cómo llega
 * (retiro, zonas de envío) lo dice la línea de envíos de la ficha (T68), no esta lista.
 */
@Component({
  selector: "app-product-benefits",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul class="benefits">
      @if (shop.selling()) {
        <li>
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6zM9 12l2 2 4-4" />
          </svg>
          Reservamos tus productos al confirmar el pedido
        </li>
      }
      <li>
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M4 19l1.3-3.8A8 8 0 1 1 8.6 18.6zM9 10h6M9 13.5h4" />
        </svg>
        ¿Dudas con la medida? Te respondemos por WhatsApp
      </li>
    </ul>
  `,
  styles: `
    .benefits {
      display: grid;
      gap: 0.6rem;
      margin: var(--space-md) 0 0;
      padding: var(--space-sm);
      list-style: none;
      background-color: var(--color-bg);
      border-radius: var(--radius-md);
      font-size: 0.86rem;
      line-height: 1.4;
    }
    li {
      display: flex;
      align-items: center;
      gap: 0.7rem;
    }
    svg {
      flex-shrink: 0;
      width: 22px;
      height: 22px;
      fill: none;
      stroke: var(--color-primary-dark);
      stroke-width: 1.5;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
  `,
})
export class ProductBenefitsComponent {
  readonly shop = inject(CommerceService);
}

/**
 * Detalles de la ficha (incluye, descripción larga, características y peso por medida): van
 * debajo de la compra y llegan diferidos, fuera del bundle inicial (T69).
 */
@Component({
  selector: "app-product-more",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./product-more.component.html",
  styleUrl: "./product-more.component.scss",
})
export class ProductMoreComponent {
  readonly type = input.required<ProductType>();
  /** Medida elegida: resalta su fila en la tabla de pesos. */
  readonly size = input.required<string>();

  /** Medidas que informan peso. Vacío en todo lo que no sea acolchado. */
  readonly weights = computed(() =>
    this.type().variants.filter((variant) => variant.weightGrams !== undefined),
  );
}
