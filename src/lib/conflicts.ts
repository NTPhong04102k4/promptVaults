import type { SQLiteDatabase } from 'expo-sqlite'

import { apiClient, ApiError } from '@/services/apiClient'

import { categoryNameFor } from './categoryId'
import { getDb } from './db'
import { enqueue } from './outbox'
import { runSync } from './syncEngine'
import {
  buildPayload,
  forceSnapshot,
  type PromptPayload,
  type RemotePrompt,
  type ResolveResponse,
} from './syncPush'

export type ConflictRecord = {
  conflictId: string
  spaceId: string
  promptId: string
  local: PromptPayload | null // null = the local side was a delete
  remote: RemotePrompt // remote.isDeleted = deleted on another device
  remoteVersion: number
  createdAt: number
}

export type LocalVersion = {
  title: string
  content: string
  category: string | null
  updatedAt: number
}

export type ResolveOutcome = 'resolved' | 'requeued' | 'forbidden'

type Content = { title: string; content: string; category: string | null }

// What the user chose, re-expressed as a normal outbox operation when the server-side
// conflict can no longer be resolved (409/404, spec §0 C17).
type Choice = { kind: 'remote' } | { kind: 'content'; value: Content } | { kind: 'delete' }

type ConflictRow = {
  conflict_id: string
  space_id: string
  prompt_id: string
  local_payload: string | null
  remote_payload: string
  remote_version: number
  created_at: number
}

export async function getConflictForPrompt(promptId: string): Promise<ConflictRecord | null> {
  const db = await getDb()
  const row = await db.getFirstAsync<ConflictRow>(
    'SELECT * FROM sync_conflicts WHERE prompt_id = ? ORDER BY created_at DESC LIMIT 1',
    promptId,
  )
  if (!row) return null
  return {
    conflictId: row.conflict_id,
    spaceId: row.space_id,
    promptId: row.prompt_id,
    local: row.local_payload ? (JSON.parse(row.local_payload) as PromptPayload) : null,
    remote: JSON.parse(row.remote_payload) as RemotePrompt,
    remoteVersion: row.remote_version,
    createdAt: row.created_at,
  }
}

export async function getLocalVersion(promptId: string): Promise<LocalVersion | null> {
  const db = await getDb()
  const row = await db.getFirstAsync<{ title: string; content: string; category: string | null; updated_at: number }>(
    'SELECT title, content, category, updated_at FROM prompts WHERE id = ?',
    promptId,
  )
  return row ? { title: row.title, content: row.content, category: row.category, updatedAt: row.updated_at } : null
}

async function postResolve(
  c: ConflictRecord,
  body: { resolution: 'keep_local' | 'keep_remote' | 'merged'; mergedPayload?: PromptPayload },
): Promise<ResolveResponse | 'stale' | 'forbidden'> {
  try {
    return await apiClient.post<ResolveResponse>(`/sync/conflicts/${c.conflictId}/resolve`, body, { auth: true })
  } catch (error) {
    if (error instanceof ApiError) {
      // Only the author or a canManage member may keep_local/merged (spec §0 C18).
      if (error.status === 403 && body.resolution !== 'keep_remote') return 'forbidden'
      if (error.status === 404 || error.status === 409) return 'stale'
    }
    throw error // offline / 5xx: nothing changes, the user can retry
  }
}

async function writeContent(db: SQLiteDatabase, c: ConflictRecord, content: Content, version: number): Promise<void> {
  const now = Date.now()
  await db.runAsync(
    `INSERT INTO prompts (id, space_id, title, content, category, created_at, updated_at, synced_at, version, has_conflict)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
     ON CONFLICT(id) DO UPDATE SET title = excluded.title, content = excluded.content,
       category = excluded.category, updated_at = excluded.updated_at, synced_at = excluded.synced_at,
       version = excluded.version, has_conflict = 0`,
    c.promptId,
    c.spaceId,
    content.title,
    content.content,
    content.category,
    now,
    now,
    now,
    version,
  )
}

