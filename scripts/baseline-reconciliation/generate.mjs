/**
 * Generate the reviewed production-drift reconciliation from read-only catalog
 * captures. The captures stay in the OS temp directory; only schema definitions,
 * fingerprints and the non-personal recovery template are written to Git.
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const migrationsDir = path.join(repoRoot, "supabase", "migrations");
const reconciliationPath = path.join(
  migrationsDir,
  "20261120120000_production_baseline_reconciliation.sql",
);
const templatePath = path.join(
  migrationsDir,
  "20261120121000_production_participation_recovery_template.sql",
);
const manifestPath = path.join(repoRoot, "supabase", "champions-league-production-catalog-manifest.json");

const [catalogCapture, functionCapture, localFunctionCapture, templateCapture] = process.argv.slice(2);
if (!catalogCapture || !functionCapture || !localFunctionCapture || !templateCapture) {
  throw new Error(
    "Usage: node generate.mjs <prod-catalog.json> <prod-functions.json> <local-functions.json> <template.json>",
  );
}

function readRows(filename) {
  const value = JSON.parse(readFileSync(filename, "utf8").replace(/^\uFEFF/, ""));
  if (!Array.isArray(value.rows)) throw new Error(`Capture has no rows array: ${filename}`);
  return value.rows;
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function canonicalMigration(content) {
  const normalized = content.replace(/\r\n/g, "\n");
  if (normalized.includes("\r")) throw new Error("Migration contains unsupported CR line endings");
  return normalized;
}

function assertExactSet(actual, expected, label) {
  const left = [...actual].sort();
  const right = [...expected].sort();
  if (JSON.stringify(left) !== JSON.stringify(right)) {
    throw new Error(`${label} changed:\nactual=${left.join(",")}\nexpected=${right.join(",")}`);
  }
}

const expectedExtra = new Map([
  ["activate_participation_access_recovery_token(text)", "e3124bff2b468034d255f1858d2de328"],
  ["discard_participation_access_recovery_token(text)", "e3e07910f131f9cddcd940284f12ee0d"],
  ["participation_recovery_token_expires_at(date)", "72f1b6f02e04eca234efd0fff84bcaca"],
  ["rls_auto_enable()", "2965a64617834a07860d67f971780883"],
  ["rotate_participation_cancellation_token(uuid,text,timestamp with time zone)", "dd5b94e123842eb89048a47e36a87809"],
  ["stage_participation_access_recovery_token(uuid,text,text,text,text)", "cf8faad8eac463b87a1d34fc9b6a044a"],
  ["upsert_status_email_template(text,text,text,email_template_type)", "95c728c23b4c6283f68425c2d9edffee"],
]);

const expectedBodyMismatch = new Map([
  ["has_rbac_permission(text,uuid,uuid)", "0254b0000633820677bd949837d30943"],
  ["issue_guest_cancellation_recovery_token(uuid,text,text,text,text,text,text,text)", "8c9f6063b9801881621d6aafd3cbeb9a"],
  ["set_tournament_partner_assignments(uuid,uuid[])", "50261435dd4c058be58abf7f7ae84f81"],
  ["sync_mein_turnierplan_tournament(uuid,jsonb,boolean)", "243dda3340b4f4d016946d43cbeecac7"],
]);

const excludedPlatformHelpers = new Set([
  "rls_auto_enable()",
  "upsert_status_email_template(text,text,text,email_template_type)",
]);

const grants = new Map([
  ["activate_participation_access_recovery_token(text)", ["service_role"]],
  ["discard_participation_access_recovery_token(text)", ["service_role"]],
  ["participation_recovery_token_expires_at(date)", ["service_role"]],
  ["rotate_participation_cancellation_token(uuid,text,timestamp with time zone)", ["authenticated"]],
  ["stage_participation_access_recovery_token(uuid,text,text,text,text)", ["service_role"]],
  ["has_rbac_permission(text,uuid,uuid)", ["anon", "authenticated"]],
  ["issue_guest_cancellation_recovery_token(uuid,text,text,text,text,text,text,text)", ["service_role"]],
  ["set_tournament_partner_assignments(uuid,uuid[])", ["authenticated"]],
  ["sync_mein_turnierplan_tournament(uuid,jsonb,boolean)", ["authenticated"]],
]);

const prodFunctions = readRows(functionCapture);
const localFunctions = readRows(localFunctionCapture);
const prodBySignature = new Map(prodFunctions.map((row) => [row.function_signature, row]));
const localBySignature = new Map(localFunctions.map((row) => [row.function_signature, row]));
const extra = prodFunctions
  .filter((row) => !localBySignature.has(row.function_signature))
  .map((row) => row.function_signature);
const mismatched = localFunctions
  .filter(
    (row) =>
      prodBySignature.has(row.function_signature) &&
      prodBySignature.get(row.function_signature).body_hash !== row.body_hash,
  )
  .map((row) => row.function_signature);

assertExactSet(extra, expectedExtra.keys(), "Production-only functions");
assertExactSet(mismatched, expectedBodyMismatch.keys(), "Changed function bodies");

for (const local of localFunctions) {
  const prod = prodBySignature.get(local.function_signature);
  if (!prod) continue;
  for (const field of [
    "result_type",
    "language",
    "security_definer",
    "volatility",
    "is_strict",
    "leakproof",
  ]) {
    if (JSON.stringify(prod[field]) !== JSON.stringify(local[field])) {
      throw new Error(`Function attribute mismatch: ${local.function_signature} ${field}`);
    }
  }
  if (JSON.stringify(prod.config ?? null) !== JSON.stringify(local.config ?? null)) {
    throw new Error(`Function config mismatch: ${local.function_signature}`);
  }
}

const versionedSignatures = [...grants.keys()];
for (const signature of versionedSignatures) {
  const row = prodBySignature.get(signature);
  const expectedHash = expectedExtra.get(signature) ?? expectedBodyMismatch.get(signature);
  if (!row || row.body_hash !== expectedHash) {
    throw new Error(`Unreviewed body for ${signature}: ${row?.body_hash ?? "missing"}`);
  }
  if (/https?:\/\//i.test(row.definition) || /(password|secret|api[_-]?key)\s*[:=]/i.test(row.definition)) {
    throw new Error(`Potential secret or external endpoint in ${signature}`);
  }
  const expectedSecurityDefiner = signature !== "participation_recovery_token_expires_at(date)";
  if (
    row.security_definer !== expectedSecurityDefiner ||
    !Array.isArray(row.config) ||
    !row.config.includes("search_path=public")
  ) {
    throw new Error(`Unexpected SECURITY DEFINER/search_path for ${signature}`);
  }
}

const functionSql = versionedSignatures
  .map((signature) => {
    const definition = prodBySignature.get(signature).definition.trimEnd();
    const terminatedDefinition = definition.endsWith(";") ? definition : `${definition};`;
    const roleGrants = grants.get(signature);
    return [
      `-- Production body fingerprint: ${prodBySignature.get(signature).body_hash}`,
      terminatedDefinition,
      `REVOKE ALL ON FUNCTION public.${signature} FROM PUBLIC, anon, authenticated, service_role;`,
      ...roleGrants.map((role) => `GRANT EXECUTE ON FUNCTION public.${signature} TO ${role};`),
    ].join("\n");
  })
  .join("\n\n");

const reconciliationSql = `-- CL Release 1.4 production baseline reconciliation.
-- Generated from a read-only production catalog capture for ogopebvpojuvheimzged.
-- Historical migrations remain immutable. This file sorts after the 66 audited
-- historical migrations and before all Champions League migrations.

SET lock_timeout = '5s';
SET statement_timeout = '2min';

SELECT pg_advisory_xact_lock(hashtextextended('vfl:production-baseline-reconciliation:v1', 0));

DO $preflight$
BEGIN
  IF to_regclass('public.applications') IS NULL
     OR to_regclass('public.secure_access_tokens') IS NULL
     OR to_regclass('public.email_templates') IS NULL THEN
    RAISE EXCEPTION 'BASELINE_PREREQUISITE_MISSING: historical schema is incomplete';
  END IF;
END
$preflight$;

ALTER TYPE public.email_template_type
  ADD VALUE IF NOT EXISTS 'cancellation-request-confirmation'
  BEFORE 'cancellation-request-submitted';

ALTER TYPE public.email_template_type
  ADD VALUE IF NOT EXISTS 'participation-access-recovery'
  AFTER 'cancellation-request-submitted';

ALTER TABLE public.secure_access_tokens
  ADD COLUMN IF NOT EXISTS pending_activation boolean NOT NULL DEFAULT false;

DO $structure$
DECLARE
  v_definition text;
BEGIN
  SELECT format_type(a.atttypid, a.atttypmod) || '|' || a.attnotnull || '|' ||
         COALESCE(pg_get_expr(d.adbin, d.adrelid), '')
  INTO v_definition
  FROM pg_attribute a
  LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
  WHERE a.attrelid = 'public.secure_access_tokens'::regclass
    AND a.attname = 'pending_activation'
    AND a.attnum > 0
    AND NOT a.attisdropped;

  IF v_definition IS DISTINCT FROM 'boolean|true|false' THEN
    RAISE EXCEPTION 'BASELINE_COLUMN_MISMATCH: secure_access_tokens.pending_activation (%)', v_definition;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.applications'::regclass
      AND conname = 'applications_birth_year_range'
  ) THEN
    ALTER TABLE public.applications
      ADD CONSTRAINT applications_birth_year_range
      CHECK (birth_year IS NULL OR (birth_year >= 1990 AND birth_year <= 2100)) NOT VALID;
    ALTER TABLE public.applications VALIDATE CONSTRAINT applications_birth_year_range;
  END IF;

  SELECT regexp_replace(pg_get_constraintdef(oid, true), '\\s+', ' ', 'g')
  INTO v_definition
  FROM pg_constraint
  WHERE conrelid = 'public.applications'::regclass
    AND conname = 'applications_birth_year_range';
  IF v_definition IS DISTINCT FROM 'CHECK (birth_year IS NULL OR birth_year >= 1990 AND birth_year <= 2100)' THEN
    RAISE EXCEPTION 'BASELINE_CONSTRAINT_MISMATCH: applications_birth_year_range (%)', v_definition;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.applications'::regclass
      AND conname = 'applications_guest_requires_contact_email'
  ) THEN
    ALTER TABLE public.applications
      ADD CONSTRAINT applications_guest_requires_contact_email
      CHECK (club_id IS NOT NULL OR (contact_email IS NOT NULL AND length(trim(contact_email)) > 0)) NOT VALID;
    ALTER TABLE public.applications VALIDATE CONSTRAINT applications_guest_requires_contact_email;
  END IF;

  SELECT regexp_replace(pg_get_constraintdef(oid, true), '\\s+', ' ', 'g')
  INTO v_definition
  FROM pg_constraint
  WHERE conrelid = 'public.applications'::regclass
    AND conname = 'applications_guest_requires_contact_email';
  IF v_definition IS DISTINCT FROM
     'CHECK (club_id IS NOT NULL OR contact_email IS NOT NULL AND length(TRIM(BOTH FROM contact_email)) > 0)' THEN
    RAISE EXCEPTION 'BASELINE_CONSTRAINT_MISMATCH: applications_guest_requires_contact_email (%)', v_definition;
  END IF;
END
$structure$;

CREATE INDEX IF NOT EXISTS applications_contact_email_idx
  ON public.applications (lower(contact_email));

DO $index_check$
DECLARE
  v_definition text;
BEGIN
  SELECT regexp_replace(pg_get_indexdef(i.indexrelid), '\\s+', ' ', 'g')
  INTO v_definition
  FROM pg_index i
  JOIN pg_class idx ON idx.oid = i.indexrelid
  WHERE i.indrelid = 'public.applications'::regclass
    AND idx.relname = 'applications_contact_email_idx';

  IF v_definition IS DISTINCT FROM
     'CREATE INDEX applications_contact_email_idx ON public.applications USING btree (lower(contact_email))' THEN
    RAISE EXCEPTION 'BASELINE_INDEX_MISMATCH: applications_contact_email_idx (%)', v_definition;
  END IF;
END
$index_check$;

${functionSql}

-- RLS does not protect TRUNCATE. Client roles do not use schema-maintenance
-- privileges anywhere in the application, so remove the unsafe inherited drift
-- from existing and future public tables. service_role defaults remain unchanged.
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
  ON ALL TABLES IN SCHEMA public
  FROM anon, authenticated;

DO $default_acl$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public '
      || 'REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLES FROM anon, authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin') THEN
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public '
      || 'REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLES FROM anon, authenticated';
  END IF;
END
$default_acl$;
`;

const templateRows = readRows(templateCapture);
if (templateRows.length !== 1) throw new Error(`Expected one recovery template, got ${templateRows.length}`);
const template = templateRows[0];
if (
  template.type !== "participation-access-recovery" ||
  template.name !== "Teilnahme-Link erneut anfordern" ||
  template.active !== true ||
  sha256(template.subject) !== "21d9f4fa816ccc567ec6bc0f3f312b63f03fff788522694c2447ce860170577e" ||
  sha256(template.body) !== "af15abb96086c6e2142af44798e49590ee49fc119805d7a1cdad0bf06b7e8987"
) {
  throw new Error("Recovery template differs from the reviewed production capture");
}
for (const tag of ["$cl_name$", "$cl_subject$", "$cl_body$"]) {
  if ([template.name, template.subject, template.body].some((value) => value.includes(tag))) {
    throw new Error(`Template contains reserved dollar-quote tag ${tag}`);
  }
}

const templateSql = `-- Companion to 20261120120000_production_baseline_reconciliation.
-- Separate transaction: enum labels added by the prior migration must commit
-- before they are used as values. Existing/customized templates are untouched.

SET lock_timeout = '5s';
SET statement_timeout = '30s';

SELECT pg_advisory_xact_lock(hashtextextended('vfl:production-baseline-reconciliation:v1', 0));

INSERT INTO public.email_templates (name, subject, body, type, active)
SELECT
  $cl_name$${template.name}$cl_name$,
  $cl_subject$${template.subject}$cl_subject$,
  $cl_body$${template.body}$cl_body$,
  'participation-access-recovery'::public.email_template_type,
  true
WHERE NOT EXISTS (
  SELECT 1
  FROM public.email_templates
  WHERE type = 'participation-access-recovery'::public.email_template_type
);
`;

writeFileSync(reconciliationPath, reconciliationSql, "utf8");
writeFileSync(templatePath, templateSql, "utf8");

const catalogRows = readRows(catalogCapture);
const catalogCanonical = catalogRows
  .map((row) => `${row.object_kind}\u0000${row.object_key}\u0000${row.fingerprint}`)
  .sort()
  .join("\n");
const catalogCounts = Object.fromEntries(
  [...new Set(catalogRows.map((row) => row.object_kind))]
    .sort()
    .map((kind) => [kind, catalogRows.filter((row) => row.object_kind === kind).length]),
);
const functionCanonical = prodFunctions
  .map(
    (row) =>
      `${row.function_signature}\u0000${row.body_hash}\u0000${row.result_type}\u0000${row.security_definer}\u0000${JSON.stringify(row.config ?? null)}`,
  )
  .sort()
  .join("\n");

const migrationFiles = readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort();
const migrations = migrationFiles.map((name) => ({
  file: name,
  sha256: sha256(canonicalMigration(readFileSync(path.join(migrationsDir, name), "utf8"))),
}));

const customizedTemplateNames = new Set([
  "Absage bestätigt",
  "Absageanfrage abgelehnt",
  "Absageanfrage eingegangen (Admin)",
  "Absageanfrage eingegangen (Mannschaft)",
  "Bewerbung angenommen",
  "Teilnahme-Link erneut anfordern",
]);
const templateFingerprints = catalogRows
  .filter(
    (row) =>
      row.object_kind === "seed_key" &&
      row.object_key.startsWith("public.email_templates.") &&
      customizedTemplateNames.has(row.object_key.slice("public.email_templates.".length)),
  )
  .map((row) => ({ name: row.object_key.slice("public.email_templates.".length), fingerprint: row.fingerprint }))
  .sort((left, right) => left.name.localeCompare(right.name, "de"));
if (templateFingerprints.length !== customizedTemplateNames.size) {
  throw new Error(`Expected ${customizedTemplateNames.size} protected template fingerprints`);
}

const manifest = {
  format_version: 1,
  project_ref: "ogopebvpojuvheimzged",
  captured_at_utc: "2026-11-25",
  access: { role: "supabase_read_only_user", transaction_read_only: true },
  catalog: {
    rows: catalogRows.length,
    sha256: sha256(catalogCanonical),
    counts_by_kind: catalogCounts,
  },
  functions: {
    rows: prodFunctions.length,
    sha256: sha256(functionCanonical),
    production_only: [...expectedExtra].map(([signature, body_hash]) => ({ signature, body_hash })),
    true_body_mismatches: [...expectedBodyMismatch].map(([signature, body_hash]) => ({ signature, body_hash })),
    intentionally_not_versioned: [...excludedPlatformHelpers].sort(),
  },
  protected_email_templates: templateFingerprints,
  acl_decision: {
    revoke_existing_and_default_from: ["anon", "authenticated"],
    revoked_privileges: ["MAINTAIN", "REFERENCES", "TRIGGER", "TRUNCATE"],
    service_role_defaults: "retained_pending_separate_least_privilege_review",
  },
  migrations,
};
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

console.log(
  `generated reconciliation (${versionedSignatures.length} functions), template seed, and catalog manifest (${catalogRows.length} objects)`,
);
