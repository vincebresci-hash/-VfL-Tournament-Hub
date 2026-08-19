import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EmailTemplateForm } from "@/components/admin/EmailTemplateForm";
import { getEmailTemplate } from "@/lib/db/admin-queries";

type AdminEmailTemplatePageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({
  params,
}: AdminEmailTemplatePageProps): Promise<Metadata> {
  const { id } = await params;
  const template = await getEmailTemplate(id);

  return { title: template ? template.name : "E-Mail-Vorlage" };
}

export default async function AdminEmailTemplatePage({
  params,
}: AdminEmailTemplatePageProps) {
  const { id } = await params;
  const template = await getEmailTemplate(id);

  if (!template) {
    notFound();
  }

  return <EmailTemplateForm template={template} />;
}
