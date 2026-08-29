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
  buildExternalTeamLogoObjectPath,
  clubLogoObjectPathFromPublicUrl,
  formatSafeStorageError,
  getFormDataUploadFile,
  isAllowedClubLogoMimeType,
  isManagedClubLogoUrl,
  mimeTypeFromFileName,
  resolveClubLogoMimeType,
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

  // E: no hub => custom logo_url displayed
  assert(
    resolveParticipantLogoUrl({
      hubClubLogoUrl: null,
      storedLogoUrl: "https://cdn.example/external-only.png",
    }) === "https://cdn.example/external-only.png",
    "E: own logo without hub",
  );

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

  // Remove / unlink
  const cleared = buildClearCustomLogoState("club-1");
  assert(cleared.clubId === "club-1", "J: remove keeps club_id");
  assert(cleared.logoUrl === null, "J: remove clears logo_url");
  assert(cleared.logoManualOverride === true, "J: remove sets override");

  const unlinked = buildUnlinkHubClubState("https://cdn.example/kept.png");
  assert(unlinked.clubId === null, "unlink clears club_id");
  assert(unlinked.logoUrl === "https://cdn.example/kept.png", "unlink keeps logo_url");

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

  // Storage helpers / security (D/E size, SVG block, path shape)
  assert(isAllowedClubLogoMimeType("image/png"), "png allowed");
  assert(isAllowedClubLogoMimeType("image/jpeg"), "jpeg allowed");
  assert(isAllowedClubLogoMimeType("image/webp"), "webp allowed");
  assert(!isAllowedClubLogoMimeType("image/gif"), "gif rejected");
  assert(!isAllowedClubLogoMimeType("image/svg+xml"), "D: svg rejected");
  assert(!isAllowedClubLogoMimeType("application/pdf"), "pdf rejected");
  assert(resolveClubLogoMimeType({ type: "image/png", name: "x.png" }) === "image/png", "B: png mime");
  assert(resolveClubLogoMimeType({ type: "image/jpeg", name: "x.jpg" }) === "image/jpeg", "B: jpg mime");
  assert(resolveClubLogoMimeType({ type: "image/webp", name: "x.webp" }) === "image/webp", "C: webp mime");
  assert(resolveClubLogoMimeType({ type: "", name: "badge.PNG" }) === "image/png", "empty mime falls back");
  assert(resolveClubLogoMimeType({ type: "image/svg+xml", name: "x.svg" }) === null, "D: svg blocked");
  assert(mimeTypeFromFileName("logo.jpeg") === "image/jpeg", "jpeg extension");
  assert(
    validateClubLogoFile({ name: "x.png", size: 10, type: "image/png" }) === null,
    "valid file accepted",
  );
  assert(
    validateClubLogoFile({ name: "x.gif", size: 10, type: "image/gif" }) !== null,
    "gif file rejected",
  );
  assert(
    validateClubLogoFile({ name: "x.png", size: 3 * 1024 * 1024, type: "image/png" }) !== null,
    "E: oversize rejected",
  );

  const objectPath = buildExternalTeamLogoObjectPath({
    tournamentId: "tour-1",
    externalTeamId: "team-2",
    mimeType: "image/webp",
  });
  assert(objectPath.startsWith("tournaments/tour-1/teams/team-2/"), "path prefix safe");
  assert(objectPath.endsWith(".webp"), "path extension");
  assert(!objectPath.includes(" "), "path has no spaces");
  assert(!objectPath.toLowerCase().includes("fellbach"), "path has no team name");

  const publicUrl = `https://xyz.supabase.co/storage/v1/object/public/${CLUB_LOGOS_BUCKET}/${objectPath}`;
  assert(isManagedClubLogoUrl(publicUrl), "managed url detected");
  assert(clubLogoObjectPathFromPublicUrl(publicUrl) === objectPath, "object path extracted");

  assert(
    formatSafeStorageError({ statusCode: 403, message: "new row violates row-level security policy" }).includes(
      "403",
    ),
    "safe storage error includes code",
  );

  // FormData file extraction without relying on instanceof File alone
  const form = new FormData();
  const blobFile = new File([new Uint8Array([1, 2, 3])], "sv-fellbach.png", { type: "image/png" });
  form.set("logoFile", blobFile);
  const extracted = getFormDataUploadFile(form, "logoFile");
  assert(extracted.meta.received === true, "form file received");
  assert(extracted.meta.filename === "sv-fellbach.png", "form filename");
  assert(extracted.meta.mime === "image/png", "form mime");
  assert(extracted.meta.size === 3, "form size");
  assert(extracted.file != null, "form file object");

  const emptyForm = new FormData();
  const missing = getFormDataUploadFile(emptyForm, "logoFile");
  assert(missing.meta.received === false, "missing file not received");
  assert(missing.file == null, "missing file null");

  const storageMigration = readFileSync(
    join(process.cwd(), "supabase/migrations/20260825170000_club_logo_storage.sql"),
    "utf8",
  );
  assert(storageMigration.includes("club-logos"), "storage migration creates club-logos bucket");
  assert(storageMigration.includes("public.is_admin()"), "storage write requires admin");
  assert(!storageMigration.includes("WITH CHECK (true)"), "no open write policy in original");

  const fixMigration = readFileSync(
    join(process.cwd(), "supabase/migrations/20260825180000_fix_club_logo_storage_policies.sql"),
    "utf8",
  );
  assert(fixMigration.includes("club-logos"), "fix migration targets club-logos");
  assert(fixMigration.includes("public.is_admin()"), "fix migration keeps admin write");
  assert(fixMigration.includes("image/webp"), "fix migration allows webp");
  assert(!fixMigration.includes("image/gif"), "fix migration drops gif");
  assert(!fixMigration.includes("WITH CHECK (true)"), "no open write policy in fix");
  assert(fixMigration.includes("TO anon, authenticated"), "public read retained");

  const previousLogoMigration = readFileSync(
    join(process.cwd(), "supabase/migrations/20260825160000_participant_logos.sql"),
    "utf8",
  );
  assert(
    previousLogoMigration.includes("logo_manual_override"),
    "previous logo migration left untouched",
  );

  const nextConfig = readFileSync(join(process.cwd(), "next.config.ts"), "utf8");
  assert(nextConfig.includes("bodySizeLimit"), "server action body size raised for uploads");
  assert(nextConfig.includes("3mb"), "body size allows 2MB file + multipart overhead");
  assert(nextConfig.includes("serverActions"), "serverActions config present");

  const actionsSource = readFileSync(
    join(process.cwd(), "src/lib/db/tournament-participants-actions.ts"),
    "utf8",
  );
  assert(actionsSource.includes("requireTeamsManage()"), "upload path requires admin");
  assert(actionsSource.includes("getFormDataUploadFile"), "form data file helper used");
  assert(actionsSource.includes("auth.getUser()"), "upload verifies auth session for storage");
  assert(actionsSource.includes('mode: "upload"'), "upload mode present");
  assert(!actionsSource.includes("SERVICE_ROLE"), "no service role in browser/server upload path");

  const editorSource = readFileSync(
    join(process.cwd(), "src/components/admin/ExternalTeamLogoEditor.tsx"),
    "utf8",
  );
  assert(editorSource.includes('name="logoFile"'), "file input name matches action");
  assert(editorSource.includes('name="tournamentId"'), "tournamentId in form");
  assert(editorSource.includes('name="externalTeamId"'), "externalTeamId in form");
  assert(editorSource.includes("uploadExternalTeamLogoFormAction"), "form uses upload action");
  assert(editorSource.includes("localError"), "errors shown inside logo panel");

  assert(resolveParticipantLogoUrl({ hubClubLogoUrl: null, storedLogoUrl: null }) === null, "placeholder");

  return "ok";
}

export function runClubLogoStorageUploadChecks() {
  return runTournamentParticipantLogoManagementChecks();
}
