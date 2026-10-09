"use client";

import { useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { markAdminNavSeenAction } from "@/lib/admin/nav-badge-actions";
import {
  maxAdminNavCursor,
  type AdminNavBadgeKey,
  type AdminNavCursorItem,
} from "@/lib/admin/nav-badges";

type AdminNavSeenMarkerProps = {
  navKey: AdminNavBadgeKey;
  items: AdminNavCursorItem[];
  ready?: boolean;
};

/**
 * Marks the loaded section snapshot as seen once per mount when a cursor exists.
 * Does not run from the sidebar — only when embedded in a section page.
 */
export function AdminNavSeenMarker({
  navKey,
  items,
  ready = true,
}: AdminNavSeenMarkerProps) {
  const router = useRouter();
  const attemptedKey = useRef<string | null>(null);

  const cursor = useMemo(() => maxAdminNavCursor(items), [items]);
  const cursorKey = cursor ? `${navKey}:${cursor.seenUntil}:${cursor.seenId}` : null;

  useEffect(() => {
    if (!ready || !cursor || !cursorKey) {
      return;
    }
    if (attemptedKey.current === cursorKey) {
      return;
    }
    attemptedKey.current = cursorKey;

    let cancelled = false;
    void markAdminNavSeenAction({ navKey, cursor }).then((result) => {
      if (cancelled || result.error || !result.advanced) {
        return;
      }
      router.refresh();
    });

    return () => {
      cancelled = true;
    };
  }, [cursor, cursorKey, navKey, ready, router]);

  return null;
}
