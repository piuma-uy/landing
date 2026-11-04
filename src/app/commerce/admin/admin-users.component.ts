import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  OnInit,
  afterNextRender,
  inject,
  signal,
  viewChild,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { CommerceService } from "../commerce.service";
import {
  AdminUsersApi,
  EMAIL_HINT,
  accessLabel,
  addedNotice,
  changeText,
  normalizeEmail,
  removedNotice,
  sinceLabel,
  validEmail,
  type Admin,
  type AdminList,
} from "../admin-users";
import { dateTime } from "../orders";
import { shownMessage } from "../errors";

/** What the "¿Estás seguro?" dialog is about to do. */
type Pending =
  { kind: "add"; email: string } | { kind: "remove"; admin: Admin };

/**
 * Administrar → Usuarios (T106): the administrators, "Agregar administrador" by email and
 * "Quitar permisos", each behind the same "¿Estás seguro?" as the transfers. Its own chunk
 * (deferred in admin.component.html), so only administrators who open the tab download it.
 */
@Component({
  selector: "app-admin-users",
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./admin-users.component.html",
  styleUrls: [
    "../commerce.component.scss",
    "../transfers.component.scss",
    "./admin-users.component.scss",
  ],
})
export class AdminUsersComponent implements OnInit {
  readonly shop = inject(CommerceService);
  private readonly injector = inject(Injector);
  private readonly users = new AdminUsersApi(this.shop.api);
  private readonly dialog =
    viewChild<ElementRef<HTMLDialogElement>>("sureDialog");
  readonly list = signal<AdminList | null>(null);
  readonly loadError = signal("");
  readonly pending = signal<Pending | null>(null);
  readonly dialogError = signal("");
  /** Shown under the field after a try with an invalid address. */
  readonly emailError = signal("");
  email = "";
  readonly sinceLabel = sinceLabel;
  readonly accessLabel = accessLabel;
  readonly changeText = changeText;
  readonly dateTime = dateTime;
  readonly emailHint = EMAIL_HINT;

  ngOnInit() {
    void this.load();
  }
  async load() {
    this.loadError.set("");
    try {
      this.list.set(await this.users.list());
    } catch (e) {
      this.loadError.set(shownMessage(e));
    }
  }
  /** "Agregar administrador": checks the address here first, then asks. */
  askAdd() {
    if (!validEmail(this.email)) {
      this.emailError.set(EMAIL_HINT);
      return;
    }
    this.emailError.set("");
    const email = normalizeEmail(this.email);
    if (this.list()?.items.some((a) => a.email.toLowerCase() === email)) {
      this.emailError.set(`${email} ya es administrador.`);
      return;
    }
    this.open({ kind: "add", email });
  }
  askRemove(admin: Admin) {
    this.open({ kind: "remove", admin });
  }
  private open(p: Pending) {
    this.dialogError.set("");
    this.pending.set(p);
    afterNextRender(() => this.dialog()?.nativeElement.showModal(), {
      injector: this.injector,
    });
  }
  /** A tap on the dimmed page around the dialog is "Volver". */
  closeOnBackdrop(event: MouseEvent) {
    const dialog = this.dialog()?.nativeElement;
    if (event.target === dialog) dialog?.close();
  }
  async confirm(p: Pending) {
    await this.shop.run(async () => {
      if (p.kind === "add") {
        const r = await this.users.add(p.email);
        this.email = "";
        this.shop.notice.set(addedNotice(r));
      } else {
        await this.users.remove(p.admin);
        this.shop.notice.set(removedNotice(p.admin));
      }
    });
    if (this.shop.error()) {
      // Said once, inside the dialog that is still open.
      this.dialogError.set(this.shop.error());
      this.shop.error.set("");
      return;
    }
    this.dialog()?.nativeElement.close();
    await this.load();
  }
}
