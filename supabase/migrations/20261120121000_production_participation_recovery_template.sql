-- Companion to 20261120120000_production_baseline_reconciliation.
-- Separate transaction: enum labels added by the prior migration must commit
-- before they are used as values. Existing/customized templates are untouched.

SET lock_timeout = '5s';
SET statement_timeout = '30s';

SELECT pg_advisory_xact_lock(hashtextextended('vfl:production-baseline-reconciliation:v1', 0));

INSERT INTO public.email_templates (name, subject, body, type, active)
SELECT
  $cl_name$Teilnahme-Link erneut anfordern$cl_name$,
  $cl_subject$Teilnahme verwalten – {{tournament_name}}$cl_subject$,
  $cl_body$Hallo {{contact_first_name}},

ihr habt einen sicheren Link angefordert, um eure Turnierteilnahme im Tournament Hub zu verwalten.

{{participation_url}}

Über den Link könnt ihr eure Teilnahme einsehen und bei Bedarf eine Absageanfrage stellen.

Sportliche Grüße
VfL Kirchheim
Tournament Hub$cl_body$,
  'participation-access-recovery'::public.email_template_type,
  true
WHERE NOT EXISTS (
  SELECT 1
  FROM public.email_templates
  WHERE type = 'participation-access-recovery'::public.email_template_type
);
