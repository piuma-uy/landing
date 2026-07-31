import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { ProductService } from '../../services/product.service';
import { ProductCardComponent } from './product-card/product-card.component';

@Component({
  selector: 'app-catalog',
  standalone: true,
  imports: [AsyncPipe, ProductCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './catalog.component.html',
  styleUrl: './catalog.component.scss',
})
export class CatalogComponent {
  private readonly productService = inject(ProductService);

  readonly products$ = this.productService.getProducts();
}
