/**
 * Static model of acceptance vs recovery token state transitions.
 * Used by regression checks where parallel DB sessions are unavailable.
 *
 * Lock contract (PostgreSQL): stage, activate, and rotate all take
 * `SELECT ... FROM applications WHERE id = ... FOR UPDATE` before mutating
 * cancellation-purpose tokens for that application. Concurrent transactions
 * serialize on the application row.
 */

export type CancellationTokenSlot = {
  hash: string;
  pending: boolean;
  revoked: boolean;
};

export type ParticipationTokenState = {
  active: CancellationTokenSlot | null;
  pending: CancellationTokenSlot | null;
};

export function countActiveNonPending(state: ParticipationTokenState) {
  return state.active && !state.active.revoked && !state.active.pending ? 1 : 0;
}

export function stageRecovery(
  state: ParticipationTokenState,
  hash: string,
): ParticipationTokenState {
  // Stage deletes prior pendings and inserts a revoked pending row.
  return {
    active: state.active,
    pending: { hash, pending: true, revoked: true },
  };
}

export function activateRecovery(
  state: ParticipationTokenState,
  hash: string,
): ParticipationTokenState {
  if (!state.pending || state.pending.hash !== hash || !state.pending.pending) {
    return state;
  }

  return {
    active: { hash, pending: false, revoked: false },
    pending: null,
  };
}

export function rotateAcceptance(
  state: ParticipationTokenState,
  hash: string,
): ParticipationTokenState {
  // Rotate deletes pendings and revokes actives, then inserts one active token.
  return {
    active: { hash, pending: false, revoked: false },
    pending: null,
  };
}

/**
 * Order A: stage → acceptance rotate → activate(stale pending)
 * Expected: acceptance token remains sole active; activate is a no-op.
 */
export function simulateOrderA() {
  let state: ParticipationTokenState = { active: null, pending: null };
  state = stageRecovery(state, "recovery-hash");
  state = rotateAcceptance(state, "acceptance-hash");
  // Pending was deleted by rotate; activate finds nothing.
  state = activateRecovery(state, "recovery-hash");
  return state;
}

/**
 * Order B: stage → activate → acceptance rotate
 * Expected: acceptance token remains sole active after rotate.
 */
export function simulateOrderB() {
  let state: ParticipationTokenState = { active: null, pending: null };
  state = stageRecovery(state, "recovery-hash");
  state = activateRecovery(state, "recovery-hash");
  state = rotateAcceptance(state, "acceptance-hash");
  return state;
}
