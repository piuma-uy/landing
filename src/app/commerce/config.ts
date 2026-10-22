import { InjectionToken } from "@angular/core";
import type { CognitoConfig } from "./cognito";
export interface RuntimeConfig {
  commerceEnabled: boolean;
  apiBaseUrl: string;
  /** "cookie" (default) talks to the local Docker API; "cognito" to AWS. */
  auth?: "cookie" | "cognito";
  cognito?: CognitoConfig;
  /** Analytics sin cookies (ver AnalyticsService); sin esta clave no se envía nada. */
  analytics?: { provider: "umami"; hostUrl: string; websiteId: string };
}
export const RUNTIME_CONFIG = new InjectionToken<RuntimeConfig>(
  "PIUMA_RUNTIME_CONFIG",
);
