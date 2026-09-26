import { AppState } from 'react-native'
import * as Network from 'expo-network'

import { ApiError } from '@/services/apiClient'

import { getDb } from './db'
import { resetInFlight } from './outbox'
import { setPromptWriteListener } from './prompts'
import { fetchAndStoreMySpaces } from './spaces'
import { pullSpace } from './syncPull'
import { pushSpace } from './syncPush'
import { getTokens } from './tokenStore'

export type SyncSummary = { pushed: number; conflicts: number; rejected: number; pulled: number; errors: number }

const MAX_PUSH_ROUNDS = 10
// apiClient has no request timeout/AbortController, so a stalled network (captive portal,
// half-open connection) could otherwise keep a doSync() run — and anyone awaiting awaitIdle()
// — pending indefinitely (Task 17 fix round 2, issue 1).
const IDLE_TIMEOUT_MS = 5000

let running: Promise<SyncSummary> | null = null
let timer: ReturnType<typeof setTimeout> | null = null

async function doSync(): Promise<SyncSummary> {
  const summary: SyncSummary = { pushed: 0, conflicts: 0, rejected: 0, pulled: 0, errors: 0 }
  if (!(await getTokens())) return summary

  const db = await getDb()
  await resetInFlight(db) // rows left in flight by a killed app
  // Local-space prompts are purely local (no backend space exists for them) — never
  // pushed or pulled (spec: local-space rows are never touched by sync).
  const spaces = await db.getAllAsync<{ id: string }>(
    "SELECT id FROM spaces WHERE kind <> 'local' ORDER BY created_at",
  )

  let lostAccess = false
  for (const { id } of spaces) {
    // Rows rejected in this run are retried on the next run, never in a later round of this
    // one (spec §11.2) — otherwise one stuck row could eat every round.
    const skipSeqs = new Set<number>()
    try {
      for (let round = 0; round < MAX_PUSH_ROUNDS; round += 1) {
        const outcome = await pushSpace(id, { skipSeqs })
        summary.pushed += outcome.applied
        summary.conflicts += outcome.conflicts
        summary.rejected += outcome.rejected
        if (!outcome.remaining) break
      }
      // Also brings the snapshot a permission rejection asked for (Task 14 forceSnapshot).
      summary.pulled += (await pullSpace(id)).applied
    } catch (error) {
      summary.errors += 1
      if (error instanceof ApiError && error.status === 403) lostAccess = true
    }
  }
  // Removed from a family/team: /spaces/me no longer lists it, so its local rows are dropped.
  if (lostAccess) await fetchAndStoreMySpaces().catch(() => undefined)
  return summary
}

export function runSync(): Promise<SyncSummary> {
  if (!running) {
    running = doSync().finally(() => {
      running = null
    })
  }
  return running
}

// Resolves once no doSync() run is currently in flight, or after IDLE_TIMEOUT_MS — whichever
// comes first. The sign-out path awaits this before wiping synced data so a pull that's already
// mid-flight can't finish AFTER the wipe and write the old account's rows back to disk for a
// space whose row is already gone (Task 17 fix round 1, issue 3). The bound (fix round 2, issue
// 1) exists so a stalled sync can never hang the caller (e.g. authStore.signOut(), which the
// cold-start sign-out path awaits before it can render the app) indefinitely; a run this gave up
// waiting on is backstopped by syncPull's spaceExists() guard, which skips writing once the
// target space is gone. Never rejects, even if the awaited run itself failed. Clears its timer
// either way, so a fast-settling run never leaves a real timer dangling (open-handle-clean).
export function awaitIdle(): Promise<void> {
  const active = running
  if (!active) return Promise.resolve()
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, IDLE_TIMEOUT_MS)
    active.then(
      () => {
        clearTimeout(timer)
        resolve()
      },
      () => {
        clearTimeout(timer)
        resolve()
      },
    )
  })
}

export function requestSync(delayMs = 2000): void {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    runSync().catch(() => undefined)
  }, delayMs)
}

// Triggers from spec §11.4: local writes, foreground, connectivity regained, start-up.
export function startSyncTriggers(): () => void {
  setPromptWriteListener(() => requestSync())

  const appSubscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') requestSync(0)
  })

  let online = true
  const networkSubscription = Network.addNetworkStateListener((state) => {
    const reachable = state.isInternetReachable ?? state.isConnected ?? false
    if (reachable && !online) requestSync(0)
    online = reachable
  })

  requestSync(0)

  return () => {
    setPromptWriteListener(null)
    appSubscription.remove()
    networkSubscription.remove()
  }
}
