import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { CommerceService } from '../../commerce/commerce.service';
import { SITE_CONFIG } from '../../core/site-config';
import { LEGAL_LINKS } from '../../core/site-env';
import { WITHDRAWAL_LABEL, type WithdrawalForm } from '../../core/withdrawal';
import {
  WITHDRAWAL_REASON_MAX,
  checkWithdrawal,
  receiptTime,
  sendWithdrawal,
  withdrawalBody,
  type WithdrawalProblems,
  type WithdrawalReceipt,
} from '../../core/withdrawal-form';
import { WhatsappService } from '../../services/whatsapp.service';

const DESCRIPTION =
  'Arrepentite de una compra hecha en la tienda online de Piuma: número de pedido, mail o teléfono y listo. Te damos un número de solicitud.';

/**
 * /arrepentimiento/ (T109): el «Botón de arrepentimiento». Formulario mínimo y la constancia con el
 * número de solicitud. Va en su propio chunk (@defer en AppComponent).
 */
@Component({
  selector: 'app-withdrawal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './withdrawal.component.html',
  styleUrl: './withdrawal.component.scss',
})
export class WithdrawalComponent {
  readonly shop = inject(CommerceService);
  readonly whatsapp = inject(WhatsappService);
  readonly label = WITHDRAWAL_LABEL;
  readonly reasonMax = WITHDRAWAL_REASON_MAX;
  readonly email = SITE_CONFIG.email;
  /** «Cambios y devoluciones», si este build la publica (T99). */
  readonly returnsPage = LEGAL_LINKS.find((p) => p.id === 'cambios') ?? null;

  readonly form = signal<WithdrawalForm>({
    orderCode: this.shop.withdrawalPrefill()?.orderCode ?? '',
    contact: this.shop.withdrawalPrefill()?.contact ?? '',
    reason: '',
  });
  readonly problems = signal<WithdrawalProblems>({});
  readonly sending = signal(false);
  readonly error = signal('');
  readonly receipt = signal<WithdrawalReceipt | null>(null);
  /** El contacto tal como lo escribió, para la constancia. */
  readonly sentContact = signal('');
  readonly when = computed(() => {
    const r = this.receipt();
    return r ? receiptTime(r.createdAt) : '';
  });
  readonly mailLink = computed(
    () =>
      `mailto:${this.email}?subject=${encodeURIComponent('Me arrepiento de mi compra')}` +
      `&body=${encodeURIComponent(this.message())}`,
  );
  readonly whatsappLink = computed(() => this.whatsapp.link(this.message()));
  /** Una clave por intento (Idempotency-Key): la misma para reintentar lo mismo, otra si cambió. */
  private attempt: { body: string; key: string } | null = null;

  constructor() {
    const title = inject(Title);
    const meta = inject(Meta);
    const before = { title: title.getTitle(), description: meta.getTag('name="description"')?.content };
    title.setTitle(`${WITHDRAWAL_LABEL} | ${SITE_CONFIG.brandName}`);
    meta.updateTag({ name: 'description', content: DESCRIPTION });
    inject(DestroyRef).onDestroy(() => {
      title.setTitle(before.title);
      if (before.description) meta.updateTag({ name: 'description', content: before.description });
    });
  }

  private message() {
    const code = this.form().orderCode.trim();
    return `Hola ${SITE_CONFIG.brandName}, me arrepiento de mi compra${code ? `, pedido ${code}` : ''}.`;
  }

  set(field: keyof WithdrawalForm, event: Event) {
    const value = (event.target as HTMLInputElement | HTMLTextAreaElement).value;
    this.form.update((f) => ({ ...f, [field]: value }));
    if (this.problems()[field]) this.problems.update((p) => ({ ...p, [field]: undefined }));
  }

  async submit(event: Event) {
    event.preventDefault();
    if (this.sending()) return;
    this.error.set('');
    const problems = checkWithdrawal(this.form());
    this.problems.set(problems);
    const first = (['orderCode', 'contact', 'reason'] as const).find((f) => problems[f]);
    if (first) {
      document.getElementById(`withdrawal-${first}`)?.focus();
      return;
    }
    const body = withdrawalBody(this.form());
    const serialized = JSON.stringify(body);
    if (this.attempt?.body !== serialized) this.attempt = { body: serialized, key: crypto.randomUUID() };
    this.sending.set(true);
    const result = await sendWithdrawal(
      (path, init) => this.shop.publicFetch(path, init),
      body,
      this.attempt.key,
    );
    this.sending.set(false);
    if ('receipt' in result) {
      this.sentContact.set(body.contact);
      this.receipt.set(result.receipt);
      window.scrollTo({ top: 0 });
      requestAnimationFrame(() => document.getElementById('withdrawal-receipt')?.focus({ preventScroll: true }));
    } else if ('problems' in result) this.problems.set(result.problems);
    else
      this.error.set(
        result.error ||
          'No pudimos enviar el pedido. Probá de nuevo en unos minutos o avisanos por mail o WhatsApp.',
      );
  }
}
