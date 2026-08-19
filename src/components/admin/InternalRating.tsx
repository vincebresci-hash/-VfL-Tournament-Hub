"use client";

import { INTERNAL_CATEGORIES, TEAM_STRENGTHS } from "@/types/application";
import type { InternalCategory, TeamStrength } from "@/types/application";

type InternalRatingProps = {
  category: InternalCategory | null;
  strength: TeamStrength | null;
  notes: string | null;
  onCategoryChange: (value: InternalCategory | null) => void;
  onStrengthChange: (value: TeamStrength | null) => void;
  onNotesChange: (value: string) => void;
};

const controlClassName =
  "h-10 w-full border border-line bg-white px-3 text-[14px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow";

export function InternalRating({
  category,
  strength,
  notes,
  onCategoryChange,
  onStrengthChange,
  onNotesChange,
}: InternalRatingProps) {
  return (
    <section className="border border-line bg-white p-5 sm:p-6">
      <h2 className="font-display text-lg font-bold tracking-wide text-ink uppercase">
        Interne Bewertung
      </h2>
      <p className="mt-2 text-[13px] leading-6 text-muted">
        Getrennt von der Selbsteinschätzung des Vereins. Nur intern sichtbar.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label>
          <span className="text-[11px] font-semibold tracking-[0.1em] text-ink uppercase">
            Interne Kategorie
          </span>
          <select
            value={category ?? ""}
            onChange={(event) =>
              onCategoryChange(
                event.target.value
                  ? (event.target.value as InternalCategory)
                  : null,
              )
            }
            className={`${controlClassName} mt-2`}
          >
            <option value="">Keine Angabe</option>
            {INTERNAL_CATEGORIES.map((value) => (
              <option key={value} value={value}>
                Kategorie {value}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className="text-[11px] font-semibold tracking-[0.1em] text-ink uppercase">
            Interne Spielstärke
          </span>
          <select
            value={strength ?? ""}
            onChange={(event) =>
              onStrengthChange(
                event.target.value
                  ? (Number(event.target.value) as TeamStrength)
                  : null,
              )
            }
            className={`${controlClassName} mt-2`}
          >
            <option value="">Keine Angabe</option>
            {TEAM_STRENGTHS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="mt-4 block">
        <span className="text-[11px] font-semibold tracking-[0.1em] text-ink uppercase">
          Interne Notiz
        </span>
        <textarea
          value={notes ?? ""}
          onChange={(event) => onNotesChange(event.target.value)}
          placeholder="Sehr starker Jahrgang. Bereits mehrfach positiv aufgefallen."
          className="mt-2 min-h-28 w-full border border-line bg-white px-3 py-3 text-[14px] text-ink placeholder:text-muted/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
        />
      </label>
    </section>
  );
}
