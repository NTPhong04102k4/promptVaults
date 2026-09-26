import type { SQLiteDatabase } from 'expo-sqlite'

import { apiClient } from '@/services/apiClient'

import { categoryNameFor } from './categoryId'
import { getDb } from './db'
import { hasPending } from './outbox'

// AioKin SyncPullResponse (Models/ViewModel/Vault/SyncPullResponse.cs), camelCase.
type ChangePrompt = {
  title: string
  content: string
  description: string | null
  categoryId: string | null
  isDeleted: boolean
}

type ChangeItem = {
  syncLogId: number
  entityType: string
  entityId: string
  operation: string // 'insert' | 'update' | 'delete'
  version: number
  tagsVariablesOnly: boolean
  prompt: ChangePrompt | null // null only for a hard 'delete'
}

type PullResponse = {
  isSnapshot: boolean
  snapshotJson: string | null
  changes: ChangeItem[]
  resumeCursor: number
}

export type SnapshotPrompt = {
  promptId: string
  title: string
  content: string
  categoryId: string | null
  version: number
}

// undefined = "could not name this id" → keep the local category (spec §9).
type ResolvedCategory = string | null | undefined

type Prepared =
  | { id: string; deleted: true }
  | { id: string; deleted: false; title: string; content: string; category: ResolvedCategory; version: number }

// snapshotJson is written with default System.Text.Json options, i.e. PascalCase keys
// (SyncService.BuildSnapshotFallbackAsync) — read either casing.
function field(source: Record<string, unknown>, camel: string): unknown {
  if (camel in source) return source[camel]
  return source[camel.charAt(0).toUpperCase() + camel.slice(1)]
}

export function parseSnapshot(json: string): SnapshotPrompt[] {
  const root = JSON.parse(json) as Record<string, unknown>
  const prompts = (field(root, 'prompts') ?? []) as Record<string, unknown>[]
  return prompts.map((p) => ({
    promptId: String(field(p, 'promptId')),
    title: String(field(p, 'title') ?? ''),
    content: String(field(p, 'content') ?? ''),
    categoryId: (field(p, 'categoryId') as string | null | undefined) ?? null,
    version: Number(field(p, 'version') ?? 0),
  }))
}

// Derived ids of PROMPT_CATEGORIES first (no network), then the space's categories list,
// fetched at most once per pull (GET /prompts/categories, spec §0 C24).
function categoryResolver(spaceId: string): (categoryId: string | null) => Promise<ResolvedCategory> {
  let remote: Map<string, string> | null = null
  return async (categoryId) => {
    if (!categoryId) return null
    const derived = await categoryNameFor(spaceId, categoryId)
    if (derived) return derived
    if (!remote) {
      try {
        const list = await apiClient.get<{ id: string; name: string }[]>(
          `/prompts/categories?spaceUuid=${encodeURIComponent(spaceId)}`,
          { auth: true },
        )
        remote = new Map(list.map((c) => [c.id.toLowerCase(), c.name]))
      } catch {
        remote = new Map()
      }
    }
    return remote.get(categoryId.toLowerCase())
  }
}

// Task 17 fix round 1 (issue 3): the space may have been wiped (e.g. a sign-out) while this
// pull's network round trip was in flight. Never resurrect its rows once the space itself is
// gone — awaitIdle() in the sign-out path already closes most of this race; this is the cheap
// second guard for whatever's left.
async function spaceExists(db: SQLiteDatabase, spaceId: string): Promise<boolean> {
  const row = await db.getFirstAsync<{ id: string }>('SELECT id FROM spaces WHERE id = ?', spaceId)
  return row !== null
}

export async function getCursor(spaceId: string): Promise<number> {
  const db = await getDb()
  const row = await db.getFirstAsync<{ cursor: number }>(
    'SELECT cursor FROM sync_state WHERE space_id = ?',
    spaceId,
  )
  return row?.cursor ?? 0
}

async function setCursor(db: SQLiteDatabase, spaceId: string, cursor: number): Promise<void> {
  await db.runAsync(
    `INSERT INTO sync_state (space_id, cursor, last_pulled_at) VALUES (?, ?, ?)
     ON CONFLICT(space_id) DO UPDATE SET cursor = excluded.cursor, last_pulled_at = excluded.last_pulled_at`,
    spaceId,
    cursor,
    Date.now(),
  )
}

// Pending outbox rows win locally (the push surfaces any divergence); an open conflict's local
// row is "your version" on the conflict screen and must not be silently overwritten by a pull
// row for the same entity (verified: the backend does NOT filter pull changes by conflict
// state server-side — SyncService.PullAsync builds `changes` purely from sync_log rows, so this
// guard is entirely the client's responsibility).
async function isLocked(db: SQLiteDatabase, promptId: string): Promise<boolean> {
  if (await hasPending(db, promptId)) return true
  const conflict = await db.getFirstAsync<{ conflict_id: string }>(
    'SELECT conflict_id FROM sync_conflicts WHERE prompt_id = ? LIMIT 1',
    promptId,
  )
  return conflict !== null
}

