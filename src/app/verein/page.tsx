import { redirect } from "next/navigation";
import { CLUB_HOME } from "@/lib/auth/roles";

export default function ClubIndexPage() {
  redirect(CLUB_HOME);
}
