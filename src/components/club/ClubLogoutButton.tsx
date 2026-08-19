import { signOutAction } from "@/lib/auth/actions";

export function ClubLogoutButton() {
  return (
    <form action={signOutAction}>
      <button
        type="submit"
        className="inline-flex h-11 items-center bg-navy px-4 text-[12px] font-semibold tracking-[0.08em] text-white uppercase transition-colors hover:bg-navy-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
      >
        Abmelden
      </button>
    </form>
  );
}
