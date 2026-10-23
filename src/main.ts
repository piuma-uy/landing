import { provideZoneChangeDetection } from "@angular/core";
import { bootstrapApplication } from "@angular/platform-browser";
import { provideHttpClient, withFetch } from "@angular/common/http";
import { AppComponent } from "./app/app.component";
import { RUNTIME_CONFIG } from "./app/commerce/config";
import {
  COMMERCE_OFF,
  parseRuntimeConfig,
  type RuntimeConfig,
} from "./app/commerce/runtime-config";

async function start() {
  let config: RuntimeConfig = COMMERCE_OFF;
  try {
    const response = await fetch("/runtime-config.json", { cache: "no-store" });
    // Validated: a malformed or incoherent file leaves commerce off (FE-09).
    if (response.ok)
      config = parseRuntimeConfig(await response.json(), (m) =>
        console.warn(m),
      );
  } catch {
    /* The original landing remains available without commerce configuration. */
  }
  await bootstrapApplication(AppComponent, {
    providers: [
      provideZoneChangeDetection(),
      provideHttpClient(withFetch()),
      { provide: RUNTIME_CONFIG, useValue: config },
    ],
  });
}
void start().catch((err) => console.error(err));
