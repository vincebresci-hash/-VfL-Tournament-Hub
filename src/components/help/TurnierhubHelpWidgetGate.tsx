"use client";

import { usePathname } from "next/navigation";
import { isHelpWidgetPathAllowed } from "@/lib/help/help-chat-paths";
import { TurnierhubHelpWidget } from "@/components/help/TurnierhubHelpWidget";

export function TurnierhubHelpWidgetGate() {
  const pathname = usePathname() ?? "/";

  if (!isHelpWidgetPathAllowed(pathname)) {
    return null;
  }

  return <TurnierhubHelpWidget />;
}
