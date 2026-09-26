import type { SQLiteDatabase } from 'expo-sqlite'

import { apiClient } from '@/services/apiClient'

import { categoryIdFor } from './categoryId'
import { getDb } from './db'
import { claimBatch, completeRow, hasPending, type OutboxOperation, releaseRows } from './outbox'

// AioKin PromptPayload (Models/InputModel/Vault/SyncPushRequest.cs). Absent keys mean
// "leave unchanged" on the server: tags/variables are never sent (no UI for them, and []
// would wipe them); categoryId/categoryName only when a category is set; clearCategory only
// on an update whose category is empty (spec §0 C5–C7).
//
// `description` is deliberately absent from this type. Backend follow-up commit 25cf356
// ("description field follows omit-means-unchanged semantics, matching category") changed
// Description/ClearDescription to the same omit=unchanged convention as categoryId/
// clearCategory (spec drift D1 in the design doc is now moot: the original two options were
// "add a schema v4 description column" or "accept that editing a prompt erases its remotely-set
// description" — but since the server now leaves description untouched when the field is
// omitted, this app (schema v3, no local description column) can simply never send it and never
// lose data). If a future task adds a local description column, extend this type with
// `description?: string` and `clearDescription?: true` and mirror buildPayload's category logic.
export type PromptPayload = {
  title: string
  content: string
  categoryId?: string
  categoryName?: string
  clearCategory?: true
}

// PromptDetailResponse sent as SyncPushResponse.remote (conflicts only). categoryName is
// always null here — only categoryId is filled (spec §0 C19).
export type RemotePrompt = {
  promptId: string
  title: string
  content: string
  description: string | null
  categoryId: string | null
  categoryName: string | null
  version: number
  isDeleted: boolean
}

// AioKin ResolveConflictResponse (Models/ViewModel/Vault/ResolveConflictResponse.cs).
export type ResolveResponse = { promptId: string; newVersion: number; isDeleted: boolean }

type PushEntry = {
  promptId: string
  operation: OutboxOperation
  baseVersion: number
  payload: PromptPayload | null
}

type PushResult = {
  promptId: string
  status: 'applied' | 'conflict' | 'rejected'
  newVersion?: number | null
  remote?: RemotePrompt | null
  conflictId?: string | null
  error?: string | null
}

type PushBatchResponse = {
  results: PushResult[]
  appliedCount: number
  conflictCount: number
  rejectedCount: number
  hasFailures: boolean
}

export type PushOutcome = { applied: number; conflicts: number; rejected: number; remaining: boolean }

// SyncService rejects edits/deletes of someone else's prompt by a non-manager with
// "Ban khong co quyen sua/xoa prompt nay." — permanent. Every other rejection may be a
// transient server fault (spec §0 C3, gap G14), so it is retried on a later run.
export const PERMISSION_REJECTED_PREFIX = 'Ban khong co quyen'

export async function buildPayload(
  spaceId: string,
  prompt: { title: string; content: string; category: string | null },
  mode: 'insert' | 'update',
): Promise<PromptPayload> {
  const payload: PromptPayload = { title: prompt.title, content: prompt.content }
  if (prompt.category) {
    payload.categoryId = await categoryIdFor(spaceId, prompt.category)
    payload.categoryName = prompt.category
  } else if (mode === 'update') {
    payload.clearCategory = true
  }
  return payload
}

// The next pull of this space returns a full snapshot (since = 0 always does, spec §0 C10),
// which overwrites every prompt that has no pending row or open conflict.
export async function forceSnapshot(db: SQLiteDatabase, spaceId: string): Promise<void> {
  await db.runAsync('UPDATE sync_state SET cursor = 0 WHERE space_id = ?', spaceId)
}

function sameContent(sent: PromptPayload, remote: RemotePrompt): boolean {
  return (
    !remote.isDeleted &&
    sent.title === remote.title &&
    sent.content === remote.content &&
    (sent.categoryId?.toLowerCase() ?? null) === (remote.categoryId?.toLowerCase() ?? null)
  )
}

async function unclaim(db: SQLiteDatabase, seq: number): Promise<void> {
  await db.runAsync('UPDATE sync_outbox SET in_flight = 0 WHERE seq = ?', seq)
}

async function markApplied(
  db: SQLiteDatabase,
  promptId: string,
  seq: number,
  newVersion: number | null,
): Promise<void> {
  await db.withTransactionAsync(async () => {
    if (newVersion === null) {
      await completeRow(db, seq) // e.g. delete of a prompt the server never had (spec §0 C21)
      return
    }
    // completeRow also rebases edits queued while this row was in flight (Task 13).
    await completeRow(db, seq, newVersion)
    await db.runAsync(
      'UPDATE prompts SET version = ?, synced_at = ?, has_conflict = 0 WHERE id = ?',
      newVersion,
      Date.now(),
      promptId,
    )
  })
}

