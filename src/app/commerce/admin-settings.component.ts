import {
  ChangeDetectionStrategy,
  Component,
  Injector,
  afterNextRender,
  computed,
  inject,
  linkedSignal,
  signal,
} from "@angular/core";
import { NgTemplateOutlet } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { CommerceService } from "./commerce.service";
import {
  ACCOUNT_TYPES,
  BANKS,
  CURRENCIES,
  RECOMMENDED,
  SECTIONS,
  emptyZone,
  firstIncomplete,
  hoursLabel,
  isRecommended,
  localWhatsapp,
  sameForm,
  sectionForm,
  sectionProblems,
  sectionStatus,
  whatsappNumber,
  zoneSummary,
  type Forms,
  type LimitsForm,
  type SectionId,
  type ShippingForm,
  type ZoneCost,
  type ZoneForm,
} from "./settings-form";
import { historyItem } from "./settings-history";
import type { Settings } from "./transfer";

/** Zones a store keeps; the API accepts up to 30. */
const MAX_ZONES = 30;
/** History items on screen at first, and how many more each "Ver más" shows. */
const HISTORY_FIRST = 5;
const HISTORY_MORE = 10;
/** Every section folds (T66); this sessionStorage slot remembers them in this tab. */
const FOLDS_SLOT = "piuma-settings-folds";

/**
 * Configuración del panel (T62): four sections in plain words, each saved on its own, and the
 * compact history of changes. The API contract is unchanged: every save is the full settings
 * with one section replaced (CommerceService.saveSettingsSection).
 */
