import { getDb } from './db'
import {
  claimBatch,
  completeRow,
  enqueue,
  hasPending,
  pendingCount,
  releaseRows,
  resetInFlight,
} from './outbox'

type Row = { prompt_id: string; operation: string; base_version: number; in_flight: number }

async function rows(): Promise<Row[]> {
  const db = await getDb()
  return db.getAllAsync<Row>(
    'SELECT prompt_id, operation, base_version, in_flight FROM sync_outbox ORDER BY seq',
  )
}

beforeEach(async () => {
  const db = await getDb()
  await db.execAsync('DELETE FROM sync_outbox')
})

describe('enqueue coalescing', () => {
  it('insert then update stays a single insert', async () => {
    const db = await getDb()
    await enqueue(db, 's', 'p', 'insert', 0)
    await enqueue(db, 's', 'p', 'update', 0)
    expect(await rows()).toEqual([{ prompt_id: 'p', operation: 'insert', base_version: 0, in_flight: 0 }])
  })

  it('insert then delete removes the row — the server never saw it', async () => {
    const db = await getDb()
    await enqueue(db, 's', 'p', 'insert', 0)
    await enqueue(db, 's', 'p', 'delete', 0)
    expect(await rows()).toEqual([])
  })

  it('update then update keeps the original base version', async () => {
    const db = await getDb()
    await enqueue(db, 's', 'p', 'update', 3)
    await enqueue(db, 's', 'p', 'update', 3)
    expect(await rows()).toEqual([{ prompt_id: 'p', operation: 'update', base_version: 3, in_flight: 0 }])
  })

  it('update then delete becomes a delete on the same base', async () => {
    const db = await getDb()
    await enqueue(db, 's', 'p', 'update', 3)
    await enqueue(db, 's', 'p', 'delete', 3)
    expect(await rows()).toEqual([{ prompt_id: 'p', operation: 'delete', base_version: 3, in_flight: 0 }])
  })

  it('never touches an in-flight row — a new row is queued instead', async () => {
    const db = await getDb()
    await enqueue(db, 's', 'p', 'insert', 0)
    await claimBatch(db, 's', 50)
    await enqueue(db, 's', 'p', 'update', 0)
    expect(await rows()).toEqual([
      { prompt_id: 'p', operation: 'insert', base_version: 0, in_flight: 1 },
      { prompt_id: 'p', operation: 'update', base_version: 0, in_flight: 0 },
    ])
  })
})

