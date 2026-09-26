import type { SQLiteDatabase } from 'expo-sqlite'

import { apiClient } from '@/services/apiClient'

import { getDb } from './db'

export type SpaceKind = 'local' | 'personal' | 'family' | 'team'

export type Space = {
  id: string
  kind: SpaceKind
  name: string
  canManage: boolean
  createdAt: number
}

// AioKin SpaceResponse (AioKin/Models/ViewModel/Vault/SpaceResponse.cs).
type SpaceResponse = {
  spaceUuid: string
  spaceType: string
  name: string
  canManage: boolean
  createdAtMillis: number
}

type SpaceRow = { id: string; kind: SpaceKind; name: string; can_manage: number; created_at: number }

function fromRow(row: SpaceRow): Space {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    canManage: row.can_manage === 1,
    createdAt: row.created_at,
  }
}

function fromResponse(response: SpaceResponse): Space | null {
  const kind = response.spaceType.toLowerCase()
  if (kind !== 'personal' && kind !== 'family' && kind !== 'team') return null
  return {
    id: response.spaceUuid,
    kind,
    name: response.name,
    canManage: response.canManage,
    createdAt: response.createdAtMillis,
  }
}

async function upsertSpace(db: SQLiteDatabase, space: Space): Promise<void> {
  await db.runAsync(
    `INSERT INTO spaces (id, kind, name, can_manage, created_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, name = excluded.name, can_manage = excluded.can_manage`,
    space.id,
    space.kind,
    space.name,
    space.canManage ? 1 : 0,
    space.createdAt,
  )
}

// Caller owns the transaction.
async function removeSpaceData(db: SQLiteDatabase, spaceId: string): Promise<void> {
  await db.runAsync('DELETE FROM prompts WHERE space_id = ?', spaceId)
  await db.runAsync('DELETE FROM sync_outbox WHERE space_id = ?', spaceId)
  await db.runAsync('DELETE FROM sync_state WHERE space_id = ?', spaceId)
  await db.runAsync('DELETE FROM sync_conflicts WHERE space_id = ?', spaceId)
  await db.runAsync('DELETE FROM spaces WHERE id = ?', spaceId)
}

export async function listSpaces(): Promise<Space[]> {
  const db = await getDb()
  const rows = await db.getAllAsync<SpaceRow>(
    `SELECT id, kind, name, can_manage, created_at FROM spaces
     ORDER BY CASE kind WHEN 'local' THEN 0 WHEN 'personal' THEN 1 ELSE 2 END, created_at`,
  )
  return rows.map(fromRow)
}

export async function getSpace(id: string): Promise<Space | null> {
  const db = await getDb()
  const row = await db.getFirstAsync<SpaceRow>(
    'SELECT id, kind, name, can_manage, created_at FROM spaces WHERE id = ?',
    id,
  )
  return row ? fromRow(row) : null
}

// GET /spaces/me also auto-creates the personal space on the backend.
export async function fetchAndStoreMySpaces(): Promise<Space[]> {
  const response = await apiClient.get<SpaceResponse[]>('/spaces/me', { auth: true })
  const spaces = response.map(fromResponse).filter((s): s is Space => s !== null)
  const keep = new Set(spaces.map((s) => s.id))
  const db = await getDb()
  await db.withTransactionAsync(async () => {
    for (const space of spaces) await upsertSpace(db, space)
    const existing = await db.getAllAsync<{ id: string }>("SELECT id FROM spaces WHERE kind <> 'local'")
    for (const { id } of existing) {
      if (!keep.has(id)) await removeSpaceData(db, id)
    }
  })
  return spaces
}

export async function createTeamSpace(name: string): Promise<Space> {
  const response = await apiClient.post<SpaceResponse>('/spaces/team', { name }, { auth: true })
  const space = fromResponse(response)
  if (!space) throw new Error('unexpected_space_type')
  const db = await getDb()
  await upsertSpace(db, space)
  return space
}

export async function wipeSyncedSpaces(): Promise<void> {
  const db = await getDb()
  await db.withTransactionAsync(async () => {
    const synced = await db.getAllAsync<{ id: string }>("SELECT id FROM spaces WHERE kind <> 'local'")
    for (const { id } of synced) await removeSpaceData(db, id)
  })
}
