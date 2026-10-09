"use client";

import { useMemo } from "react";
import { AdminNavSeenMarker } from "@/components/admin/AdminNavSeenMarker";
import { useAdminData } from "@/components/admin/AdminDataProvider";

export function AdminApplicationsNavSeen() {
  const { applications, databaseReady } = useAdminData();

  const items = useMemo(
    () =>
      applications
        .filter((application) => !application.archivedAt)
        .map((application) => ({
          id: application.id,
          timestamp: application.createdAt,
        })),
    [applications],
  );

  return (
    <AdminNavSeenMarker
      navKey="applications"
      items={items}
      ready={databaseReady}
    />
  );
}
