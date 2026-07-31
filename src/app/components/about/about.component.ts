import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-about',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './about.component.html',
  styleUrl: './about.component.scss',
})
export class AboutComponent {
  /** Placeholder: reemplazar por assets/images/about.jpg. */
  readonly image = 'https://picsum.photos/seed/piuma-about/900/1100';

  readonly values = [
    {
      title: 'Materiales honestos',
      text: 'Trabajamos con algodón peinado y lino europeo, sin mezclas sintéticas que acorten la vida de la pieza.',
    },
    {
      title: 'Diseño sereno',
      text: 'Una paleta neutra y cálida, pensada para que todo combine y el dormitorio se sienta en calma.',
    },
    {
      title: 'Confort que dura',
      text: 'Terminaciones reforzadas y tejidos que mejoran con cada lavado en lugar de desgastarse.',
    },
  ];
}
