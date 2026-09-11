import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-about',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './about.component.html',
  styleUrl: './about.component.scss',
})
export class AboutComponent {
  readonly image = 'assets/images/sobre-nosotros-piuma.webp';

  readonly values = [
    {
      title: 'Más de 20 años',
      text: 'Dos décadas en el rubro textil para el hogar, con la misma gente atendiendo del otro lado.',
    },
    {
      title: '100% algodón',
      text: 'Toda la línea es de algodón puro, salvo la funda nórdica de lino, que combina 55% lino y 45% algodón.',
    },
    {
      title: 'Empresa familiar',
      text: 'Elegimos cada tela nosotros mismos y respondemos personalmente cada consulta.',
    },
  ];
}
