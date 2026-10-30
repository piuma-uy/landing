// API products (one per SKU) grouped back into the landing's category → type → size shape,
// keeping the copy and images of the static catalog when the ids match.
// Framework-free so it can be unit tested with `node --test` (see tests/catalog.test.ts).
import type { Category } from "../models/catalog.model";
import type { Product } from "../commerce/commerce.service";
import { sortCatalogSizes } from "./sizes";

export function adaptCatalog(
  source: Category[],
  products: Product[],
): Category[] {
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
    const original = originalCategory?.types.find((t) => t.id === p.productId);
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
  return sortCatalogSizes([...categories.values()]);
}
