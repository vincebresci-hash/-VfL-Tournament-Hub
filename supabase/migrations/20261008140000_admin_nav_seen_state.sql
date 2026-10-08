-- =============================================================================
-- Admin sidebar unread badges: per-user monotonic nav cursors
-- Production: NOT auto-applied. Apply in Supabase SQL Editor when ready.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.admin_nav_seen_state (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  nav_key text NOT NULL,
  seen_until timestamptz NOT NULL,
  seen_id uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, nav_key),
  CONSTRAINT admin_nav_seen_state_nav_key_check
    CHECK (nav_key IN ('applications', 'cancellations'))
);

COMMENT ON TABLE public.admin_nav_seen_state IS
  'Per-admin unread cursors for sidebar new-item badges. Advance only via monotonic RPCs.';

ALTER TABLE public.admin_nav_seen_state ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.admin_nav_seen_state FROM PUBLIC, anon;

-- Authenticated users may only read their own rows. Writes go through SECURITY DEFINER RPCs
-- so clients cannot regress cursors with arbitrary UPDATEs.
GRANT SELECT ON TABLE public.admin_nav_seen_state TO authenticated;

DROP POLICY IF EXISTS admin_nav_seen_state_select_own ON public.admin_nav_seen_state;
CREATE POLICY admin_nav_seen_state_select_own
  ON public.admin_nav_seen_state
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.admin_nav_nil_uuid()
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT '00000000-0000-0000-0000-000000000000'::uuid;
$$;

