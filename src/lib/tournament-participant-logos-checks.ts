import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildApplyLogoUrlOnlyState,
  buildClearCustomLogoState,
  buildManualLogoState,
  buildUnlinkHubClubState,
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
  // A/B/C: MTP/manual logo without club_id
  const mtpUpload = buildManualLogoState({
    clubId: null,
    logoUrl: "https://cdn.example/sv-fellbach-upload.png",
  });
  assert(mtpUpload.clubId === null, "A: upload without club_id");
  assert(mtpUpload.logoUrl === "https://cdn.example/sv-fellbach-upload.png", "A: logo_url set");
  assert(mtpUpload.logoManualOverride === true, "A: override true");

  const mtpUrl = buildManualLogoState({
    clubId: null,
    logoUrl: "https://cdn.example/sv-fellbach-url.png",
  });
  assert(mtpUrl.clubId === null, "B: url without club_id");
  assert(mtpUrl.logoManualOverride === true, "B: override true");

  const manualNoClub = mergeTournamentParticipants({
    applications: [],
    externalTeams: [
      {
        id: "manual-1",
        externalSource: "manual",
        name: "SV Fellbach · U10",
        clubName: "SV Fellbach",
        teamName: "U10",
        applicationId: null,
        participationStatus: "confirmed",
        externalActive: true,
        ageGroup: "U10",
        birthYear: null,
        clubId: null,
        logoUrl: "https://cdn.example/fellbach.png",
        hubClubLogoUrl: null,
      },
    ],
  });
  assert(manualNoClub[0]?.logoUrl === "https://cdn.example/fellbach.png", "C: manual without hub shows logo");
  assert(manualNoClub[0]?.clubId === null, "C: club_id stays null");

  // D: Hub logo priority
  assert(
    resolveParticipantLogoUrl({
      hubClubLogoUrl: "https://cdn.example/hub.png",
      storedLogoUrl: "https://cdn.example/manual.png",
    }) === "https://cdn.example/hub.png",
    "D: hub preferred",
  );
  const mergedHub = mergeTournamentParticipants({
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
  assert(mergedHub[0]?.logoUrl === "https://cdn.example/hub.png", "D: merged hub priority");
  assert(mergedHub[0]?.customLogoUrl === "https://cdn.example/custom.png", "D: custom kept");

  // E: no hub => custom logo_url displayed
  assert(
    resolveParticipantLogoUrl({
      hubClubLogoUrl: null,
      storedLogoUrl: "https://cdn.example/external-only.png",
    }) === "https://cdn.example/external-only.png",
    "E: own logo without hub",
  );

  // Remove custom logo keeps club link
  const cleared = buildClearCustomLogoState("club-1");
  assert(cleared.clubId === "club-1", "remove keeps club_id");
  assert(cleared.logoUrl === null, "remove clears logo_url");
  assert(cleared.logoManualOverride === true, "remove sets override");

  const unlinked = buildUnlinkHubClubState("https://cdn.example/kept.png");
  assert(unlinked.clubId === null, "unlink clears club_id");
  assert(unlinked.logoUrl === "https://cdn.example/kept.png", "unlink keeps logo_url");

  // F: sync skips override
  assert(shouldSkipMeinTurnierplanLogoSync(true) === true, "F: sync skips override");
  assert(shouldSkipMeinTurnierplanLogoSync(false) === false, "F: sync allows without override");

  // G: apply logo_url to selected teams without club_id
  const applyOk = buildApplyLogoUrlOnlyState("https://cdn.example/shared.png");
  assert(!applyOk.error && applyOk.logoUrl === "https://cdn.example/shared.png", "G: apply url ok");
  const applyEmpty = buildApplyLogoUrlOnlyState(null);
  assert(applyEmpty.error, "G: apply requires source logo_url");

  const selectionOk = selectTeamsForLogoApply({
    sourceTeamId: "t1",
    selectedTeamIds: ["t2", "t3"],
    availableTeamIds: ["t1", "t2", "t3"],
  });
  assert(!selectionOk.error, "G: selection without club_id ok");
  assert(selectionOk.targetIds.sort().join(",") === "t1,t2,t3", "G: targets include selection");

  const selectionEmpty = selectTeamsForLogoApply({
    sourceTeamId: "t1",
    selectedTeamIds: [],
    availableTeamIds: ["t1", "t2"],
  });
  assert(selectionEmpty.error, "apply requires selected teams");

  // Suggestions still exact-only
  const suggestedByClubId = suggestRelatedTeamsForLogoApply({
    sourceTeamId: "t1",
    sourceClubId: "club-1",
    sourceClubName: "VfL Kirchheim",
    candidates: [
      { id: "t1", displayName: "VfL Kirchheim", clubName: "VfL Kirchheim", clubId: "club-1" },
      { id: "t2", displayName: "VfL Kirchheim II", clubName: "VfL Kirchheim II", clubId: null },
      { id: "t3", displayName: "VfL Kirchheim III", clubName: "VfL Kirchheim III", clubId: "club-1" },
    ],
  });
  assert(
    suggestedByClubId.map((entry) => entry.id).join(",") === "t3",
    "no unsafe prefix suggestion for II/III",
  );

  // Storage helpers / security
  assert(isAllowedClubLogoMimeType("image/png"), "png allowed");
  assert(isAllowedClubLogoMimeType("image/jpeg"), "jpeg allowed");
  assert(isAllowedClubLogoMimeType("image/webp"), "webp allowed");
  assert(!isAllowedClubLogoMimeType("image/gif"), "gif rejected");
  assert(!isAllowedClubLogoMimeType("image/svg+xml"), "svg rejected");
  assert(!isAllowedClubLogoMimeType("application/pdf"), "pdf rejected");
  assert(
    validateClubLogoFile({ name: "x.png", size: 10, type: "image/png" } as File) === null,
    "valid file accepted",
  );
  assert(
    validateClubLogoFile({ name: "x.gif", size: 10, type: "image/gif" } as File) !== null,
    "gif file rejected",
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
    "previous logo migration left untouched",
  );

  assert(resolveParticipantLogoUrl({ hubClubLogoUrl: null, storedLogoUrl: null }) === null, "placeholder");

  return "ok";
}
