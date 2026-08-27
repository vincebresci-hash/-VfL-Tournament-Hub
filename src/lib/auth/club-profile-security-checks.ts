import { readFileSync } from "node:fs";
import { join } from "node:path";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function readMigration() {
  return readFileSync(
    join(
      process.cwd(),
      "supabase/migrations/20260827210000_protect_profile_club_id.sql",
    ),
    "utf8",
  );
}

function readInitMigration() {
  return readFileSync(
    join(
      process.cwd(),
      "supabase/migrations/20260819170000_init_tournament_hub.sql",
    ),
    "utf8",
  );
}

/**
 * Static security checks for profiles.club_id self-assignment (Vereinsportal audit HIGH).
 */
export function runClubProfileSecurityChecks() {
  const migration = readMigration();
  const initMigration = readInitMigration();

  // A) NULL club_id cannot jump to arbitrary foreign club via client UPDATE
  assert(
    migration.includes("NEW.club_id IS DISTINCT FROM OLD.club_id"),
    "A: migration must compare old and new club_id",
  );
  assert(
    migration.includes("clubs.created_by = auth.uid()"),
    "A: only clubs created by the user may be linked on first assignment",
  );
  assert(
    !migration.includes("IF OLD.club_id IS NOT NULL THEN"),
    "A: must not only lock club_id when OLD.club_id was already set",
  );

  // B) ensure_own_club path still assigns club_id via profile UPDATE
  assert(
    initMigration.includes("UPDATE public.profiles"),
    "B: ensure_own_club updates profiles",
  );
  assert(
    initMigration.includes("SET club_id = v_club_id"),
    "B: ensure_own_club sets club_id from created club",
  );
  assert(
    initMigration.includes("INSERT INTO public.clubs"),
    "B: ensure_own_club creates clubs with created_by",
  );
  assert(
    initMigration.includes("created_by = v_user_id"),
    "B: created club rows belong to the onboarding user",
  );

  // C) Existing club_id cannot be switched to another club
  assert(
    migration.includes("OLD.club_id IS NULL"),
    "C: first-assignment exception requires OLD.club_id IS NULL",
  );

  // D) club_id cannot be cleared by normal users
  assert(
    migration.includes("NEW.club_id IS NOT NULL"),
    "D: clearing club_id is not an allowed first-assignment path",
  );

  // E) RLS still scopes teams/applications by current_club_id()
  assert(
    initMigration.includes("club_id = public.current_club_id()"),
    "E: teams/applications RLS uses current_club_id()",
  );

  // F) Admin bypass remains in protect_profile_columns
  assert(
    migration.includes("IF NOT public.is_admin()"),
    "F: non-admin branch must exist for club_id protection",
  );
  assert(
    initMigration.includes("WITH CHECK (id = auth.uid() OR public.is_admin())"),
    "F: profiles update policy still allows admin updates",
  );

  // G) Registration flow still calls ensure_own_club RPC
  const authActions = readFileSync(
    join(process.cwd(), "src/lib/auth/actions.ts"),
    "utf8",
  );
  assert(
    authActions.includes("ensure_own_club"),
    "G: auth actions still call ensure_own_club RPC",
  );

  assert(
    migration.includes("SET search_path = public"),
    "migration must pin search_path on SECURITY DEFINER trigger",
  );
  assert(
    migration.includes("SECURITY DEFINER"),
    "migration must keep protect_profile_columns as SECURITY DEFINER",
  );

  return "ok";
}
