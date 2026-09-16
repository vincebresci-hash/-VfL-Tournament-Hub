-- =============================================================================
-- PR51: Add participation-access-recovery email template enum value
-- =============================================================================
-- Production: NOT auto-applied. Run manually in Supabase SQL Editor when ready.
--
-- Must be committed BEFORE 20260902120000_participation_access_recovery.sql.
-- PostgreSQL ERROR 55P04: new enum values cannot be used in the same
-- transaction that creates them. Keep this migration enum-only.
-- =============================================================================

ALTER TYPE public.email_template_type
  ADD VALUE IF NOT EXISTS 'participation-access-recovery';
