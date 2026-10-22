import { InjectionToken } from "@angular/core";
import type { CognitoConfig } from "./cognito";
export interface RuntimeConfig {
  commerceEnabled: boolean;
  apiBaseUrl: string;
  /** "cookie" (default) talks to the local Docker API; "cognito" to AWS. */
  auth?: "cookie" | "cognito";
  cognito?: CognitoConfig;
}
export const RUNTIME_CONFIG = new InjectionToken<RuntimeConfig>(
  "PIUMA_RUNTIME_CONFIG",
);
