import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { SITE_CONFIG } from '../../core/site-config';
import { WhatsappService } from '../../services/whatsapp.service';
import { SocialLinksComponent } from '../../shared/social-links/social-links.component';

@Component({
  selector: 'app-contact',
  standalone: true,
  imports: [ReactiveFormsModule, SocialLinksComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './contact.component.html',
  styleUrl: './contact.component.scss',
})
export class ContactComponent {
  private readonly fb = inject(FormBuilder);
  private readonly whatsapp = inject(WhatsappService);

  readonly config = SITE_CONFIG;
  readonly whatsappLink = this.whatsapp.generalLink();
  readonly submitted = signal(false);

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    message: ['', [Validators.required, Validators.minLength(10)]],
  });

  isInvalid(field: 'name' | 'email' | 'message'): boolean {
    const control = this.form.controls[field];
    return control.invalid && (control.touched || control.dirty);
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    // =========================================================================
    // AQUÍ SE CONECTA EL ENVÍO REAL DE EMAILS.
    //
    // Hoy no hay backend: sólo mostramos la confirmación en pantalla.
    // Para que el formulario envíe de verdad, elegí un servicio y reemplazá
    // este bloque por un POST. Ejemplo con Web3Forms o Formspree:
    //
    //   const http = inject(HttpClient);   // ya está provisto en main.ts
    //
    //   http.post('https://api.web3forms.com/submit', {
    //     access_key: 'TU_ACCESS_KEY',     // guardala en environments/
    //     ...this.form.getRawValue(),
    //   }).subscribe({
    //     next: () => this.submitted.set(true),
    //     error: () => { /* mostrar mensaje de error al usuario */ },
    //   });
    //
    // Formspree es equivalente: POST a https://formspree.io/f/TU_FORM_ID
    // con el mismo body y el header 'Accept: application/json'.
    // =========================================================================

    this.submitted.set(true);
    this.form.reset();
  }

  resetForm(): void {
    this.submitted.set(false);
  }
}
