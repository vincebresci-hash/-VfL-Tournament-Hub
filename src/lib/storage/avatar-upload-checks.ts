import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getFormDataUploadFile } from "@/lib/storage/club-logos";
import {
  AVATAR_MAX_BYTES,
  avatarObjectPathFromPublicUrl,
  buildAvatarObjectPath,
  isManagedAvatarUrl,
  validateAvatarFile,
} from "@/lib/storage/avatars";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function readAvatarsSource() {
  return readFileSync(join(process.cwd(), "src/lib/storage/avatars.ts"), "utf8");
}

function readUploadActionSource() {
  return readFileSync(join(process.cwd(), "src/lib/auth/actions.ts"), "utf8");
}

export function runAvatarUploadChecks() {
  const avatarsSource = readAvatarsSource();
  const actionsSource = readUploadActionSource();

  // Regression: never spread File into plain objects (drops name/type getters).
  assert(
    !avatarsSource.includes("validateClubLogoFile({ ...file"),
    "must not spread File into validateClubLogoFile",
  );
  assert(
    !avatarsSource.includes("{ ...file, size: Math.min"),
    "must not spread File when adjusting avatar size",
  );

  // VALID: real File instances (same shape as FormData / server action uploads)
  const png = new File([new Uint8Array(64)], "avatar.png", { type: "image/png" });
  const jpg = new File([new Uint8Array(64)], "avatar.jpg", { type: "image/jpeg" });
  const jpeg = new File([new Uint8Array(64)], "avatar.jpeg", { type: "image/jpeg" });
  const webp = new File([new Uint8Array(64)], "avatar.webp", { type: "image/webp" });

  assert(validateAvatarFile(png) === null, "PNG <1MB PASS");
  assert(validateAvatarFile(jpg) === null, "JPG <1MB PASS");
  assert(validateAvatarFile(jpeg) === null, "JPEG <1MB PASS");
  assert(validateAvatarFile(webp) === null, "WebP <1MB PASS");

  // Empty type + extension fallback (some runtimes clear File.type after FormData)
  assert(
    validateAvatarFile({ name: "photo.PNG", size: 100, type: "" }) === null,
    "empty mime + .png PASS",
  );
  assert(
    validateAvatarFile({ name: "photo.JPG", size: 100, type: "application/octet-stream" }) === null,
    "octet-stream + .jpg PASS",
  );

  // FormData → getFormDataUploadFile → validateAvatarFile (server-action path)
  const form = new FormData();
  form.set("avatar", new File([new Uint8Array(32)], "prod-test.png", { type: "image/png" }));
  const extracted = getFormDataUploadFile(form, "avatar");
  assert(extracted.file != null, "FormData file extracted");
  assert(validateAvatarFile(extracted.file!) === null, "FormData PNG validates");

  // INVALID
  const oversize = new File([new Uint8Array(AVATAR_MAX_BYTES + 1)], "big.png", {
    type: "image/png",
  });
  assert(validateAvatarFile(oversize) !== null, "PNG >1MB REJECT");
  assert(
    validateAvatarFile(oversize)?.includes("1 MB") === true,
    "oversize uses avatar 1MB message",
  );

  assert(
    validateAvatarFile({ name: "x.svg", size: 10, type: "image/svg+xml" }) !== null,
    "SVG REJECT",
  );
  assert(
    validateAvatarFile({ name: "x.pdf", size: 10, type: "application/pdf" }) !== null,
    "PDF REJECT",
  );
  assert(
    validateAvatarFile({ name: "x.txt", size: 10, type: "text/plain" }) !== null,
    "TXT REJECT",
  );
  assert(
    validateAvatarFile({ name: "x.gif", size: 10, type: "image/gif" }) !== null,
    "INVALID MIME REJECT",
  );
  assert(
    validateAvatarFile({ name: "x.exe", size: 10, type: "application/octet-stream" }) !== null,
    "executable extension REJECT",
  );

  // Path / ownership helpers
  const path = buildAvatarObjectPath("user-abc", "image/png");
  assert(path.startsWith("user-abc/"), "storage path under userId");
  assert(path.endsWith(".png"), "png extension");

  const publicUrl = `https://xyz.supabase.co/storage/v1/object/public/avatars/${path}`;
  assert(isManagedAvatarUrl(publicUrl), "managed avatar url");
  assert(avatarObjectPathFromPublicUrl(publicUrl) === path, "path from public url");

  // Security wiring in upload/remove actions (source contracts)
  assert(actionsSource.includes("uploadAvatarAction"), "upload action present");
  assert(actionsSource.includes("removeAvatarAction"), "remove action present");
  assert(actionsSource.includes("auth.getUser()"), "own-user from auth.getUser");
  assert(actionsSource.includes('getFormDataUploadFile(formData, "avatar")'), "FormData helper");
  assert(actionsSource.includes("deleteManagedAvatarIfOwned"), "owned delete helper");
  assert(actionsSource.includes("userId: user.id"), "storage scoped to session user");
  assert(!actionsSource.includes("formData.get(\"userId\")"), "no client userId");

  return "ok";
}
