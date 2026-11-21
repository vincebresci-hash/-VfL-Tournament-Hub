-- Disposable-database test script for save_competition_configuration.
--
-- This file is not a migration and must not be applied to production.
-- It refuses to run unless the session explicitly opts into a disposable test:
--   SET app.disposable_competition_test = 'on';
-- The statements below are the concurrency and authorization cases. They require
-- the full application schema plus both competition migrations, loaded into an
-- empty local database. Stage 3B.3C.2 does not execute this file.

DO $$
BEGIN
  IF current_setting('app.disposable_competition_test', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION
      'Refusing to run save_competition_configuration tests without app.disposable_competition_test=on on a disposable database.';
  END IF;
END
$$;

-- Cases, each in its own transaction pair against the disposable database:
-- 1. Authorization: anon and a user lacking either tournaments.manage or schedule.manage receive forbidden and no row changes.
-- 2. Missing permissions: schedule.manage without tournaments.manage receives forbidden before any application row is required.
-- 3. Archived tournaments: archived_at returns ARCHIVED and does not change competition columns.
-- 4. Invalid configuration: unknown format, cutoff 6, and round-robin with a cutoff return validation_error.
-- 5. Legacy compatibility: null format and zero groups can be stored as round-robin; null format with a group cannot become round-robin (UNSAFE_LEGACY_CONVERSION).
-- 6. Champions League database kill switch: a valid champions-league request returns not_activated and the three columns stay unchanged.
-- 7. Accepted applications: two accepted applications are one identity each.
-- 8. Confirmed external teams: confirmed and external_active are included; detected or inactive teams are not.
-- 9. Linked non-accepted applications: a confirmed external team whose application is not accepted counts as that external id only.
-- 10. Duplicate identities: the same id from an application and an external team returns DUPLICATE_PARTICIPANT.
-- 11. Existing matches and results: any match, a live match, a 0:0 result, or a knockout match returns config_locked.
-- 12. No-op and stale versions: the same columns and token return unchanged; a different token returns stale_configuration.
-- 13. Concurrent configuration saves: session B blocks on the tournament FOR UPDATE held by session A, then returns stale_configuration.
-- 14. Concurrent application decisions: an acceptance blocks on the application BEFORE trigger until the save commits, or is visible to the save if it committed first.
-- 15. Concurrent external-team updates: confirming or deactivating a team takes the same tournament lock.
-- 16. Concurrent group and membership edits: group insert and member insert take the tournament lock and do not change competition columns.
-- 17. Concurrent match inserts: a match insert blocks behind the save lock; the save sees the match or the insert waits.
-- 18. Concurrent result updates: recording a score takes the match trigger lock and cannot land inside the save decision.
-- 19. Deadlock behavior: parent-then-child order. A second session waiting on the tournament lock must not already hold a child row lock required by the save. The save never locks child rows.
-- 20. No unintended group or match mutation: after every case, group and match counts are unchanged by the configuration function.
