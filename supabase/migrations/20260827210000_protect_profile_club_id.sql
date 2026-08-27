-- Prevent club users from self-assigning profiles.club_id to arbitrary clubs.
-- Normal users may only link their profile once to a club they created (onboarding).
-- Admins retain full control; ensure_own_club continues via created_by check.

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

  IF NOT public.is_admin() THEN
    NEW.email := OLD.email;

    IF NEW.club_id IS DISTINCT FROM OLD.club_id THEN
      IF OLD.club_id IS NULL
         AND NEW.club_id IS NOT NULL
         AND EXISTS (
           SELECT 1
           FROM public.clubs AS clubs
           WHERE clubs.id = NEW.club_id
             AND clubs.created_by = auth.uid()
         )
      THEN
        -- First-time onboarding: link only to a club this user created.
        NULL;
      ELSE
        NEW.club_id := OLD.club_id;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
