import { register } from "node:module";

// Registers the "@/..." alias resolver for node --test with --experimental-strip-types.
register("./alias-hooks.mjs", import.meta.url);
