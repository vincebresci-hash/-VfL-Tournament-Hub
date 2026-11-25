"use client";

export function PrintScheduleButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex h-11 items-center bg-navy px-4 text-[12px] font-semibold tracking-[0.08em] text-white uppercase print:hidden"
    >
      Spielplan als PDF
    </button>
  );
}
