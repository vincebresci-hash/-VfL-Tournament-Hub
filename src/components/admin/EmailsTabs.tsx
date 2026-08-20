"use client";

import { useState } from "react";
import { EmailTemplatesBoard } from "@/components/admin/EmailTemplatesBoard";
import { EmailLogsBoard } from "@/components/admin/EmailLogsBoard";
import type { EmailLogView, EmailTemplate } from "@/types/admin";

type EmailsTabsProps = {
  templates: EmailTemplate[];
  logs: EmailLogView[];
  logsReady: boolean;
};

type TabId = "templates" | "logs";

const tabs: Array<{ id: TabId; label: string }> = [
  { id: "templates", label: "Vorlagen" },
  { id: "logs", label: "Versandprotokoll" },
];

export function EmailsTabs({ templates, logs, logsReady }: EmailsTabsProps) {
  const [active, setActive] = useState<TabId>("templates");

  return (
    <div>
      <div
        className="mt-6 flex flex-wrap gap-2 border-b border-line"
        role="tablist"
        aria-label="E-Mail-Bereiche"
      >
        {tabs.map((tab) => {
          const isActive = tab.id === active;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(tab.id)}
              className={
                isActive
                  ? "-mb-px border-b-2 border-navy px-4 py-3 text-[12px] font-semibold tracking-[0.08em] text-ink uppercase"
                  : "-mb-px border-b-2 border-transparent px-4 py-3 text-[12px] font-semibold tracking-[0.08em] text-muted uppercase hover:text-ink"
              }
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="mt-2">
        {active === "templates" ? (
          <EmailTemplatesBoard templates={templates} />
        ) : (
          <EmailLogsBoard logs={logs} ready={logsReady} />
        )}
      </div>
    </div>
  );
}
