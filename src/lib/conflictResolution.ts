// Pure decision logic for the side-by-side conflict screen (src/app/conflict.tsx, Task 19).
// Kept out of the component so the four required behaviors — forbidden hides keep_local/merged,
// a thrown 422 is caught not crashed, requeued re-fetches, success lets the caller navigate away —
// are unit-testable without a React Native rendering harness (this repo has none).

import { toAuthError } from '@/lib/authForm'

import type { ResolveOutcome } from './conflicts'

export type ResolveAttemptResult =
  | { kind: 'success' }
  | { kind: 'forbidden' }
  | { kind: 'requeued' }
  | { kind: 'error'; message: string }

// Runs one resolution action (resolveKeepLocal/resolveKeepRemote/resolveMerged) and turns its
// outcome — or a thrown exception, e.g. a 422 validation error that `conflicts.ts` doesn't
// capture in `ResolveOutcome` — into a single result the screen can switch on.
//
// A 'requeued' outcome means the server moved on since the conflict was recorded (409/404):
// the stored conflict row is gone, so the screen must re-fetch before showing anything again,
// rather than keep displaying the now-stale conflict/local state it already has.
export async function runResolution(
  action: () => Promise<ResolveOutcome>,
  refetch: () => Promise<void>,
): Promise<ResolveAttemptResult> {
  try {
    const outcome = await action()
    if (outcome === 'forbidden') return { kind: 'forbidden' }
    if (outcome === 'requeued') {
      await refetch()
      return { kind: 'requeued' }
    }
    return { kind: 'success' }
  } catch (e) {
    return { kind: 'error', message: toAuthError(e).message }
  }
}

export type ConflictButtons = {
  keepLocal: boolean
  keepRemote: boolean
  merge: boolean
}

// Which resolution actions the screen may offer. `keep_remote` (spec §0 C18) is the only
// resolution a non-author/non-manager member may ever submit, so once a prior attempt has come
// back 'forbidden' the other two are hidden entirely, not merely disabled. `merge` never applies
// to a local delete (situation 2 of spec §12) since there is no local content to merge from.
export function visibleResolutionButtons(opts: { deletedLocally: boolean; forbidden: boolean }): ConflictButtons {
  return {
    keepLocal: !opts.forbidden,
    keepRemote: true,
    merge: !opts.deletedLocally && !opts.forbidden,
  }
}
