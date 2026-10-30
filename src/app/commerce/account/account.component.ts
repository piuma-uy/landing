import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  computed,
  inject,
  signal,
  viewChild,
} from "@angular/core";
import { NgTemplateOutlet } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { CommerceService } from "../commerce.service";
import { PhoneFieldComponent } from "../phone-field/phone-field.component";
import { AuthError, type SignInResult } from "../cognito";
import { shownMessage } from "../errors";
import {
  RESEND_WAIT_S,
  codeOf,
  emailOk,
  passwordProblem,
  passwordRules,
} from "../account";

/**
 * The steps of the account forms (T61). In AWS they talk to Cognito's user pool API; in Docker
 * only "signin" and "signup" exist, against the local accounts of the API.
 */
export type Step =
  | "signin"
  | "signup"
  | "confirm"
  | "forgot"
  | "reset"
  | "newPassword"
  | "totp";

type Field = "name" | "email" | "password" | "code";

const TEXTS: Record<Step, { title: string; lead: string }> = {
  signin: {
    title: "Qué bueno verte",
    lead: "Ingresá para guardar tu carrito y seguir tus pedidos.",
  },
  signup: {
    title: "Creá tu cuenta",
    lead: "Así guardás tu carrito y seguís tus pedidos desde cualquier dispositivo.",
  },
  confirm: {
    title: "Revisá tu correo",
    lead: "Te mandamos un código de 6 dígitos para confirmar tu cuenta.",
  },
  forgot: {
    title: "Recuperá tu contraseña",
    lead: "Escribí tu correo y te mandamos un código para crear una contraseña nueva.",
  },
  reset: {
    title: "Creá una contraseña nueva",
    lead: "Si el correo tiene una cuenta en Piuma, te llegó un código de 6 dígitos.",
  },
  newPassword: {
    title: "Elegí tu contraseña",
    lead: "Es tu primer ingreso: cambiá la contraseña temporal por una propia.",
  },
  totp: {
    title: "Código de verificación",
    lead: "Escribí el código de 6 dígitos de tu app autenticadora.",
  },
};