@Component({
  selector: "app-admin-settings",
  standalone: true,
  imports: [FormsModule, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./admin-settings.component.html",
  styleUrl: "./admin-settings.component.scss",
})
export class AdminSettingsComponent {
  readonly shop = inject(CommerceService);
  private readonly injector = inject(Injector);
  readonly banks = BANKS;
  readonly currencies = CURRENCIES;
  readonly maxZones = MAX_ZONES;
  readonly costs: { value: ZoneCost; label: string }[] = [
    { value: "free", label: "Gratis" },
    { value: "paid", label: "Precio fijo" },
    { value: "coordinate", label: "A coordinar por WhatsApp" },
  ];
  readonly holdFields: {
    key: "transferHold" | "cardHold" | "pendingHold";
    label: string;
    recommended: number;
    extra: string;
  }[] = [
    {
      key: "transferHold",
      label: "Por transferencia",
      recommended: RECOMMENDED.transferHold,
      extra: "",
    },
    {
      key: "cardHold",
      label: "Con tarjeta",
      recommended: RECOMMENDED.cardHold,
      extra: "",
    },
    {
      key: "pendingHold",
      label: "Sin forma de pago",
      recommended: RECOMMENDED.pendingHold,
      extra: "Sólo cuenta cuando la tienda no tiene pagos activados.",
    },
  ];
  readonly countFields: {
    key: "maxOpen" | "maxUnitsUser" | "maxUnitsSku";
    label: string;
    recommended: number;
  }[] = [
    {
      key: "maxOpen",
      label: "Pedidos sin pagar a la vez",
      recommended: RECOMMENDED.maxOpen,
    },
    {
      key: "maxUnitsUser",
      label: "Productos en total",
      recommended: RECOMMENDED.maxUnitsUser,
    },
    {
      key: "maxUnitsSku",
      label: "Unidades de un mismo producto",
      recommended: RECOMMENDED.maxUnitsSku,
    },
  ];
  readonly pay = this.section("pay");
  readonly contact = this.section("contact");
  readonly shipping = this.section("shipping");
  readonly limits = this.section("limits");
  /** Outcome of the last save of each section: saved, or why the form changed under Piuma. */
  readonly outcome = signal<
    Partial<Record<SectionId, { ok: boolean; message: string }>>
  >({});
  /** Sections whose save was refused by a problem: every problem of them shows. */
  private readonly submitted = signal<ReadonlySet<SectionId>>(new Set());
  /** "section.field" left at least once: its problem shows from then on. */
  private readonly touched = signal<ReadonlySet<string>>(new Set());
  /** Offered only once the API sends WhatsApp messages (runtime-config whatsappAlerts). */
  readonly whatsappAlerts = this.shop.config.whatsappAlerts === true;
  /** Folds the admin opened or closed in this tab. */
  private readonly chosenFolds = signal(readFolds());
  /**
   * The section that opens on its own: the first with incomplete data, decided once when the
   * settings arrive, so saving it does not fold it under the finger. Undefined until then.
   */
  private readonly opensAlone = linkedSignal<
    Settings | null,
    SectionId | null | undefined
  >({
    source: () => this.shop.settings(),
    computation: (s, previous) =>
      previous?.value !== undefined
        ? previous.value
        : s
          ? firstIncomplete(s)
          : undefined,
  });
  /** Open state of each section: as left in this tab, else folded but the one that opens alone. */
  readonly folds = computed(() => {
    const chosen = this.chosenFolds();
    const alone = this.opensAlone();
    return Object.fromEntries(
      SECTIONS.map((id) => [id, chosen[id] ?? id === alone]),
    ) as Record<SectionId, boolean>;
  });
  /** Zone cards unfolded for editing; new zones open unfolded. */
  readonly openZones = signal<ReadonlySet<ZoneForm>>(new Set());
  readonly historyShown = signal(HISTORY_FIRST);
  readonly historyItems = computed(() => {
    const me = this.shop.user()?.email ?? null;
    const now = Date.now();
    return this.shop
      .history()
      .map((e) => historyItem(e, me, now))
      .filter((i) => !!i);
  });
  readonly visibleHistory = computed(() =>
    this.historyItems().slice(0, this.historyShown()),
  );

  /** Stored values of one section (unchanged while other sections save) and its editable copy. */
  private section<K extends SectionId>(id: K) {
    const saved = computed(
      () => {
        const s = this.shop.settings();
        return s ? sectionForm(id, s) : null;
      },
      { equal: sameForm },
    );
    const draft = linkedSignal<Forms[K] | null>(() => {
      const f = saved();
      return f && structuredClone(f);
    });
    return { saved, draft };
  }
  private forms() {
    return {
      pay: this.pay,
      contact: this.contact,
      shipping: this.shipping,
      limits: this.limits,
    } as { [K in SectionId]: ReturnType<AdminSettingsComponent["section"]> };
  }

  accountTypes(current: string) {
    return current && !ACCOUNT_TYPES.includes(current)
      ? [...ACCOUNT_TYPES, current]
      : ACCOUNT_TYPES;
  }
  /** Template outlets pass the section as a plain string. */
  result(id: string) {
    return this.outcome()[id as SectionId];
  }
  dirty(id: SectionId) {
    const { saved, draft } = this.forms()[id];
    return !sameForm(saved(), draft());
  }
  problems(id: SectionId) {
    const settings = this.shop.settings();
    const draft = this.forms()[id].draft();
    return settings && draft
      ? sectionProblems(id, draft as Forms[typeof id], settings)
      : {};
  }
  /** The problem of a field once Piuma left it or tried to save. */
  problem(id: SectionId, field: string) {
    const shown =
      this.submitted().has(id) || this.touched().has(`${id}.${field}`);
    return shown ? (this.problems(id)[field] ?? "") : "";
  }
  /**
   * Left with something typed: from now on its problem shows. An empty field only complains on
   * save, so leaving it never pushes the rest of the form under the finger.
   */
  touch(id: SectionId, field: string, value: unknown) {
    if (!String(value ?? "").trim()) return;
    this.touched.update((t) => new Set(t).add(`${id}.${field}`));
  }
  discard(id: SectionId) {
    const { saved, draft } = this.forms()[id];
    draft.set(structuredClone(saved()));
    this.forget(id);
  }
  private forget(id: SectionId) {
    this.submitted.update((s) => {
      const next = new Set(s);
      next.delete(id);
      return next;
    });
    this.touched.update(
      (t) => new Set([...t].filter((k) => !k.startsWith(id + "."))),
    );
  }
  async save(id: SectionId) {
    const draft = this.forms()[id].draft();
    if (!draft) return;
    const fields = Object.keys(this.problems(id));
    if (fields.length) {
      this.submitted.update((s) => new Set(s).add(id));
      this.setFold(id, true);
      if (id === "shipping")
        this.openProblemZones(draft as ShippingForm, fields);
      this.outcome.update((o) => ({ ...o, [id]: undefined }));
      // After the render that shows the messages: focus the first field to fix.
      this.focusAfterRender(this.fieldId(id, fields[0]!));
      return;
    }
    const result = await this.shop.saveSettingsSection(id, draft);
    if (!result.message) return;
    this.forget(id);
    this.outcome.update((o) => ({ ...o, [id]: result }));
  }
  /** Once the field is on screen, and only that render: never later, in the middle of typing. */
  private focusAfterRender(elementId: string) {
    afterNextRender(() => document.getElementById(elementId)?.focus(), {
      injector: this.injector,
    });
  }
  fieldId(id: SectionId, field: string) {
    return `${id}-${field.replace(".", "-")}`;
  }
  /** aria-describedby of a field: its help line and, when shown, its problem. */
  describedBy(id: SectionId, field: string, help = false) {
    const base = this.fieldId(id, field);
    return (
      [
        help ? base + "-help" : "",
        this.problem(id, field) ? base + "-error" : "",
      ]
        .filter(Boolean)
        .join(" ") || null
    );
  }

  /** "099123456" or "+598 99 123 456" become "99 123 456" when Piuma leaves the field. */
  tidyWhatsapp(f: Forms["contact"]) {
    const e164 = whatsappNumber(f.whatsapp);
    if (e164) f.whatsapp = localWhatsapp(e164);
    this.touch("contact", "whatsapp", f.whatsapp);
  }

  zoneSummary(z: ZoneForm) {
    return zoneSummary(z, (minor) => this.shop.money(minor));
  }
  toggleZone(z: ZoneForm) {
    this.openZones.update((open) => {
      const next = new Set(open);
      if (!next.delete(z)) next.add(z);
      return next;
    });
  }
  setCost(z: ZoneForm, cost: ZoneCost) {
    z.cost = cost;
    if (cost !== "paid") z.price = null;
  }
  addZone(f: ShippingForm) {
    const zone = emptyZone();
    f.zones.push(zone);
    this.openZones.update((open) => new Set(open).add(zone));
    this.focusAfterRender(
      this.fieldId("shipping", `zone${f.zones.length - 1}.name`),
    );
  }
  removeZone(f: ShippingForm, index: number) {
    f.zones.splice(index, 1);
    // Problems are by position: they follow the zones that moved up.
    this.touched.update(
      (t) => new Set([...t].filter((k) => !k.startsWith("shipping.zone"))),
    );
  }
  private openProblemZones(f: ShippingForm, fields: string[]) {
    const open = new Set(this.openZones());
    for (const field of fields) {
      const m = /^zone(\d+)\./.exec(field);
      const zone = m && f.zones[Number(m[1])];
      if (zone) open.add(zone);
    }
    this.openZones.set(open);
  }

  /** "Son 2 días. Recomendado: 48 horas." under an hours field. */
  holdHint(hours: number | null, recommended: number, extra: string) {
    const now = hoursLabel(hours);
    return [
      now.includes("= ") ? "Son " + now.slice(now.indexOf("= ") + 2) + "." : "",
      `Recomendado: ${recommended} horas.`,
      extra,
    ]
      .filter(Boolean)
      .join(" ");
  }
  useRecommended(f: LimitsForm) {
    f.transferHold = RECOMMENDED.transferHold;
    f.cardHold = RECOMMENDED.cardHold;
    f.pendingHold = RECOMMENDED.pendingHold;
    f.maxOpen = RECOMMENDED.maxOpen;
    if (f.maxUnitsUser !== undefined) f.maxUnitsUser = RECOMMENDED.maxUnitsUser;
    if (f.maxUnitsSku !== undefined) f.maxUnitsSku = RECOMMENDED.maxUnitsSku;
  }
  isRecommended(f: LimitsForm) {
    return isRecommended(f);
  }
  /** Template outlets pass the section as a plain string. */
  folded(id: string) {
    return !this.folds()[id as SectionId];
  }
  /** What a folded section has stored, in one line. */
  status(id: string) {
    const form = this.forms()[id as SectionId].saved();
    return form
      ? sectionStatus(id as SectionId, form, (minor) => this.shop.money(minor))
      : "";
  }
  onFoldToggle(id: SectionId, event: Event) {
    this.setFold(id, (event.target as HTMLDetailsElement).open);
  }
  private setFold(id: SectionId, open: boolean) {
    if (this.folds()[id] === open) return;
    // The whole state is kept: the section that opened alone stays as the admin sees it.
    this.chosenFolds.set({ ...this.folds(), [id]: open });
    try {
      sessionStorage.setItem(FOLDS_SLOT, JSON.stringify(this.chosenFolds()));
    } catch {}
  }

  async moreHistory() {
    this.historyShown.update((n) => n + HISTORY_MORE);
    if (
      this.historyItems().length < this.historyShown() &&
      this.shop.historyCursor()
    )
      await this.shop.moreHistory();
  }
}

/** Folds as the admin left them in this tab; none on a new tab or bad data. */
function readFolds(): Partial<Record<SectionId, boolean>> {
  const folds: Partial<Record<SectionId, boolean>> = {};
  try {
    const saved = JSON.parse(sessionStorage.getItem(FOLDS_SLOT) ?? "{}");
    for (const id of SECTIONS)
      if (typeof saved?.[id] === "boolean") folds[id] = saved[id];
  } catch {}
  return folds;
}
