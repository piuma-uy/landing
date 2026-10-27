import {
  ApplicationRef,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Meta, Title } from '@angular/platform-browser';
import { CatalogService } from '../../services/catalog.service';
import { AnalyticsService } from '../../services/analytics.service';
import { Category, ProductType } from '../../models/catalog.model';
import { SITE_CONFIG } from '../../core/site-config';
import { catalogPath, pageMeta, parseCatalogPath } from '../../core/catalog-seo';
import { ProductDetailComponent } from './product-detail/product-detail.component';
import { SizeGuideComponent } from './size-guide/size-guide.component';
import { PHOTO_SIZES, photoSrcset } from '../../core/photos';

/**
 * Catálogo de 3 niveles: categorías → tipos → detalle con variantes.
 *
 * Se maneja con estado local (signals) y no con rutas de Angular: el catálogo es una
 * sección de una landing de scroll único, así que separar en rutas obligaría a partir
 * la página o a montar el Router sólo para guardar cuál tarjeta está abierta. Ver README.
 *
 * Lo que sí se refleja es la URL (/catalogo/<categoría>/<producto>/, con la History API): son las
 * páginas que scripts/prerender.ts genera para buscadores, así que entrar directo a una abre esa
 * categoría o ficha, y abrir una tarjeta deja una URL compartible e indexable.
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
  readonly photoSrcset = photoSrcset;
  readonly photoSizes = PHOTO_SIZES;
  private readonly catalogService = inject(CatalogService);
  private readonly analytics = inject(AnalyticsService);
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly appRef = inject(ApplicationRef);

  /** `undefined` mientras carga; `[]` si la carga falló. */
  readonly categories = toSignal(this.catalogService.getCategories());
  /** Sólo lo que tiene página prerenderizada recibe URL propia (lo demás daría 404 al recargar). */
  private readonly prerendered = toSignal(this.catalogService.getPrerendered());

  private readonly initial = parseCatalogPath(location.pathname);
  readonly selectedCategoryId = signal<string | null>(this.initial?.categoryId ?? null);
  readonly selectedTypeId = signal<string | null>(this.initial?.typeId ?? null);

  /** Tarjeta cuya foto viaja a la ficha al abrirla y vuelve a su lugar al cerrarla. */
  readonly morphId = signal<string | null>(null);

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

  constructor() {
    // Title, description y canonical siguen a lo abierto, también en una entrada directa.
    effect(() => this.applyMeta());
    if (this.initial) {
      // Entrada directa a una página del catálogo: llevar la vista a la sección cuando cargue.
      const scroll = effect(() => {
        if (!this.categories()) return;
        scroll.destroy();
        // Después de un primer frame con contenido: un scroll antes deja a la página sin LCP.
        const go = () =>
          requestAnimationFrame(() => document.getElementById('catalogo')?.scrollIntoView());
        if (document.readyState === 'complete') go();
        else addEventListener('load', go, { once: true });
      });
    }
    const popstate = () => {
      const route = parseCatalogPath(location.pathname);
      this.selectedCategoryId.set(route?.categoryId ?? null);
      this.selectedTypeId.set(route?.typeId ?? null);
    };
    addEventListener('popstate', popstate);
    inject(DestroyRef).onDestroy(() => removeEventListener('popstate', popstate));
  }

  openCategory(id: string): void {
    this.selectedCategoryId.set(id);
    // Cambiar de categoría con un tipo abierto tiene que volver a la grilla de tipos.
    this.selectedTypeId.set(null);
    this.navigate();
    this.analytics.event('categoria', { id });
  }

  openType(id: string): void {
    this.morphId.set(id);
    this.transition(() => {
      this.selectedTypeId.set(id);
      this.navigate();
    });
    this.analytics.event('producto', { id });
  }

  backToCategories(): void {
    this.selectedCategoryId.set(null);
    this.selectedTypeId.set(null);
    this.navigate();
  }

  backToTypes(): void {
    this.morphId.set(this.selectedTypeId());
    this.transition(() => {
      this.selectedTypeId.set(null);
      this.navigate();
    });
  }

  /**
   * Abrir y cerrar una ficha con View Transitions: fundido corto y la foto de la tarjeta que se
   * agranda hasta la ficha (view-transition-name sólo en esa tarjeta y en la foto de la ficha).
   * Sólo ahí, donde ayuda a seguir qué se abrió: las pestañas de categoría cambian al instante,
   * porque durante la transición la página no recibe toques. Sin la API o con movimiento
   * reducido, el cambio es directo, como siempre.
   */
  private transition(update: () => void): void {
    if (
      !('startViewTransition' in document) ||
      matchMedia('(prefers-reduced-motion: reduce)').matches
    )
      return update();
    // La captura de "antes" es en el próximo frame, después de que Angular pinte morphId.
    document.startViewTransition(() => {
      update();
      this.appRef.tick();
    });
  }

  private navigate(): void {
    const categoryId = this.selectedCategoryId();
    const typeId = this.selectedTypeId();
    const page = this.prerendered()?.find((c) => c.id === categoryId);
    const linkable =
      !categoryId || (page && (!typeId || page.types.some((t) => t.id === typeId)));
    if (!linkable) return;
    const path = catalogPath(categoryId, typeId);
    if (path === location.pathname) return;
    history.pushState(null, '', path + location.search);
    this.applyMeta();
    this.analytics.pageview();
  }

  private applyMeta(): void {
    const meta = pageMeta(SITE_CONFIG.brandName, this.activeCategory(), this.activeType());
    // Una URL del catálogo que todavía carga (o que no existe) conserva lo que trajo el HTML.
    if (meta.path !== location.pathname) return;
    this.title.setTitle(meta.title);
    this.meta.updateTag({ name: 'description', content: meta.description });
    const canonical = document.querySelector<HTMLLinkElement>('link[rel=canonical]');
    if (canonical) canonical.href = new URL(meta.path, canonical.href).href;
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
