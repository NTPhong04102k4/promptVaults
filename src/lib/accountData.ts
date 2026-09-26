import { useSpaceStore } from '@/store/spaceStore'

import { getDb, LOCAL_SPACE_ID } from './db'
import { enqueue, pendingCount } from './outbox'
import { fetchAndStoreMySpaces, type Space, wipeSyncedSpaces } from './spaces'
import { setSignOutPending } from './tokenStore'

export async function prepareSignedInUser(userId: string): Promise<Space | null> {
  const { ownerUserId } = useSpaceStore.getState()
  if (ownerUserId !== null && ownerUserId !== userId) {
    await wipeSyncedSpaces()
    useSpaceStore.getState().reset()
  }
  useSpaceStore.getState().setOwner(userId)
  // A sign-out-pending marker left by a faulted earlier sign-out (Task 17 fix round 4) must not
  // fire against THIS legitimate sign-in on the next cold start. Safe to drop here: the owner
  // check above has already wiped any other account's leftover data (fix round 5). Done before
  // the network fetch below so an offline sign-in clears it too.
  await setSignOutPending(false)

  const spaces = await fetchAndStoreMySpaces()
  const personal = spaces.find((s) => s.kind === 'personal') ?? null
  if (personal && useSpaceStore.getState().currentSpaceId === LOCAL_SPACE_ID) {
    useSpaceStore.getState().setCurrentSpace(personal.id)
  }
  return personal
}

export async function countLocalPrompts(): Promise<number> {
  const db = await getDb()
  const row = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM prompts WHERE space_id = ?',
    LOCAL_SPACE_ID,
  )
  return row?.n ?? 0
}

// Spec §10.3: idempotent — adopted prompts leave the local space.
export async function adoptLocalPrompts(personalSpaceId: string): Promise<number> {
  const db = await getDb()
  let adopted = 0
  await db.withTransactionAsync(async () => {
    const rows = await db.getAllAsync<{ id: string }>(
      'SELECT id FROM prompts WHERE space_id = ?',
      LOCAL_SPACE_ID,
    )
    await db.runAsync(
      'UPDATE prompts SET space_id = ?, version = 0, synced_at = NULL WHERE space_id = ?',
      personalSpaceId,
      LOCAL_SPACE_ID,
    )
    for (const { id } of rows) await enqueue(db, personalSpaceId, id, 'insert', 0)
    adopted = rows.length
  })
  return adopted
}

export async function pendingChanges(): Promise<number> {
  return pendingCount(await getDb())
}

export async function clearSyncedData(): Promise<void> {
  await wipeSyncedSpaces()
  useSpaceStore.getState().reset()
}
