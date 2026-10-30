// The app imports its sibling modules without extension, as the Angular build expects; node --test
// and scripts/prerender.ts (npm run build) need the file name. Relative imports that do not resolve
// as written are tried with ".ts".
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (error) {
      if (
        !specifier.startsWith(".") ||
        (error as { code?: string }).code !== "ERR_MODULE_NOT_FOUND"
      )
        throw error;
      return next(specifier + ".ts", context);
    }
  },
});
