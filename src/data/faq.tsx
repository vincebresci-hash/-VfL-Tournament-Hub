import type { ReactNode } from "react";
import Link from "next/link";
import type { AppSettings } from "@/types/admin";
import { publicContactEmail } from "@/lib/contact";
import {
  getTurnierhubKnowledgeEntries,
  type TurnierhubKnowledgeEntry,
  type TurnierhubKnowledgeLink,
} from "@/lib/help/turnierhub-knowledge";

export type FaqItem = {
  id: string;
  question: string;
  answer: ReactNode;
};

function renderKnowledgeLinks(links: TurnierhubKnowledgeLink[] | undefined) {
  if (!links || links.length === 0) {
    return null;
  }

  return (
    <p className="mt-3 text-[14px] leading-6 text-muted">
      {links.map((link, index) => (
        <span key={link.href}>
          {index > 0 ? " · " : null}
          <Link
            href={link.href}
            className="font-semibold text-ink underline decoration-brand-yellow underline-offset-2 hover:text-brand-blue"
          >
            {link.label}
          </Link>
        </span>
      ))}
    </p>
  );
}

function renderKnowledgeAnswer(entry: TurnierhubKnowledgeEntry) {
  const paragraphs = entry.answer.split(/\n\n+/);

  return (
    <>
      {paragraphs.map((paragraph, index) => (
        <p key={index} className={index > 0 ? "mt-3" : undefined}>
          {paragraph}
        </p>
      ))}
      {renderKnowledgeLinks(entry.links)}
    </>
  );
}

export function getFaqItems(settings?: AppSettings): FaqItem[] {
  const contactEmail = publicContactEmail(settings);
  const entries = getTurnierhubKnowledgeEntries(contactEmail);

  return entries.map((entry) => ({
    id: entry.id,
    question: entry.title,
    answer: renderKnowledgeAnswer(entry),
  }));
}
