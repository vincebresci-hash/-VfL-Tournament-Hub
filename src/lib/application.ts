import type {
  ApplicationStatus,
  ClubType,
  TeamStrength,
  TournamentApplication,
} from "@/types/application";
import type { AgeGroup } from "@/types/tournament";

export const clubTypeOptions: Array<{ value: ClubType; label: string }> = [
  { value: "amateur", label: "Amateurverein" },
  { value: "performance", label: "Leistungsorientierter Verein" },
  { value: "youth-academy", label: "Nachwuchsleistungszentrum" },
  { value: "other", label: "Sonstiges" },
];

export const teamStrengthOptions: Array<{ value: TeamStrength; label: string }> = [
  { value: 1, label: "1 – Breitensport / Anfänger" },
  { value: 2, label: "2 – Breitensport" },
  { value: 3, label: "3 – Fortgeschritten" },
  { value: 4, label: "4 – Leistungsorientiert" },
  { value: 5, label: "5 – Sehr leistungsstark" },
];

export type ApplicationFormValues = {
  clubName: string;
  clubCity: string;
  website: string;
  teamName: string;
  ageGroup: AgeGroup;
  birthYear: string;
  league: string;
  division: string;
  selfRatedStrength: string;
  teamDescription: string;
  clubType: string;
  contactFirstName: string;
  contactLastName: string;
  contactRole: string;
  contactEmail: string;
  contactPhone: string;
  alternativePhone: string;
  staffCount: string;
  notes: string;
  dataAccurate: boolean;
  privacyAccepted: boolean;
  honeypot: string;
};

export type ApplicationFormErrors = Partial<
  Record<keyof ApplicationFormValues, string>
>;

export const applicationFieldOrder: Array<keyof ApplicationFormValues> = [
  "clubName",
  "clubCity",
  "website",
  "teamName",
  "birthYear",
  "league",
  "selfRatedStrength",
  "clubType",
  "contactFirstName",
  "contactLastName",
  "contactRole",
  "contactEmail",
  "contactPhone",
  "alternativePhone",
  "staffCount",
  "dataAccurate",
  "privacyAccepted",
];

export function createEmptyApplicationForm(
  ageGroup: AgeGroup,
): ApplicationFormValues {
  return {
    clubName: "",
    clubCity: "",
    website: "",
    teamName: "",
    ageGroup,
    birthYear: "",
    league: "",
    division: "",
    selfRatedStrength: "",
    teamDescription: "",
    clubType: "",
    contactFirstName: "",
    contactLastName: "",
    contactRole: "",
    contactEmail: "",
    contactPhone: "",
    alternativePhone: "",
    staffCount: "",
    notes: "",
    dataAccurate: false,
    privacyAccepted: false,
    honeypot: "",
  };
}

export function isHoneypotFilled(values: Pick<ApplicationFormValues, "honeypot">) {
  return values.honeypot.trim().length > 0;
}

