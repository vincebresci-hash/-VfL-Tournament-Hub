import { AdminEmpty, AdminPageHeader } from "@/components/admin/AdminPanel";

type AdminPlaceholderProps = {
  title: string;
  description: string;
};

export function AdminPlaceholder({ title, description }: AdminPlaceholderProps) {
  return (
    <div>
      <AdminPageHeader title={title} description={description} />
      <div className="mt-8">
        <AdminEmpty>
          Dieser Bereich ist vorbereitet und wird später angebunden.
        </AdminEmpty>
      </div>
    </div>
  );
}
