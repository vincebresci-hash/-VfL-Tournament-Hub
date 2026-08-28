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
-- Extend secure token validation with payment context (read-only)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.validate_secure_access_token(
  p_token_hash text,
  p_purpose public.secure_access_token_purpose
)
RETURNS TABLE (
  token_id uuid,
  application_id uuid,
  tournament_name text,
  team_name text,
  tournament_date date,
  payment_status public.payment_status,
  participation_fee numeric,
  paid_at timestamptz
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token public.secure_access_tokens%ROWTYPE;
  v_app public.applications%ROWTYPE;
  v_tournament public.tournaments%ROWTYPE;
BEGIN
  IF char_length(p_token_hash) <> 64 THEN
    RETURN;
  END IF;

  SELECT * INTO v_token
  FROM public.secure_access_tokens
  WHERE token_hash = p_token_hash
    AND purpose = p_purpose
    AND revoked_at IS NULL
    AND expires_at > now()
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT * INTO v_app
  FROM public.applications
  WHERE id = v_token.application_id;

  IF NOT FOUND OR v_app.status IS DISTINCT FROM 'accepted'::public.application_status THEN
    RETURN;
  END IF;

  SELECT * INTO v_tournament
  FROM public.tournaments
  WHERE id = v_app.tournament_id;

  UPDATE public.secure_access_tokens
  SET last_used_at = now()
  WHERE id = v_token.id;

  RETURN QUERY
  SELECT
    v_token.id,
    v_app.id,
    COALESCE(NULLIF(btrim(v_tournament.name), ''), 'Turnier'),
    COALESCE(NULLIF(btrim(v_app.team_name), ''), 'Mannschaft'),
    v_tournament.date,
    v_app.payment_status,
    v_app.participation_fee,
    v_app.paid_at;
END;
$$;

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
