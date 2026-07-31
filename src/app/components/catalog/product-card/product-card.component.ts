import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Product } from '../../../models/product.model';
import { WhatsappService } from '../../../services/whatsapp.service';

@Component({
  selector: 'app-product-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './product-card.component.html',
  styleUrl: './product-card.component.scss',
})
export class ProductCardComponent {
  private readonly whatsapp = inject(WhatsappService);

  readonly product = input.required<Product>();

  readonly whatsappLink = computed(() => this.whatsapp.productLink(this.product().name));

  readonly formattedPrice = computed(() =>
    new Intl.NumberFormat('es-UY', {
      style: 'currency',
      currency: this.product().currency,
      maximumFractionDigits: 0,
    }).format(this.product().price),
  );
}