CREATE OR REPLACE FUNCTION public.admin_nav_cursor_less(
  p_until_a timestamptz,
  p_id_a uuid,
  p_until_b timestamptz,
  p_id_b uuid
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (p_until_a, p_id_a) < (p_until_b, p_id_b);
$$;

CREATE OR REPLACE FUNCTION public.admin_nav_max_applications_cursor()
RETURNS TABLE (seen_until timestamptz, seen_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(MAX(applications.created_at), '-infinity'::timestamptz) AS seen_until,
    COALESCE(
      (
        SELECT applications.id
        FROM public.applications
        WHERE applications.archived_at IS NULL
        ORDER BY applications.created_at DESC, applications.id DESC
        LIMIT 1
      ),
      public.admin_nav_nil_uuid()
    ) AS seen_id
  FROM public.applications
  WHERE applications.archived_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.admin_nav_max_cancellations_cursor()
RETURNS TABLE (seen_until timestamptz, seen_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(MAX(cr.requested_at), '-infinity'::timestamptz) AS seen_until,
    COALESCE(
      (
        SELECT cr2.id
        FROM public.cancellation_requests AS cr2
        INNER JOIN public.applications AS a2 ON a2.id = cr2.application_id
        INNER JOIN public.tournaments AS t2 ON t2.id = a2.tournament_id
        ORDER BY cr2.requested_at DESC, cr2.id DESC
        LIMIT 1
      ),
      public.admin_nav_nil_uuid()
    ) AS seen_id
  FROM public.cancellation_requests AS cr
  INNER JOIN public.applications AS a ON a.id = cr.application_id
  INNER JOIN public.tournaments AS t ON t.id = a.tournament_id;
$$;

CREATE OR REPLACE FUNCTION public.admin_nav_ensure_bootstrap(p_nav_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_until timestamptz;
  v_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_nav_key IS DISTINCT FROM 'applications'
    AND p_nav_key IS DISTINCT FROM 'cancellations'
  THEN
    RAISE EXCEPTION 'Invalid nav_key';
  END IF;

  IF p_nav_key = 'applications'
    AND NOT public.has_rbac_permission('applications.view')
  THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_nav_key = 'cancellations'
    AND NOT public.has_rbac_permission('cancellations.view')
  THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Only initialize when this admin has no cursor yet. Do not re-bootstrap on
  -- later calls (that would swallow unread arrivals).
  IF EXISTS (
    SELECT 1
    FROM public.admin_nav_seen_state
    WHERE user_id = v_user_id
      AND nav_key = p_nav_key
  ) THEN
    RETURN;
  END IF;

  IF p_nav_key = 'applications' THEN
    SELECT cursor.seen_until, cursor.seen_id
    INTO v_until, v_id
    FROM public.admin_nav_max_applications_cursor() AS cursor;
  ELSE
    SELECT cursor.seen_until, cursor.seen_id
    INTO v_until, v_id
    FROM public.admin_nav_max_cancellations_cursor() AS cursor;
  END IF;

  -- Insert quiet bootstrap cursor. If a concurrent first-write raced in with a
  -- lower cursor, upgrade monotonically to the DB snapshot max — never regress.
  INSERT INTO public.admin_nav_seen_state (
    user_id,
    nav_key,
    seen_until,
    seen_id,
    updated_at
  )
  VALUES (
    v_user_id,
    p_nav_key,
    v_until,
    v_id,
    now()
  )
  ON CONFLICT (user_id, nav_key) DO UPDATE
  SET
    seen_until = EXCLUDED.seen_until,
    seen_id = EXCLUDED.seen_id,
    updated_at = now()
  WHERE public.admin_nav_cursor_less(
    admin_nav_seen_state.seen_until,
    admin_nav_seen_state.seen_id,
    EXCLUDED.seen_until,
    EXCLUDED.seen_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.advance_admin_nav_seen_state(
  p_nav_key text,
  p_seen_until timestamptz,
  p_seen_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_updated integer := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_nav_key IS DISTINCT FROM 'applications'
    AND p_nav_key IS DISTINCT FROM 'cancellations'
  THEN
    RAISE EXCEPTION 'Invalid nav_key';
  END IF;

  IF p_seen_until IS NULL OR p_seen_id IS NULL THEN
    RAISE EXCEPTION 'Invalid cursor';
  END IF;

  IF p_nav_key = 'applications'
    AND NOT public.has_rbac_permission('applications.view')
  THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_nav_key = 'cancellations'
    AND NOT public.has_rbac_permission('cancellations.view')
  THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Reject arbitrary / future cursors. The supplied pair must match one
  -- currently visible authoritative row so clients cannot suppress unread
  -- badges by advancing past reality. Snapshot callers still pass the max
  -- loaded row; concurrent newer arrivals remain unread.
  IF p_nav_key = 'applications' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.applications AS application
      WHERE application.id = p_seen_id
        AND application.created_at = p_seen_until
        AND application.archived_at IS NULL
    ) THEN
      RETURN false;
    END IF;
  ELSE
    IF NOT EXISTS (
      SELECT 1
      FROM public.cancellation_requests AS request
      INNER JOIN public.applications AS application
        ON application.id = request.application_id
      INNER JOIN public.tournaments AS tournament
        ON tournament.id = application.tournament_id
      WHERE request.id = p_seen_id
        AND request.requested_at = p_seen_until
    ) THEN
      RETURN false;
    END IF;
  END IF;

  INSERT INTO public.admin_nav_seen_state (
    user_id,
    nav_key,
    seen_until,
    seen_id,
    updated_at
  )
  VALUES (
    v_user_id,
    p_nav_key,
    p_seen_until,
    p_seen_id,
    now()
  )
  ON CONFLICT (user_id, nav_key) DO NOTHING;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated > 0 THEN
    RETURN true;
  END IF;

  UPDATE public.admin_nav_seen_state
  SET
    seen_until = p_seen_until,
    seen_id = p_seen_id,
    updated_at = now()
  WHERE user_id = v_user_id
    AND nav_key = p_nav_key
    AND public.admin_nav_cursor_less(
      seen_until,
      seen_id,
      p_seen_until,
      p_seen_id
    );

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_nav_badge_counts()
RETURNS TABLE (nav_key text, unread_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_until timestamptz;
  v_id uuid;
  v_count integer;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  IF public.has_rbac_permission('applications.view') THEN
    PERFORM public.admin_nav_ensure_bootstrap('applications');

    SELECT state.seen_until, state.seen_id
    INTO v_until, v_id
    FROM public.admin_nav_seen_state AS state
    WHERE state.user_id = v_user_id
      AND state.nav_key = 'applications';

    SELECT COUNT(*)::integer
    INTO v_count
    FROM public.applications AS application
    WHERE application.archived_at IS NULL
      AND (application.created_at, application.id) > (v_until, v_id);

    nav_key := 'applications';
    unread_count := COALESCE(v_count, 0);
    RETURN NEXT;
  END IF;

  IF public.has_rbac_permission('cancellations.view') THEN
    PERFORM public.admin_nav_ensure_bootstrap('cancellations');

    SELECT state.seen_until, state.seen_id
    INTO v_until, v_id
    FROM public.admin_nav_seen_state AS state
    WHERE state.user_id = v_user_id
      AND state.nav_key = 'cancellations';

    SELECT COUNT(*)::integer
    INTO v_count
    FROM public.cancellation_requests AS request
    INNER JOIN public.applications AS application
      ON application.id = request.application_id
    INNER JOIN public.tournaments AS tournament
      ON tournament.id = application.tournament_id
    WHERE (request.requested_at, request.id) > (v_until, v_id);

    nav_key := 'cancellations';
    unread_count := COALESCE(v_count, 0);
    RETURN NEXT;
  END IF;
END;
$$;

-- Helpers are internal-only (called by the two granted RPCs below).
REVOKE ALL ON FUNCTION public.admin_nav_nil_uuid() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_nav_cursor_less(timestamptz, uuid, timestamptz, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_nav_max_applications_cursor()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_nav_max_cancellations_cursor()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_nav_ensure_bootstrap(text)
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.advance_admin_nav_seen_state(text, timestamptz, uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_admin_nav_badge_counts() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.advance_admin_nav_seen_state(text, timestamptz, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_nav_badge_counts() TO authenticated;
