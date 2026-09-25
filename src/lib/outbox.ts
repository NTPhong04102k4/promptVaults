import type { SQLiteDatabase } from 'expo-sqlite'

export type OutboxOperation = 'insert' | 'update' | 'delete'

export type OutboxRow = {
  seq: number
  space_id: string
  prompt_id: string
  operation: OutboxOperation
  base_version: number
  attempts: number
}

// Coalesces against the prompt's pending row that is NOT in flight (spec §11.1). An
// in-flight row is never modified, so an edit made during a push is never lost.
// Caller owns the transaction.
export async function enqueue(
  db: SQLiteDatabase,
  spaceId: string,
  promptId: string,
  operation: OutboxOperation,
  baseVersion: number,
): Promise<void> {
  const pending = await db.getFirstAsync<{ seq: number; operation: OutboxOperation }>(
    'SELECT seq, operation FROM sync_outbox WHERE prompt_id = ? AND in_flight = 0 ORDER BY seq DESC LIMIT 1',
    promptId,
  )

  if (!pending) {
    await db.runAsync(
      'INSERT INTO sync_outbox (space_id, prompt_id, operation, base_version, created_at) VALUES (?, ?, ?, ?, ?)',
      spaceId,
      promptId,
      operation,
      baseVersion,
      Date.now(),
    )
    return
  }

  if (pending.operation === 'insert' && operation === 'delete') {
    // Dropping the row is only safe if no earlier copy is already on its way to the server.
    const inFlight = await db.getFirstAsync<{ seq: number }>(
      'SELECT seq FROM sync_outbox WHERE prompt_id = ? AND in_flight = 1',
      promptId,
    )
    if (inFlight) {
      await db.runAsync("UPDATE sync_outbox SET operation = 'delete' WHERE seq = ?", pending.seq)
    } else {
      await db.runAsync('DELETE FROM sync_outbox WHERE seq = ?', pending.seq)
    }
    return
  }

  if (pending.operation === 'update' && operation === 'delete') {
    await db.runAsync("UPDATE sync_outbox SET operation = 'delete' WHERE seq = ?", pending.seq)
  }
  // insert+update, update+update: the payload is built at push time from the current row.
}

// A prompt with an open conflict (has_conflict = 1, spec §11.2/§12) is excluded so a batch of
// old conflicted rows can never sit at the front of the queue and starve newer, unrelated rows
// from ever being pushed (Review Focus). The LEFT JOIN treats a prompt_id with no matching
// prompts row (already deleted, or a stale row in tests) as conflict-free rather than hiding it.
//
// One row per prompt, oldest first, and never a second row for a prompt that already has one
// in flight. Without this, releaseRows() after a failed push can hand back a prompt's insert
// row *and* an update row queued behind it (queued while the insert was in flight) in the same
// batch — the update would then be pushed with its stale pre-insert base_version instead of
// waiting for completeRow() to rebase it onto the insert's acknowledged version (Review Focus:
// a fix-round regression found this breaks after any single network failure).
export async function claimBatch(
  db: SQLiteDatabase,
  spaceId: string,
  limit: number,
): Promise<OutboxRow[]> {
  const rows = await db.getAllAsync<OutboxRow>(
    `SELECT o.seq, o.space_id, o.prompt_id, o.operation, o.base_version, o.attempts
     FROM sync_outbox o
     LEFT JOIN prompts p ON p.id = o.prompt_id
     WHERE o.space_id = ? AND o.in_flight = 0 AND COALESCE(p.has_conflict, 0) = 0
       AND NOT EXISTS (
         SELECT 1 FROM sync_outbox o2
         WHERE o2.prompt_id = o.prompt_id AND (o2.in_flight = 1 OR o2.seq < o.seq)
       )
     ORDER BY o.seq LIMIT ?`,
    spaceId,
    limit,
  )
  for (const row of rows) {
    await db.runAsync('UPDATE sync_outbox SET in_flight = 1 WHERE seq = ?', row.seq)
  }
  return rows
}

// newVersion, when given, is the server-assigned version from a push acknowledgement (spec
// §11.2). Any other queued (non in-flight) row for the same prompt was necessarily enqueued
// before that ack landed — e.g. an edit made while this row was in flight — so its
// base_version is still the pre-push value and must be rebased onto newVersion. Otherwise the
// next push round would send a stale baseVersion and manufacture a spurious conflict against
// an edit that never actually raced the server (Review Focus, Tasks 13/14).
export async function completeRow(
  db: SQLiteDatabase,
  seq: number,
  newVersion?: number,
): Promise<void> {
  if (newVersion !== undefined) {
    const row = await db.getFirstAsync<{ prompt_id: string }>(
      'SELECT prompt_id FROM sync_outbox WHERE seq = ?',
      seq,
    )
    if (row) {
      await db.runAsync(
        'UPDATE sync_outbox SET base_version = ? WHERE prompt_id = ? AND seq != ? AND in_flight = 0',
        newVersion,
        row.prompt_id,
        seq,
      )
    }
  }
  await db.runAsync('DELETE FROM sync_outbox WHERE seq = ?', seq)
}

export async function releaseRows(db: SQLiteDatabase, seqs: number[], error: string): Promise<void> {
  for (const seq of seqs) {
    await db.runAsync(
      'UPDATE sync_outbox SET in_flight = 0, attempts = attempts + 1, last_error = ? WHERE seq = ?',
      error,
      seq,
    )
  }
}

export async function resetInFlight(db: SQLiteDatabase): Promise<void> {
  await db.runAsync('UPDATE sync_outbox SET in_flight = 0 WHERE in_flight = 1')
}

export async function hasPending(db: SQLiteDatabase, promptId: string): Promise<boolean> {
  const row = await db.getFirstAsync<{ seq: number }>(
    'SELECT seq FROM sync_outbox WHERE prompt_id = ? LIMIT 1',
    promptId,
  )
  return row !== null
}

export async function pendingCount(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM sync_outbox')
  return row?.n ?? 0
}
