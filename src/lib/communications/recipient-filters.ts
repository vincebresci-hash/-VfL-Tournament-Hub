import type { CommunicationType, CommunicationRecipientFilter } from "@/types/communication";

export function defaultRecipientFilterForType(
  type: CommunicationType,
): CommunicationRecipientFilter {
  if (type === "payment-reminder") {
    return "payment-pending";
  }

  return "accepted";
}

export function isRecipientFilterAllowed(input: {
  type: CommunicationType;
  filter: CommunicationRecipientFilter;
}): boolean {
  if (input.type === "payment-reminder") {
    return input.filter === "payment-pending" || input.filter === "custom";
  }

  return true;
}

export function requiresCustomApplicationIds(
  filter: CommunicationRecipientFilter,
): boolean {
  return filter === "custom";
}

export function allowedRecipientFiltersForType(
  type: CommunicationType,
): CommunicationRecipientFilter[] {
  const base: CommunicationRecipientFilter[] = [
    "accepted",
    "payment-paid",
    "payment-pending",
    "custom",
  ];

  if (type === "payment-reminder") {
    return ["payment-pending", "custom"];
  }

  return [...base, "waitlist"];
}
