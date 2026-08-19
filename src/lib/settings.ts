import { APP_NAME, CLUB_NAME } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import { isMissingRelationError } from "@/lib/db/errors";
import { APPLICATION_STATUSES, type ApplicationStatus } from "@/types/application";
import type { AppSettings } from "@/types/admin";
import type { Json } from "@/lib/supabase/database";

export const APP_SETTING_KEYS = {
  platformName: "platform_name",
  organizerName: "organizer_name",
  contactEmail: "contact_email",
  contactPhone: "contact_phone",
  applicationsEnabled: "applications_enabled",
  waitlistEnabled: "waitlist_enabled",
  applicationConfirmationEnabled: "application_confirmation_enabled",
  dashboardShowNewApplications: "dashboard_show_new_applications",
  defaultApplicationStatus: "default_application_status",
} as const;

export const defaultAppSettings: AppSettings = {
  platformName: APP_NAME,
  organizerName: CLUB_NAME,
  contactEmail: "",
  contactPhone: "",
  applicationsEnabled: true,
  waitlistEnabled: true,
  applicationConfirmationEnabled: true,
  dashboardShowNewApplications: true,
  defaultApplicationStatus: "new",
};

function asString(value: Json | undefined, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

function asBoolean(value: Json | undefined, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function asApplicationStatus(value: Json | undefined): ApplicationStatus {
  if (typeof value === "string" && APPLICATION_STATUSES.includes(value as ApplicationStatus)) {
    return value as ApplicationStatus;
  }

  return defaultAppSettings.defaultApplicationStatus;
}

export function mapAppSettings(
  rows: Array<{ key: string; value: Json }>,
): AppSettings {
  const byKey = new Map(rows.map((row) => [row.key, row.value]));

  return {
    platformName: asString(
      byKey.get(APP_SETTING_KEYS.platformName),
      defaultAppSettings.platformName,
    ),
    organizerName: asString(
      byKey.get(APP_SETTING_KEYS.organizerName),
      defaultAppSettings.organizerName,
    ),
    contactEmail: asString(
      byKey.get(APP_SETTING_KEYS.contactEmail),
      defaultAppSettings.contactEmail,
    ),
    contactPhone: asString(
      byKey.get(APP_SETTING_KEYS.contactPhone),
      defaultAppSettings.contactPhone,
    ),
    applicationsEnabled: asBoolean(
      byKey.get(APP_SETTING_KEYS.applicationsEnabled),
      defaultAppSettings.applicationsEnabled,
    ),
    waitlistEnabled: asBoolean(
      byKey.get(APP_SETTING_KEYS.waitlistEnabled),
      defaultAppSettings.waitlistEnabled,
    ),
    applicationConfirmationEnabled: asBoolean(
      byKey.get(APP_SETTING_KEYS.applicationConfirmationEnabled),
      defaultAppSettings.applicationConfirmationEnabled,
    ),
    dashboardShowNewApplications: asBoolean(
      byKey.get(APP_SETTING_KEYS.dashboardShowNewApplications),
      defaultAppSettings.dashboardShowNewApplications,
    ),
    defaultApplicationStatus: asApplicationStatus(
      byKey.get(APP_SETTING_KEYS.defaultApplicationStatus),
    ),
  };
}

export async function getAppSettings(): Promise<AppSettings> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("app_settings")
    .select("key, value");

  if (error || !data) {
    return defaultAppSettings;
  }

  return mapAppSettings(data);
}

export function isAppSettingsReady(error: { code?: string; message?: string } | null) {
  return !isMissingRelationError(error);
}

export function settingsToRows(settings: AppSettings): Array<{
  key: string;
  value: Json;
  description: string;
}> {
  return [
    {
      key: APP_SETTING_KEYS.platformName,
      value: settings.platformName,
      description: "Öffentlicher Name der Plattform",
    },
    {
      key: APP_SETTING_KEYS.organizerName,
      value: settings.organizerName,
      description: "Name des veranstaltenden Vereins",
    },
    {
      key: APP_SETTING_KEYS.contactEmail,
      value: settings.contactEmail,
      description: "Zentrale Kontakt-E-Mail",
    },
    {
      key: APP_SETTING_KEYS.contactPhone,
      value: settings.contactPhone,
      description: "Zentrale Telefonnummer",
    },
    {
      key: APP_SETTING_KEYS.applicationsEnabled,
      value: settings.applicationsEnabled,
      description: "Bewerbungen global aktivieren oder deaktivieren",
    },
    {
      key: APP_SETTING_KEYS.waitlistEnabled,
      value: settings.waitlistEnabled,
      description: "Warteliste für Bewerbungen aktivieren oder deaktivieren",
    },
    {
      key: APP_SETTING_KEYS.applicationConfirmationEnabled,
      value: settings.applicationConfirmationEnabled,
      description: "Bewerbungsbestätigung (später per E-Mail) aktivieren oder deaktivieren",
    },
    {
      key: APP_SETTING_KEYS.dashboardShowNewApplications,
      value: settings.dashboardShowNewApplications,
      description: "Neue Bewerbungen im Admin-Dashboard anzeigen",
    },
    {
      key: APP_SETTING_KEYS.defaultApplicationStatus,
      value: settings.defaultApplicationStatus,
      description: "Standardstatus neu eingehender Bewerbungen",
    },
  ];
}
