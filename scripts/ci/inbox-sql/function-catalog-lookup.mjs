/**
 * Robust PostgreSQL function catalog lookup for CI-only migration compat.
 *
 * Why not compare pg_get_function_identity_arguments() to bare types?
 * PostgreSQL includes parameter *names* in identity-argument formatting when
 * present. For CREATE FUNCTION ...(p_slug text) RETURNS TABLE (...),
 * pg_get_function_identity_arguments(oid) returns "p_slug text", not "text".
 * Equality checks against "text" therefore miss the live function (Phase 1S).
 *
 * Prefer to_regprocedure('schema.fn(argtypes)') — PostgreSQL's exact identity
 * resolution for DROP/ALTER FUNCTION style signatures (input types only;
 * argument names are not part of the regprocedure literal).
 */

/**
 * @typedef {{
 *   oid: string | number,
 *   schemaName: string,
 *   proname: string,
 *   identityArgs: string,
 *   resultType: string,
 *   securityDefiner: boolean,
 *   config: string[],
 * }} FunctionCatalogMeta
 */

/**
 * Parse "schema.name(args)" into parts for post-resolution verification.
 * @param {string} functionIdentity e.g. public.tournament_public_roster(text)
 * @returns {{ schema: string, name: string, args: string }}
 */
export function parseFunctionIdentity(functionIdentity) {
  const match = String(functionIdentity || "")
    .trim()
    .match(/^([a-zA-Z_][\w]*)\.([a-zA-Z_][\w]*)\((.*)\)$/);
  if (!match) {
    throw new Error(`Invalid function identity: ${functionIdentity}`);
  }
  return { schema: match[1], name: match[2], args: match[3].trim() };
}

/**
 * Resolve a function via to_regprocedure and verify schema/name ownership.
 * Returns null when the signature does not exist (fail-closed caller decides).
 *
 * @param {{ query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }} client
 * @param {string} functionIdentity e.g. public.tournament_public_roster(text)
 * @returns {Promise<FunctionCatalogMeta | null>}
 */
export async function resolveFunctionMeta(client, functionIdentity) {
  const expected = parseFunctionIdentity(functionIdentity);

  const { rows } = await client.query(
    `
    SELECT
      p.oid,
      n.nspname AS schema_name,
      p.proname,
      pg_get_function_identity_arguments(p.oid) AS identity_args,
      pg_get_function_result(p.oid) AS result_type,
      p.prosecdef AS security_definer,
      COALESCE(p.proconfig, ARRAY[]::text[]) AS config
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.oid = to_regprocedure($1)
    `,
    [functionIdentity],
  );

  const row = rows[0];
  if (!row) {
    return null;
  }

  const schemaName = String(row.schema_name);
  const proname = String(row.proname);
  if (schemaName !== expected.schema || proname !== expected.name) {
    throw new Error(
      `to_regprocedure(${functionIdentity}) resolved unexpected object ` +
        `${schemaName}.${proname} (expected ${expected.schema}.${expected.name})`,
    );
  }

  return {
    oid: row.oid,
    schemaName,
    proname,
    identityArgs: String(row.identity_args ?? ""),
    resultType: String(row.result_type ?? ""),
    securityDefiner: Boolean(row.security_definer),
    config: Array.isArray(row.config) ? row.config.map(String) : [],
  };
}

/**
 * Documented PostgreSQL formatting behavior used by regression tests.
 * Mirrors catalog output for a named IN argument (not a live DB call).
 *
 * @param {string} identityArgsFromPg e.g. "p_slug text"
 * @param {string} bareTypes e.g. "text"
 * @returns {boolean}
 */
export function identityArgsEqualBareTypes(identityArgsFromPg, bareTypes) {
  return String(identityArgsFromPg) === String(bareTypes);
}
