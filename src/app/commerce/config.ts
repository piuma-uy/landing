import { InjectionToken } from "@angular/core";
import type { RuntimeConfig } from "./runtime-config";
export type { RuntimeConfig } from "./runtime-config";
export const RUNTIME_CONFIG = new InjectionToken<RuntimeConfig>(
  "PIUMA_RUNTIME_CONFIG",
);
