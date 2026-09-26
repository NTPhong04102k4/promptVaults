import * as SQLite from 'expo-sqlite'

import { getDb, LOCAL_SPACE_ID, migrate } from './db'

// The exact v2 schema shipped before this plan (db.ts DATABASE_VERSION = 2).
const V2_SCHEMA = `
  CREATE TABLE vaults (
    id TEXT PRIMARY KEY, name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('personal','group')), created_at INTEGER NOT NULL
  );
  CREATE TABLE prompts (
    id TEXT PRIMARY KEY, vault_id TEXT NOT NULL REFERENCES vaults(id),
    title TEXT NOT NULL, content TEXT NOT NULL, category TEXT, tags TEXT,
    is_favorite INTEGER DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
    synced_at INTEGER
  );
  CREATE VIRTUAL TABLE prompts_fts USING fts5(
    title, content, category, tags, content='prompts', content_rowid='rowid'
  );
  CREATE TRIGGER prompts_ai AFTER INSERT ON prompts BEGIN
    INSERT INTO prompts_fts(rowid, title, content, category, tags)
    VALUES (new.rowid, new.title, new.content, new.category, new.tags);
  END;
  CREATE TRIGGER prompts_ad AFTER DELETE ON prompts BEGIN
    INSERT INTO prompts_fts(prompts_fts, rowid, title, content, category, tags)
    VALUES ('delete', old.rowid, old.title, old.content, old.category, old.tags);
  END;
  CREATE TRIGGER prompts_au AFTER UPDATE ON prompts BEGIN
    INSERT INTO prompts_fts(prompts_fts, rowid, title, content, category, tags)
    VALUES ('delete', old.rowid, old.title, old.content, old.category, old.tags);
    INSERT INTO prompts_fts(rowid, title, content, category, tags)
    VALUES (new.rowid, new.title, new.content, new.category, new.tags);
  END;
  ALTER TABLE prompts ADD COLUMN copy_count INTEGER NOT NULL DEFAULT 0;
  INSERT INTO vaults VALUES ('00000000-0000-4000-8000-000000000001', 'Kho cá nhân', 'personal', 1);
  PRAGMA user_version = 2;
`

async function schemaNames(db: SQLite.SQLiteDatabase): Promise<string[]> {
  const rows = await db.getAllAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type IN ('table','trigger')",
  )
  return rows.map((r) => r.name)
}

describe('getDb (fresh install)', () => {
  it('creates schema v3 with the local space', async () => {
    const db = await getDb()
    const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version')
    expect(version?.user_version).toBe(3)

    const local = await db.getFirstAsync<{ kind: string; name: string }>(
      'SELECT kind, name FROM spaces WHERE id = ?',
      LOCAL_SPACE_ID,
    )
    expect(local).toEqual({ kind: 'local', name: 'Trên máy này' })

    const names = await schemaNames(db)
    expect(names).toEqual(
      expect.arrayContaining([
        'spaces', 'prompts', 'prompts_fts', 'sync_outbox', 'sync_state', 'sync_conflicts',
        'prompts_ai', 'prompts_ad', 'prompts_au',
      ]),
    )
    expect(names).not.toContain('vaults')

    const cols = (await db.getAllAsync<{ name: string }>("PRAGMA table_info('prompts')")).map((c) => c.name)
    expect(cols).toEqual(expect.arrayContaining(['space_id', 'version', 'has_conflict', 'copy_count']))
    expect(cols).not.toContain('vault_id')
  })

  it('rerunning migrate on an already-v3 database is a no-op (atomic/idempotent)', async () => {
    const db = await getDb()
    const before = await schemaNames(db)
    const beforeSpaces = await db.getAllAsync('SELECT * FROM spaces')

    // Re-running migrate against a DB already at DATABASE_VERSION must not attempt to
    // re-create the v3 tables (which would throw, since they're not IF NOT EXISTS) —
    // the version-gate short-circuits before the transaction runs.
    await expect(migrate(db)).resolves.toBeUndefined()

    const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version')
    expect(version?.user_version).toBe(3)
    expect(await schemaNames(db)).toEqual(before)
    expect(await db.getAllAsync('SELECT * FROM spaces')).toEqual(beforeSpaces)
  })
})

