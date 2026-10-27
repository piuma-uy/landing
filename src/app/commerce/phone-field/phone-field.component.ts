import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
} from "@angular/core";
import {
  DEFAULT_COUNTRY,
  checkPhone,
  countries,
  countryOf,
  dialCode,
  formatTyping,
  fromE164,
  type CountryCode,
} from "../phone";

/**
 * "Tu celular" (T71): country (Uruguay by default) and number, formatted while typed and
 * checked with the API's rule. Always inside @defer, so libphonenumber-js loads only with the
 * checkout or the account. Emits the E.164 number, or null while it is not a valid celular.
 */
@Component({
  selector: "app-phone-field",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./phone-field.component.html",
  styleUrl: "./phone-field.component.scss",
})
export class PhoneFieldComponent {
  /** The saved number (profile) to start from; ignored once the buyer typed. */
  readonly initial = input<string | null>(null);
  readonly disabled = input(false);
  readonly phoneChange = output<string | null>();
  readonly countries = countries();
  readonly country = signal<CountryCode>(DEFAULT_COUNTRY);
  readonly dial = computed(() => dialCode(this.country()));
  readonly text = signal("");
  /** Left the field once: from then on a wrong number is explained under it. */
  readonly touched = signal(false);
  private edited = false;
  readonly check = computed(() => checkPhone(this.text(), this.country()));
  readonly problem = computed(() =>
    this.touched() ? this.check().problem : null,
  );
  readonly placeholder = computed(() =>
    this.country() === DEFAULT_COUNTRY ? "091 234 567" : "",
  );
  constructor() {
    effect(() => {
      const saved = this.initial();
      if (this.edited || !saved) return;
      const back = fromE164(saved);
      if (!back) return;
      this.country.set(back.country);
      this.text.set(back.text);
      this.phoneChange.emit(this.check().e164);
    });
  }
  typed(field: HTMLInputElement) {
    this.edited = true;
    // A number typed, pasted or autofilled with its code selects that country.
    const own = countryOf(field.value);
    if (own) this.country.set(own);
    // Formatting moves the caret to the end: only while the buyer writes at the end.
    const atEnd = field.selectionStart === field.value.length;
    const value = atEnd
      ? formatTyping(field.value, this.country())
      : field.value;
    if (value !== field.value) field.value = value;
    this.text.set(value);
    this.phoneChange.emit(this.check().e164);
  }
  chose(code: string) {
    this.edited = true;
    this.country.set(code as CountryCode);
    this.text.set(formatTyping(this.text(), this.country()));
    this.phoneChange.emit(this.check().e164);
  }
  left() {
    this.touched.set(true);
    // A valid number ends up as its country plus the number (091 813 234), however it was typed.
    const e164 = this.check().e164;
    const back = e164 && fromE164(e164);
    if (back) {
      this.country.set(back.country);
      this.text.set(back.text);
    }
  }
}
