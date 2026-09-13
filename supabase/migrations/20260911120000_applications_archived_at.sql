-- Additive soft-archive flag for admin organization only.
-- Does NOT change application status, capacity, payments, cancellations, or participation.
-- Existing rows keep archived_at = NULL (active).

ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS archived_at timestamptz NULL;

COMMENT ON COLUMN public.applications.archived_at IS
  'Admin soft-archive timestamp. Organizational hide only; does not affect status, capacity, or tournament participation.';

CREATE INDEX IF NOT EXISTS applications_archived_at_idx
  ON public.applications (archived_at);
