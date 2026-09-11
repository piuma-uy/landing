import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { CatalogService } from '../../services/catalog.service';
import { Category, ProductType } from '../../models/catalog.model';
import { ProductDetailComponent } from './product-detail/product-detail.component';
import { SizeGuideComponent } from './size-guide/size-guide.component';

/**
 * Catálogo de 3 niveles: categorías → tipos → detalle con variantes.
 *
 * Se maneja con estado local (signals) y no con rutas de Angular: el catálogo es una
 * sección de una landing de scroll único, así que separar en rutas obligaría a partir
 * la página o a montar el Router sólo para guardar cuál tarjeta está abierta. Ver README.
 */
@Component({
  selector: 'app-catalog',
  standalone: true,
  imports: [ProductDetailComponent, SizeGuideComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './catalog.component.html',
  styleUrl: './catalog.component.scss',
})
export class CatalogComponent {
  private readonly catalogService = inject(CatalogService);

  /** `undefined` mientras carga; `[]` si la carga falló. */
  readonly categories = toSignal(this.catalogService.getCategories());

  readonly selectedCategoryId = signal<string | null>(null);
  readonly selectedTypeId = signal<string | null>(null);

  readonly activeCategory = computed<Category | null>(() => {
    const id = this.selectedCategoryId();
    if (!id) return null;
    return this.categories()?.find((category) => category.id === id) ?? null;
  });

  readonly activeType = computed<ProductType | null>(() => {
    const id = this.selectedTypeId();
    if (!id) return null;
    return this.activeCategory()?.types.find((type) => type.id === id) ?? null;
  });

  openCategory(id: string): void {
    this.selectedCategoryId.set(id);
    // Cambiar de categoría con un tipo abierto tiene que volver a la grilla de tipos.
    this.selectedTypeId.set(null);
  }

  openType(id: string): void {
    this.selectedTypeId.set(id);
  }

  backToCategories(): void {
    this.selectedCategoryId.set(null);
    this.selectedTypeId.set(null);
  }

  backToTypes(): void {
    this.selectedTypeId.set(null);
  }

  /** Precio más bajo del tipo, para el "Desde $X" de las tarjetas de nivel 2. */
  formatPriceFrom(type: ProductType): string {
    const min = Math.min(...type.variants.map((variant) => variant.price));
    return new Intl.NumberFormat('es-UY', {
      style: 'currency',
      currency: type.currency,
      maximumFractionDigits: 0,
    }).format(min);
  }

  typeCountLabel(category: Category): string {
    const count = category.types.length;
    return count === 1 ? '1 tipo' : `${count} tipos`;
  }

  variantCountLabel(type: ProductType): string {
    const count = type.variants.length;
    return count === 1 ? '1 medida' : `${count} medidas`;
  }
}
