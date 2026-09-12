import { Injectable, inject } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { toObservable } from "@angular/core/rxjs-interop";
import {
  Observable,
  catchError,
  combineLatest,
  map,
  of,
  shareReplay,
} from "rxjs";
import { Category, ProductType, Variant } from "../models/catalog.model";
import { CommerceService, Product } from "../commerce/commerce.service";
@Injectable({ providedIn: "root" })
export class CatalogService {
  private readonly http = inject(HttpClient);
  private readonly shop = inject(CommerceService);
  private readonly source = this.http
    .get<Category[]>("assets/data/catalog.json")
    .pipe(
      catchError(() => of([] as Category[])),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
  private readonly categories = this.shop.enabled
    ? combineLatest([this.source, toObservable(this.shop.products)]).pipe(
        map(([source, products]) =>
          products === null ? undefined : this.adapt(source, products),
        ),
      )
    : this.source;
  getCategories(): Observable<Category[] | undefined> {
    return this.categories;
  }
  private adapt(source: Category[], products: Product[]): Category[] {
    const categories = new Map<string, Category>();
    for (const p of products) {
      const originalCategory = source.find((c) => c.id === p.categoryId);
      let category = categories.get(p.categoryId);
      if (!category) {
        category = {
          id: p.categoryId,
          name: originalCategory?.name ?? p.categoryId.replace(/-/g, " "),
          image: originalCategory?.image ?? p.image,
          alt: originalCategory?.alt ?? p.name,
          types: [],
        };
        categories.set(p.categoryId, category);
      }
      const original = originalCategory?.types.find(
        (t) => t.id === p.productId,
      );
      let type = category.types.find((t) => t.id === p.productId);
      if (!type) {
        type = {
          ...(original ?? {}),
          id: p.productId,
          name: original?.name ?? p.name,
          fullName: p.name,
          material: original?.material ?? null,
          description: p.description,
          currency: p.currency,
          image: p.image,
          alt: original?.alt ?? p.name,
          variants: [],
        };
        category.types.push(type);
      }
      let variant = type.variants.find((v) => v.size === p.size);
      if (!variant) {
        variant = {
          ...(original?.variants.find((v) => v.size === p.size) ?? {}),
          size: p.size,
          productSize:
            original?.variants.find((v) => v.size === p.size)?.productSize ??
            p.size,
          colors: [],
          price: p.priceMinor / 100,
          skuByColor: {},
          priceByColor: {},
          stockByColor: {},
        };
        type.variants.push(variant);
      }
      variant.colors.push(p.color);
      variant.skuByColor![p.color] = p.sku;
      variant.priceByColor![p.color] = p.priceMinor;
      variant.stockByColor![p.color] = p.stock;
      variant.price = Math.min(variant.price, p.priceMinor / 100);
    }
    return [...categories.values()];
  }
}
