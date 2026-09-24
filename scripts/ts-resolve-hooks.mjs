/**
 * Let `node --experimental-strip-types` load the app's own modules.
 *
 * Node requires an explicit extension on relative imports, while the app's
 * source (and Metro, and TypeScript) omit them. Rather than litter `.ts` across
 * real source files to suit a preview script, this hook fills the extension in
 * during resolution, so the design previews import exactly the modules the app
 * ships, unmodified, and cannot drift from them.
 *
 * Used as: node --experimental-strip-types --import ./scripts/ts-resolve.mjs <script>
 */
export async function resolve(specifier, context, next) {
  if (specifier.startsWith('.') && !/\.[cm]?[jt]sx?$/.test(specifier)) {
    try {
      return await next(`${specifier}.ts`, context);
    } catch {
      // Fall through to Node's own resolution and let it report the problem.
    }
  }
  return next(specifier, context);
}