async function recordConflict(
  db: SQLiteDatabase,
  spaceId: string,
  seq: number,
  promptId: string,
  conflictId: string,
  payload: PromptPayload | null,
  remote: RemotePrompt,
): Promise<void> {
  await db.withTransactionAsync(async () => {
    await completeRow(db, seq)
    await db.runAsync(
      `INSERT OR REPLACE INTO sync_conflicts
         (conflict_id, space_id, prompt_id, local_payload, remote_payload, remote_version, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      conflictId,
      spaceId,
      promptId,
      payload ? JSON.stringify(payload) : null,
      JSON.stringify(remote),
      remote.version,
      Date.now(),
    )
    await db.runAsync('UPDATE prompts SET has_conflict = 1 WHERE id = ?', promptId)
  })
}

export async function pushSpace(
  spaceId: string,
  options: { batchSize?: number; skipSeqs?: Set<number> } = {},
): Promise<PushOutcome> {
  const batchSize = options.batchSize ?? 50
  const skipSeqs = options.skipSeqs ?? new Set<number>()
  const outcome: PushOutcome = { applied: 0, conflicts: 0, rejected: 0, remaining: false }
  const db = await getDb()
  const rows = await claimBatch(db, spaceId, batchSize, [...skipSeqs])
  if (rows.length === 0) return outcome

  const entries: PushEntry[] = []
  const sent = new Map<string, { seq: number; operation: OutboxOperation; payload: PromptPayload | null }>()

  for (const row of rows) {
    // claimBatch filters on prompts.has_conflict, which a locally deleted prompt no longer has.
    const blocked = await db.getFirstAsync<{ conflict_id: string }>(
      'SELECT conflict_id FROM sync_conflicts WHERE prompt_id = ?',
      row.prompt_id,
    )
    if (blocked) {
      await unclaim(db, row.seq) // waits for the user to resolve (Task 18)
      continue
    }
    let payload: PromptPayload | null = null
    if (row.operation !== 'delete') {
      const prompt = await db.getFirstAsync<{ title: string; content: string; category: string | null }>(
        'SELECT title, content, category FROM prompts WHERE id = ?',
        row.prompt_id,
      )
      if (!prompt) {
        await completeRow(db, row.seq) // deleted locally meanwhile; its delete row follows
        continue
      }
      payload = await buildPayload(spaceId, prompt, row.operation)
    }
    entries.push({ promptId: row.prompt_id, operation: row.operation, baseVersion: row.base_version, payload })
    sent.set(row.prompt_id.toLowerCase(), { seq: row.seq, operation: row.operation, payload })
  }

  if (entries.length === 0) return outcome

  let response: PushBatchResponse
  try {
    response = await apiClient.post<PushBatchResponse>(
      '/sync/push',
      { spaceUuid: spaceId, entities: entries },
      { auth: true },
    )
  } catch (error) {
    await releaseRows(
      db,
      [...sent.values()].map((s) => s.seq),
      error instanceof Error ? error.message : String(error),
    )
    throw error
  }

  const answered = new Set<string>()
  let followUp = false

  // HTTP 200 / success:true even when entries failed — read every result (spec §0 C1).
  for (const result of response.results) {
    const key = result.promptId.toLowerCase()
    const entry = sent.get(key)
    if (!entry) continue
    answered.add(key)

    if (result.status === 'applied') {
      await markApplied(db, result.promptId, entry.seq, result.newVersion ?? null)
      outcome.applied += 1
      if (await hasPending(db, result.promptId)) followUp = true // a rebased edit is now claimable
      continue
    }

    if (result.status === 'rejected') {
      outcome.rejected += 1
      if (result.error?.startsWith(PERMISSION_REJECTED_PREFIX)) {
        // Not this user's prompt to change (spec §0 C18). Drop the edit; the snapshot pulled
        // right after this push restores the server copy.
        await db.withTransactionAsync(async () => {
          await completeRow(db, entry.seq)
          await forceSnapshot(db, spaceId)
        })
      } else {
        // Possibly-transient server fault (spec §0 C3, gap G14) — keep the row for a later
        // sync run, but skip it for the rest of *this* run so it doesn't jam the queue.
        await releaseRows(db, [entry.seq], `rejected: ${result.error ?? ''}`)
        skipSeqs.add(entry.seq)
      }
      continue
    }

    if (result.status !== 'conflict' || !result.conflictId || !result.remote) {
      await releaseRows(db, [entry.seq], `unexpected_result: ${result.status}`)
      skipSeqs.add(entry.seq)
      continue
    }

    const remote = result.remote
    // Both sides already agree — our delete vs a remote delete, or identical content (e.g.
    // the same edit made on two devices). keep_remote writes nothing server-side and is
    // allowed for every member, so nothing is chosen over anything (no LWW).
    const identical =
      entry.operation === 'delete'
        ? remote.isDeleted
        : entry.payload !== null && sameContent(entry.payload, remote)
    if (identical) {
      try {
        const resolved = await apiClient.post<ResolveResponse>(
          `/sync/conflicts/${result.conflictId}/resolve`,
          { resolution: 'keep_remote' },
          { auth: true },
        )
        await markApplied(db, result.promptId, entry.seq, resolved.newVersion)
        outcome.applied += 1
        continue
      } catch {
        // Could not auto-resolve — show it to the user like any other conflict.
      }
    }

    await recordConflict(db, spaceId, entry.seq, result.promptId, result.conflictId, entry.payload, remote)
    outcome.conflicts += 1
  }

  const unanswered = [...sent.entries()].filter(([key]) => !answered.has(key)).map(([, s]) => s.seq)
  if (unanswered.length > 0) {
    await releaseRows(db, unanswered, 'no_result')
    for (const seq of unanswered) skipSeqs.add(seq)
  }

  outcome.remaining = rows.length === batchSize || followUp
  return outcome
}