describe('claim / release', () => {
  it('claims oldest rows of one space and releases them with the error', async () => {
    const db = await getDb()
    await enqueue(db, 's1', 'a', 'insert', 0)
    await enqueue(db, 's2', 'b', 'insert', 0)
    await enqueue(db, 's1', 'c', 'insert', 0)

    const batch = await claimBatch(db, 's1', 1)
    expect(batch.map((r) => r.prompt_id)).toEqual(['a'])

    await releaseRows(db, batch.map((r) => r.seq), 'network')
    const released = await db.getFirstAsync(
      "SELECT in_flight, attempts, last_error FROM sync_outbox WHERE prompt_id = 'a'",
    )
    expect(released).toEqual({ in_flight: 0, attempts: 1, last_error: 'network' })
    expect(await pendingCount(db)).toBe(3)
    expect(await hasPending(db, 'b')).toBe(true)
  })

  it('resetInFlight recovers rows left in flight by a killed app', async () => {
    const db = await getDb()
    await enqueue(db, 's', 'p', 'insert', 0)
    await claimBatch(db, 's', 50)
    await resetInFlight(db)
    expect((await rows())[0]?.in_flight).toBe(0)
  })

  // Fix round 1 (Review Focus regression): a failed push releases a prompt's row back to
  // in_flight = 0, but if an edit was queued behind it while it was in flight, a later
  // claimBatch must not hand back both rows in the same batch — only completeRow() rebasing
  // the queued row onto the acknowledged version makes it safe to push.
  it('claims only the oldest row per prompt — a row released after a failed push does not surface a row queued behind it', async () => {
    const db = await getDb()
    await enqueue(db, 's', 'p', 'insert', 0)
    const claimed = await claimBatch(db, 's', 50)
    expect(claimed.map((r) => r.operation)).toEqual(['insert'])

    // Edited while the insert is in flight — queued as its own row (coalescing rule).
    await enqueue(db, 's', 'p', 'update', 0)

    // The push fails; the insert row goes back to in_flight = 0.
    await releaseRows(
      db,
      claimed.map((r) => r.seq),
      'network',
    )

    // Both rows are now in_flight = 0, but only the oldest (the insert) may be claimed again —
    // the update must wait for the insert to complete and rebase it.
    const reclaimed = await claimBatch(db, 's', 50)
    expect(reclaimed.map((r) => r.operation)).toEqual(['insert'])
    expect(await rows()).toEqual([
      { prompt_id: 'p', operation: 'insert', base_version: 0, in_flight: 1 },
      { prompt_id: 'p', operation: 'update', base_version: 0, in_flight: 0 },
    ])
  })

  // P12: a prompt with an open conflict must never be able to sit at the head of the queue
  // and starve newer, unrelated rows out of every batch.
  it('excludes rows whose prompt has an open conflict, even when there are more of them than the batch size', async () => {
    const db = await getDb()
    await db.runAsync(
      "INSERT OR IGNORE INTO spaces (id, kind, name, can_manage, created_at) VALUES ('s', 'personal', 'S', 1, 0)",
    )
    await db.execAsync("DELETE FROM prompts WHERE id LIKE 'p12-%'")
    const limit = 3
    for (let i = 0; i < limit + 2; i += 1) {
      const promptId = `p12-conflicted-${i}`
      await db.runAsync(
        `INSERT INTO prompts (id, space_id, title, content, is_favorite, copy_count, created_at, updated_at, version, has_conflict)
         VALUES (?, 's', 't', 'c', 0, 0, ?, ?, 1, 1)`,
        promptId,
        i,
        i,
      )
      await enqueue(db, 's', promptId, 'update', 0)
    }
    await enqueue(db, 's', 'p12-clean', 'insert', 0)

    const batch = await claimBatch(db, 's', limit)
    expect(batch.map((r) => r.prompt_id)).toEqual(['p12-clean'])
  })
})

// Review Focus (Tasks 13/14): a prompt edited while its insert is in flight must not have the
// edit lost or merged into the in-flight row (covered above by "never touches an in-flight
// row"), and once the insert is acknowledged, the queued edit's base_version must follow the
// insert's newVersion rather than staying pinned to the stale pre-push value.
describe('completeRow rebases queued rows onto an acknowledged version', () => {
  it('an edit queued while the insert was in flight picks up the acknowledged version as its base', async () => {
    const db = await getDb()
    await enqueue(db, 's', 'p', 'insert', 0)
    const [inserted] = await claimBatch(db, 's', 50)
    if (!inserted) throw new Error('expected a claimed row')

    // Edited while the insert is still in flight — a brand-new row, per coalescing rules.
    await enqueue(db, 's', 'p', 'update', 0)
    expect(await rows()).toEqual([
      { prompt_id: 'p', operation: 'insert', base_version: 0, in_flight: 1 },
      { prompt_id: 'p', operation: 'update', base_version: 0, in_flight: 0 },
    ])

    // The insert is acknowledged with a server-assigned version.
    await completeRow(db, inserted.seq, 7)

    expect(await rows()).toEqual([{ prompt_id: 'p', operation: 'update', base_version: 7, in_flight: 0 }])
  })

  it('completeRow without a newVersion (e.g. a delete ack) leaves other queued rows untouched', async () => {
    const db = await getDb()
    await enqueue(db, 's', 'p', 'insert', 0)
    const [inserted] = await claimBatch(db, 's', 50)
    if (!inserted) throw new Error('expected a claimed row')
    await enqueue(db, 's', 'p', 'update', 0)

    await completeRow(db, inserted.seq)

    expect(await rows()).toEqual([{ prompt_id: 'p', operation: 'update', base_version: 0, in_flight: 0 }])
  })
})
