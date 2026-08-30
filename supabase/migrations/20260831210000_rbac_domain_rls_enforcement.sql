-- =============================================================================
-- RBAC domain RLS enforcement
-- Production: NOT auto-applied. Run manually in Supabase SQL Editor when ready.
-- Depends on: 20260831160000_user_profiles_rbac.sql (+ 170000 aliases)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Harden has_rbac_permission (remove is_admin bypass, legacy fallback, anon)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.has_platform_rbac_access()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_super_admin()
    OR EXISTS (
      SELECT 1
      FROM public.rbac_user_roles ur
      JOIN public.rbac_roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid()
        AND r.is_platform_role = true
        AND ur.club_id IS NULL
    )
    OR (
      EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.is_active = true
          AND p.role IN ('admin'::public.user_role, 'super-admin'::public.user_role)
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.rbac_user_roles ur
        WHERE ur.user_id = auth.uid()
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.has_rbac_permission(
  p_permission text,
  p_club_id uuid DEFAULT NULL,
  p_team_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_permission_id uuid;
  v_override boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  IF NOT public.is_profile_active() THEN
    RETURN false;
  END IF;

  IF public.is_super_admin() THEN
    RETURN true;
  END IF;

  -- Legacy platform admins without RBAC role rows (pre-backfill compatibility).
  IF EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = v_user_id
      AND p.role IN ('admin'::public.user_role, 'super-admin'::public.user_role)
  ) AND NOT EXISTS (
    SELECT 1
    FROM public.rbac_user_roles ur
    WHERE ur.user_id = v_user_id
  ) THEN
    RETURN p_permission <> 'roles.manage';
  END IF;

  SELECT id INTO v_permission_id
  FROM public.rbac_permissions
  WHERE key = p_permission;

  IF v_permission_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT granted INTO v_override
  FROM public.rbac_user_permission_overrides
  WHERE user_id = v_user_id
    AND permission_id = v_permission_id;

  IF v_override IS NOT NULL THEN
    RETURN v_override;
  END IF;

  IF p_team_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.rbac_user_team_assignments uta
      JOIN public.teams t ON t.id = uta.team_id
      WHERE uta.user_id = v_user_id
        AND uta.team_id = p_team_id
        AND (
          public.has_platform_rbac_access()
          OR t.club_id = public.current_club_id()
        )
    ) THEN
      RETURN false;
    END IF;
  END IF;

  IF p_club_id IS NOT NULL AND NOT public.has_platform_rbac_access() THEN
    IF public.current_club_id() IS DISTINCT FROM p_club_id THEN
      RETURN false;
    END IF;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.rbac_user_roles ur
    JOIN public.rbac_role_permissions rp ON rp.role_id = ur.role_id
    WHERE ur.user_id = v_user_id
      AND rp.permission_id = v_permission_id
      AND (
        ur.club_id IS NULL
        OR p_club_id IS NULL
        OR ur.club_id = p_club_id
        OR ur.club_id = public.current_club_id()
      )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.has_rbac_permission(text, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_platform_rbac_access() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_rbac_permission(text, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_platform_rbac_access() TO authenticated;

-- -----------------------------------------------------------------------------
-- 2. Idempotent legacy admin RBAC backfill (no privilege escalation for unknowns)
-- -----------------------------------------------------------------------------

INSERT INTO public.rbac_user_roles (user_id, role_id, club_id, assigned_by)
SELECT p.id, r.id, NULL, NULL
FROM public.profiles p
JOIN public.rbac_roles r ON r.key = 'SUPER_ADMIN'
WHERE p.role = 'super-admin'::public.user_role
  AND p.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM public.rbac_user_roles ur WHERE ur.user_id = p.id
  )
ON CONFLICT DO NOTHING;

INSERT INTO public.rbac_user_roles (user_id, role_id, club_id, assigned_by)
SELECT p.id, r.id, NULL, NULL
FROM public.profiles p
JOIN public.rbac_roles r ON r.key = 'ADMIN'
WHERE p.role = 'admin'::public.user_role
  AND p.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM public.rbac_user_roles ur WHERE ur.user_id = p.id
  )
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- 3. Profile protection trigger (users.manage instead of is_admin)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.protect_profile_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'profile id cannot be changed';
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'role cannot be changed';
  END IF;

  IF NEW.is_active IS DISTINCT FROM OLD.is_active AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'is_active cannot be changed';
  END IF;

  IF NEW.email IS DISTINCT FROM OLD.email
     AND NOT public.has_rbac_permission('users.manage') THEN
    NEW.email := OLD.email;
  END IF;

  IF NEW.club_id IS DISTINCT FROM OLD.club_id
     AND NOT public.has_rbac_permission('users.manage') THEN
    NEW.club_id := OLD.club_id;
  END IF;

  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. Payment field guard trigger
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_application_payment_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF public.has_rbac_permission('payments.manage') THEN
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

