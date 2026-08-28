-- =============================================================================
-- PR B: Payment status for accepted applications
-- =============================================================================
-- Production: NOT auto-applied. Run manually in Supabase SQL Editor when ready.
-- =============================================================================

DO $$
BEGIN
  CREATE TYPE public.payment_status AS ENUM (
    'pending',
    'paid',
    'not_required',
    'waived'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS payment_status public.payment_status;

ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS participation_fee numeric(10, 2);

ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS payment_note text;

-- Backfill must run before the payment guard trigger exists (or is re-enabled).
DROP TRIGGER IF EXISTS applications_payment_fields_guard ON public.applications;

UPDATE public.applications
SET payment_status = 'pending'::public.payment_status
WHERE payment_status IS NULL;

ALTER TABLE public.applications
  ALTER COLUMN payment_status SET DEFAULT 'pending'::public.payment_status;

ALTER TABLE public.applications
  ALTER COLUMN payment_status SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'applications_participation_fee_non_negative'
  ) THEN
    ALTER TABLE public.applications
      ADD CONSTRAINT applications_participation_fee_non_negative
      CHECK (participation_fee IS NULL OR participation_fee >= 0);
  END IF;
END
$$;

COMMENT ON COLUMN public.applications.payment_status IS
  'Payment tracking for accepted teams; does not affect capacity or application_status.';

-- -----------------------------------------------------------------------------
-- Only admins may change payment fields (clubs retain other update rights)
-- -----------------------------------------------------------------------------

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
     OR NEW.paid_at IS DISTINCT FROM OLD.paid_at
     OR NEW.payment_note IS DISTINCT FROM OLD.payment_note THEN
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

-- -----------------------------------------------------------------------------
-- External participation payment (token-scoped, separate from validate_secure_access_token)
-- PR A validate_secure_access_token return type must remain unchanged (42P13 safe).
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_external_participation_payment_by_token(
  p_token_hash text,
  p_purpose public.secure_access_token_purpose
)
RETURNS TABLE (
  payment_status public.payment_status,
  participation_fee numeric,
  paid_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF char_length(p_token_hash) <> 64 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    a.payment_status,
    a.participation_fee,
    a.paid_at
  FROM public.secure_access_tokens t
  INNER JOIN public.applications a ON a.id = t.application_id
  WHERE t.token_hash = p_token_hash
    AND t.purpose = p_purpose
    AND t.revoked_at IS NULL
    AND t.expires_at > now()
    AND a.status = 'accepted'::public.application_status
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.get_external_participation_payment_by_token(
  text, public.secure_access_token_purpose
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_external_participation_payment_by_token(
  text, public.secure_access_token_purpose
) TO anon, authenticated;

-- -----------------------------------------------------------------------------
-- application-accepted email: optional payment placeholders (idempotent by type)
-- -----------------------------------------------------------------------------

DO $seed$
DECLARE
  v_type public.email_template_type := 'application-accepted';
  v_name text := 'Bewerbung angenommen';
  v_subject text := 'Zusage – {{tournament_name}}';
  v_body text := $body$Hallo {{contact_first_name}},

vielen Dank für eure Bewerbung mit {{team_name}} für den {{tournament_name}}.

Damit ist eure Teilnahme an unserem Turnier bestätigt.

Turnier:
{{tournament_name}}
Altersklasse: {{age_group}}
Datum: {{tournament_date}}
Ort: {{location}}

{{participation_fee_line}}

{{payment_binding_notice}}

{{participation_url}}

Weitere organisatorische Informationen, den Ablauf sowie gegebenenfalls den Spielplan erhaltet ihr rechtzeitig vor dem Turnier.

Wir freuen uns, euch bei uns in Kirchheim begrüßen zu dürfen und wünschen euch schon jetzt eine gute Anreise und ein tolles Turnier.

Sportliche Grüße

VfL Kirchheim
Tournament Hub$body$;
BEGIN
  IF EXISTS (SELECT 1 FROM public.email_templates WHERE type = v_type) THEN
    UPDATE public.email_templates
    SET
      name = v_name,
      subject = v_subject,
      body = v_body,
      updated_at = now()
    WHERE type = v_type;
  ELSE
    INSERT INTO public.email_templates (name, subject, body, type, active)
    VALUES (v_name, v_subject, v_body, v_type, true);
  END IF;
END
$seed$;
