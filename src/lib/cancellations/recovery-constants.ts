/** Canonical public response for guest cancellation recovery (anti-enumeration). */
export const GUEST_CANCELLATION_RECOVERY_PUBLIC_MESSAGE =
  "Wenn wir eine passende Teilnahme finden konnten, senden wir euch eine E-Mail mit den nächsten Schritten.";

/** public_action_attempts action_type values (hashed identifiers only). */
export const RECOVERY_RATE_LIMIT = {
  emailAction: "guest_cancellation_recovery_email",
  emailMaxPerHour: 3,
  tournamentEmailAction: "guest_cancellation_recovery_tournament_email",
  tournamentEmailMaxPerHour: 5,
  ipAction: "guest_cancellation_recovery_ip",
  ipMaxPerHour: 10,
} as const;

export const RECOVERY_RPC_NAME = "issue_guest_cancellation_recovery_token" as const;
export const RECOVERY_REVOKE_RPC_NAME = "revoke_secure_access_token_by_hash" as const;
