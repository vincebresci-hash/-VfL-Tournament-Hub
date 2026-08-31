import type {
  CommunicationType,
  CommunicationRecipientFilter,
  CommunicationRecipientSource,
} from "@/types/communication";
import { COMMUNICATION_TYPES } from "@/types/communication";

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

export function requiresCustomDirectoryEntryIds(
  source: CommunicationRecipientSource,
): boolean {
  return source === "team-directory";
}

export function isTypeAllowedForRecipientSource(input: {
  type: CommunicationType;
  recipientSource: CommunicationRecipientSource;
}): boolean {
  if (
    input.recipientSource === "team-directory" &&
    input.type === "payment-reminder"
  ) {
    return false;
  }

  return true;
}

export function allowedCommunicationTypesForSource(
  source: CommunicationRecipientSource,
): CommunicationType[] {
  if (source === "team-directory") {
    return COMMUNICATION_TYPES.filter((type) => type !== "payment-reminder");
  }

  return [...COMMUNICATION_TYPES];
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
