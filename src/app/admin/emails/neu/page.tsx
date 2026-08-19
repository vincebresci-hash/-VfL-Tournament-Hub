import type { Metadata } from "next";
import { EmailTemplateForm } from "@/components/admin/EmailTemplateForm";

export const metadata: Metadata = { title: "Neue E-Mail-Vorlage" };

export default function AdminNewEmailTemplatePage() {
  return <EmailTemplateForm />;
}
