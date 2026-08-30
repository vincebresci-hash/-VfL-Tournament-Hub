-- =============================================================================
-- Communication recipient email deduplication
-- Production: NOT auto-applied. Run manually in Supabase SQL Editor when ready.
-- Depends on: 20260830120000_communication_center.sql
-- =============================================================================
-- Ensures preview and send resolve one recipient per normalized email address
-- (lower(trim(contact_email))) while keeping a stable application_id mapping.

CREATE OR REPLACE FUNCTION public.resolve_communication_recipients(
  p_tournament_id uuid,
  p_communication_type text,
  p_recipient_filter text,
  p_application_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  application_id uuid,
  recipient_email text,
  recipient_team_name text,
  recipient_club_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_communication_type = 'payment-reminder'
     AND p_recipient_filter NOT IN ('payment-pending', 'custom') THEN
    RAISE EXCEPTION 'payment reminder only allows payment-pending or custom filter';
  END IF;

  IF p_recipient_filter = 'custom' THEN
    IF p_application_ids IS NULL OR cardinality(p_application_ids) = 0 THEN
      RAISE EXCEPTION 'custom filter requires application ids';
    END IF;

    RETURN QUERY
    SELECT DISTINCT ON (lower(btrim(a.contact_email)))
      a.id,
      lower(btrim(a.contact_email)),
      COALESCE(NULLIF(btrim(a.team_name), ''), 'Mannschaft'),
      NULLIF(btrim(a.club_name), '')
    FROM public.applications a
    WHERE a.tournament_id = p_tournament_id
      AND a.id = ANY (p_application_ids)
      AND a.status NOT IN ('cancelled'::public.application_status, 'rejected'::public.application_status)
      AND a.contact_email IS NOT NULL
      AND length(btrim(a.contact_email)) > 0
      AND (
        p_communication_type <> 'payment-reminder'
        OR (
          a.status = 'accepted'::public.application_status
          AND a.payment_status = 'pending'::public.payment_status
          AND a.participation_fee IS NOT NULL
        )
      )
      AND (
        p_communication_type = 'payment-reminder'
        OR a.status IN (
          'accepted'::public.application_status,
          'waiting-list'::public.application_status
        )
      )
    ORDER BY
      lower(btrim(a.contact_email)),
      array_position(p_application_ids, a.id),
      a.id;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT DISTINCT ON (lower(btrim(a.contact_email)))
    a.id,
    lower(btrim(a.contact_email)),
    COALESCE(NULLIF(btrim(a.team_name), ''), 'Mannschaft'),
    NULLIF(btrim(a.club_name), '')
  FROM public.applications a
  WHERE a.tournament_id = p_tournament_id
    AND a.contact_email IS NOT NULL
    AND length(btrim(a.contact_email)) > 0
    AND a.status NOT IN ('cancelled'::public.application_status, 'rejected'::public.application_status)
    AND (
      (p_recipient_filter = 'accepted' AND a.status = 'accepted'::public.application_status)
      OR (
        p_recipient_filter = 'payment-paid'
        AND a.status = 'accepted'::public.application_status
        AND a.payment_status = 'paid'::public.payment_status
      )
      OR (
        p_recipient_filter = 'payment-pending'
        AND a.status = 'accepted'::public.application_status
        AND a.payment_status = 'pending'::public.payment_status
        AND (
          p_communication_type <> 'payment-reminder'
          OR a.participation_fee IS NOT NULL
        )
      )
      OR (
        p_recipient_filter = 'waitlist'
        AND a.status = 'waiting-list'::public.application_status
      )
    )
  ORDER BY lower(btrim(a.contact_email)), a.id;
END;
$$;
