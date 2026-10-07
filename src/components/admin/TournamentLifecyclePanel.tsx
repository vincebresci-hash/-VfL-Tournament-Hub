"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmModal } from "@/components/admin/ConfirmModal";
import {
  adminCardShellClass,
  adminPrimaryButtonClass,
  adminSecondaryButtonClass,
  adminTextLinkClass,
} from "@/components/admin/AdminPanel";
import { reopenTournamentAction } from "@/lib/db/knockout-actions";
import type { AdminLifecyclePanelModel } from "@/lib/db/tournament-lifecycle-admin";
import {
  TOURNAMENT_LIFECYCLE_LABEL_DE,
  TOURNAMENT_LIFECYCLE_STEPS,
  tournamentLifecycleStepIndex,
} from "@/lib/schedule/tournament-lifecycle-labels";
import type { TournamentLifecycleState } from "@/lib/schedule/tournament-lifecycle";

type TournamentLifecyclePanelProps = {
  tournamentId: string;
  model: AdminLifecyclePanelModel;
};

function stepVisualState(
  step: TournamentLifecycleState,
  effective: TournamentLifecycleState,
): "done" | "current" | "upcoming" {
  const stepIndex = tournamentLifecycleStepIndex(step);
  const currentIndex = tournamentLifecycleStepIndex(effective);
  if (stepIndex < currentIndex) {
    return "done";
  }
  if (stepIndex === currentIndex) {
    return "current";
  }
  return "upcoming";
}

export function TournamentLifecyclePanel({
  tournamentId,
  model,
}: TournamentLifecyclePanelProps) {
  const router = useRouter();
  const [reopenOpen, setReopenOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmReopen() {
    setReopenOpen(false);
    setPending(true);
    setError(null);
    const result = await reopenTournamentAction(tournamentId, true);
    setPending(false);
    if (result.error) {
      setError(result.error);
      router.refresh();
      return;
    }
    router.refresh();
  }

  return (
    <section
      className={`mt-4 ${adminCardShellClass} p-3.5 sm:p-4`}
      aria-labelledby="matchday-lifecycle-heading"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2
          id="matchday-lifecycle-heading"
          className="text-[11px] font-semibold tracking-[0.12em] text-muted uppercase"
        >
          Matchday-Phase
        </h2>
        <p className="text-[13px] font-semibold text-ink" aria-live="polite">
          Aktuell: {model.label}
        </p>
      </div>

      <ol
        className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4"
        aria-label="Matchday-Phasen"
      >
        {TOURNAMENT_LIFECYCLE_STEPS.map((step) => {
          const visual = stepVisualState(step, model.effective);
          const label = TOURNAMENT_LIFECYCLE_LABEL_DE[step];
          const marker =
            visual === "done" ? "✓" : visual === "current" ? "●" : "○";
          const stateClass =
            visual === "current"
              ? "border-brand-yellow bg-[#fff8e0] text-navy"
              : visual === "done"
                ? "border-line bg-surface text-ink"
                : "border-line/70 bg-white text-muted";
          return (
            <li
              key={step}
              className={`rounded-lg border px-2.5 py-2 text-center ${stateClass}`}
              aria-current={visual === "current" ? "step" : undefined}
            >
              <span className="sr-only">
                {visual === "done"
                  ? "Abgeschlossen: "
                  : visual === "current"
                    ? "Aktuell: "
                    : "Ausstehend: "}
              </span>
              <span
                className="block text-[12px] font-semibold"
                aria-hidden="true"
              >
                {marker}
              </span>
              <span className="mt-0.5 block text-[11px] font-semibold tracking-[0.04em] uppercase">
                {label}
              </span>
            </li>
          );
        })}
      </ol>

      <p className="mt-3 text-[13px] leading-relaxed text-muted">
        {model.description}
      </p>

      {model.correctionHint ? (
        <p
          className="mt-2 text-[13px] leading-relaxed text-ink"
          role="status"
        >
          {model.correctionHint}
        </p>
      ) : null}

      {model.completionReadinessText ? (
        <p className="mt-2 text-[13px] leading-relaxed text-muted">
          {model.completionReadinessText}{" "}
          {model.completionEligible ? (
            <Link href={model.knockoutHref} className={adminTextLinkClass}>
              Zur K.-o.-Runde
            </Link>
          ) : null}
        </p>
      ) : null}

      {model.effective === "completed" ? (
        <p className="mt-2 text-[14px] font-semibold text-ink">
          Turnier abgeschlossen.
        </p>
      ) : null}

      {error ? (
        <p className="mt-2 text-[14px] text-[#9a2b2b]" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {model.effective === "setup" ? (
          <Link href={model.groupsHref} className={adminSecondaryButtonClass}>
            Gruppen anlegen
          </Link>
        ) : null}
        {model.effective === "group_stage" ? (
          <Link href={model.knockoutHref} className={adminSecondaryButtonClass}>
            Zur K.-o.-Runde
          </Link>
        ) : null}
        {model.canReopen ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => setReopenOpen(true)}
            className={adminPrimaryButtonClass}
          >
            {pending ? "Wird geöffnet…" : "Turnier wieder öffnen"}
          </button>
        ) : null}
      </div>

      <ConfirmModal
        open={reopenOpen}
        title="Turnier wieder öffnen?"
        confirmLabel="Wieder öffnen"
        cancelLabel="Abbrechen"
        onCancel={() => setReopenOpen(false)}
        onConfirm={() => {
          void confirmReopen();
        }}
      >
        <div className="grid gap-3 text-[14px] leading-6 text-muted">
          <p>
            Der öffentliche Turnierstatus wechselt von Abgeschlossen zu Aktiv.
          </p>
          <p>
            Die Matchday-Phase wird automatisch aus dem aktuellen Stand
            abgeleitet.
          </p>
          <p>
            Bestehende Gruppen, Spiele und Ergebnisse bleiben erhalten.
          </p>
          <p>
            Bewerbungsstatus, Bewerbungsfenster und Kapazität werden nicht
            geändert.
          </p>
          <p>
            Wenn Bewerbungen bereits geöffnet sind und die übrigen öffentlichen
            Regeln es zulassen, können Bewerbungen danach wieder möglich sein.
          </p>
        </div>
      </ConfirmModal>
    </section>
  );
}