-- -----------------------------------------------------------------------------
-- 5. Core domain RLS policies
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS profiles_select_own_or_admin ON public.profiles;
CREATE POLICY profiles_select_own_or_admin
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    id = auth.uid()
    OR public.has_rbac_permission('users.view')
  );

DROP POLICY IF EXISTS profiles_update_own_or_admin ON public.profiles;
CREATE POLICY profiles_update_own_or_admin
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (
    id = auth.uid()
    OR public.has_rbac_permission('users.manage')
  )
  WITH CHECK (
    id = auth.uid()
    OR public.has_rbac_permission('users.manage')
  );

DROP POLICY IF EXISTS clubs_select_own_or_admin ON public.clubs;
CREATE POLICY clubs_select_own_or_admin
  ON public.clubs
  FOR SELECT
  TO authenticated
  USING (
    id = public.current_club_id()
    OR created_by = auth.uid()
    OR public.has_rbac_permission('clubs.view', id)
  );

DROP POLICY IF EXISTS clubs_update_own_or_admin ON public.clubs;
CREATE POLICY clubs_update_own_or_admin
  ON public.clubs
  FOR UPDATE
  TO authenticated
  USING (
    id = public.current_club_id()
    OR public.has_rbac_permission('clubs.manage', id)
  )
  WITH CHECK (
    id = public.current_club_id()
    OR public.has_rbac_permission('clubs.manage', id)
  );

DROP POLICY IF EXISTS teams_select_own_or_admin ON public.teams;
CREATE POLICY teams_select_own_or_admin
  ON public.teams
  FOR SELECT
  TO authenticated
  USING (
    club_id = public.current_club_id()
    OR public.has_rbac_permission('teams.view', club_id)
  );

DROP POLICY IF EXISTS teams_insert_own ON public.teams;
CREATE POLICY teams_insert_own
  ON public.teams
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (
      club_id = public.current_club_id()
      AND public.has_rbac_permission('teams.manage', club_id)
    )
    OR public.has_rbac_permission('teams.manage', club_id)
  );

DROP POLICY IF EXISTS teams_update_own_or_admin ON public.teams;
CREATE POLICY teams_update_own_or_admin
  ON public.teams
  FOR UPDATE
  TO authenticated
  USING (
    (
      club_id = public.current_club_id()
      AND public.has_rbac_permission('teams.manage', club_id)
    )
    OR public.has_rbac_permission('teams.manage', club_id)
  )
  WITH CHECK (
    (
      club_id = public.current_club_id()
      AND public.has_rbac_permission('teams.manage', club_id)
    )
    OR public.has_rbac_permission('teams.manage', club_id)
  );

DROP POLICY IF EXISTS teams_delete_own_or_admin ON public.teams;
CREATE POLICY teams_delete_own_or_admin
  ON public.teams
  FOR DELETE
  TO authenticated
  USING (
    (
      club_id = public.current_club_id()
      AND public.has_rbac_permission('teams.manage', club_id)
    )
    OR public.has_rbac_permission('teams.manage', club_id)
  );

DROP POLICY IF EXISTS tournaments_write_admin ON public.tournaments;
CREATE POLICY tournaments_write_admin
  ON public.tournaments
  FOR ALL
  TO authenticated
  USING (public.has_rbac_permission('tournaments.manage'))
  WITH CHECK (public.has_rbac_permission('tournaments.manage'));

DROP POLICY IF EXISTS applications_select_own_or_admin ON public.applications;
CREATE POLICY applications_select_own_or_admin
  ON public.applications
  FOR SELECT
  TO authenticated
  USING (
    club_id = public.current_club_id()
    OR public.has_rbac_permission('applications.view', club_id)
  );

