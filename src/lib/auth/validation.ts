import { CLUB_CONTACT_ROLES } from "@/types/auth";

export function isFilled(value: string) {
  return value.trim().length > 0;
}

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

export function isValidOptionalUrl(value: string) {
  if (!isFilled(value)) {
    return true;
  }

  try {
    const withProtocol = /^https?:\/\//i.test(value.trim())
      ? value.trim()
      : `https://${value.trim()}`;
    const url = new URL(withProtocol);
    return Boolean(url.hostname.includes("."));
  } catch {
    return false;
  }
}

export type LoginFormValues = {
  email: string;
  password: string;
  remember: boolean;
};

export type LoginFormErrors = Partial<Record<"email" | "password", string>>;

export function validateLoginForm(values: LoginFormValues): LoginFormErrors {
  const errors: LoginFormErrors = {};

  if (!isFilled(values.email)) {
    errors.email = "Bitte die E-Mail-Adresse angeben.";
  } else if (!isValidEmail(values.email)) {
    errors.email = "Bitte eine gültige E-Mail-Adresse angeben.";
  }

  if (!isFilled(values.password)) {
    errors.password = "Bitte das Passwort angeben.";
  } else if (values.password.length < 8) {
    errors.password = "Das Passwort muss mindestens 8 Zeichen haben.";
  }

  return errors;
}

export type RegisterFormValues = {
  firstName: string;
  lastName: string;
  contactRole: string;
  clubName: string;
  clubCity: string;
  website: string;
  email: string;
  password: string;
  passwordConfirm: string;
  acceptedTerms: boolean;
};

export type RegisterFormErrors = Partial<
  Record<keyof RegisterFormValues, string>
>;

export const registerFieldOrder: Array<keyof RegisterFormValues> = [
  "firstName",
  "lastName",
  "contactRole",
  "clubName",
  "clubCity",
  "website",
  "email",
  "password",
  "passwordConfirm",
  "acceptedTerms",
];

export function validateRegisterForm(
  values: RegisterFormValues,
): RegisterFormErrors {
  const errors: RegisterFormErrors = {};

  if (!isFilled(values.firstName)) {
    errors.firstName = "Bitte den Vornamen angeben.";
  }

  if (!isFilled(values.lastName)) {
    errors.lastName = "Bitte den Nachnamen angeben.";
  }

  if (
    !CLUB_CONTACT_ROLES.includes(
      values.contactRole as (typeof CLUB_CONTACT_ROLES)[number],
    )
  ) {
    errors.contactRole = "Bitte die Funktion im Verein auswählen.";
  }

  if (!isFilled(values.clubName)) {
    errors.clubName = "Bitte den Vereinsnamen angeben.";
  }

  if (!isFilled(values.clubCity)) {
    errors.clubCity = "Bitte den Ort angeben.";
  }

  if (!isValidOptionalUrl(values.website)) {
    errors.website = "Bitte eine gültige Website angeben.";
  }

  if (!isFilled(values.email)) {
    errors.email = "Bitte die E-Mail-Adresse angeben.";
  } else if (!isValidEmail(values.email)) {
    errors.email = "Bitte eine gültige E-Mail-Adresse angeben.";
  }

  if (!isFilled(values.password)) {
    errors.password = "Bitte ein Passwort angeben.";
  } else if (values.password.length < 8) {
    errors.password = "Das Passwort muss mindestens 8 Zeichen haben.";
  }

  if (!isFilled(values.passwordConfirm)) {
    errors.passwordConfirm = "Bitte das Passwort wiederholen.";
  } else if (values.password !== values.passwordConfirm) {
    errors.passwordConfirm = "Die Passwörter stimmen nicht überein.";
  }

  if (!values.acceptedTerms) {
    errors.acceptedTerms =
      "Bitte die Datenschutzerklärung und Nutzungsbedingungen akzeptieren.";
  }

  return errors;
}

export function getFirstRegisterError(
  errors: RegisterFormErrors,
): keyof RegisterFormValues | undefined {
  return registerFieldOrder.find((field) => errors[field]);
}

export type ForgotPasswordValues = {
  email: string;
};

export type ForgotPasswordErrors = Partial<Record<"email", string>>;

export function validateForgotPasswordForm(
  values: ForgotPasswordValues,
): ForgotPasswordErrors {
  const errors: ForgotPasswordErrors = {};

  if (!isFilled(values.email)) {
    errors.email = "Bitte die E-Mail-Adresse angeben.";
  } else if (!isValidEmail(values.email)) {
    errors.email = "Bitte eine gültige E-Mail-Adresse angeben.";
  }

  return errors;
}

export type AdminLoginValues = {
  email: string;
  password: string;
};

export type AdminLoginErrors = Partial<Record<"email" | "password", string>>;

export function validateAdminLoginForm(
  values: AdminLoginValues,
): AdminLoginErrors {
  return validateLoginForm({ ...values, remember: false });
}
