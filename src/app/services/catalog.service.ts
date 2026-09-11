import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, of, shareReplay } from 'rxjs';
import { Category } from '../models/catalog.model';

/**
 * Lee el catálogo jerárquico (categorías → tipos → variantes) desde un JSON estático.
 * Para pasar a datos reales alcanza con cambiar CATALOG_URL por el endpoint de una API:
 * el resto de la app no se entera.
 */
const CATALOG_URL = 'assets/data/catalog.json';

@Injectable({ providedIn: 'root' })
export class CatalogService {
  private readonly http = inject(HttpClient);

  private readonly categories$ = this.http.get<Category[]>(CATALOG_URL).pipe(
    catchError((error) => {
      console.error('No se pudo cargar el catálogo', error);
      return of([] as Category[]);
    }),
    shareReplay({ bufferSize: 1, refCount: false }),
  );

  getCategories(): Observable<Category[]> {
    return this.categories$;
  }
}