DROP POLICY IF EXISTS applications_update_own_or_admin ON public.applications;
CREATE POLICY applications_update_own_or_admin
  ON public.applications
  FOR UPDATE
  TO authenticated
  USING (
    club_id = public.current_club_id()
    OR public.has_rbac_permission('applications.manage', club_id)
    OR public.has_rbac_permission('applications.decide', club_id)
  )
  WITH CHECK (
    club_id = public.current_club_id()
    OR public.has_rbac_permission('applications.manage', club_id)
    OR public.has_rbac_permission('applications.decide', club_id)
  );

DROP POLICY IF EXISTS application_reviews_admin_all ON public.application_reviews;
CREATE POLICY application_reviews_admin_all
  ON public.application_reviews
  FOR ALL
  TO authenticated
  USING (
    public.has_rbac_permission('applications.decide')
    OR public.has_rbac_permission('applications.manage')
  )
  WITH CHECK (
    public.has_rbac_permission('applications.decide')
    OR public.has_rbac_permission('applications.manage')
  );

DROP POLICY IF EXISTS email_templates_admin_all ON public.email_templates;
CREATE POLICY email_templates_admin_all
  ON public.email_templates
  FOR ALL
  TO authenticated
  USING (public.has_rbac_permission('communications.manage'))
  WITH CHECK (public.has_rbac_permission('communications.manage'));

DROP POLICY IF EXISTS app_settings_admin_all ON public.app_settings;
CREATE POLICY app_settings_admin_all
  ON public.app_settings
  FOR ALL
  TO authenticated
  USING (public.has_rbac_permission('users.manage'))
  WITH CHECK (public.has_rbac_permission('users.manage'));

DROP POLICY IF EXISTS news_posts_admin_all ON public.news_posts;
CREATE POLICY news_posts_admin_all
  ON public.news_posts
  FOR ALL
  TO authenticated
  USING (public.has_rbac_permission('news.manage'))
  WITH CHECK (public.has_rbac_permission('news.manage'));

DROP POLICY IF EXISTS application_payment_admin_notes_admin_all ON public.application_payment_admin_notes;
CREATE POLICY application_payment_admin_notes_admin_all
  ON public.application_payment_admin_notes
  FOR ALL
  TO authenticated
  USING (public.has_rbac_permission('payments.manage'))
  WITH CHECK (public.has_rbac_permission('payments.manage'));

DROP POLICY IF EXISTS tournament_communications_admin_all ON public.tournament_communications;
CREATE POLICY tournament_communications_admin_all
  ON public.tournament_communications
  FOR ALL
  TO authenticated
  USING (public.has_rbac_permission('communications.manage'))
  WITH CHECK (public.has_rbac_permission('communications.manage'));

DROP POLICY IF EXISTS communication_recipients_admin_all ON public.communication_recipients;
CREATE POLICY communication_recipients_admin_all
  ON public.communication_recipients
  FOR ALL
  TO authenticated
  USING (public.has_rbac_permission('communications.manage'))
  WITH CHECK (public.has_rbac_permission('communications.manage'));

DROP POLICY IF EXISTS communication_confirmation_tokens_admin_select ON public.communication_confirmation_tokens;
CREATE POLICY communication_confirmation_tokens_admin_select
  ON public.communication_confirmation_tokens
  FOR SELECT
  TO authenticated
  USING (public.has_rbac_permission('communications.view'));

DROP POLICY IF EXISTS secure_access_tokens_admin_select ON public.secure_access_tokens;
CREATE POLICY secure_access_tokens_admin_select
  ON public.secure_access_tokens
  FOR SELECT
  TO authenticated
  USING (public.has_rbac_permission('cancellations.manage'));

DROP POLICY IF EXISTS cancellation_requests_admin_update ON public.cancellation_requests;
CREATE POLICY cancellation_requests_admin_update
  ON public.cancellation_requests
  FOR UPDATE
  TO authenticated
  USING (
    public.has_rbac_permission('cancellations.decide')
    OR public.has_rbac_permission('cancellations.manage')
  )
  WITH CHECK (
    public.has_rbac_permission('cancellations.decide')
    OR public.has_rbac_permission('cancellations.manage')
  );

