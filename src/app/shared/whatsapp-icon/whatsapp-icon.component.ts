import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Logo de WhatsApp como SVG inline: hereda el color del texto y no lo leen los lectores. */
@Component({
  selector: 'app-whatsapp-icon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.61-.92-2.21-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.06 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.76-.72 2-1.41.25-.7.25-1.29.17-1.42-.07-.13-.27-.2-.57-.35ZM12.05 21.8h-.02a9.76 9.76 0 0 1-4.97-1.36l-.36-.21-3.7.97.99-3.6-.23-.37a9.72 9.72 0 0 1-1.49-5.2c0-5.38 4.39-9.76 9.79-9.76a9.7 9.7 0 0 1 6.91 2.87 9.66 9.66 0 0 1 2.86 6.9c0 5.38-4.39 9.76-9.78 9.76ZM20.5 3.5A11.66 11.66 0 0 0 12.05 0C5.6 0 .35 5.24.35 11.68c0 2.06.54 4.07 1.56 5.84L.25 24l6.65-1.74a11.7 11.7 0 0 0 5.15 1.31h.01c6.44 0 11.69-5.24 11.69-11.68 0-3.12-1.22-6.05-3.25-8.26Z"
      />
    </svg>
  `,
  styles: `
    :host {
      display: inline-flex;
      flex-shrink: 0;
    }
    svg {
      width: 1.25em;
      height: 1.25em;
    }
  `,
})
export class WhatsappIconComponent {}