function isFilled(value: string) {
  return value.trim().length > 0;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

function digitCount(value: string) {
  return value.replace(/\D/g, "").length;
}

function isValidPhone(value: string) {
  const trimmed = value.trim();
  if (!/^[+\d][\d\s/()-]*$/.test(trimmed)) {
    return false;
  }

  const digits = digitCount(trimmed);
  return digits >= 6 && digits <= 16;
}

function isValidOptionalUrl(value: string) {
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

export function validateApplicationForm(
  values: ApplicationFormValues,
): ApplicationFormErrors {
  const errors: ApplicationFormErrors = {};

  if (!isFilled(values.clubName)) {
    errors.clubName = "Bitte den Vereinsnamen angeben.";
  }

  if (!isFilled(values.clubCity)) {
    errors.clubCity = "Bitte den Ort angeben.";
  }

  if (!isValidOptionalUrl(values.website)) {
    errors.website = "Bitte eine gültige Website angeben.";
  }

  if (!isFilled(values.teamName)) {
    errors.teamName = "Bitte den Mannschaftsnamen angeben.";
  }

  const year = Number(values.birthYear);
  if (!isFilled(values.birthYear) || !Number.isInteger(year)) {
    errors.birthYear = "Bitte den Jahrgang angeben.";
  } else if (year < 2008 || year > 2022) {
    errors.birthYear = "Bitte einen plausiblen Jahrgang angeben.";
  }

  if (!teamStrengthOptions.some((option) => String(option.value) === values.selfRatedStrength)) {
    errors.selfRatedStrength = "Bitte die Spielstärke auswählen.";
  }

  if (!isFilled(values.contactFirstName)) {
    errors.contactFirstName = "Bitte den Vornamen angeben.";
  }

  if (!isFilled(values.contactLastName)) {
    errors.contactLastName = "Bitte den Nachnamen angeben.";
  }

  if (!isFilled(values.contactRole)) {
    errors.contactRole = "Bitte die Funktion im Verein angeben.";
  }

  if (!isFilled(values.contactEmail)) {
    errors.contactEmail = "Bitte die E-Mail-Adresse angeben.";
  } else if (!isValidEmail(values.contactEmail)) {
    errors.contactEmail = "Bitte eine gültige E-Mail-Adresse angeben.";
  }

  if (isFilled(values.contactPhone) && !isValidPhone(values.contactPhone)) {
    errors.contactPhone = "Bitte eine gültige Telefonnummer angeben.";
  }

  if (isFilled(values.alternativePhone) && !isValidPhone(values.alternativePhone)) {
    errors.alternativePhone = "Bitte eine gültige Telefonnummer angeben.";
  }

  if (isFilled(values.clubType) && !clubTypeOptions.some((option) => option.value === values.clubType)) {
    errors.clubType = "Bitte eine gültige Vereinsart auswählen.";
  }

  if (isFilled(values.staffCount)) {
    const count = Number(values.staffCount);
    if (!Number.isInteger(count) || count < 0 || count > 40) {
      errors.staffCount = "Bitte eine gültige Anzahl angeben.";
    }
  }

  if (!values.dataAccurate) {
    errors.dataAccurate = "Bitte die Richtigkeit der Angaben bestätigen.";
  }

  if (!values.privacyAccepted) {
    errors.privacyAccepted = "Bitte die Datenschutzerklärung bestätigen.";
  }

  return errors;
}

export function getFirstApplicationError(
  errors: ApplicationFormErrors,
): keyof ApplicationFormValues | undefined {
  return applicationFieldOrder.find((field) => errors[field]);
}

export function toTournamentApplication(
  values: ApplicationFormValues,
  tournamentId: string,
): TournamentApplication {
  const optional = (value: string) => {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  };

  return {
    id: crypto.randomUUID(),
    tournamentId,
    clubName: values.clubName.trim(),
    clubCity: values.clubCity.trim(),
    website: optional(values.website),
    teamName: values.teamName.trim(),
    ageGroup: values.ageGroup,
    birthYear: Number(values.birthYear),
    league: optional(values.league) ?? "",
    division: optional(values.division),
    selfRatedStrength: Number(values.selfRatedStrength) as TeamStrength,
    teamDescription: optional(values.teamDescription),
    clubType: clubTypeOptions.some((option) => option.value === values.clubType)
      ? (values.clubType as ClubType)
      : null,
    contactFirstName: values.contactFirstName.trim(),
    contactLastName: values.contactLastName.trim(),
    contactRole: values.contactRole.trim(),
    contactEmail: values.contactEmail.trim(),
    contactPhone: optional(values.contactPhone) ?? "",
    alternativePhone: optional(values.alternativePhone),
    staffCount: isFilled(values.staffCount) ? Number(values.staffCount) : null,
    notes: optional(values.notes),
    applicationStatus: "new" satisfies ApplicationStatus,
    createdAt: new Date().toISOString(),
    paymentStatus: "pending",
    participationFee: null,
    paidAt: null,
    paymentNote: null,
  };
}
