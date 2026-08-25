import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildManualLogoState,
  selectTeamsForLogoApply,
  shouldSkipMeinTurnierplanLogoSync,
  suggestRelatedTeamsForLogoApply,
} from "@/lib/tournament-participant-logos";
import {
  mergeTournamentParticipants,
  resolveParticipantLogoUrl,
} from "@/lib/tournament-participants";
import {
  CLUB_LOGOS_BUCKET,
  clubLogoObjectPathFromPublicUrl,
  isAllowedClubLogoMimeType,
  isManagedClubLogoUrl,
  validateClubLogoFile,
} from "@/lib/storage/club-logos";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

export function runTournamentParticipantLogoManagementChecks() {
  // Manual logo state
  const uploaded = buildManualLogoState({
    clubId: null,
    logoUrl: "https://cdn.example/manual-upload.png",
  });
  assert(uploaded.logoManualOverride === true, "manual upload sets override");
  assert(uploaded.logoUrl === "https://cdn.example/manual-upload.png", "manual upload stores url");

  const hubLinked = buildManualLogoState({
    clubId: "club-1",
    logoUrl: "https://cdn.example/kept.png",
  });
  assert(hubLinked.clubId === "club-1", "hub club id stored");
  assert(hubLinked.logoManualOverride === true, "hub link is manual override");

  const removed = buildManualLogoState({ clearLogo: true });
  assert(removed.clubId === null && removed.logoUrl === null, "remove clears club + logo");
  assert(removed.logoManualOverride === true, "remove keeps override true");

  // Display priority: hub > stored > null
  assert(
    resolveParticipantLogoUrl({
      hubClubLogoUrl: "https://cdn.example/hub.png",
      storedLogoUrl: "https://cdn.example/manual.png",
    }) === "https://cdn.example/hub.png",
    "display prefers hub club logo",
  );
  assert(
    resolveParticipantLogoUrl({
      hubClubLogoUrl: null,
      storedLogoUrl: "https://cdn.example/manual.png",
    }) === "https://cdn.example/manual.png",
    "display falls back to manual logo",
  );
  assert(
    resolveParticipantLogoUrl({ hubClubLogoUrl: null, storedLogoUrl: null }) === null,
    "display placeholder when no logo",
  );

  // Merge reflects hub priority for external teams
  const merged = mergeTournamentParticipants({
    applications: [],
    externalTeams: [
      {
        id: "ext-1",
        externalSource: "mein-turnierplan",
        name: "VfL Kirchheim",
        clubName: "VfL Kirchheim",
        teamName: "U10",
        applicationId: null,
        participationStatus: "confirmed",
        externalActive: true,
        ageGroup: null,
        birthYear: null,
        clubId: "club-1",
        logoUrl: "https://cdn.example/custom.png",
        hubClubLogoUrl: "https://cdn.example/hub.png",
      },
    ],
  });
  assert(merged[0]?.logoUrl === "https://cdn.example/hub.png", "merged display uses hub logo");
  assert(merged[0]?.customLogoUrl === "https://cdn.example/custom.png", "custom kept for edits");

  // Sync must skip override
  assert(shouldSkipMeinTurnierplanLogoSync(true) === true, "sync skips override true");
  assert(shouldSkipMeinTurnierplanLogoSync(false) === false, "sync allows override false");
  assert(shouldSkipMeinTurnierplanLogoSync(null) === false, "sync allows null override");

  // Related team suggestions: exact club_id / exact club name only (no prefix)
  const candidates = [
    {
      id: "t1",
      displayName: "VfL Kirchheim",
      clubName: "VfL Kirchheim",
      clubId: "club-1",
    },
    {
      id: "t2",
      displayName: "VfL Kirchheim II",
      clubName: "VfL Kirchheim II",
      clubId: null,
    },
    {
      id: "t3",
      displayName: "VfL Kirchheim III",
      clubName: "VfL Kirchheim III",
      clubId: "club-1",
    },
    {
      id: "t4",
      displayName: "TSV Altenburg",
      clubName: "TSV Altenburg",
      clubId: null,
    },
  ];

  const suggestedByClubId = suggestRelatedTeamsForLogoApply({
    sourceTeamId: "t1",
    sourceClubId: "club-1",
    sourceClubName: "VfL Kirchheim",
    candidates,
  });
  assert(
    suggestedByClubId.map((entry) => entry.id).join(",") === "t3",
    "suggest by club_id exact; no II/III prefix match",
  );

  const suggestedByName = suggestRelatedTeamsForLogoApply({
    sourceTeamId: "t4",
    sourceClubId: null,
    sourceClubName: "TSV Altenburg",
    candidates: [
      ...candidates,
      {
        id: "t5",
        displayName: "TSV Altenburg · U11",
        clubName: "TSV Altenburg",
        clubId: null,
      },
    ],
  });
  assert(
    suggestedByName.some((entry) => entry.id === "t5"),
    "exact club name match is suggested",
  );
  assert(
    !suggestedByName.some((entry) => entry.id === "t2"),
    "prefix-like VfL Kirchheim II is not auto-suggested from unrelated source",
  );

  // Admin must select teams explicitly for apply
  const selectionEmpty = selectTeamsForLogoApply({
    sourceTeamId: "t1",
    selectedTeamIds: [],
    availableTeamIds: ["t1", "t2", "t3"],
  });
  assert(selectionEmpty.error, "apply requires selected teams");

  const selectionOk = selectTeamsForLogoApply({
    sourceTeamId: "t1",
    selectedTeamIds: ["t2", "t3"],
    availableTeamIds: ["t1", "t2", "t3"],
  });
  assert(!selectionOk.error, "valid selection accepted");
  assert(
    selectionOk.targetIds.sort().join(",") === "t1,t2,t3",
    "apply includes source + selected teams",
  );

  const selectionForeign = selectTeamsForLogoApply({
    sourceTeamId: "t1",
    selectedTeamIds: ["foreign"],
    availableTeamIds: ["t1", "t2"],
  });
  assert(selectionForeign.error, "foreign team ids rejected");

  // Storage helpers
  assert(isAllowedClubLogoMimeType("image/png"), "png allowed");
  assert(!isAllowedClubLogoMimeType("application/pdf"), "pdf rejected");
  assert(
    validateClubLogoFile({
      name: "x.png",
      size: 10,
      type: "image/png",
    } as File) === null,
    "valid file accepted",
  );
  assert(
    validateClubLogoFile({
      name: "x.png",
      size: 0,
      type: "image/png",
    } as File) !== null,
    "empty file rejected",
  );

  const publicUrl = `https://xyz.supabase.co/storage/v1/object/public/${CLUB_LOGOS_BUCKET}/external-teams/t/e/a.png`;
  assert(isManagedClubLogoUrl(publicUrl), "managed url detected");
  assert(
    clubLogoObjectPathFromPublicUrl(publicUrl) === "external-teams/t/e/a.png",
    "object path extracted",
  );

  const storageMigration = readFileSync(
    join(process.cwd(), "supabase/migrations/20260825170000_club_logo_storage.sql"),
    "utf8",
  );
  assert(storageMigration.includes("club-logos"), "storage migration creates club-logos bucket");
  assert(storageMigration.includes("public.is_admin()"), "storage write requires admin");

  const previousLogoMigration = readFileSync(
    join(process.cwd(), "supabase/migrations/20260825160000_participant_logos.sql"),
    "utf8",
  );
  assert(
    previousLogoMigration.includes("logo_manual_override"),
    "previous logo migration left untouched and still defines override",
  );

  return "ok";
}
