import { redirect } from "next/navigation";

export const metadata = { title: "Turnier bewerben" };

export default function BewerbenPage() {
  redirect("/turniere");
}
