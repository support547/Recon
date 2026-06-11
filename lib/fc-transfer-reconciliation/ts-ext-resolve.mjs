// Node ESM resolve hook for the raw `node --test --experimental-strip-types`
// runner. PRODUCTION code (built by Next) imports siblings EXTENSIONLESS — e.g.
// `import { classifyDisposition } from "./full-recon"` — because TS5097 forbids
// `.ts` import extensions without `allowImportingTsExtensions`, which the Next
// build does not enable. The node strip-types loader, however, does NOT auto-
// append `.ts` to an extensionless relative specifier, so a transitively-imported
// production module (by-fc.ts → full-recon) fails with ERR_MODULE_NOT_FOUND.
//
// This hook bridges the two: when a relative, extensionless specifier fails to
// resolve, retry it with a `.ts` extension. Test files are excluded from the
// Next/tsc build (tsconfig "exclude"), so this lives only in the test path and
// changes nothing about the production bundle.
//
// Usage (already wired into the test header commands):
//   node --test --experimental-strip-types \
//     --import ./lib/fc-transfer-reconciliation/ts-ext-resolve.mjs <test.ts>
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    const isRelative = specifier.startsWith("./") || specifier.startsWith("../");
    const hasExt = /\.[mc]?[jt]sx?$/.test(specifier);
    if (
      isRelative &&
      !hasExt &&
      (err?.code === "ERR_MODULE_NOT_FOUND" || err?.code === "ERR_UNSUPPORTED_DIR_IMPORT")
    ) {
      return nextResolve(specifier + ".ts", context);
    }
    throw err;
  }
}
