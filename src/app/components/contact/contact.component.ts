import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from "@angular/core";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { SITE_CONFIG } from "../../core/site-config";
import { contactMessage } from "../../core/whatsapp";
import { WhatsappService } from "../../services/whatsapp.service";
import { WhatsappIconComponent } from "../../shared/whatsapp-icon/whatsapp-icon.component";
import { SocialLinksComponent } from "../../shared/social-links/social-links.component";

@Component({
  selector: "app-contact",
  standalone: true,
  imports: [ReactiveFormsModule, SocialLinksComponent, WhatsappIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./contact.component.html",
  styleUrl: "./contact.component.scss",
})
export class ContactComponent {
  private readonly fb = inject(FormBuilder);
  readonly whatsapp = inject(WhatsappService);

  readonly config = SITE_CONFIG;
  readonly submitted = signal(false);
  readonly preparedLink = signal("");

  readonly form = this.fb.nonNullable.group({
    name: [
      "",
      [Validators.required, Validators.minLength(2), Validators.maxLength(100)],
    ],
    email: [
      "",
      [Validators.required, Validators.email, Validators.maxLength(254)],
    ],
    message: [
      "",
      [
        Validators.required,
        Validators.minLength(10),
        Validators.maxLength(1000),
      ],
    ],
  });

  isInvalid(field: "name" | "email" | "message"): boolean {
    const control = this.form.controls[field];
    return control.invalid && (control.touched || control.dirty);
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { name, email, message } = this.form.getRawValue();
    this.preparedLink.set(
      this.whatsapp.link(contactMessage(name, email, message)),
    );
    this.submitted.set(true);
    this.form.reset();
  }

  resetForm(): void {
    this.submitted.set(false);
  }
}
