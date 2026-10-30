import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Meta, Title } from '@angular/platform-browser';
import { CommerceService } from '../../commerce/commerce.service';
import { SITE_CONFIG } from '../../core/site-config';
import { LEGAL_DRAFT, legalDocs, pendingParts } from '../../core/legal';
import { LEGAL_PAGES, type LegalId } from '../../core/legal-pages';
import { formatWhatsapp } from '../../core/whatsapp';

const DOCS = legalDocs(LEGAL_PAGES, formatWhatsapp(SITE_CONFIG.whatsappNumber));

/**
 * /privacidad/, /terminos/ y /cambios-y-devoluciones/ (T89). Va en un chunk aparte (@defer en
 * AppComponent): el texto no suma al bundle inicial. Mismo texto que el prerender.
 */
@Component({
  selector: 'app-legal-page',
  standalone: true,
  imports: [NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './legal-page.component.html',
  styleUrl: './legal-page.component.scss',
})
export class LegalPageComponent {
  readonly page = input.required<LegalId>();
  readonly shop = inject(CommerceService);
  readonly draft = LEGAL_DRAFT;
  readonly doc = computed(() => DOCS.find((d) => d.id === this.page())!);
  readonly others = computed(() => LEGAL_PAGES.filter((p) => p.id !== this.page()));
  readonly parts = pendingParts;

  constructor() {
    // Abierta sin recargar: título y description propios mientras se ve, como en el prerender.
    const title = inject(Title);
    const meta = inject(Meta);
    const before = { title: title.getTitle(), description: meta.getTag('name="description"')?.content };
    effect(() => {
      const doc = this.doc();
      title.setTitle(`${doc.title} | ${SITE_CONFIG.brandName}`);
      meta.updateTag({ name: 'description', content: doc.description });
    });
    inject(DestroyRef).onDestroy(() => {
      title.setTitle(before.title);
      if (before.description) meta.updateTag({ name: 'description', content: before.description });
    });
  }

  back() {
    history.back();
  }
}
