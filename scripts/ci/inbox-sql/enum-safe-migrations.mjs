/**
 * Narrow, fail-closed allowlist for CI-only enum transaction boundaries.
 * Historical migration files are never modified.
 *
 * Fingerprints were computed from the reviewed contents on branch
 * feature/ionos-inbox-readonly @ a0a670de48a85c87da81aaa3b29ad1aa13188f7e.
 */

/** @typedef {{ sha256: string, enumStatements: string[] }} EnumSafeMigrationSpec */

/** @type {Record<string, EnumSafeMigrationSpec>} */
export const ENUM_SAFE_MIGRATIONS = {
  "20260820114200_application_status_emails.sql": {
    sha256: "3e3faa78af9d0db21b9ce033f9541a65781c98c366b00081f11b28904e2a9963",
    enumStatements: [
      "ALTER TYPE public.email_template_type\n  ADD VALUE IF NOT EXISTS 'application-under-review';",
    ],
  },
  "20260829160000_cancellation_requests.sql": {
    sha256: "da544cb71e37b5fc1d7cb7673fd5ecfb57f3fd9ffc66e1831259988fadcd4976",
    enumStatements: [
      "ALTER TYPE public.application_status\n  ADD VALUE IF NOT EXISTS 'cancelled';",
      "ALTER TYPE public.email_template_type\n  ADD VALUE IF NOT EXISTS 'cancellation-request-received';",
      "ALTER TYPE public.email_template_type\n  ADD VALUE IF NOT EXISTS 'cancellation-request-submitted';",
      "ALTER TYPE public.email_template_type\n  ADD VALUE IF NOT EXISTS 'cancellation-confirmed';",
      "ALTER TYPE public.email_template_type\n  ADD VALUE IF NOT EXISTS 'cancellation-rejected';",
    ],
  },
};