describe('migrate (atomic failure recovery)', () => {
  it('survives a v3 rebuild failure on a fresh install: v1/v2 stay committed, a retry finishes the job', async () => {
    const db = await SQLite.openDatabaseAsync('fresh-install-v3-failure.db')
    const realExecAsync = db.execAsync.bind(db)
    const execSpy = jest.spyOn(db, 'execAsync').mockImplementation(async (sql: string) => {
      // Simulate a crash mid v3 rebuild (app killed, disk full, etc.) — the v1/v2 step above
      // must already have committed its own transaction, independently of this one.
      if (sql.includes('CREATE TABLE spaces')) {
        throw new Error('simulated crash mid v3 rebuild')
      }
      return realExecAsync(sql)
    })

    await expect(migrate(db)).rejects.toThrow('simulated crash mid v3 rebuild')

    const versionAfterFailure = await db.getFirstAsync<{ user_version: number }>(
      'PRAGMA user_version',
    )
    expect(versionAfterFailure?.user_version).toBeLessThanOrEqual(2)

    // The v1 seed and the v2 ALTER survived the failed v3 attempt — a real app would still be
    // able to read/write local prompts (LOCAL_SPACE_ID always works), not wedged forever.
    const localVault = await db.getFirstAsync<{ id: string }>(
      'SELECT id FROM vaults WHERE id = ?',
      LOCAL_SPACE_ID,
    )
    expect(localVault).toEqual({ id: LOCAL_SPACE_ID })
    const cols = (await db.getAllAsync<{ name: string }>("PRAGMA table_info('prompts')")).map(
      (c) => c.name,
    )
    expect(cols).toContain('copy_count')

    // Without the fix, this second call re-runs `ALTER TABLE prompts ADD COLUMN copy_count`
    // (since user_version was never advanced past 0/1) and throws "duplicate column" forever.
    execSpy.mockRestore()
    await expect(migrate(db)).resolves.toBeUndefined()

    const versionAfterRetry = await db.getFirstAsync<{ user_version: number }>(
      'PRAGMA user_version',
    )
    expect(versionAfterRetry?.user_version).toBe(3)
  })
})

describe('migrate v2 → v3', () => {
  it('keeps every prompt, favourite, copy count and full-text search', async () => {
    const db = await SQLite.openDatabaseAsync('upgrade-test.db')
    await db.execAsync(V2_SCHEMA)
    await db.runAsync(
      `INSERT INTO prompts (id, vault_id, title, content, category, is_favorite, copy_count, created_at, updated_at, synced_at)
       VALUES ('p1', ?, 'Viết caption', 'Nội dung A', 'Marketing', 1, 5, 1, 2, 3),
              ('p2', ?, 'Tóm tắt', 'Nội dung B', NULL, 0, 0, 1, 2, NULL)`,
      LOCAL_SPACE_ID,
      LOCAL_SPACE_ID,
    )

    await migrate(db)

    const rows = await db.getAllAsync(
      'SELECT id, space_id, is_favorite, copy_count, version, has_conflict, synced_at FROM prompts ORDER BY id',
    )
    expect(rows).toEqual([
      { id: 'p1', space_id: LOCAL_SPACE_ID, is_favorite: 1, copy_count: 5, version: 0, has_conflict: 0, synced_at: null },
      { id: 'p2', space_id: LOCAL_SPACE_ID, is_favorite: 0, copy_count: 0, version: 0, has_conflict: 0, synced_at: null },
    ])

    const found = await db.getAllAsync("SELECT rowid FROM prompts_fts WHERE prompts_fts MATCH 'caption'")
    expect(found).toHaveLength(1)

    await db.runAsync("UPDATE prompts SET title = 'Viết slogan' WHERE id = 'p1'")
    const afterUpdate = await db.getAllAsync("SELECT rowid FROM prompts_fts WHERE prompts_fts MATCH 'slogan'")
    expect(afterUpdate).toHaveLength(1)

    const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version')
    expect(version?.user_version).toBe(3)
  })

  it('rerunning migrate after the v2→v3 upgrade is a no-op', async () => {
    const db = await SQLite.openDatabaseAsync('upgrade-idempotent-test.db')
    await db.execAsync(V2_SCHEMA)
    await db.runAsync(
      `INSERT INTO prompts (id, vault_id, title, content, category, is_favorite, copy_count, created_at, updated_at, synced_at)
       VALUES ('p1', ?, 'Viết caption', 'Nội dung A', 'Marketing', 1, 5, 1, 2, 3)`,
      LOCAL_SPACE_ID,
    )

    await migrate(db)
    const rowsAfterFirstMigration = await db.getAllAsync(
      'SELECT id, space_id, is_favorite, copy_count, version, has_conflict, synced_at FROM prompts ORDER BY id',
    )

    await expect(migrate(db)).resolves.toBeUndefined()

    const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version')
    expect(version?.user_version).toBe(3)
    expect(
      await db.getAllAsync(
        'SELECT id, space_id, is_favorite, copy_count, version, has_conflict, synced_at FROM prompts ORDER BY id',
      ),
    ).toEqual(rowsAfterFirstMigration)
  })
})