async function clearConflict(db: SQLiteDatabase, c: ConflictRecord): Promise<void> {
  await db.runAsync('DELETE FROM sync_outbox WHERE prompt_id = ?', c.promptId)
  await db.runAsync('DELETE FROM sync_conflicts WHERE conflict_id = ?', c.conflictId)
}

// Success path: the server's answer is authoritative for version and deletion (G8/G9 closed).
async function settle(c: ConflictRecord, resolved: ResolveResponse, content: Content | null): Promise<void> {
  const db = await getDb()
  await db.withTransactionAsync(async () => {
    await clearConflict(db, c)
    if (resolved.isDeleted) {
      await db.runAsync('DELETE FROM prompts WHERE id = ?', c.promptId)
    } else if (content) {
      await writeContent(db, c, content, resolved.newVersion)
    } else {
      await db.runAsync(
        'UPDATE prompts SET version = ?, has_conflict = 0, synced_at = ? WHERE id = ?',
        resolved.newVersion,
        Date.now(),
        c.promptId,
      )
    }
  })
  runSync().catch(() => undefined)
}

async function requeue(c: ConflictRecord, choice: Choice): Promise<void> {
  const db = await getDb()
  await db.withTransactionAsync(async () => {
    await clearConflict(db, c)
    if (choice.kind === 'remote') {
      await db.runAsync('UPDATE prompts SET has_conflict = 0 WHERE id = ?', c.promptId)
      await forceSnapshot(db, c.spaceId)
    } else if (choice.kind === 'delete') {
      await db.runAsync('DELETE FROM prompts WHERE id = ?', c.promptId)
      await enqueue(db, c.spaceId, c.promptId, 'delete', c.remoteVersion)
    } else {
      await writeContent(db, c, choice.value, c.remoteVersion)
      await enqueue(db, c.spaceId, c.promptId, 'update', c.remoteVersion)
    }
  })
  runSync().catch(() => undefined)
}

async function finish(
  c: ConflictRecord,
  answer: ResolveResponse | 'stale' | 'forbidden',
  content: Content | null,
  choice: Choice,
): Promise<ResolveOutcome> {
  if (answer === 'forbidden') return 'forbidden'
  if (answer === 'stale') {
    await requeue(c, choice)
    return 'requeued'
  }
  await settle(c, answer, content)
  return 'resolved'
}

export async function resolveKeepRemote(c: ConflictRecord): Promise<ResolveOutcome> {
  const answer = await postResolve(c, { resolution: 'keep_remote' })
  const local = await getLocalVersion(c.promptId)
  // A push conflict's remote carries categoryId only (categoryName is null, spec §0 C19):
  // name it from the app's derived ids, else keep the local name.
  let category: string | null = null
  if (c.remote.categoryId) {
    category = (await categoryNameFor(c.spaceId, c.remote.categoryId)) ?? local?.category ?? null
  }
  return finish(c, answer, { title: c.remote.title, content: c.remote.content, category }, { kind: 'remote' })
}

export async function resolveKeepLocal(c: ConflictRecord): Promise<ResolveOutcome> {
  const local = await getLocalVersion(c.promptId)

  if (!local) {
    // "Vẫn xoá": the server replays the stored local delete (G9 closed).
    const answer = await postResolve(c, { resolution: 'keep_local' })
    return finish(c, answer, null, { kind: 'delete' })
  }

  const content: Content = { title: local.title, content: local.content, category: local.category }
  const answer =
    local.updatedAt > c.createdAt
      ? await postResolve(c, { resolution: 'merged', mergedPayload: await buildPayload(c.spaceId, content, 'update') })
      : await postResolve(c, { resolution: 'keep_local' })
  return finish(c, answer, null, { kind: 'content', value: content })
}

export async function resolveMerged(c: ConflictRecord, merged: Content): Promise<ResolveOutcome> {
  const answer = await postResolve(c, {
    resolution: 'merged',
    mergedPayload: await buildPayload(c.spaceId, merged, 'update'),
  })
  return finish(c, answer, merged, { kind: 'content', value: merged })
}
