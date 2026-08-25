-- Participant logos for combined tournament roster.
-- Additive only. MeinTurnierplan raw JSON currently has no logo fields;
-- logo_url on external teams supports manual logos and future MTP logos.
-- Sync must not overwrite rows with logo_manual_override = true (enforced in app layer;
-- the sync RPC does not write logo_url today).

ALTER TABLE public.tournament_external_teams
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS club_id uuid REFERENCES public.clubs (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS logo_manual_override boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS tournament_external_teams_club_idx
  ON public.tournament_external_teams (club_id)
  WHERE club_id IS NOT NULL;

COMMENT ON COLUMN public.tournament_external_teams.logo_url IS
  'Optional team/club logo URL (manual custom logo or imported MeinTurnierplan logo).';
COMMENT ON COLUMN public.tournament_external_teams.club_id IS
  'Optional Hub club link; when set, the Hub club logo is preferred over logo_url.';
COMMENT ON COLUMN public.tournament_external_teams.logo_manual_override IS
  'When true, MeinTurnierplan sync must not overwrite logo_url.';

-- Public roster includes Hub club logos via SECURITY DEFINER (bypasses clubs RLS).
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
    clubs.logo_url
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

-- Resolve Hub club logos for external/manual teams on public pages (clubs RLS).
CREATE OR REPLACE FUNCTION public.club_logo_urls(p_club_ids uuid[])
RETURNS TABLE (
  id uuid,
  logo_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.logo_url
  FROM public.clubs c
  WHERE c.id = ANY (p_club_ids);
$$;

REVOKE ALL ON FUNCTION public.club_logo_urls(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.club_logo_urls(uuid[]) TO anon, authenticated;
