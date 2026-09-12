import { InjectionToken } from "@angular/core";
export interface RuntimeConfig {
  commerceEnabled: boolean;
  apiBaseUrl: string;
}
export const RUNTIME_CONFIG = new InjectionToken<RuntimeConfig>(
  "PIUMA_RUNTIME_CONFIG",
);