@Component({
  selector: "app-account",
  standalone: true,
  imports: [FormsModule, NgTemplateOutlet, PhoneFieldComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./account.component.html",
  styleUrl: "./account.component.scss",
})
export class AccountComponent implements OnDestroy {
  readonly shop = inject(CommerceService);
  /** "Tu celular" as typed: E.164 once valid (T71). */
  readonly phone = signal<string | null>(null);
  readonly cognito = this.shop.cognito;
  /** Cognito without the issuer in runtime-config: only the hosted UI can sign in. */
  readonly hosted = !!this.cognito && !this.cognito.forms;
  readonly google = !!this.shop.config.cognito?.google;
  readonly step = signal<Step>("signin");
  readonly texts = computed(() => TEXTS[this.step()]);
  readonly pending = signal(false);
  readonly error = signal(this.shop.takeLoginError());
  readonly notice = signal("");
  readonly invalid = signal<Partial<Record<Field, string>>>({});
  readonly showPassword = signal(false);
  readonly rules = passwordRules(!!this.cognito);
  readonly password = signal("");
  /** Seconds left before the code can be sent again. */
  readonly resendIn = signal(0);
  /** Masked address Cognito sent the code to ("p***@g***"). */
  readonly destination = signal("");
  private readonly heading = viewChild<ElementRef<HTMLElement>>("heading");
  private timer: ReturnType<typeof setInterval> | undefined;
  email = "";
  name = "";
  code = "";

  /** The checklist is for passwords being created, not for the one already in use. */
  readonly newPassword = computed(() =>
    ["signup", "reset", "newPassword"].includes(this.step()),
  );

  ngOnDestroy() {
    clearInterval(this.timer);
  }

  go(step: Step) {
    this.step.set(step);
    this.error.set("");
    this.invalid.set({});
    this.code = "";
    this.showPassword.set(false);
    // The password typed to sign up or in stays for the confirmation, which signs in with it.
    if (["forgot", "reset", "newPassword", "totp"].includes(step))
      this.password.set("");
    // The new title is read first by screen readers and stays in view on a phone.
    requestAnimationFrame(() => this.heading()?.nativeElement.focus());
  }

  /** A field error about the length goes away as soon as the password meets the rules. */
  typePassword(value: string) {
    this.password.set(value);
    const { password, ...rest } = this.invalid();
    if (password && value && !(this.newPassword() && passwordProblem(this.rules, value)))
      this.invalid.set(rest);
  }

  /** Field errors the server never needs to see; true when the form can go. */
  private check(fields: Field[]) {
    const problems: Partial<Record<Field, string>> = {};
    if (fields.includes("name") && !this.name.trim())
      problems.name = "Escribí tu nombre.";
    if (fields.includes("email") && !emailOk(this.email))
      problems.email = "Escribí un correo válido, como nombre@gmail.com.";
    if (fields.includes("password")) {
      if (!this.password()) problems.password = "Escribí tu contraseña.";
      else if (this.newPassword()) {
        const problem = passwordProblem(this.rules, this.password());
        if (problem) problems.password = problem;
      }
    }
    if (fields.includes("code") && !codeOf(this.code))
      problems.code = "El código tiene 6 números.";
    this.invalid.set(problems);
    this.error.set("");
    const first = fields.find((f) => problems[f]);
    // The first field to fix gets the focus, so its message is read and the keyboard opens there.
    if (first)
      requestAnimationFrame(() => document.getElementById(`auth-${first}`)?.focus());
    return !first;
  }

  /** One request at a time; errors stay in this card, next to the form that caused them. */
  private async attempt(fn: () => Promise<void>) {
    if (this.pending()) return;
    this.pending.set(true);
    this.notice.set("");
    try {
      await fn();
    } catch (e) {
      this.error.set(e instanceof AuthError ? e.message : shownMessage(e));
      if (e instanceof AuthError) await this.recover(e.type);
    } finally {
      this.pending.set(false);
    }
  }

  /** Errors with a way forward move to the step that solves them. */
  private async recover(type: string) {
    const email = this.email.trim();
    if (type === "UserNotConfirmedException") {
      await this.cognito!.resendSignUpCode(email).catch(() => undefined);
      const message = this.error();
      this.go("confirm");
      this.notice.set(message);
      this.startResendWait();
    } else if (type === "PasswordResetRequiredException") {
      await this.cognito!.forgotPassword(email).catch(() => undefined);
      const message = this.error();
      this.go("reset");
      this.notice.set(message);
      this.startResendWait();
    }
  }

  private async finish(result: SignInResult) {
    if ("user" in result) {
      this.password.set("");
      await this.shop.enter(result.user);
    } else this.go(result.next);
  }

  async signIn() {
    if (!this.check(["email", "password"])) return;
    const email = this.email.trim();
    await this.attempt(async () => {
      if (this.cognito)
        await this.finish(await this.cognito.signIn(email, this.password()));
      else await this.shop.login({ email, password: this.password() });
    });
  }

  async signUp() {
    if (!this.check(["name", "email", "password"])) return;
    const input = {
      name: this.name.trim(),
      email: this.email.trim(),
      password: this.password(),
    };
    await this.attempt(async () => {
      if (!this.cognito) return this.shop.login(input, true);
      this.destination.set(await this.cognito.signUp(input));
      this.go("confirm");
      this.startResendWait();
    });
  }

  /** Confirms the account and signs in with the password typed a moment ago. */
  async confirm() {
    if (!this.check(["code"])) return;
    const email = this.email.trim();
    await this.attempt(async () => {
      await this.cognito!.confirmSignUp(email, codeOf(this.code)!);
      if (this.password())
        await this.finish(await this.cognito!.signIn(email, this.password()));
      else {
        this.go("signin");
        this.notice.set("¡Listo! Tu cuenta está confirmada. Ya podés ingresar.");
      }
    });
  }

  async resend() {
    if (this.resendIn() > 0) return;
    const email = this.email.trim();
    await this.attempt(async () => {
      if (this.step() === "confirm")
        await this.cognito!.resendSignUpCode(email);
      else await this.cognito!.forgotPassword(email);
      this.notice.set("Te mandamos un código nuevo. Puede tardar un minuto.");
      this.startResendWait();
    });
  }

  async forgot() {
    if (!this.check(["email"])) return;
    await this.attempt(async () => {
      await this.cognito!.forgotPassword(this.email.trim());
      this.go("reset");
      this.startResendWait();
    });
  }

  async reset() {
    if (!this.check(["code", "password"])) return;
    const email = this.email.trim();
    await this.attempt(async () => {
      await this.cognito!.confirmForgotPassword(
        email,
        codeOf(this.code)!,
        this.password(),
      );
      // Whoever held a session with the old password loses it (T87-04).
      await this.finish(
        await this.cognito!.signInEndingOtherSessions(email, this.password()),
      );
    });
  }

  async choosePassword() {
    if (!this.check(["password"])) return;
    await this.attempt(async () =>
      this.finish(await this.cognito!.completeNewPassword(this.password())),
    );
  }

  async totp() {
    if (!this.check(["code"])) return;
    await this.attempt(async () =>
      this.finish(await this.cognito!.completeTotp(codeOf(this.code)!)),
    );
  }

  /** Back to the start after a step that needed Cognito's session (it expires in 3 minutes). */
  restart() {
    this.cognito?.clear();
    this.go("signin");
  }

  private startResendWait() {
    clearInterval(this.timer);
    this.resendIn.set(RESEND_WAIT_S);
    this.timer = setInterval(() => {
      this.resendIn.update((s) => Math.max(0, s - 1));
      if (this.resendIn() === 0) clearInterval(this.timer);
    }, 1000);
  }

  describedBy(field: Field, extra = "") {
    return (
      [this.invalid()[field] ? `auth-${field}-error` : "", extra]
        .filter(Boolean)
        .join(" ") || null
    );
  }
}
