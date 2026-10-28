import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from "@angular/core";
import { LowerCasePipe } from "@angular/common";
import { Photo, ProductType, Variant } from "../../../models/catalog.model";
import { WhatsappService } from "../../../services/whatsapp.service";
import { WhatsappIconComponent } from "../../../shared/whatsapp-icon/whatsapp-icon.component";
import {
  BuyBarComponent,
  PhotoZoomComponent,
  ProductBenefitsComponent,
  ProductMoreComponent,
} from "./product-extras";
import { CommerceService } from "../../../commerce/commerce.service";
import { swatchFor } from "../../../core/color-swatches";
import { PHOTO_SIZES, photoSrcset } from "../../../core/photos";
import { policyTeaser } from "../../../core/shipping-policy";
import {
  colorSoldOut,
  sizeSoldOut,
  stockLabel,
} from "../../../core/product-info";

@Component({
  selector: "app-product-detail",
  standalone: true,
  imports: [
    LowerCasePipe,
    WhatsappIconComponent,
    BuyBarComponent,
    PhotoZoomComponent,
    ProductBenefitsComponent,
    ProductMoreComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./product-detail.component.html",
  styleUrl: "./product-detail.component.scss",
})
export class ProductDetailComponent {
  readonly photoSrcset = photoSrcset;
  readonly photoSizes = PHOTO_SIZES;
  readonly shop = inject(CommerceService);
  readonly sku = computed(
    () => this.variant().skuByColor?.[this.activeColor()],
  );
  readonly selectedProduct = computed(() =>
    this.shop.products()?.find((p) => p.sku === this.sku()),
  );
  readonly stock = computed(
    () => this.variant().stockByColor?.[this.activeColor()] ?? 0,
  );
  private readonly whatsapp = inject(WhatsappService);
  /** "Envío gratis en Carrasco, Pocitos y más", con las zonas del API cuando ya respondió. */
  readonly shippingTeaser = computed(() => policyTeaser(this.shop.policy()));
  readonly sizeSoldOut = sizeSoldOut;
  readonly colorSoldOut = colorSoldOut;
  readonly stockInfo = computed(() => stockLabel(this.stock()));
  /** Barra fija del teléfono: visible con la ficha en pantalla y su botón de compra fuera. */
  readonly barShown = signal(false);
  private readonly detailRef = viewChild.required<ElementRef<HTMLElement>>("detail");
  private readonly actionsRef = viewChild.required<ElementRef<HTMLElement>>("actions");

  constructor() {
    this.shop.loadPolicy();
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      if (!("IntersectionObserver" in window)) return;
      const seen = new Map<Element, boolean>();
      const observer = new IntersectionObserver((entries) => {
        for (const e of entries) seen.set(e.target, e.isIntersecting);
        this.barShown.set(
          !!seen.get(this.detailRef().nativeElement) &&
            !seen.get(this.actionsRef().nativeElement),
        );
      });
      observer.observe(this.detailRef().nativeElement);
      observer.observe(this.actionsRef().nativeElement);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  readonly type = input.required<ProductType>();
  /** Nombre de la categoría contenedora, para el botón de volver. */
  readonly categoryName = input.required<string>();
  readonly back = output<void>();

  readonly selectedSizeIndex = signal(0);
  /** Color elegido por el usuario. Puede no existir en la medida activa: ver activeColor(). */
  private readonly pickedColor = signal<string | null>(null);

  readonly variant = computed<Variant>(
    () => this.type().variants[this.selectedSizeIndex()],
  );

  readonly availableColors = computed(() => this.variant().colors);


  /**
   * Al cambiar de medida el color elegido puede dejar de existir (King no viene en azul).
   * En vez de resetearlo con un effect, se resuelve al leerlo.
   */
  readonly activeColor = computed(() => {
    const picked = this.pickedColor();
    const available = this.availableColors();
    return picked && available.includes(picked) ? picked : available[0];
  });

  /** Índice dentro de photos(). 0 es siempre la foto del color activo. */
  readonly selectedPhotoIndex = signal(0);

  /** Foto que corresponde al color elegido; si ese color no tiene, la principal. */
  private readonly colorImage = computed(
    () => this.type().colorImages?.[this.activeColor()] ?? this.type().image,
  );

  /**
   * La foto del color primero, después las de la galería de ESE color, y al final
   * las que valen para cualquier color. Así ninguna miniatura muestra un color
   * distinto al seleccionado.
   */
  readonly photos = computed<Photo[]>(() => {
    const type = this.type();
    return [
      { src: this.colorImage(), alt: type.alt },
      ...(type.galleryByColor?.[this.activeColor()] ?? []),
      ...(type.gallery ?? []),
    ];
  });

  readonly hasGallery = computed(() => this.photos().length > 1);

  readonly displayedPhoto = computed(
    () => this.photos()[this.selectedPhotoIndex()] ?? this.photos()[0],
  );

  /**
   * `true` sólo cuando se está viendo la foto del color (índice 0), el producto declara
   * fotos por color y falta justo la del color activo. En un producto de un solo color
   * la foto principal ES la de ese color: no se avisa nada.
   */
  readonly imageIsReference = computed(() => {
    if (this.selectedPhotoIndex() !== 0) return false;
    const byColor = this.type().colorImages;
    return !!byColor && !byColor[this.activeColor()];
  });

  readonly formattedPrice = computed(() =>
    new Intl.NumberFormat("es-UY", {
      style: "currency",
      currency: this.type().currency,
      maximumFractionDigits: 0,
    }).format(
      this.shop.selling()
        ? (this.variant().priceByColor?.[this.activeColor()] ?? 0) / 100
        : this.variant().price,
    ),
  );

  readonly whatsappLink = computed(() =>
    this.whatsapp.variantLink(
      this.type().fullName,
      this.activeColor(),
      this.variant(),
    ),
  );

  // Cambiar medida o color vuelve a la foto del color: si no, quedaría abierta una
  // miniatura de galería mientras el usuario cree estar mirando el color nuevo.
  selectSize(index: number): void {
    this.selectedSizeIndex.set(index);
    this.selectedPhotoIndex.set(0);
  }

  selectColor(color: string): void {
    this.pickedColor.set(color);
    this.selectedPhotoIndex.set(0);
  }

  /** Veces que se agregó desde esta ficha: cada una vuelve a dibujar la tilde del botón. */
  readonly added = signal(0);

  async add(sku: string): Promise<void> {
    await this.shop.add(sku);
    if (!this.shop.error()) this.added.update((n) => n + 1);
  }

  selectPhoto(index: number): void {
    this.selectedPhotoIndex.set(index);
  }

  swatch(color: string): string {
    return swatchFor(color);
  }
}
