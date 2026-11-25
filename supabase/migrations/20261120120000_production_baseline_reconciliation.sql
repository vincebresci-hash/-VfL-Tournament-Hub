-- CL Release 1.4 production baseline reconciliation.
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

  SELECT regexp_replace(pg_get_constraintdef(oid, true), '\s+', ' ', 'g')
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

  SELECT regexp_replace(pg_get_constraintdef(oid, true), '\s+', ' ', 'g')
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
  SELECT regexp_replace(pg_get_indexdef(i.indexrelid), '\s+', ' ', 'g')
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

-- Production body fingerprint: e3124bff2b468034d255f1858d2de328
CREATE OR REPLACE FUNCTION public.activate_participation_access_recovery_token(p_token_hash text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_application_id uuid;
  v_token public.secure_access_tokens%ROWTYPE;
  v_app public.applications%ROWTYPE;
BEGIN
  IF char_length(p_token_hash) <> 64
     OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN false;
  END IF;

  SELECT application_id
  INTO v_application_id
  FROM public.secure_access_tokens
  WHERE token_hash = p_token_hash
    AND purpose = 'cancellation'::public.secure_access_token_purpose
    AND pending_activation = true;

  IF v_application_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT *
  INTO v_app
  FROM public.applications
  WHERE id = v_application_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_app.status IS DISTINCT FROM 'accepted'::public.application_status
     OR v_app.club_id IS NOT NULL THEN

    DELETE FROM public.secure_access_tokens
    WHERE token_hash = p_token_hash
      AND purpose = 'cancellation'::public.secure_access_token_purpose
      AND pending_activation = true;

    RETURN false;
  END IF;

  SELECT *
  INTO v_token
  FROM public.secure_access_tokens
  WHERE token_hash = p_token_hash
    AND purpose = 'cancellation'::public.secure_access_token_purpose
    AND pending_activation = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_token.expires_at <= now() THEN
    DELETE FROM public.secure_access_tokens
    WHERE id = v_token.id
      AND pending_activation = true;

    RETURN false;
  END IF;

  UPDATE public.secure_access_tokens
  SET revoked_at = now()
  WHERE application_id = v_app.id
    AND purpose = 'cancellation'::public.secure_access_token_purpose
    AND pending_activation = false
    AND revoked_at IS NULL
    AND id IS DISTINCT FROM v_token.id;

  UPDATE public.secure_access_tokens
  SET
    pending_activation = false,
    revoked_at = NULL
  WHERE id = v_token.id;

  DELETE FROM public.secure_access_tokens
  WHERE application_id = v_app.id
    AND purpose = 'cancellation'::public.secure_access_token_purpose
    AND pending_activation = true
    AND id IS DISTINCT FROM v_token.id;

  RETURN true;
END;
$function$;
REVOKE ALL ON FUNCTION public.activate_participation_access_recovery_token(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.activate_participation_access_recovery_token(text) TO service_role;

-- Production body fingerprint: e3e07910f131f9cddcd940284f12ee0d
CREATE OR REPLACE FUNCTION public.discard_participation_access_recovery_token(p_token_hash text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_deleted integer;
BEGIN
  IF char_length(p_token_hash) <> 64
     OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN false;
  END IF;

  DELETE FROM public.secure_access_tokens
  WHERE token_hash = p_token_hash
    AND purpose = 'cancellation'::public.secure_access_token_purpose
    AND pending_activation = true;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN v_deleted > 0;
END;
$function$;
REVOKE ALL ON FUNCTION public.discard_participation_access_recovery_token(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.discard_participation_access_recovery_token(text) TO service_role;

-- Production body fingerprint: 72f1b6f02e04eca234efd0fff84bcaca
CREATE OR REPLACE FUNCTION public.participation_recovery_token_expires_at(p_tournament_date date)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_reference_date date;
  v_expires_at timestamptz;
  v_minimum_expires_at timestamptz;
BEGIN
  IF p_tournament_date IS NULL THEN
    RETURN (timezone('UTC', now()) + interval '1 day');
  END IF;

  v_reference_date := GREATEST(
    p_tournament_date,
    (timezone('UTC', now()))::date
  );

  v_expires_at := ((v_reference_date + 30)::timestamp AT TIME ZONE 'UTC');
  v_minimum_expires_at := timezone(
    'UTC',
    date_trunc('day', timezone('UTC', now())) + interval '1 day'
  );

  IF v_expires_at <= timezone('UTC', now()) THEN
    RETURN v_minimum_expires_at;
  END IF;

  IF v_expires_at < v_minimum_expires_at THEN
    RETURN v_minimum_expires_at;
  END IF;

  RETURN v_expires_at;
END;
$function$;
REVOKE ALL ON FUNCTION public.participation_recovery_token_expires_at(date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.participation_recovery_token_expires_at(date) TO service_role;

-- Production body fingerprint: dd5b94e123842eb89048a47e36a87809
CREATE OR REPLACE FUNCTION public.rotate_participation_cancellation_token(p_application_id uuid, p_token_hash text, p_expires_at timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_app public.applications%ROWTYPE;
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'admin required';
  END IF;

  IF NOT (
    public.has_rbac_permission('cancellations.manage')
    OR public.has_rbac_permission('applications.decide')
  ) THEN
    RAISE EXCEPTION 'admin required';
  END IF;

  IF p_application_id IS NULL THEN
    RAISE EXCEPTION 'application required';
  END IF;

  IF char_length(p_token_hash) <> 64
     OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid token hash';
  END IF;

  IF p_expires_at IS NULL OR p_expires_at <= now() THEN
    RAISE EXCEPTION 'invalid expiry';
  END IF;

  SELECT *
  INTO v_app
  FROM public.applications
  WHERE id = p_application_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'application not found';
  END IF;

  IF v_app.status IS DISTINCT FROM 'accepted'::public.application_status THEN
    RAISE EXCEPTION 'application not accepted';
  END IF;

  DELETE FROM public.secure_access_tokens
  WHERE application_id = v_app.id
    AND purpose = 'cancellation'::public.secure_access_token_purpose
    AND pending_activation = true;

  UPDATE public.secure_access_tokens
  SET revoked_at = now()
  WHERE application_id = v_app.id
    AND purpose = 'cancellation'::public.secure_access_token_purpose
    AND pending_activation = false
    AND revoked_at IS NULL;

  INSERT INTO public.secure_access_tokens (
    application_id,
    purpose,
    token_hash,
    expires_at,
    pending_activation
  )
  VALUES (
    v_app.id,
    'cancellation'::public.secure_access_token_purpose,
    p_token_hash,
    p_expires_at,
    false
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.rotate_participation_cancellation_token(uuid,text,timestamp with time zone) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rotate_participation_cancellation_token(uuid,text,timestamp with time zone) TO authenticated;

-- Production body fingerprint: cf8faad8eac463b87a1d34fc9b6a044a
CREATE OR REPLACE FUNCTION public.stage_participation_access_recovery_token(p_tournament_id uuid, p_contact_email text, p_email_identifier_hash text, p_ip_identifier_hash text, p_token_hash text)
 RETURNS TABLE(application_id uuid, contact_email text, contact_first_name text, tournament_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_email text;
  v_app public.applications%ROWTYPE;
  v_tournament public.tournaments%ROWTYPE;
  v_expires_at timestamptz;
BEGIN
  IF p_tournament_id IS NULL THEN
    RETURN;
  END IF;

  v_email := lower(btrim(p_contact_email));

  IF v_email IS NULL
     OR char_length(v_email) < 3
     OR position('@' IN v_email) = 0 THEN
    RETURN;
  END IF;

  IF char_length(p_token_hash) <> 64
     OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN;
  END IF;

  IF char_length(p_email_identifier_hash) <> 64
     OR p_email_identifier_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN;
  END IF;

  IF p_ip_identifier_hash IS NOT NULL
     AND btrim(p_ip_identifier_hash) <> ''
     AND (
       char_length(p_ip_identifier_hash) <> 64
       OR p_ip_identifier_hash !~ '^[0-9a-f]{64}$'
     ) THEN
    RETURN;
  END IF;

  IF public.is_public_action_rate_limited(
    'participation_recovery_email',
    p_email_identifier_hash,
    5,
    interval '1 hour'
  ) THEN
    RETURN;
  END IF;

  IF btrim(coalesce(p_ip_identifier_hash, '')) <> ''
     AND public.is_public_action_rate_limited(
       'participation_recovery_ip',
       p_ip_identifier_hash,
       30,
       interval '1 hour'
     ) THEN
    RETURN;
  END IF;

  PERFORM public.record_public_action_attempt(
    'participation_recovery_email',
    p_email_identifier_hash
  );

  IF btrim(coalesce(p_ip_identifier_hash, '')) <> '' THEN
    PERFORM public.record_public_action_attempt(
      'participation_recovery_ip',
      p_ip_identifier_hash
    );
  END IF;

  SELECT a.*
  INTO v_app
  FROM public.applications a
  WHERE a.tournament_id = p_tournament_id
    AND lower(btrim(a.contact_email)) = v_email
    AND a.status = 'accepted'::public.application_status
    AND a.club_id IS NULL
  ORDER BY a.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT *
  INTO v_app
  FROM public.applications
  WHERE id = v_app.id
  FOR UPDATE;

  IF v_app.status IS DISTINCT FROM 'accepted'::public.application_status
     OR v_app.club_id IS NOT NULL
     OR v_app.tournament_id IS DISTINCT FROM p_tournament_id
     OR lower(btrim(v_app.contact_email)) IS DISTINCT FROM v_email THEN
    RETURN;
  END IF;

  IF public.is_public_action_rate_limited(
    'participation_recovery_app',
    encode(
      extensions.digest(v_app.id::text, 'sha256'),
      'hex'
    ),
    1,
    interval '15 minutes'
  ) THEN
    RETURN;
  END IF;

  PERFORM public.record_public_action_attempt(
    'participation_recovery_app',
    encode(
      extensions.digest(v_app.id::text, 'sha256'),
      'hex'
    )
  );

  SELECT *
  INTO v_tournament
  FROM public.tournaments
  WHERE id = p_tournament_id;

  IF NOT FOUND OR v_tournament.date IS NULL THEN
    RETURN;
  END IF;

  v_expires_at :=
    public.participation_recovery_token_expires_at(v_tournament.date);

  DELETE FROM public.secure_access_tokens AS sat
  WHERE sat.application_id = v_app.id
    AND sat.purpose = 'cancellation'::public.secure_access_token_purpose
    AND sat.pending_activation = true;

  INSERT INTO public.secure_access_tokens (
    application_id,
    purpose,
    token_hash,
    expires_at,
    revoked_at,
    pending_activation
  )
  VALUES (
    v_app.id,
    'cancellation'::public.secure_access_token_purpose,
    p_token_hash,
    v_expires_at,
    now(),
    true
  );

  RETURN QUERY
  SELECT
    v_app.id,
    v_app.contact_email,
    coalesce(nullif(btrim(v_app.contact_first_name), ''), ''),
    coalesce(nullif(btrim(v_tournament.name), ''), 'Turnier');
END;
$function$;
REVOKE ALL ON FUNCTION public.stage_participation_access_recovery_token(uuid,text,text,text,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.stage_participation_access_recovery_token(uuid,text,text,text,text) TO service_role;

-- Production body fingerprint: 0254b0000633820677bd949837d30943
CREATE OR REPLACE FUNCTION public.has_rbac_permission(p_permission text, p_club_id uuid DEFAULT NULL::uuid, p_team_id uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
                                                                                                                                                                                                                                                                                                                                                                                                                                                          $function$;
REVOKE ALL ON FUNCTION public.has_rbac_permission(text,uuid,uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_rbac_permission(text,uuid,uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.has_rbac_permission(text,uuid,uuid) TO authenticated;

-- Production body fingerprint: 8c9f6063b9801881621d6aafd3cbeb9a
CREATE OR REPLACE FUNCTION public.issue_guest_cancellation_recovery_token(p_tournament_id uuid, p_contact_email text, p_club_name text, p_team_name text, p_token_hash text, p_email_identifier_hash text, p_tournament_email_identifier_hash text, p_ip_identifier_hash text DEFAULT NULL::text)
 RETURNS TABLE(should_send boolean, contact_email text, contact_first_name text, tournament_name text, tournament_date date, team_name text, club_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_email text;
  v_club text;
  v_team text;
  v_email_key text;
  v_combo_key text;
  v_ip_key text;
  v_match_count integer := 0;
  v_app public.applications%ROWTYPE;
  v_tournament public.tournaments%ROWTYPE;
  v_expires_at timestamptz;
  v_rate_limited boolean := false;
BEGIN
  should_send := false;
  contact_email := NULL;
  contact_first_name := NULL;
  tournament_name := NULL;
  tournament_date := NULL;
  team_name := NULL;
  club_name := NULL;

  IF p_tournament_id IS NULL
    OR p_contact_email IS NULL
    OR p_club_name IS NULL
    OR p_team_name IS NULL
    OR p_token_hash IS NULL
    OR p_email_identifier_hash IS NULL
    OR p_tournament_email_identifier_hash IS NULL
  THEN
    RETURN NEXT;
    RETURN;
  END IF;

  IF char_length(p_token_hash) <> 64
    OR p_token_hash !~ '^[0-9a-f]{64}$'
  THEN
    RETURN NEXT;
    RETURN;
  END IF;

  IF char_length(p_email_identifier_hash) <> 64
    OR p_email_identifier_hash !~ '^[0-9a-f]{64}$'
  THEN
    RETURN NEXT;
    RETURN;
  END IF;

  IF char_length(p_tournament_email_identifier_hash) <> 64
    OR p_tournament_email_identifier_hash !~ '^[0-9a-f]{64}$'
  THEN
    RETURN NEXT;
    RETURN;
  END IF;

  IF p_ip_identifier_hash IS NOT NULL
    AND (
      char_length(p_ip_identifier_hash) <> 64
      OR p_ip_identifier_hash !~ '^[0-9a-f]{64}$'
    )
  THEN
    RETURN NEXT;
    RETURN;
  END IF;

  v_email := lower(btrim(p_contact_email));
  v_club := lower(btrim(p_club_name));
  v_team := lower(btrim(p_team_name));

  IF v_email = ''
    OR v_club = ''
    OR v_team = ''
    OR position('@' IN v_email) = 0
  THEN
    RETURN NEXT;
    RETURN;
  END IF;

  v_email_key := p_email_identifier_hash;
  v_combo_key := p_tournament_email_identifier_hash;
  v_ip_key := NULLIF(
    btrim(COALESCE(p_ip_identifier_hash, '')),
    ''
  );

  -- Existing project semantics:
  -- CHECK first, then RECORD.
  -- This allows exactly 3 / 5 / 10 attempts respectively.

  IF public.is_public_action_rate_limited(
    'guest_cancellation_recovery_email',
    v_email_key,
    3,
    interval '1 hour'
  ) THEN
    v_rate_limited := true;
  END IF;

  IF public.is_public_action_rate_limited(
    'guest_cancellation_recovery_tournament_email',
    v_combo_key,
    5,
    interval '1 hour'
  ) THEN
    v_rate_limited := true;
  END IF;

  IF v_ip_key IS NOT NULL
    AND public.is_public_action_rate_limited(
      'guest_cancellation_recovery_ip',
      v_ip_key,
      10,
      interval '1 hour'
    )
  THEN
    v_rate_limited := true;
  END IF;

  IF v_rate_limited THEN
    RETURN NEXT;
    RETURN;
  END IF;

  -- Count the request even if the supplied identity ultimately
  -- does not match an eligible application.

  PERFORM public.record_public_action_attempt(
    'guest_cancellation_recovery_email',
    v_email_key
  );

  PERFORM public.record_public_action_attempt(
    'guest_cancellation_recovery_tournament_email',
    v_combo_key
  );

  IF v_ip_key IS NOT NULL THEN
    PERFORM public.record_public_action_attempt(
      'guest_cancellation_recovery_ip',
      v_ip_key
    );
  END IF;

  SELECT COUNT(*)::integer
  INTO v_match_count
  FROM public.applications a
  WHERE a.tournament_id = p_tournament_id
    AND a.club_id IS NULL
    AND a.status = 'accepted'::public.application_status
    AND a.archived_at IS NULL
    AND lower(btrim(a.contact_email)) = v_email
    AND lower(btrim(a.club_name)) = v_club
    AND lower(btrim(a.team_name)) = v_team;

  IF v_match_count IS DISTINCT FROM 1 THEN
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT a.*
  INTO v_app
  FROM public.applications a
  WHERE a.tournament_id = p_tournament_id
    AND a.club_id IS NULL
    AND a.status = 'accepted'::public.application_status
    AND a.archived_at IS NULL
    AND lower(btrim(a.contact_email)) = v_email
    AND lower(btrim(a.club_name)) = v_club
    AND lower(btrim(a.team_name)) = v_team
  LIMIT 1;

  IF NOT FOUND
    OR v_app.contact_email IS NULL
    OR btrim(v_app.contact_email) = ''
  THEN
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT t.*
  INTO v_tournament
  FROM public.tournaments t
  WHERE t.id = v_app.tournament_id;

  IF NOT FOUND OR v_tournament.date IS NULL THEN
    RETURN NEXT;
    RETURN;
  END IF;

  v_expires_at :=
    ((v_tournament.date::timestamp AT TIME ZONE 'UTC')
      + interval '30 days');

  IF v_expires_at <= now() THEN
    RETURN NEXT;
    RETURN;
  END IF;

  -- Atomic token rotation.
  -- If this block fails, PostgreSQL rolls back the revoke + insert.

  UPDATE public.secure_access_tokens
  SET revoked_at = now()
  WHERE application_id = v_app.id
    AND purpose = 'cancellation'::public.secure_access_token_purpose
    AND revoked_at IS NULL;

  INSERT INTO public.secure_access_tokens (
    application_id,
    purpose,
    token_hash,
    expires_at
  )
  VALUES (
    v_app.id,
    'cancellation'::public.secure_access_token_purpose,
    p_token_hash,
    v_expires_at
  );

  should_send := true;
  contact_email := btrim(v_app.contact_email);
  contact_first_name :=
    NULLIF(btrim(COALESCE(v_app.contact_first_name, '')), '');
  tournament_name :=
    NULLIF(btrim(COALESCE(v_tournament.name, '')), '');
  tournament_date := v_tournament.date;
  team_name :=
    NULLIF(btrim(COALESCE(v_app.team_name, '')), '');
  club_name :=
    NULLIF(btrim(COALESCE(v_app.club_name, '')), '');

  RETURN NEXT;
  RETURN;

EXCEPTION
  WHEN OTHERS THEN
    should_send := false;
    contact_email := NULL;
    contact_first_name := NULL;
    tournament_name := NULL;
    tournament_date := NULL;
    team_name := NULL;
    club_name := NULL;

    RETURN NEXT;
    RETURN;
END;
$function$;
REVOKE ALL ON FUNCTION public.issue_guest_cancellation_recovery_token(uuid,text,text,text,text,text,text,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.issue_guest_cancellation_recovery_token(uuid,text,text,text,text,text,text,text) TO service_role;

-- Production body fingerprint: 50261435dd4c058be58abf7f7ae84f81
CREATE OR REPLACE FUNCTION public.set_tournament_partner_assignments(p_tournament_id uuid, p_partner_ids uuid[])
 RETURNS uuid[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tournament_id uuid;
  v_normalized uuid[];
  v_existing uuid[];
BEGIN

  IF NOT public.has_rbac_permission('tournaments.manage') THEN
    RAISE EXCEPTION 'Nicht autorisiert.';
  END IF;

  IF p_tournament_id IS NULL THEN
    RAISE EXCEPTION 'Turnier fehlt.';
  END IF;

  -- Validate tournament exists and serialize same-tournament assignment updates.
  SELECT t.id
  INTO v_tournament_id
  FROM public.tournaments AS t
  WHERE t.id = p_tournament_id
  FOR UPDATE;

  IF v_tournament_id IS NULL THEN
    RAISE EXCEPTION 'Turnier nicht gefunden.';
  END IF;

  -- NULL / empty → empty assignment set; deduplicate Partner IDs.
  SELECT coalesce(
    array_agg(DISTINCT x ORDER BY x),
    ARRAY[]::uuid[]
  )
  INTO v_normalized
  FROM unnest(
    coalesce(p_partner_ids, ARRAY[]::uuid[])
  ) AS x;

  SELECT coalesce(
    array_agg(tp.partner_id),
    ARRAY[]::uuid[]
  )
  INTO v_existing
  FROM public.tournament_partners AS tp
  WHERE tp.tournament_id = p_tournament_id;

  -- Every submitted Partner ID must exist.
  IF EXISTS (
    SELECT 1
    FROM unnest(v_normalized) AS sid(id)
    LEFT JOIN public.partners AS p
      ON p.id = sid.id
    WHERE p.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Ungültiger Partner.';
  END IF;

  -- Inactive Partners may remain only if already assigned;
  -- new inactive assignments are rejected.
  IF EXISTS (
    SELECT 1
    FROM unnest(v_normalized) AS sid(id)
    JOIN public.partners AS p
      ON p.id = sid.id
    WHERE p.is_active = false
      AND NOT (sid.id = ANY (v_existing))
  ) THEN
    RAISE EXCEPTION 'Inaktive Partner können nicht neu zugeordnet werden.';
  END IF;

  -- Replace-set: remove omitted assignments, insert missing ones.
  DELETE FROM public.tournament_partners AS tp
  WHERE tp.tournament_id = p_tournament_id
    AND NOT (tp.partner_id = ANY (v_normalized));

  INSERT INTO public.tournament_partners (
    tournament_id,
    partner_id
  )
  SELECT
    p_tournament_id,
    sid.id
  FROM unnest(v_normalized) AS sid(id)
  WHERE NOT (sid.id = ANY (v_existing))
  ON CONFLICT (tournament_id, partner_id) DO NOTHING;

  -- Deterministic final Partner IDs (partners global order).
  RETURN ARRAY(
    SELECT tp.partner_id
    FROM public.tournament_partners AS tp
    JOIN public.partners AS p
      ON p.id = tp.partner_id
    WHERE tp.tournament_id = p_tournament_id
    ORDER BY
      p.sort_order ASC,
      p.name ASC,
      p.id ASC
  );

END;
$function$;
REVOKE ALL ON FUNCTION public.set_tournament_partner_assignments(uuid,uuid[]) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_tournament_partner_assignments(uuid,uuid[]) TO authenticated;

-- Production body fingerprint: 243dda3340b4f4d016946d43cbeecac7
CREATE OR REPLACE FUNCTION public.sync_mein_turnierplan_tournament(p_tournament_id uuid, p_payload jsonb, p_overwrite_manual boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_source constant text := 'mein-turnierplan';
  v_now timestamptz := now();
  v_match_duration integer := 12;
  v_teams_inserted integer := 0;
  v_teams_updated integer := 0;
  v_groups_inserted integer := 0;
  v_groups_updated integer := 0;
  v_fields_inserted integer := 0;
  v_fields_updated integer := 0;
  v_matches_inserted integer := 0;
  v_matches_updated integer := 0;
  v_protected_overrides integer := 0;
  v_deactivated_teams integer := 0;
  v_deactivated_groups integer := 0;
  v_deactivated_fields integer := 0;
  v_deactivated_matches integer := 0;
  v_team record;
  v_group record;
  v_field record;
  v_match record;
  v_existing_team record;
  v_existing_group record;
  v_existing_field record;
  v_existing_match record;
  v_team_uuid uuid;
  v_group_uuid uuid;
  v_field_uuid uuid;
  v_home_application_id uuid;
  v_away_application_id uuid;
  v_home_external_team_id uuid;
  v_away_external_team_id uuid;
  v_payload_team_ids text[] := ARRAY[]::text[];
  v_payload_group_ids text[] := ARRAY[]::text[];
  v_payload_field_ids text[] := ARRAY[]::text[];
  v_payload_match_ids text[] := ARRAY[]::text[];
  v_sync_meta jsonb;
BEGIN
  IF auth.uid() IS NULL
    OR NOT public.has_rbac_permission('tournaments.manage')
    OR NOT public.has_rbac_permission('schedule.manage')
    OR NOT public.has_rbac_permission('results.manage')
  THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tournaments
    WHERE id = p_tournament_id
  ) THEN
    RAISE EXCEPTION 'Tournament not found';
  END IF;

  IF COALESCE(p_payload->>'source', '') <> v_source THEN
    RAISE EXCEPTION 'Invalid payload source';
  END IF;

  IF jsonb_typeof(p_payload->'teams') <> 'array'
    OR jsonb_typeof(p_payload->'groups') <> 'array'
    OR jsonb_typeof(p_payload->'fields') <> 'array'
    OR jsonb_typeof(p_payload->'matches') <> 'array'
  THEN
    RAISE EXCEPTION 'Payload sections must be arrays';
  END IF;

  SELECT match_duration_minutes
  INTO v_match_duration
  FROM public.tournaments
  WHERE id = p_tournament_id;

  -- Validate teams
  FOR v_team IN
    SELECT value AS item
    FROM jsonb_array_elements(p_payload->'teams')
  LOOP
    IF COALESCE(btrim(v_team.item->>'externalId'), '') = '' THEN
      RAISE EXCEPTION 'Team external ID must not be empty';
    END IF;

    IF v_team.item->>'applicationId' IS NOT NULL
      AND btrim(v_team.item->>'applicationId') <> ''
    THEN
      IF NOT EXISTS (
        SELECT 1
        FROM public.applications
        WHERE id = (v_team.item->>'applicationId')::uuid
          AND tournament_id = p_tournament_id
          AND status = 'accepted'::public.application_status
      ) THEN
        RAISE EXCEPTION 'Mapped application is not accepted for this tournament';
      END IF;
    END IF;
  END LOOP;

  SELECT COALESCE(array_agg(DISTINCT item->>'externalId'), ARRAY[]::text[])
  INTO v_payload_team_ids
  FROM jsonb_array_elements(p_payload->'teams') AS item;

  IF (
    SELECT COUNT(*)
    FROM jsonb_array_elements(p_payload->'teams') AS item
  ) <> COALESCE(array_length(v_payload_team_ids, 1), 0) THEN
    RAISE EXCEPTION 'Duplicate team external IDs in payload';
  END IF;

  -- Validate groups
  FOR v_group IN
    SELECT value AS item
    FROM jsonb_array_elements(p_payload->'groups')
  LOOP
    IF COALESCE(btrim(v_group.item->>'externalId'), '') = '' THEN
      RAISE EXCEPTION 'Group external ID must not be empty';
    END IF;

    IF jsonb_typeof(v_group.item->'teamExternalIds') <> 'array' THEN
      RAISE EXCEPTION 'Group teamExternalIds must be an array';
    END IF;

    FOR v_team IN
      SELECT value AS member_id
      FROM jsonb_array_elements(v_group.item->'teamExternalIds')
    LOOP
      IF COALESCE(btrim(v_team.member_id #>> '{}'), '') = '' THEN
        RAISE EXCEPTION 'Group member external ID must not be empty';
      END IF;

      IF NOT (
        (v_team.member_id #>> '{}') = ANY (v_payload_team_ids)
        OR EXISTS (
          SELECT 1
          FROM public.tournament_external_teams
          WHERE tournament_id = p_tournament_id
            AND external_source = v_source
            AND external_id = v_team.member_id #>> '{}'
        )
      ) THEN
        RAISE EXCEPTION 'Group references unknown team external ID';
      END IF;
    END LOOP;
  END LOOP;

  SELECT COALESCE(array_agg(DISTINCT item->>'externalId'), ARRAY[]::text[])
  INTO v_payload_group_ids
  FROM jsonb_array_elements(p_payload->'groups') AS item;

  IF (
    SELECT COUNT(*)
    FROM jsonb_array_elements(p_payload->'groups') AS item
  ) <> COALESCE(array_length(v_payload_group_ids, 1), 0) THEN
    RAISE EXCEPTION 'Duplicate group external IDs in payload';
  END IF;

  -- Validate fields
  FOR v_field IN
    SELECT value AS item
    FROM jsonb_array_elements(p_payload->'fields')
  LOOP
    IF COALESCE(btrim(v_field.item->>'externalId'), '') = '' THEN
      RAISE EXCEPTION 'Field external ID must not be empty';
    END IF;
  END LOOP;

  SELECT COALESCE(array_agg(DISTINCT item->>'externalId'), ARRAY[]::text[])
  INTO v_payload_field_ids
  FROM jsonb_array_elements(p_payload->'fields') AS item;

  IF (
    SELECT COUNT(*)
    FROM jsonb_array_elements(p_payload->'fields') AS item
  ) <> COALESCE(array_length(v_payload_field_ids, 1), 0) THEN
    RAISE EXCEPTION 'Duplicate field external IDs in payload';
  END IF;

  -- Validate matches
  FOR v_match IN
    SELECT value AS item
    FROM jsonb_array_elements(p_payload->'matches')
  LOOP
    IF COALESCE(btrim(v_match.item->>'externalId'), '') = '' THEN
      RAISE EXCEPTION 'Match external ID must not be empty';
    END IF;

    IF COALESCE(btrim(v_match.item->>'homeTeamExternalId'), '') = ''
      OR COALESCE(btrim(v_match.item->>'awayTeamExternalId'), '') = ''
    THEN
      RAISE EXCEPTION 'Match teams must not be empty';
    END IF;

    IF v_match.item->>'homeTeamExternalId' = v_match.item->>'awayTeamExternalId' THEN
      RAISE EXCEPTION 'Match teams must be different';
    END IF;

    IF NOT (
      v_match.item->>'homeTeamExternalId' = ANY (v_payload_team_ids)
      OR EXISTS (
        SELECT 1
        FROM public.tournament_external_teams
        WHERE tournament_id = p_tournament_id
          AND external_source = v_source
          AND external_id = v_match.item->>'homeTeamExternalId'
      )
    ) THEN
      RAISE EXCEPTION 'Match references unknown home team';
    END IF;

    IF NOT (
      v_match.item->>'awayTeamExternalId' = ANY (v_payload_team_ids)
      OR EXISTS (
        SELECT 1
        FROM public.tournament_external_teams
        WHERE tournament_id = p_tournament_id
          AND external_source = v_source
          AND external_id = v_match.item->>'awayTeamExternalId'
      )
    ) THEN
      RAISE EXCEPTION 'Match references unknown away team';
    END IF;

    IF v_match.item->>'groupExternalId' IS NOT NULL
      AND btrim(v_match.item->>'groupExternalId') <> ''
      AND NOT (
        v_match.item->>'groupExternalId' = ANY (v_payload_group_ids)
        OR EXISTS (
          SELECT 1
          FROM public.tournament_groups
          WHERE tournament_id = p_tournament_id
            AND external_source = v_source
            AND external_id = v_match.item->>'groupExternalId'
        )
      )
    THEN
      RAISE EXCEPTION 'Match references unknown group';
    END IF;

    IF v_match.item->>'fieldExternalId' IS NOT NULL
      AND btrim(v_match.item->>'fieldExternalId') <> ''
      AND NOT (
        v_match.item->>'fieldExternalId' = ANY (v_payload_field_ids)
        OR EXISTS (
          SELECT 1
          FROM public.tournament_fields
          WHERE tournament_id = p_tournament_id
            AND external_source = v_source
            AND external_id = v_match.item->>'fieldExternalId'
        )
      )
    THEN
      RAISE EXCEPTION 'Match references unknown field';
    END IF;
  END LOOP;

  SELECT COALESCE(array_agg(DISTINCT item->>'externalId'), ARRAY[]::text[])
  INTO v_payload_match_ids
  FROM jsonb_array_elements(p_payload->'matches') AS item;

  IF (
    SELECT COUNT(*)
    FROM jsonb_array_elements(p_payload->'matches') AS item
  ) <> COALESCE(array_length(v_payload_match_ids, 1), 0) THEN
    RAISE EXCEPTION 'Duplicate match external IDs in payload';
  END IF;

  -- Upsert external teams
  FOR v_team IN
    SELECT value AS item
    FROM jsonb_array_elements(p_payload->'teams')
  LOOP
    SELECT *
    INTO v_existing_team
    FROM public.tournament_external_teams
    WHERE tournament_id = p_tournament_id
      AND external_source = v_source
      AND external_id = v_team.item->>'externalId';

    v_home_application_id := NULL;
    IF v_team.item->>'applicationId' IS NOT NULL
      AND btrim(v_team.item->>'applicationId') <> ''
    THEN
      v_home_application_id := (v_team.item->>'applicationId')::uuid;
    END IF;

    IF v_existing_team.id IS NULL THEN
      INSERT INTO public.tournament_external_teams (
        tournament_id,
        external_source,
        external_id,
        name,
        application_id,
        external_active,
        external_updated_at,
        last_synced_at
      ) VALUES (
        p_tournament_id,
        v_source,
        v_team.item->>'externalId',
        v_team.item->>'name',
        v_home_application_id,
        true,
        v_now,
        v_now
      );
      v_teams_inserted := v_teams_inserted + 1;
    ELSE
      UPDATE public.tournament_external_teams
      SET
        name = v_team.item->>'name',
        application_id = CASE
          WHEN v_home_application_id IS NOT NULL THEN v_home_application_id
          ELSE application_id
        END,
        external_active = true,
        external_updated_at = v_now,
        last_synced_at = v_now,
        updated_at = v_now
      WHERE id = v_existing_team.id;
      v_teams_updated := v_teams_updated + 1;
    END IF;
  END LOOP;

  UPDATE public.tournament_external_teams
  SET
    external_active = false,
    updated_at = v_now
  WHERE tournament_id = p_tournament_id
    AND external_source = v_source
    AND external_id IS NOT NULL
    AND NOT (external_id = ANY (v_payload_team_ids))
    AND external_active = true;

  GET DIAGNOSTICS v_deactivated_teams = ROW_COUNT;

  -- Upsert groups
  FOR v_group IN
    SELECT value AS item
    FROM jsonb_array_elements(p_payload->'groups')
  LOOP
    SELECT *
    INTO v_existing_group
    FROM public.tournament_groups
    WHERE tournament_id = p_tournament_id
      AND external_source = v_source
      AND external_id = v_group.item->>'externalId';

    IF v_existing_group.id IS NULL THEN
      SELECT *
      INTO v_existing_group
      FROM public.tournament_groups
      WHERE tournament_id = p_tournament_id
        AND lower(btrim(name)) = lower(btrim(COALESCE(v_group.item->>'name', '')))
        AND (
          external_id IS NULL
          OR external_source IS NULL
          OR external_source IS DISTINCT FROM v_source
        )
      ORDER BY created_at ASC
      LIMIT 1;
    END IF;

    IF v_existing_group.id IS NULL THEN
      INSERT INTO public.tournament_groups (
        tournament_id,
        name,
        sort_order,
        external_source,
        external_id,
        external_active,
        last_synced_at,
        manual_override
      ) VALUES (
        p_tournament_id,
        v_group.item->>'name',
        COALESCE((v_group.item->>'sortOrder')::integer, 0),
        v_source,
        v_group.item->>'externalId',
        true,
        v_now,
        false
      )
      RETURNING id INTO v_group_uuid;
      v_groups_inserted := v_groups_inserted + 1;
    ELSE
      v_group_uuid := v_existing_group.id;

      IF v_existing_group.manual_override = true AND NOT p_overwrite_manual THEN
        UPDATE public.tournament_groups
        SET
          external_source = v_source,
          external_id = v_group.item->>'externalId',
          external_active = true,
          last_synced_at = v_now,
          updated_at = v_now
        WHERE id = v_existing_group.id;
        v_protected_overrides := v_protected_overrides + 1;
      ELSE
        UPDATE public.tournament_groups
        SET
          name = v_group.item->>'name',
          sort_order = COALESCE((v_group.item->>'sortOrder')::integer, 0),
          external_source = v_source,
          external_id = v_group.item->>'externalId',
          external_active = true,
          last_synced_at = v_now,
          manual_override = false,
          updated_at = v_now
        WHERE id = v_existing_group.id;
        v_groups_updated := v_groups_updated + 1;
      END IF;
    END IF;

    DELETE FROM public.tournament_group_members
    WHERE group_id = v_group_uuid
      AND (
        external_team_id IN (
          SELECT id
          FROM public.tournament_external_teams
          WHERE tournament_id = p_tournament_id
            AND external_source = v_source
        )
        OR application_id IN (
          SELECT application_id
          FROM public.tournament_external_teams
          WHERE tournament_id = p_tournament_id
            AND external_source = v_source
            AND application_id IS NOT NULL
        )
      );

    FOR v_team IN
      SELECT value AS member_id
      FROM jsonb_array_elements(v_group.item->'teamExternalIds')
    LOOP
      SELECT id, application_id
      INTO v_existing_team
      FROM public.tournament_external_teams
      WHERE tournament_id = p_tournament_id
        AND external_source = v_source
        AND external_id = v_team.member_id #>> '{}';

      IF v_existing_team.application_id IS NOT NULL THEN
        INSERT INTO public.tournament_group_members (
          group_id,
          application_id,
          external_team_id
        ) VALUES (
          v_group_uuid,
          v_existing_team.application_id,
          NULL
        );
      ELSIF v_existing_team.id IS NOT NULL THEN
        INSERT INTO public.tournament_group_members (
          group_id,
          application_id,
          external_team_id
        ) VALUES (
          v_group_uuid,
          NULL,
          v_existing_team.id
        );
      END IF;
    END LOOP;
  END LOOP;

  UPDATE public.tournament_groups
  SET
    external_active = false,
    updated_at = v_now
  WHERE tournament_id = p_tournament_id
    AND external_source = v_source
    AND external_id IS NOT NULL
    AND NOT (external_id = ANY (v_payload_group_ids))
    AND external_active = true;

  GET DIAGNOSTICS v_deactivated_groups = ROW_COUNT;

  -- Upsert fields
  FOR v_field IN
    SELECT value AS item
    FROM jsonb_array_elements(p_payload->'fields')
  LOOP
    SELECT *
    INTO v_existing_field
    FROM public.tournament_fields
    WHERE tournament_id = p_tournament_id
      AND external_source = v_source
      AND external_id = v_field.item->>'externalId';

    IF v_existing_field.id IS NULL THEN
      SELECT *
      INTO v_existing_field
      FROM public.tournament_fields
      WHERE tournament_id = p_tournament_id
        AND lower(btrim(name)) = lower(btrim(COALESCE(v_field.item->>'name', '')))
        AND (
          external_id IS NULL
          OR external_source IS NULL
          OR external_source IS DISTINCT FROM v_source
        )
      ORDER BY created_at ASC
      LIMIT 1;
    END IF;

    IF v_existing_field.id IS NULL THEN
      INSERT INTO public.tournament_fields (
        tournament_id,
        name,
        sort_order,
        external_source,
        external_id,
        external_active,
        last_synced_at,
        manual_override
      ) VALUES (
        p_tournament_id,
        v_field.item->>'name',
        COALESCE((v_field.item->>'sortOrder')::integer, 0),
        v_source,
        v_field.item->>'externalId',
        true,
        v_now,
        false
      );
      v_fields_inserted := v_fields_inserted + 1;
    ELSIF v_existing_field.manual_override = true AND NOT p_overwrite_manual THEN
      UPDATE public.tournament_fields
      SET
        external_source = v_source,
        external_id = v_field.item->>'externalId',
        external_active = true,
        last_synced_at = v_now
      WHERE id = v_existing_field.id;
      v_protected_overrides := v_protected_overrides + 1;
    ELSE
      UPDATE public.tournament_fields
      SET
        name = v_field.item->>'name',
        sort_order = COALESCE((v_field.item->>'sortOrder')::integer, 0),
        external_source = v_source,
        external_id = v_field.item->>'externalId',
        external_active = true,
        last_synced_at = v_now,
        manual_override = false
      WHERE id = v_existing_field.id;
      v_fields_updated := v_fields_updated + 1;
    END IF;
  END LOOP;

  UPDATE public.tournament_fields
  SET external_active = false
  WHERE tournament_id = p_tournament_id
    AND external_source = v_source
    AND external_id IS NOT NULL
    AND NOT (external_id = ANY (v_payload_field_ids))
    AND external_active = true;

  GET DIAGNOSTICS v_deactivated_fields = ROW_COUNT;

  -- Upsert matches
  FOR v_match IN
    SELECT value AS item
    FROM jsonb_array_elements(p_payload->'matches')
  LOOP
    SELECT *
    INTO v_existing_match
    FROM public.tournament_matches
    WHERE tournament_id = p_tournament_id
      AND external_source = v_source
      AND external_id = v_match.item->>'externalId';

    IF v_existing_match.id IS NOT NULL
      AND v_existing_match.manual_override = true
      AND NOT p_overwrite_manual
    THEN
      v_protected_overrides := v_protected_overrides + 1;
      CONTINUE;
    END IF;

    SELECT id, application_id
    INTO v_existing_team
    FROM public.tournament_external_teams
    WHERE tournament_id = p_tournament_id
      AND external_source = v_source
      AND external_id = v_match.item->>'homeTeamExternalId';

    v_home_application_id := v_existing_team.application_id;
    v_home_external_team_id := CASE
      WHEN v_home_application_id IS NOT NULL THEN NULL
      ELSE v_existing_team.id
    END;

    SELECT id, application_id
    INTO v_existing_team
    FROM public.tournament_external_teams
    WHERE tournament_id = p_tournament_id
      AND external_source = v_source
      AND external_id = v_match.item->>'awayTeamExternalId';

    v_away_application_id := v_existing_team.application_id;
    v_away_external_team_id := CASE
      WHEN v_away_application_id IS NOT NULL THEN NULL
      ELSE v_existing_team.id
    END;

    IF v_home_application_id IS NULL AND v_home_external_team_id IS NULL THEN
      RAISE EXCEPTION 'Match home team could not be resolved';
    END IF;

    IF v_away_application_id IS NULL AND v_away_external_team_id IS NULL THEN
      RAISE EXCEPTION 'Match away team could not be resolved';
    END IF;

    v_group_uuid := NULL;
    IF v_match.item->>'groupExternalId' IS NOT NULL
      AND btrim(v_match.item->>'groupExternalId') <> ''
    THEN
      SELECT id
      INTO v_group_uuid
      FROM public.tournament_groups
      WHERE tournament_id = p_tournament_id
        AND external_source = v_source
        AND external_id = v_match.item->>'groupExternalId';
    END IF;

    v_field_uuid := NULL;
    IF v_match.item->>'fieldExternalId' IS NOT NULL
      AND btrim(v_match.item->>'fieldExternalId') <> ''
    THEN
      SELECT id
      INTO v_field_uuid
      FROM public.tournament_fields
      WHERE tournament_id = p_tournament_id
        AND external_source = v_source
        AND external_id = v_match.item->>'fieldExternalId';
    END IF;

    IF v_existing_match.id IS NULL THEN
      INSERT INTO public.tournament_matches (
        tournament_id,
        group_id,
        field_id,
        home_application_id,
        away_application_id,
        home_external_team_id,
        away_external_team_id,
        scheduled_at,
        duration_minutes,
        home_score,
        away_score,
        status,
        phase,
        round,
        sort_order,
        decided_by,
        external_source,
        external_id,
        external_active,
        last_synced_at,
        manual_override
      ) VALUES (
        p_tournament_id,
        v_group_uuid,
        v_field_uuid,
        v_home_application_id,
        v_away_application_id,
        v_home_external_team_id,
        v_away_external_team_id,
        NULLIF(v_match.item->>'scheduledAt', '')::timestamptz,
        v_match_duration,
        NULLIF(v_match.item->>'homeScore', '')::integer,
        NULLIF(v_match.item->>'awayScore', '')::integer,
        COALESCE(v_match.item->>'status', 'scheduled'),
        COALESCE(v_match.item->>'phase', 'group'),
        NULLIF(v_match.item->>'round', ''),
        COALESCE((v_match.item->>'sortOrder')::integer, 0),
        COALESCE(v_match.item->>'decidedBy', 'regular'),
        v_source,
        v_match.item->>'externalId',
        true,
        v_now,
        false
      );
      v_matches_inserted := v_matches_inserted + 1;
    ELSE
      UPDATE public.tournament_matches
      SET
        group_id = v_group_uuid,
        field_id = v_field_uuid,
        home_application_id = v_home_application_id,
        away_application_id = v_away_application_id,
        home_external_team_id = v_home_external_team_id,
        away_external_team_id = v_away_external_team_id,
        scheduled_at = NULLIF(v_match.item->>'scheduledAt', '')::timestamptz,
        duration_minutes = v_match_duration,
        home_score = NULLIF(v_match.item->>'homeScore', '')::integer,
        away_score = NULLIF(v_match.item->>'awayScore', '')::integer,
        status = COALESCE(v_match.item->>'status', 'scheduled'),
        phase = COALESCE(v_match.item->>'phase', 'group'),
        round = NULLIF(v_match.item->>'round', ''),
        sort_order = COALESCE((v_match.item->>'sortOrder')::integer, 0),
        decided_by = COALESCE(v_match.item->>'decidedBy', 'regular'),
        external_active = true,
        last_synced_at = v_now,
        manual_override = false,
        updated_at = v_now
      WHERE id = v_existing_match.id;
      v_matches_updated := v_matches_updated + 1;
    END IF;
  END LOOP;

  UPDATE public.tournament_matches
  SET
    external_active = false,
    updated_at = v_now
  WHERE tournament_id = p_tournament_id
    AND external_source = v_source
    AND external_id IS NOT NULL
    AND NOT (external_id = ANY (v_payload_match_ids))
    AND external_active = true;

  GET DIAGNOSTICS v_deactivated_matches = ROW_COUNT;

  v_sync_meta := jsonb_build_object(
    'source', v_source,
    'externalTournamentId', p_payload->>'externalTournamentId',
    'teams', jsonb_array_length(p_payload->'teams'),
    'groups', jsonb_array_length(p_payload->'groups'),
    'fields', jsonb_array_length(p_payload->'fields'),
    'matches', jsonb_array_length(p_payload->'matches')
  );

  UPDATE public.tournaments
  SET
    mein_turnierplan_last_synced_at = v_now,
    mein_turnierplan_sync_meta = v_sync_meta
  WHERE id = p_tournament_id;

  RETURN jsonb_build_object(
    'success', true,
    'teamsInserted', v_teams_inserted,
    'teamsUpdated', v_teams_updated,
    'groupsInserted', v_groups_inserted,
    'groupsUpdated', v_groups_updated,
    'fieldsInserted', v_fields_inserted,
    'fieldsUpdated', v_fields_updated,
    'matchesInserted', v_matches_inserted,
    'matchesUpdated', v_matches_updated,
    'protectedOverrides', v_protected_overrides,
    'deactivatedTeams', v_deactivated_teams,
    'deactivatedGroups', v_deactivated_groups,
    'deactivatedFields', v_deactivated_fields,
    'deactivatedMatches', v_deactivated_matches
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.sync_mein_turnierplan_tournament(uuid,jsonb,boolean) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sync_mein_turnierplan_tournament(uuid,jsonb,boolean) TO authenticated;

-- RLS does not protect TRUNCATE. Client roles do not use schema-maintenance
-- privileges anywhere in the application, so remove the unsafe inherited drift
-- from existing and future public tables. service_role defaults remain unchanged.
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
  ON ALL TABLES IN SCHEMA public
  FROM anon, authenticated;

-- ALTER DEFAULT PRIVILEGES can only target a role the executor is a member of.
-- On production this file is registered as already applied and never executed,
-- so the operative default-ACL state there is unaffected. On fresh local
-- databases the executing role may not be a member of postgres/supabase_admin
-- (e.g. the Supabase local stack), so each statement is best-effort and a lack
-- of privilege is skipped rather than failing the migration. The direct
-- REVOKE ... ON ALL TABLES above is the authoritative hardening and still runs.
DO $default_acl$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
    BEGIN
      EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public '
        || 'REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLES FROM anon, authenticated';
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'Skipping ALTER DEFAULT PRIVILEGES FOR ROLE postgres: insufficient privilege for current_user %', current_user;
    END;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin') THEN
    BEGIN
      EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public '
        || 'REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLES FROM anon, authenticated';
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'Skipping ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin: insufficient privilege for current_user %', current_user;
    END;
  END IF;
END
$default_acl$;
