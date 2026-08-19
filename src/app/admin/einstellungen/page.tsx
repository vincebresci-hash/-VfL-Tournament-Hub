import type { Metadata } from "next";
import { AdminSettingsForm } from "@/components/admin/AdminSettingsForm";
import { AdminNotice, AdminPageHeader } from "@/components/admin/AdminPanel";
import { createClient } from "@/lib/supabase/server";
import { defaultAppSettings, getAppSettings } from "@/lib/settings";
import { isMissingRelationError } from "@/lib/db/errors";

export const metadata: Metadata = { title: "Einstellungen" };

export default async function AdminSettingsPage() {
  const supabase = await createClient();
  const { error } = await supabase.from("app_settings").select("key").limit(1);
  const ready = !isMissingRelationError(error);
  const settings = ready ? await getAppSettings() : defaultAppSettings;

  return (
    <div>
      <AdminPageHeader
        title="Einstellungen"
        description="Allgemeine Plattform-, Bewerbungs- und Admin-Einstellungen. Nur für Admin und Super-Admin."
      />
      {!ready ? (
        <AdminNotice>
          Bitte zuerst die neue SQL-Migration im Supabase SQL Editor ausführen, damit
          Einstellungen gespeichert werden können.
        </AdminNotice>
      ) : (
        <AdminSettingsForm settings={settings} />
      )}
    </div>
  );
}
