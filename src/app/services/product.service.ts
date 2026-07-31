import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, of, shareReplay } from 'rxjs';
import { Product } from '../models/product.model';

/**
 * Lee el catálogo desde un JSON estático.
 * Para pasar a datos reales alcanza con cambiar PRODUCTS_URL por el endpoint
 * de una API: el resto de la app no se entera.
 */
const PRODUCTS_URL = 'assets/data/products.json';

@Injectable({ providedIn: 'root' })
export class ProductService {
  private readonly http = inject(HttpClient);

  private readonly products$ = this.http.get<Product[]>(PRODUCTS_URL).pipe(
    catchError((error) => {
      console.error('No se pudo cargar el catálogo', error);
      return of([] as Product[]);
    }),
    shareReplay({ bufferSize: 1, refCount: false }),
  );

  getProducts(): Observable<Product[]> {
    return this.products$;
  }
}
