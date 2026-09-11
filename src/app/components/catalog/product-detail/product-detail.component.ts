import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { LowerCasePipe } from '@angular/common';
import { Photo, ProductType, Variant } from '../../../models/catalog.model';
import { WhatsappService } from '../../../services/whatsapp.service';
import { swatchFor } from '../../../core/color-swatches';

@Component({
  selector: 'app-product-detail',
  standalone: true,
  imports: [LowerCasePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './product-detail.component.html',
  styleUrl: './product-detail.component.scss',
})
export class ProductDetailComponent {
  private readonly whatsapp = inject(WhatsappService);

  readonly type = input.required<ProductType>();
  /** Nombre de la categoría contenedora, para el botón de volver. */
  readonly categoryName = input.required<string>();
  readonly back = output<void>();

  readonly selectedSizeIndex = signal(0);
  /** Color elegido por el usuario. Puede no existir en la medida activa: ver activeColor(). */
  private readonly pickedColor = signal<string | null>(null);

  readonly variant = computed<Variant>(() => this.type().variants[this.selectedSizeIndex()]);

  readonly availableColors = computed(() => this.variant().colors);

  /** Medidas que informan peso. Vacío en todo lo que no sea acolchado. */
  readonly weights = computed(() =>
    this.type().variants.filter((variant) => variant.weightGrams !== undefined),
  );

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
    new Intl.NumberFormat('es-UY', {
      style: 'currency',
      currency: this.type().currency,
      maximumFractionDigits: 0,
    }).format(this.variant().price),
  );

  readonly whatsappLink = computed(() =>
    this.whatsapp.variantLink(this.type().fullName, this.activeColor(), this.variant()),
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

  selectPhoto(index: number): void {
    this.selectedPhotoIndex.set(index);
  }

  swatch(color: string): string {
    return swatchFor(color);
  }
}
