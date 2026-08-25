"use client";

import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  loadAdminApplicationsAction,
  updateApplicationStatusAction,
  upsertApplicationReviewAction,
} from "@/lib/db/admin-actions";
import { listAllExternalTeamsForAdminAction } from "@/lib/db/mein-turnierplan-participants-actions";
import type {
  AdminApplication,
  ApplicationStatus,
  InternalCategory,
  TeamStrength,
} from "@/types/application";
import type { ExternalTeamForParticipantCount } from "@/lib/mein-turnierplan-participants";

type InternalRatingUpdate = {
  internalCategory?: InternalCategory | null;
  internalStrength?: TeamStrength | null;
  internalNotes?: string | null;
};

type AdminExternalTeamRow = ExternalTeamForParticipantCount & {
  tournamentId: string;
};

type AdminDataContextValue = {
  applications: AdminApplication[];
  externalTeams: AdminExternalTeamRow[];
  getApplication: (id: string) => AdminApplication | undefined;
  updateStatus: (
    id: string,
    status: ApplicationStatus,
  ) => Promise<{ error: string | null; notice: string | null }>;
  updateInternalRating: (id: string, update: InternalRatingUpdate) => void;
  databaseReady: boolean;
};

const AdminDataContext = createContext<AdminDataContextValue | null>(null);

export function AdminDataProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [applications, setApplications] = useState<AdminApplication[]>([]);
  const [externalTeams, setExternalTeams] = useState<AdminExternalTeamRow[]>([]);
  const [databaseReady, setDatabaseReady] = useState(true);
  const noteTimers = useRef<Record<string, number>>({});

  useEffect(() => {
    if (pathname === "/admin/login") {
      return;
    }

    let cancelled = false;

    void Promise.all([
      loadAdminApplicationsAction(),
      listAllExternalTeamsForAdminAction(),
    ]).then(([applicationsResult, externalResult]) => {
      if (cancelled) {
        return;
      }

      setApplications(applicationsResult.ready ? applicationsResult.applications : []);
      setExternalTeams(externalResult.ready ? externalResult.teams : []);
      setDatabaseReady(applicationsResult.ready);
    });

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  const persistRating = useCallback(
    (id: string, update: InternalRatingUpdate) => {
      void upsertApplicationReviewAction(id, update);
    },
    [],
  );

  const value = useMemo<AdminDataContextValue>(
    () => ({
      applications,
      externalTeams,
      databaseReady,
      getApplication: (id) =>
        applications.find((application) => application.id === id),
      updateStatus: async (id, status) => {
        if (!databaseReady) {
          return {
            error: "Die Datenbank ist derzeit nicht erreichbar.",
            notice: null,
          };
        }

        const previous = applications.find((application) => application.id === id);
        setApplications((current) =>
          current.map((application) =>
            application.id === id
              ? { ...application, applicationStatus: status }
              : application,
          ),
        );

        const result = await updateApplicationStatusAction(id, status);
        if (result.error && previous) {
          setApplications((current) =>
            current.map((application) =>
              application.id === id
                ? { ...application, applicationStatus: previous.applicationStatus }
                : application,
            ),
          );
        }

        return result;
      },
      updateInternalRating: (id, update) => {
        if (!databaseReady) {
          return;
        }

        setApplications((current) =>
          current.map((application) =>
            application.id === id ? { ...application, ...update } : application,
          ),
        );

        if (update.internalNotes !== undefined) {
          window.clearTimeout(noteTimers.current[id]);
          noteTimers.current[id] = window.setTimeout(() => {
            persistRating(id, update);
          }, 400);
          return;
        }

        persistRating(id, update);
      },
    }),
    [applications, externalTeams, persistRating, databaseReady],
  );

  return (
    <AdminDataContext.Provider value={value}>{children}</AdminDataContext.Provider>
  );
}

export function useAdminData() {
  const context = useContext(AdminDataContext);

  if (!context) {
    throw new Error("useAdminData must be used within AdminDataProvider");
  }

  return context;
}
