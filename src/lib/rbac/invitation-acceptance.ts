import { createServiceRoleClient } from "@/lib/supabase/service-role";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function markInvitationAcceptedForAuthUser(input: {
  userId: string;
  email: string | undefined;
}) {
  if (!input.email) {
    return;
  }

  let service;
  try {
    service = createServiceRoleClient();
  } catch {
    return;
  }

  const normalizedEmail = normalizeEmail(input.email);

  const { data: invitation } = await service
    .from("user_invitations")
    .select("id, email, status")
    .eq("profile_id", input.userId)
    .eq("status", "pending")
    .maybeSingle();

  if (!invitation) {
    return;
  }

  if (normalizeEmail(invitation.email) !== normalizedEmail) {
    return;
  }

  await service
    .from("user_invitations")
    .update({
      status: "accepted",
      accepted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", invitation.id)
    .eq("status", "pending");
}