DROP POLICY IF EXISTS email_logs_admin_select ON public.email_logs;
CREATE POLICY email_logs_admin_select
  ON public.email_logs
  FOR SELECT
  TO authenticated
  USING (public.has_rbac_permission('communications.view'));

DROP POLICY IF EXISTS email_logs_admin_insert ON public.email_logs;
CREATE POLICY email_logs_admin_insert
  ON public.email_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_rbac_permission('communications.send'));

-- Schedule / results / mein-turnierplan write policies
DROP POLICY IF EXISTS tournament_groups_write_admin ON public.tournament_groups;
CREATE POLICY tournament_groups_write_admin
  ON public.tournament_groups
  FOR ALL
  TO authenticated
  USING (public.has_rbac_permission('schedule.manage'))
  WITH CHECK (public.has_rbac_permission('schedule.manage'));

DROP POLICY IF EXISTS tournament_group_members_write_admin ON public.tournament_group_members;
CREATE POLICY tournament_group_members_write_admin
  ON public.tournament_group_members
  FOR ALL
  TO authenticated
  USING (public.has_rbac_permission('schedule.manage'))
  WITH CHECK (public.has_rbac_permission('schedule.manage'));

DROP POLICY IF EXISTS tournament_fields_write_admin ON public.tournament_fields;
CREATE POLICY tournament_fields_write_admin
  ON public.tournament_fields
  FOR ALL
  TO authenticated
  USING (public.has_rbac_permission('schedule.manage'))
  WITH CHECK (public.has_rbac_permission('schedule.manage'));

DROP POLICY IF EXISTS tournament_matches_write_admin ON public.tournament_matches;
CREATE POLICY tournament_matches_write_admin
  ON public.tournament_matches
  FOR ALL
  TO authenticated
  USING (
    public.has_rbac_permission('schedule.manage')
    OR public.has_rbac_permission('results.manage')
  )
  WITH CHECK (
    public.has_rbac_permission('schedule.manage')
    OR public.has_rbac_permission('results.manage')
  );

DROP POLICY IF EXISTS tournament_external_teams_write_admin ON public.tournament_external_teams;
CREATE POLICY tournament_external_teams_write_admin
  ON public.tournament_external_teams
  FOR ALL
  TO authenticated
  USING (public.has_rbac_permission('tournaments.manage'))
  WITH CHECK (public.has_rbac_permission('tournaments.manage'));

-- Storage: club logos
DROP POLICY IF EXISTS club_logos_admin_insert ON storage.objects;
CREATE POLICY club_logos_admin_insert
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'club-logos'
    AND public.has_rbac_permission('teams.manage')
  );

DROP POLICY IF EXISTS club_logos_admin_update ON storage.objects;
CREATE POLICY club_logos_admin_update
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'club-logos'
    AND public.has_rbac_permission('teams.manage')
  )
  WITH CHECK (
    bucket_id = 'club-logos'
    AND public.has_rbac_permission('teams.manage')
  );

DROP POLICY IF EXISTS club_logos_admin_delete ON storage.objects;
CREATE POLICY club_logos_admin_delete
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'club-logos'
    AND public.has_rbac_permission('teams.manage')
  );

-- Archived tournament visibility in nested selects
CREATE OR REPLACE FUNCTION public.can_view_archived_tournament(p_archived_at timestamptz)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_archived_at IS NULL OR public.has_rbac_permission('tournaments.view');
$$;

REVOKE ALL ON FUNCTION public.can_view_archived_tournament(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_archived_tournament(timestamptz) TO authenticated;

DROP POLICY IF EXISTS tournaments_select_public ON public.tournaments;
CREATE POLICY tournaments_select_public
  ON public.tournaments
  FOR SELECT
  TO anon, authenticated
  USING (public.can_view_archived_tournament(archived_at));

DROP POLICY IF EXISTS tournament_groups_select_public ON public.tournament_groups;
CREATE POLICY tournament_groups_select_public
  ON public.tournament_groups
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.tournaments
      WHERE tournaments.id = tournament_groups.tournament_id
        AND public.can_view_archived_tournament(tournaments.archived_at)
    )
  );

