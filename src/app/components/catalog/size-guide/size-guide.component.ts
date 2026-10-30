import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { Category } from '../../../models/catalog.model';
import { GUIDE_COLUMNS, PILLOWCASE_SIZES, SIZE_GUIDE, guideColumn } from '../../../core/size-guide';

/** "¿Qué medida necesito?": la tabla de Piuma, una columna por categoría (T91). */
@Component({
  selector: 'app-size-guide',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './size-guide.component.html',
  styleUrl: './size-guide.component.scss',
})
export class SizeGuideComponent {
  readonly activeCategory = input<Category | null>(null);

  readonly open = signal(false);
  readonly columns = GUIDE_COLUMNS;
  readonly rows = SIZE_GUIDE;
  readonly pillowcases = PILLOWCASE_SIZES.join(' y ');

  /** Si estás en Sábanas se resalta la columna de sábanas. */
  readonly highlight = computed(() => guideColumn(this.activeCategory()?.id));

  toggle(): void {
    this.open.update((value) => !value);
  }
}
