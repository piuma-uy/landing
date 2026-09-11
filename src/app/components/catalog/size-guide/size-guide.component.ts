import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { Category, ProductType } from '../../../models/catalog.model';

/**
 * Las medidas de producto se agrupan en dos familias (verificado contra la lista de
 * precios 2026, tamaño por tamaño):
 *   - Sábanas = Funda nórdica Satén = Funda nórdica Lino  → columna "linen"
 *   - Acolchados = Funda nórdica Downproof               → columna "duvet"
 * Ojo: "Fundas nórdicas" como categoría NO comparte medidas con los acolchados; sólo
 * la Downproof. Satén y Lino difieren en 4-5 tamaños, por eso van con las sábanas.
 *
 * Cada columna se lee de un producto de referencia que tiene los 6 tamaños, así la
 * tabla sale del catálogo y no puede desincronizarse de los precios.
 */
const LINEN_REF = 'sabanas-percal';
const DUVET_REF = 'acolchado-pluma-natural';
const SIZES = ['Twin', 'Plaza y media', 'Dos plazas / Full', 'Queen', 'King', 'Super King'];

type Column = 'linen' | 'duvet';

/** Qué columna le corresponde a cada categoría, para resaltarla al estar adentro. */
const COLUMN_BY_CATEGORY: Record<string, Column | undefined> = {
  sabanas: 'linen',
  acolchados: 'duvet',
  cubrecamas: 'duvet',
  // fundas-nordicas usa las dos (Satén/Lino vs Downproof): no se resalta ninguna.
};

interface SizeRow {
  size: string;
  bed: string | null;
  linen: string;
  duvet: string;
}

@Component({
  selector: 'app-size-guide',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './size-guide.component.html',
  styleUrl: './size-guide.component.scss',
})
export class SizeGuideComponent {
  readonly categories = input.required<Category[]>();
  readonly activeCategory = input<Category | null>(null);

  readonly open = signal(false);

  readonly rows = computed<SizeRow[]>(() => {
    const types = this.categories().flatMap((category) => category.types);
    const linen = types.find((type) => type.id === LINEN_REF);
    const duvet = types.find((type) => type.id === DUVET_REF);

    return SIZES.map((size) => {
      const linenVariant = findSize(linen, size);
      return {
        size,
        bed: linenVariant?.bedSize ? formatSize(linenVariant.bedSize) : null,
        linen: formatSize(linenVariant?.productSize),
        duvet: formatSize(findSize(duvet, size)?.productSize),
      };
    });
  });

  readonly highlight = computed<Column | null>(() => {
    const id = this.activeCategory()?.id;
    return (id && COLUMN_BY_CATEGORY[id]) || null;
  });

  toggle(): void {
    this.open.update((value) => !value);
  }
}

function findSize(type: ProductType | undefined, size: string) {
  return type?.variants.find((variant) => variant.size === size);
}

/** "240x270 cm" → "240 x 270". Los centímetros van una sola vez, en el encabezado. */
function formatSize(value: string | undefined): string {
  return value ? value.replace(' cm', '').replace('x', ' x ') : '—';
}
