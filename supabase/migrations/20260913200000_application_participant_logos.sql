-- =============================================================================
-- Application participant logos (PR-B)
-- Additive only. Does not change status, capacity, payments, cancellations,
-- archive/delete guard, or participant source/dedup logic.
-- =============================================================================

ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS logo_manual_override boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.applications.logo_url IS
  'Optional tournament-specific logo for this application participant. Used when logo_manual_override is true.';
COMMENT ON COLUMN public.applications.logo_manual_override IS
  'When true, applications.logo_url is preferred over clubs.logo_url for this participant.';

-- Public roster: prefer application override logo, else Hub club logo.
-- Signature unchanged from 20260825160000_participant_logos.sql.
CREATE OR REPLACE FUNCTION public.tournament_public_roster(p_slug text)
RETURNS TABLE (
  application_id uuid,
  club_name text,
  team_name text,
  age_group text,
  birth_year integer,
  group_id uuid,
  group_name text,
  group_sort_order integer,
  club_id uuid,
  logo_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    applications.id,
    applications.club_name,
    applications.team_name,
    applications.age_group,
    applications.birth_year,
    tournament_groups.id,
    tournament_groups.name,
    tournament_groups.sort_order,
    applications.club_id,
    CASE
      WHEN applications.logo_manual_override
        AND applications.logo_url IS NOT NULL
        AND btrim(applications.logo_url) <> ''
        THEN applications.logo_url
      ELSE clubs.logo_url
    END
  FROM public.tournaments
  JOIN public.applications
    ON applications.tournament_id = tournaments.id
  LEFT JOIN public.clubs
    ON clubs.id = applications.club_id
  LEFT JOIN public.tournament_group_members
    ON tournament_group_members.application_id = applications.id
  LEFT JOIN public.tournament_groups
    ON tournament_groups.id = tournament_group_members.group_id
    AND tournament_groups.tournament_id = tournaments.id
  WHERE tournaments.slug = p_slug
    AND tournaments.archived_at IS NULL
    AND applications.status = 'accepted'::public.application_status;
$$;

REVOKE ALL ON FUNCTION public.tournament_public_roster(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tournament_public_roster(text) TO anon, authenticated;