DROP POLICY IF EXISTS tournament_group_members_select_public ON public.tournament_group_members;
CREATE POLICY tournament_group_members_select_public
  ON public.tournament_group_members
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.tournament_groups
      JOIN public.tournaments
        ON tournaments.id = tournament_groups.tournament_id
      WHERE tournament_groups.id = tournament_group_members.group_id
        AND public.can_view_archived_tournament(tournaments.archived_at)
    )
  );

DROP POLICY IF EXISTS tournament_fields_select_public ON public.tournament_fields;
CREATE POLICY tournament_fields_select_public
  ON public.tournament_fields
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.tournaments
      WHERE tournaments.id = tournament_fields.tournament_id
        AND public.can_view_archived_tournament(tournaments.archived_at)
    )
  );

DROP POLICY IF EXISTS tournament_matches_select_public ON public.tournament_matches;
CREATE POLICY tournament_matches_select_public
  ON public.tournament_matches
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.tournaments
      WHERE tournaments.id = tournament_matches.tournament_id
        AND public.can_view_archived_tournament(tournaments.archived_at)
    )
  );

DROP POLICY IF EXISTS tournament_external_teams_select_public ON public.tournament_external_teams;
CREATE POLICY tournament_external_teams_select_public
  ON public.tournament_external_teams
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.tournaments
      WHERE tournaments.id = tournament_external_teams.tournament_id
        AND public.can_view_archived_tournament(tournaments.archived_at)
    )
  );

DROP POLICY IF EXISTS applications_insert_own ON public.applications;
CREATE POLICY applications_insert_own
  ON public.applications
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_rbac_permission('applications.manage', club_id)
    OR (
      club_id = public.current_club_id()
      AND submitted_by = auth.uid()
      AND status = 'new'::public.application_status
    )
  );

DROP POLICY IF EXISTS cancellation_requests_select ON public.cancellation_requests;
CREATE POLICY cancellation_requests_select
  ON public.cancellation_requests
  FOR SELECT
  TO authenticated
  USING (
    public.has_rbac_permission('cancellations.view')
    OR EXISTS (
      SELECT 1
      FROM public.applications a
      WHERE a.id = cancellation_requests.application_id
        AND a.club_id = public.current_club_id()
    )
  );