// Keeps is_favorite and copy_count — device-local (spec §9).
//
// Version gate is a strict `>`, not `>=`. Verified live against the backend (commit 7bd1ba6,
// "AddPromptMetaSig", D:\user\Projects\AioKin\AioKin): `vault.prompts` has a
// `before update` trigger (db/init-postgres.sql) that bumps `version` by exactly 1 whenever it
// fires — and it now fires on a `meta_sig` change too, which `SyncService.ComputeMetaSig` sets
// whenever tags/variables are touched (PushInsertAsync, ApplyUpdateOrConflictAsync,
// ApplyResolvedPayloadAsync). The old P12 workaround this app's brief was written against
// (`AddTagVariableSyncLogEntry`, which wrote a manual sync_log row that KEPT the prompt's
// current version, so two sync_log rows for one entity could share a version) was deleted in
// that same commit. Two sync_log rows for the same prompt can therefore no longer legitimately
// carry the same version, so `>=` is no longer needed — a plain `>` is correct and simpler, and
// also gives an extra safety margin: a redelivered or equal-version row is never re-applied.
async function upsertRemote(
  db: SQLiteDatabase,
  spaceId: string,
  id: string,
  fields: { title: string; content: string; category: ResolvedCategory; version: number },
): Promise<void> {
  const now = Date.now()
  const keepLocalCategory = fields.category === undefined
  await db.runAsync(
    `INSERT INTO prompts (id, space_id, title, content, category, is_favorite, copy_count,
                          created_at, updated_at, synced_at, version, has_conflict)
     VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, 0)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       content = excluded.content,
       category = ${keepLocalCategory ? 'prompts.category' : 'excluded.category'},
       updated_at = excluded.updated_at,
       synced_at = excluded.synced_at,
       version = excluded.version
     WHERE excluded.version > prompts.version`,
    id,
    spaceId,
    fields.title,
    fields.content,
    fields.category ?? null,
    now,
    now,
    now,
    fields.version,
  )
}

async function applySnapshot(db: SQLiteDatabase, spaceId: string, response: PullResponse): Promise<number> {
  const prompts = parseSnapshot(response.snapshotJson ?? '{}')
  const resolveCategory = categoryResolver(spaceId)
  const categories = new Map<string, ResolvedCategory>()
  for (const p of prompts) categories.set(p.promptId, await resolveCategory(p.categoryId))

  let applied = 0
  await db.withTransactionAsync(async () => {
    if (!(await spaceExists(db, spaceId))) return
    const keep = new Set(prompts.map((p) => p.promptId.toLowerCase()))
    const local = await db.getAllAsync<{ id: string }>('SELECT id FROM prompts WHERE space_id = ?', spaceId)
    for (const { id } of local) {
      if (!keep.has(id.toLowerCase()) && !(await isLocked(db, id))) {
        await db.runAsync('DELETE FROM prompts WHERE id = ?', id)
      }
    }
    for (const p of prompts) {
      if (await isLocked(db, p.promptId)) continue
      await upsertRemote(db, spaceId, p.promptId, {
        title: p.title,
        content: p.content,
        category: categories.get(p.promptId),
        version: p.version,
      })
      applied += 1
    }
    await setCursor(db, spaceId, response.resumeCursor)
  })
  return applied
}

export async function pullSpace(spaceId: string): Promise<{ applied: number; snapshot: boolean }> {
  const db = await getDb()
  const since = await getCursor(spaceId)
  const response = await apiClient.get<PullResponse>(
    `/sync/pull?spaceUuid=${encodeURIComponent(spaceId)}&since=${since}`,
    { auth: true },
  )

  if (response.isSnapshot) {
    return { applied: await applySnapshot(db, spaceId, response), snapshot: true }
  }

  // Category names may need network/hashing — resolve before opening the transaction.
  const resolveCategory = categoryResolver(spaceId)
  const prepared: Prepared[] = []
  for (const item of response.changes) {
    if (item.entityType !== 'prompt') continue
    // tagsVariablesOnly is effectively dead on the current backend (the manual "kind":
    // "tags_variables" sync_log row it used to mark was removed by the meta_sig follow-up —
    // see upsertRemote's comment) but the DTO still carries the field, so keep skipping it
    // defensively: were it ever true again, its accompanying payload would be a live-row
    // hydration, not real history, and must never be applied verbatim.
    if (item.tagsVariablesOnly) continue
    if (item.operation === 'delete' || !item.prompt || item.prompt.isDeleted) {
      prepared.push({ id: item.entityId, deleted: true })
      continue
    }
    prepared.push({
      id: item.entityId,
      deleted: false,
      title: item.prompt.title,
      content: item.prompt.content,
      category: await resolveCategory(item.prompt.categoryId),
      version: item.version,
    })
  }

  let applied = 0
  await db.withTransactionAsync(async () => {
    if (!(await spaceExists(db, spaceId))) return
    for (const change of prepared) {
      if (await isLocked(db, change.id)) continue
      if (change.deleted) {
        await db.runAsync('DELETE FROM prompts WHERE id = ? AND space_id = ?', change.id, spaceId)
      } else {
        await upsertRemote(db, spaceId, change.id, change)
      }
      applied += 1
    }
    await setCursor(db, spaceId, response.resumeCursor)
  })
  return { applied, snapshot: false }
}
