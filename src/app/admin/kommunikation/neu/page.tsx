import type { Metadata } from "next";
import { CommunicationComposeForm } from "@/components/admin/CommunicationComposeForm";
import { AdminNotice, AdminPageHeader } from "@/components/admin/AdminPanel";
import { listAdminTournaments } from "@/lib/db/admin-queries";
import { getCommunicationTeamDirectoryAccess } from "@/lib/communications/access";
import {
  hasPermissionInAuthorization,
  requireAdminSession,
} from "@/lib/auth/guards";
import { canManageSystem } from "@/lib/auth/roles";

export const metadata: Metadata = {
  title: "Neue Kommunikation",
};

export const dynamic = "force-dynamic";

export default async function AdminCommunicationComposePage() {
  const tournaments = await listAdminTournaments();
  const adminAccess = await requireAdminSession();
  const directoryAccess = await getCommunicationTeamDirectoryAccess();
  const canSend =
    !("error" in adminAccess && adminAccess.error) &&
    adminAccess.session !== null &&
    adminAccess.authorization !== null &&
    (canManageSystem(adminAccess.session.user.role) ||
      hasPermissionInAuthorization(
        adminAccess.authorization,
        adminAccess.session,
        "communications.send",
      ) ||
      hasPermissionInAuthorization(
        adminAccess.authorization,
        adminAccess.session,
        "communications.manage",
      ));

  return (
    <div>
      <AdminPageHeader
        title="Neue Kommunikation"
        description="Nachricht verfassen, Empfänger prüfen und per E-Mail versenden."
      />
      {tournaments.length === 0 ? (
        <AdminNotice>Es sind noch keine Turniere vorhanden.</AdminNotice>
      ) : (
        <CommunicationComposeForm
          tournaments={tournaments}
          canSend={canSend}
          canUseTeamDirectorySource={directoryAccess.canUseTeamDirectorySource}
        />
      )}
    </div>
  );
}
