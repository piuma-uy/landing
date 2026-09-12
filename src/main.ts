import { bootstrapApplication } from "@angular/platform-browser";
import { provideHttpClient, withFetch } from "@angular/common/http";
import { AppComponent } from "./app/app.component";
import { RUNTIME_CONFIG, RuntimeConfig } from "./app/commerce/config";

async function start() {
  let config: RuntimeConfig = { commerceEnabled: false, apiBaseUrl: "" };
  try {
    const response = await fetch("/runtime-config.json", { cache: "no-store" });
    if (response.ok) config = await response.json();
  } catch {
    /* The original landing remains available without commerce configuration. */
  }
  await bootstrapApplication(AppComponent, {
    providers: [
      provideHttpClient(withFetch()),
      { provide: RUNTIME_CONFIG, useValue: config },
    ],
  });
}
void start().catch((err) => console.error(err));
