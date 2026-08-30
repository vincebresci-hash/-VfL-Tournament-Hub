import { readFileSync } from "node:fs";
import { join } from "node:path";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

export function runAuthCallbackChecks() {
  const callbackRoute = read("src/app/auth/callback/route.ts");
  const authCallback = read("src/lib/auth/auth-callback.ts");
  const loginPage = read("src/app/login/page.tsx");

  assert(
    authCallback.includes("clearLocalAuthSessionOnFailure"),
    "auth callback helper clears session on failure",
  );
  assert(
    authCallback.includes("removeAllPKCEVerifiers"),
    "documents PKCE verifier deletion on signOut",
  );
  assert(
    authCallback.includes("establishInviteSessionFromTokenHash"),
    "invite token_hash session helper",
  );
  assert(
    authCallback.includes('type: "invite"'),
    "invite flow uses verifyOtp type invite",
  );
  assert(
    authCallback.includes("getUser()"),
    "invite flow confirms authenticated user",
  );
  assert(
    authCallback.includes("establishAuthSessionFromCallback"),
    "auth callback helper handles pkce code",
  );
  assert(
    authCallback.includes('input.authType !== "invite"'),
    "pkce exchange skips admin invite codes",
  );
  assert(authCallback.includes("logAuthCallbackFailure"), "callback logs sanitized failures");
  assert(authCallback.includes("resolveAuthCallbackDestination"), "invite destination resolver");
  assert(authCallback.includes("authCallbackFailurePath"), "invite failure path");

  const callbackBody = callbackRoute.slice(callbackRoute.indexOf("export async function GET"));
  assert(
    callbackBody.includes("isInviteTokenHashCallback"),
    "callback detects invite token_hash flow",
  );
  assert(
    callbackBody.includes("establishInviteSessionFromTokenHash"),
    "callback routes invite token_hash before pkce exchange",
  );
  assert(
    callbackBody.indexOf("establishInviteSessionFromTokenHash") <
      callbackBody.indexOf("establishAuthSessionFromCallback"),
    "invite token_hash handled before pkce exchange",
  );
  assert(
    !callbackBody.includes("clearSessionBeforeAuthExchange"),
    "callback does not clear session before exchange",
  );
  assert(
    callbackBody.indexOf("establishInviteSessionFromTokenHash") <
      callbackBody.indexOf("clearLocalAuthSessionOnFailure"),
    "session cleared only after failed exchange",
  );
  assert(callbackRoute.includes("logAuthCallbackFailure"), "callback logs failures");
  assert(callbackRoute.includes("authCallbackFailurePath"), "callback uses invite failure path");
  assert(callbackRoute.includes("resolveAuthCallbackDestination"), "callback forces invite destination");

  assert(loginPage.includes('errorParam === "invite_auth"'), "login handles invite callback failure");
  assert(loginPage.includes("!errorParam"), "login does not bounce when callback failed");

  return "ok";
}
