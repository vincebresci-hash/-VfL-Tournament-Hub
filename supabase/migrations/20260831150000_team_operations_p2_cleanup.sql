-- =============================================================================
-- Team Operations P2 cleanup (APP-01 PAY-01)
-- =============================================================================
-- Production: NOT auto-applied. Run manually in Supabase SQL Editor when ready.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.application_payment_admin_notes (
  application_id uuid PRIMARY KEY
    REFERENCES public.applications (id) ON DELETE CASCADE,
  payment_note text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.application_payment_admin_notes IS
  'Admin-only internal payment notes; not exposed to club or external token flows.';

ALTER TABLE public.application_payment_admin_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS application_payment_admin_notes_admin_all
  ON public.application_payment_admin_notes;
CREATE POLICY application_payment_admin_notes_admin_all
  ON public.application_payment_admin_notes
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

REVOKE ALL ON TABLE public.application_payment_admin_notes FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.application_payment_admin_notes
  TO authenticated;

INSERT INTO public.application_payment_admin_notes (application_id, payment_note)
SELECT id, NULLIF(btrim(payment_note), '')
FROM public.applications
WHERE payment_note IS NOT NULL
  AND btrim(payment_note) <> ''
ON CONFLICT (application_id) DO UPDATE
SET
  payment_note = EXCLUDED.payment_note,
  updated_at = now();

CREATE OR REPLACE FUNCTION public.guard_application_payment_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.payment_status IS DISTINCT FROM OLD.payment_status
     OR NEW.participation_fee IS DISTINCT FROM OLD.participation_fee
     OR NEW.paid_at IS DISTINCT FROM OLD.paid_at THEN
    RAISE EXCEPTION 'payment fields admin only';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS applications_payment_fields_guard ON public.applications;
CREATE TRIGGER applications_payment_fields_guard
  BEFORE UPDATE ON public.applications
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_application_payment_fields();

ALTER TABLE public.applications
  DROP COLUMN IF EXISTS payment_note;
