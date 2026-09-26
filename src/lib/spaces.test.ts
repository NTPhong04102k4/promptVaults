jest.mock('@/services/apiClient', () => ({
  apiClient: { get: jest.fn(), post: jest.fn() },
}))

import { apiClient } from '@/services/apiClient'

import { getDb, LOCAL_SPACE_ID } from './db'
import { createTeamSpace, fetchAndStoreMySpaces, listSpaces, wipeSyncedSpaces } from './spaces'

const personal = {
  spaceUuid: 'aaaaaaaa-0000-4000-8000-000000000001',
  spaceType: 'Personal',
  name: 'Personal',
  canManage: true,
  createdAtMillis: 10,
}
const team = {
  spaceUuid: 'bbbbbbbb-0000-4000-8000-000000000002',
  spaceType: 'Team',
  name: 'Team A',
  canManage: false,
  createdAtMillis: 20,
}

beforeEach(async () => {
  jest.clearAllMocks()
  const db = await getDb()
  await db.execAsync(`
    DELETE FROM prompts; DELETE FROM sync_outbox; DELETE FROM sync_state; DELETE FROM sync_conflicts;
    DELETE FROM spaces WHERE kind <> 'local';
  `)
})

describe('spaces', () => {
  it('mirrors /spaces/me and keeps the local space first', async () => {
    ;(apiClient.get as jest.Mock).mockResolvedValue([team, personal])

    const remote = await fetchAndStoreMySpaces()

    expect(apiClient.get).toHaveBeenCalledWith('/spaces/me', { auth: true })
    expect(remote.map((s) => s.kind)).toEqual(['team', 'personal'])
    expect((await listSpaces()).map((s) => s.id)).toEqual([
      LOCAL_SPACE_ID,
      personal.spaceUuid,
      team.spaceUuid,
    ])
  })

  it('removes spaces the user lost access to, with their prompts and outbox', async () => {
    ;(apiClient.get as jest.Mock).mockResolvedValueOnce([personal, team])
    await fetchAndStoreMySpaces()
    const db = await getDb()
    await db.runAsync(
      "INSERT INTO prompts (id, space_id, title, content, created_at, updated_at) VALUES ('p1', ?, 't', 'c', 1, 1)",
      team.spaceUuid,
    )
    await db.runAsync(
      "INSERT INTO sync_outbox (space_id, prompt_id, operation, base_version, created_at) VALUES (?, 'p1', 'insert', 0, 1)",
      team.spaceUuid,
    )

    ;(apiClient.get as jest.Mock).mockResolvedValueOnce([personal])
    await fetchAndStoreMySpaces()

    expect(await db.getFirstAsync('SELECT id FROM prompts WHERE id = ?', 'p1')).toBeNull()
    expect(await db.getFirstAsync('SELECT seq FROM sync_outbox')).toBeNull()
    expect((await listSpaces()).map((s) => s.kind)).toEqual(['local', 'personal'])
  })

  it('ignores space types it does not know', async () => {
    ;(apiClient.get as jest.Mock).mockResolvedValue([personal, { ...team, spaceType: 'Galaxy' }])
    expect(await fetchAndStoreMySpaces()).toHaveLength(1)
  })

  it('creates a team space (the creator is Owner, so canManage is true)', async () => {
    ;(apiClient.post as jest.Mock).mockResolvedValue({ ...team, canManage: true })
    const space = await createTeamSpace('Team A')
    expect(apiClient.post).toHaveBeenCalledWith('/spaces/team', { name: 'Team A' }, { auth: true })
    expect(space).toEqual({ id: team.spaceUuid, kind: 'team', name: 'Team A', canManage: true, createdAt: 20 })
  })

  it('wipeSyncedSpaces keeps only the local space and its prompts', async () => {
    ;(apiClient.get as jest.Mock).mockResolvedValue([personal])
    await fetchAndStoreMySpaces()
    const db = await getDb()
    await db.runAsync(
      "INSERT INTO prompts (id, space_id, title, content, created_at, updated_at) VALUES ('mine', ?, 't', 'c', 1, 1), ('synced', ?, 't', 'c', 1, 1)",
      LOCAL_SPACE_ID,
      personal.spaceUuid,
    )

    await wipeSyncedSpaces()

    const ids = (await db.getAllAsync<{ id: string }>('SELECT id FROM prompts')).map((r) => r.id)
    expect(ids).toEqual(['mine'])
    expect((await listSpaces()).map((s) => s.kind)).toEqual(['local'])
  })
})
