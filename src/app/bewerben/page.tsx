import type { Metadata } from "next";
import { withCanonical } from "@/lib/site";
import { redirect } from "next/navigation";

export const metadata: Metadata = withCanonical("/bewerben", { title: "Turnier bewerben" });

export default function BewerbenPage() {
  redirect("/turniere");
}
