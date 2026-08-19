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
import { applications as seedApplications } from "@/data/applications";
import {
  loadAdminApplicationsAction,
  updateApplicationStatusAction,
  upsertApplicationReviewAction,
} from "@/lib/db/admin-actions";
import type {
  AdminApplication,
  ApplicationStatus,
  InternalCategory,
  TeamStrength,
} from "@/types/application";

type InternalRatingUpdate = {
  internalCategory?: InternalCategory | null;
  internalStrength?: TeamStrength | null;
  internalNotes?: string | null;
};

type AdminDataContextValue = {
  applications: AdminApplication[];
  getApplication: (id: string) => AdminApplication | undefined;
  updateStatus: (id: string, status: ApplicationStatus) => void;
  updateInternalRating: (id: string, update: InternalRatingUpdate) => void;
  usingDemoData: boolean;
};

const AdminDataContext = createContext<AdminDataContextValue | null>(null);

export function AdminDataProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [applications, setApplications] = useState<AdminApplication[]>([]);
  const [usingDemoData, setUsingDemoData] = useState(false);
  const noteTimers = useRef<Record<string, number>>({});

  useEffect(() => {
    if (pathname === "/admin/login") {
      return;
    }

    let cancelled = false;

    void loadAdminApplicationsAction().then((result) => {
      if (cancelled) {
        return;
      }

      if (!result.ready) {
        setApplications(seedApplications);
        setUsingDemoData(true);
        return;
      }

      setApplications(result.applications);
      setUsingDemoData(false);
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
      usingDemoData,
      getApplication: (id) =>
        applications.find((application) => application.id === id),
      updateStatus: (id, status) => {
        setApplications((current) =>
          current.map((application) =>
            application.id === id
              ? { ...application, applicationStatus: status }
              : application,
          ),
        );
        if (!usingDemoData) {
          void updateApplicationStatusAction(id, status);
        }
      },
      updateInternalRating: (id, update) => {
        setApplications((current) =>
          current.map((application) =>
            application.id === id ? { ...application, ...update } : application,
          ),
        );

        if (usingDemoData) {
          return;
        }

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
    [applications, persistRating, usingDemoData],
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
