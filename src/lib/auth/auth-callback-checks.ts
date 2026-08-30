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

  assert(authCallback.includes("clearSessionBeforeAuthExchange"), "auth callback helper clears session");
  assert(authCallback.includes('signOut({ scope: "local" })'), "foreign session cleared locally");
  assert(authCallback.includes("establishAuthSessionFromCallback"), "auth callback helper exchanges code");
  assert(authCallback.includes("resolveAuthCallbackDestination"), "invite destination resolver");
  assert(authCallback.includes("authCallbackFailurePath"), "invite failure path");

  assert(callbackRoute.includes("clearSessionBeforeAuthExchange"), "callback clears session before exchange");
  assert(
    callbackRoute.indexOf("clearSessionBeforeAuthExchange") <
      callbackRoute.indexOf("establishAuthSessionFromCallback"),
    "session cleared before code exchange",
  );
  assert(callbackRoute.includes("authCallbackFailurePath"), "callback uses invite failure path");
  assert(callbackRoute.includes("resolveAuthCallbackDestination"), "callback forces invite destination");

  assert(loginPage.includes('errorParam === "invite_auth"'), "login handles invite callback failure");
  assert(loginPage.includes("!errorParam"), "login does not bounce when callback failed");

  return "ok";
}
