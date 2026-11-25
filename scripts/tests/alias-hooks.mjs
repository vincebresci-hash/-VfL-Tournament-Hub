// Resolve the TypeScript "@/..." path alias to src/* for node --test runs.
const srcRoot = new URL("../../src/", import.meta.url);

export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    let relative = specifier.slice(2);
    if (!/\.(ts|tsx|mjs|cjs|js|json)$/.test(relative)) {
      relative += ".ts";
    }
    return next(new URL(relative, srcRoot).href, context);
  }
  return next(specifier, context);
}
