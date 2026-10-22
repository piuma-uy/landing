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
import { Category } from "../models/catalog.model";
import { adaptCatalog } from "../core/catalog-adapter";
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
          products === null ? undefined : adaptCatalog(source, products),
        ),
      )
    : this.source;
  getCategories(): Observable<Category[] | undefined> {
    return this.categories;
  }
  /** El catálogo del JSON: el mismo que scripts/prerender.ts convierte en páginas estáticas. */
  getPrerendered(): Observable<Category[]> {
    return this.source;
  }
}