-- -----------------------------------------------------------------------------
-- 6. SECURITY DEFINER RPC guards (domain permissions)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.preview_communication_recipients(
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
  IF NOT public.has_rbac_permission('communications.view') THEN
    RAISE EXCEPTION 'communications.view required';
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.resolve_communication_recipients(
    p_tournament_id,
    p_communication_type,
    p_recipient_filter,
    p_application_ids
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.initiate_communication_send(
  p_tournament_id uuid,
  p_type text,
  p_subject text,
  p_body text,
  p_important boolean,
  p_recipient_filter text,
  p_application_ids uuid[] DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_id uuid;
  v_communication_id uuid;
  v_recipient_count integer;
BEGIN
  IF NOT public.has_rbac_permission('communications.send') THEN
    RAISE EXCEPTION 'communications.send required';
  END IF;

  IF p_idempotency_key IS NOT NULL AND length(btrim(p_idempotency_key)) > 0 THEN
    SELECT id INTO v_existing_id
    FROM public.tournament_communications
    WHERE idempotency_key = btrim(p_idempotency_key)
    LIMIT 1;

    IF FOUND THEN
      RETURN v_existing_id;
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tournaments WHERE id = p_tournament_id
  ) THEN
    RAISE EXCEPTION 'tournament not found';
  END IF;

  IF p_type = 'payment-reminder'
     AND p_recipient_filter NOT IN ('payment-pending', 'custom') THEN
    RAISE EXCEPTION 'payment reminder only allows payment-pending or custom filter';
  END IF;

  INSERT INTO public.tournament_communications (
    tournament_id,
    type,
    subject,
    body,
    important,
    recipient_filter,
    status,
    idempotency_key,
    created_by
  )
  VALUES (
    p_tournament_id,
    p_type,
    btrim(p_subject),
    btrim(p_body),
    COALESCE(p_important, false),
    p_recipient_filter,
    'sending',
    NULLIF(btrim(p_idempotency_key), ''),
    auth.uid()
  )
  RETURNING id INTO v_communication_id;

  INSERT INTO public.communication_recipients (
    communication_id,
    application_id,
    recipient_email,
    recipient_team_name,
    recipient_club_name,
    send_status
  )
  SELECT
    v_communication_id,
    r.application_id,
    r.recipient_email,
    r.recipient_team_name,
    r.recipient_club_name,
    'pending'
  FROM public.resolve_communication_recipients(
    p_tournament_id,
    p_type,
    p_recipient_filter,
    p_application_ids
  ) r;

  GET DIAGNOSTICS v_recipient_count = ROW_COUNT;

  IF v_recipient_count = 0 THEN
    UPDATE public.tournament_communications
    SET status = 'failed', updated_at = now()
    WHERE id = v_communication_id;

    RAISE EXCEPTION 'no eligible recipients';
  END IF;

  UPDATE public.tournament_communications
  SET recipient_count = v_recipient_count, updated_at = now()
  WHERE id = v_communication_id;

  RETURN v_communication_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reserve_communication_email_send(
  p_communication_recipient_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_rbac_permission('communications.send') THEN
    RAISE EXCEPTION 'communications.send required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.communication_recipients cr
    INNER JOIN public.tournament_communications tc ON tc.id = cr.communication_id
    WHERE cr.id = p_communication_recipient_id
      AND tc.status = 'sending'
      AND cr.send_status = 'pending'
  ) THEN
    RETURN 'skip';
  END IF;

  INSERT INTO public.communication_email_send_keys (communication_recipient_id)
  VALUES (p_communication_recipient_id)
  ON CONFLICT (communication_recipient_id) DO NOTHING;

  IF NOT FOUND THEN
    RETURN 'skip';
  END IF;

  UPDATE public.communication_recipients
  SET send_status = 'sending'
  WHERE id = p_communication_recipient_id
    AND send_status = 'pending';

  IF NOT FOUND THEN
    RETURN 'skip';
  END IF;

  RETURN 'send';
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_communication_recipient(
  p_recipient_id uuid,
  p_send_status text,
  p_email_log_id uuid DEFAULT NULL,
  p_error_message text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_rbac_permission('communications.send') THEN
    RAISE EXCEPTION 'communications.send required';
  END IF;

  IF p_send_status NOT IN ('sent', 'failed', 'skipped') THEN
    RAISE EXCEPTION 'invalid send status';
  END IF;

  UPDATE public.communication_recipients
  SET
    send_status = p_send_status,
    sent_at = CASE WHEN p_send_status = 'sent' THEN now() ELSE sent_at END,
    email_log_id = p_email_log_id,
    error_message = NULLIF(btrim(p_error_message), '')
  WHERE id = p_recipient_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_communication(
  p_communication_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sent integer;
  v_failed integer;
  v_pending integer;
  v_sending integer;
  v_total integer;
  v_status text;
  v_complete boolean;
BEGIN
  IF NOT public.has_rbac_permission('communications.send') THEN
    RAISE EXCEPTION 'communications.send required';
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE send_status = 'sent'),
    COUNT(*) FILTER (WHERE send_status = 'failed'),
    COUNT(*) FILTER (WHERE send_status = 'pending'),
    COUNT(*) FILTER (WHERE send_status = 'sending'),
    COUNT(*)
  INTO v_sent, v_failed, v_pending, v_sending, v_total
  FROM public.communication_recipients
  WHERE communication_id = p_communication_id;

  v_complete := (v_pending = 0 AND v_sending = 0);

  IF v_total = 0 THEN
    v_status := 'failed';
  ELSIF NOT v_complete THEN
    v_status := 'sending';
  ELSIF v_sent = v_total THEN
    v_status := 'sent';
  ELSIF v_failed = v_total THEN
    v_status := 'failed';
  ELSIF v_sent > 0 AND v_failed > 0 THEN
    v_status := 'partially_sent';
  ELSIF v_sent > 0 THEN
    v_status := 'sent';
  ELSE
    v_status := 'failed';
  END IF;

  UPDATE public.tournament_communications
  SET
    sent_count = v_sent,
    failed_count = v_failed,
    status = v_status,
    sent_at = CASE WHEN v_complete THEN now() ELSE sent_at END,
    updated_at = now()
  WHERE id = p_communication_id;
END;
$$;
