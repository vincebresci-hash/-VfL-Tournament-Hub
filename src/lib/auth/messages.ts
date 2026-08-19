export const AUTH_ERROR_MESSAGES = {
  invalidCredentials: "E-Mail-Adresse oder Passwort ist nicht korrekt.",
  emailNotConfirmed:
    "Bitte bestätige zuerst deine E-Mail-Adresse. Schau dazu in dein Postfach.",
  generic: "Die Anmeldung ist fehlgeschlagen. Bitte versuche es erneut.",
  registerGeneric:
    "Die Registrierung konnte nicht abgeschlossen werden. Bitte versuche es erneut.",
  emailInUse:
    "Diese E-Mail-Adresse kann nicht verwendet werden. Prüfe dein Postfach oder melde dich an.",
  weakPassword: "Bitte wähle ein stärkeres Passwort mit mindestens 8 Zeichen.",
  resetGeneric:
    "Falls ein Konto mit dieser E-Mail-Adresse existiert, wurde eine Nachricht zum Zurücksetzen des Passworts versendet.",
  updatePasswordGeneric:
    "Das Passwort konnte nicht gespeichert werden. Bitte fordere einen neuen Link an.",
  callbackFailed: "Die Anmeldung konnte nicht abgeschlossen werden. Bitte versuche es erneut.",
  adminNotReady:
    "Der Adminbereich ist noch nicht freigeschaltet. Vereinskonten verwenden den Vereins-Login.",
} as const;

function messageIncludes(errorMessage: string, snippets: string[]) {
  const normalized = errorMessage.toLowerCase();
  return snippets.some((snippet) => normalized.includes(snippet));
}

export function toLoginErrorMessage(errorMessage: string | undefined) {
  if (!errorMessage) {
    return AUTH_ERROR_MESSAGES.generic;
  }

  if (
    messageIncludes(errorMessage, [
      "invalid login",
      "invalid credentials",
      "invalid email or password",
    ])
  ) {
    return AUTH_ERROR_MESSAGES.invalidCredentials;
  }

  if (messageIncludes(errorMessage, ["email not confirmed", "not confirmed"])) {
    return AUTH_ERROR_MESSAGES.emailNotConfirmed;
  }

  return AUTH_ERROR_MESSAGES.generic;
}

export function toRegisterErrorMessage(errorMessage: string | undefined) {
  if (!errorMessage) {
    return AUTH_ERROR_MESSAGES.registerGeneric;
  }

  if (
    messageIncludes(errorMessage, [
      "already registered",
      "already been registered",
      "user already exists",
    ])
  ) {
    return AUTH_ERROR_MESSAGES.emailInUse;
  }

  if (messageIncludes(errorMessage, ["password"])) {
    return AUTH_ERROR_MESSAGES.weakPassword;
  }

  return AUTH_ERROR_MESSAGES.registerGeneric;
}
