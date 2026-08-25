import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getPostLoginRedirect } from "@/lib/auth/redirects";
import { ADMIN_HOME, canAccessAdmin } from "@/lib/auth/roles";
import {
  NEW_PASSWORD_MIN_LENGTH,
  validateAdminLoginForm,
  validateLoginCredentials,
  validateLoginForm,
  validateNewPassword,
  validateRegisterForm,
} from "@/lib/auth/validation";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function readSource(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

/**
 * Self-checks for login vs new-password validation split (AUDIT-008 follow-up).
 */
export function runAuthLoginValidationChecks() {
  // A) Existing short passwords must pass client login validation
  const shortSix = validateLoginCredentials({
    email: "admin@example.com",
    password: "123456",
  });
  assert(!shortSix.email && !shortSix.password, "A: 6-char password must pass login validation");

  const shortSeven = validateLoginForm({
    email: "admin@example.com",
    password: "1234567",
    remember: false,
  });
  assert(!shortSeven.email && !shortSeven.password, "A: 7-char password must pass login validation");

  const adminShort = validateAdminLoginForm({
    email: "admin@example.com",
    password: "123456",
  });
  assert(!adminShort.email && !adminShort.password, "A: admin login accepts short passwords");

  // B) Empty password blocked
  const empty = validateLoginCredentials({
    email: "admin@example.com",
    password: "",
  });
  assert(empty.password === "Bitte Passwort eingeben.", "B: empty password message");

  const whitespaceOnly = validateLoginCredentials({
    email: "admin@example.com",
    password: "   ",
  });
  assert(Boolean(whitespaceOnly.password), "B: whitespace-only password blocked");

  // C) Registration still requires min length
  assert(NEW_PASSWORD_MIN_LENGTH === 8, "C: new password min length is 8");
  assert(
    validateNewPassword("1234567") === "Das Passwort muss mindestens 8 Zeichen haben.",
    "C: validateNewPassword blocks <8",
  );
  assert(validateNewPassword("12345678") === null, "C: validateNewPassword allows 8+");

  const registerShort = validateRegisterForm({
    firstName: "Max",
    lastName: "Mustermann",
    contactRole: "Vorstand",
    clubName: "Testverein",
    clubCity: "Kirchheim",
    website: "",
    email: "club@example.com",
    password: "1234567",
    passwordConfirm: "1234567",
    acceptedTerms: true,
  });
  assert(
    registerShort.password === "Das Passwort muss mindestens 8 Zeichen haben.",
    "C: register form still blocks short passwords",
  );

  const registerOk = validateRegisterForm({
    firstName: "Max",
    lastName: "Mustermann",
    contactRole: "Vorstand",
    clubName: "Testverein",
    clubCity: "Kirchheim",
    website: "",
    email: "club@example.com",
    password: "12345678",
    passwordConfirm: "12345678",
    acceptedTerms: true,
  });
  assert(!registerOk.password, "C: register accepts 8+ password");

  // D) Password change / reset still enforce min length in source
  const changePasswordAction = readSource("src/lib/auth/actions.ts");
  assert(
    changePasswordAction.includes("validateNewPassword"),
    "D: change-password action uses validateNewPassword",
  );
  assert(
    changePasswordAction.includes("Das neue Passwort muss mindestens 8 Zeichen haben."),
    "D: change-password keeps 8-char error",
  );

  const resetForm = readSource("src/components/auth/ResetPasswordForm.tsx");
  assert(resetForm.includes("validateNewPassword"), "D: reset form uses validateNewPassword");

  // E) Admin redirect unchanged
  assert(canAccessAdmin("admin"), "E: admin role can access admin");
  assert(getPostLoginRedirect("admin", null) === ADMIN_HOME, "E: admin post-login -> /admin");
  assert(
    getPostLoginRedirect("admin", "/admin/turniere") === "/admin/turniere",
    "E: admin safe redirect preserved",
  );

  // Login forms must not reintroduce min-length checks
  const loginForm = readSource("src/components/auth/LoginForm.tsx");
  const adminLoginForm = readSource("src/components/auth/AdminLoginForm.tsx");
  assert(loginForm.includes("validateLoginCredentials"), "login form uses credentials validator");
  assert(adminLoginForm.includes("validateAdminLoginForm"), "admin login uses admin validator");
  assert(!loginForm.includes("mindestens 8"), "login form has no min-length message");
  assert(!adminLoginForm.includes("mindestens 8"), "admin login has no min-length message");

  const validationSource = readSource("src/lib/auth/validation.ts");
  assert(
    validationSource.includes("validateLoginCredentials"),
    "validation exports login credentials helper",
  );
  assert(validationSource.includes("validateNewPassword"), "validation exports new-password helper");

  return "ok";
}
