"use client";

import { useState, type ReactNode } from "react";
import { IconChevron } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

export type AccordionItem = {
  id: string;
  question: string;
  answer: ReactNode;
};

type AccordionProps = {
  items: AccordionItem[];
};

export function Accordion({ items }: AccordionProps) {
  const [openIds, setOpenIds] = useState<string[]>([]);

  function toggle(id: string) {
    setOpenIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  return (
    <div className="divide-y divide-line overflow-hidden rounded-[12px] border border-line bg-white">
      {items.map((item) => {
        const open = openIds.includes(item.id);
        const panelId = `${item.id}-panel`;
        const buttonId = `${item.id}-button`;

        return (
          <div key={item.id}>
            <h2 className="m-0">
              <button
                type="button"
                id={buttonId}
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => toggle(item.id)}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-yellow sm:px-6"
              >
                <span className="font-display text-[15px] font-bold tracking-wide text-ink uppercase sm:text-base">
                  {item.question}
                </span>
                <IconChevron
                  className={cn(
                    "h-5 w-5 shrink-0 text-brand-yellow transition-transform",
                    open && "rotate-180",
                  )}
                />
              </button>
            </h2>
            <div
              id={panelId}
              role="region"
              aria-labelledby={buttonId}
              hidden={!open}
              className={cn(!open && "hidden")}
            >
              <div className="px-5 pb-5 text-[15px] leading-7 text-muted sm:px-6">
                {item.answer}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
