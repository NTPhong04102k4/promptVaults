import * as SQLite from 'expo-sqlite'

// The on-device space for guests and not-yet-adopted prompts. Same UUID the v1/v2
// "personal vault" used, so existing rows need no rewrite.
export const LOCAL_SPACE_ID = '00000000-0000-4000-8000-000000000001'

const DATABASE_VERSION = 3

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    const promise: Promise<SQLite.SQLiteDatabase> = SQLite.openDatabaseAsync(
      'promptvaults.db',
    ).then(async (db) => {
      await migrate(db)
      return db
    })
    // If migration fails, don't cache the rejection forever — clear it so the next getDb()
    // call retries instead of every future call rejecting until the app is reinstalled.
    promise.catch(() => {
      if (dbPromise === promise) dbPromise = null
    })
    dbPromise = promise
  }
  return dbPromise
}

const FTS_TRIGGERS = `
  CREATE TRIGGER IF NOT EXISTS prompts_ai AFTER INSERT ON prompts BEGIN
    INSERT INTO prompts_fts(rowid, title, content, category, tags)
    VALUES (new.rowid, new.title, new.content, new.category, new.tags);
  END;

  CREATE TRIGGER IF NOT EXISTS prompts_ad AFTER DELETE ON prompts BEGIN
    INSERT INTO prompts_fts(prompts_fts, rowid, title, content, category, tags)
    VALUES ('delete', old.rowid, old.title, old.content, old.category, old.tags);
  END;

  CREATE TRIGGER IF NOT EXISTS prompts_au AFTER UPDATE ON prompts BEGIN
    INSERT INTO prompts_fts(prompts_fts, rowid, title, content, category, tags)
    VALUES ('delete', old.rowid, old.title, old.content, old.category, old.tags);
    INSERT INTO prompts_fts(rowid, title, content, category, tags)
    VALUES (new.rowid, new.title, new.content, new.category, new.tags);
  END;
`

const MIGRATION_V1 = `
  CREATE TABLE IF NOT EXISTS vaults (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('personal','group')),
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS prompts (
    id TEXT PRIMARY KEY,
    vault_id TEXT NOT NULL REFERENCES vaults(id),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT,
    tags TEXT,
    is_favorite INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    synced_at INTEGER
  );

  CREATE VIRTUAL TABLE IF NOT EXISTS prompts_fts USING fts5(
    title, content, category, tags,
    content='prompts', content_rowid='rowid'
  );
  ${FTS_TRIGGERS}
`

// vaults.type has CHECK(type IN ('personal','group')) and prompts.vault_id references it,
// so prompts is rebuilt. rowid is copied explicitly to keep prompts_fts aligned, and the
// 'rebuild' command makes FTS consistent regardless.
const MIGRATION_V3 = `
  CREATE TABLE spaces (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK(kind IN ('local','personal','family','team')),
    name TEXT NOT NULL,
    can_manage INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  INSERT INTO spaces (id, kind, name, can_manage, created_at)
    SELECT id, 'local', 'Trên máy này', 1, created_at FROM vaults WHERE type = 'personal';

  CREATE TABLE prompts_v3 (
    id TEXT PRIMARY KEY,
    space_id TEXT NOT NULL REFERENCES spaces(id),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT,
    tags TEXT,
    is_favorite INTEGER DEFAULT 0,
    copy_count INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    synced_at INTEGER,
    version INTEGER NOT NULL DEFAULT 0,
    has_conflict INTEGER NOT NULL DEFAULT 0
  );
  INSERT INTO prompts_v3 (rowid, id, space_id, title, content, category, tags, is_favorite,
                          copy_count, created_at, updated_at, synced_at)
    SELECT rowid, id, vault_id, title, content, category, tags, is_favorite,
           copy_count, created_at, updated_at, NULL FROM prompts;

  DROP TRIGGER IF EXISTS prompts_ai;
  DROP TRIGGER IF EXISTS prompts_ad;
  DROP TRIGGER IF EXISTS prompts_au;
  DROP TABLE prompts;
  ALTER TABLE prompts_v3 RENAME TO prompts;
  CREATE INDEX idx_prompts_space ON prompts(space_id, updated_at);
  ${FTS_TRIGGERS}
  INSERT INTO prompts_fts(prompts_fts) VALUES('rebuild');
  DROP TABLE vaults;

  CREATE TABLE sync_outbox (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    space_id TEXT NOT NULL,
    prompt_id TEXT NOT NULL,
    operation TEXT NOT NULL CHECK(operation IN ('insert','update','delete')),
    base_version INTEGER NOT NULL,
    in_flight INTEGER NOT NULL DEFAULT 0,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX idx_outbox_space ON sync_outbox(space_id, seq);
  CREATE INDEX idx_outbox_prompt ON sync_outbox(prompt_id);

  CREATE TABLE sync_state (
    space_id TEXT PRIMARY KEY,
    cursor INTEGER NOT NULL DEFAULT 0,
    last_pulled_at INTEGER
  );

  CREATE TABLE sync_conflicts (
    conflict_id TEXT PRIMARY KEY,
    space_id TEXT NOT NULL,
    prompt_id TEXT NOT NULL,
    local_payload TEXT,
    remote_payload TEXT NOT NULL,
    remote_version INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
`

export async function migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version')
  const currentVersion = row?.user_version ?? 0
  if (currentVersion >= DATABASE_VERSION) return

  // journal_mode is a connection/file-level pragma, not page data — SQLite rejects changing
  // it inside a transaction, so it always runs standalone, before any transactional work.
  if (currentVersion < 1) {
    await db.execAsync('PRAGMA journal_mode = WAL')
  }

  // v1 DDL + seed + v2 ALTER + PRAGMA user_version = 2 all commit in one transaction. Without
  // this, a fresh install (or a v1 device) that throws/crashes between these steps and the v3
  // transaction below leaves user_version at 0/1 while `copy_count` has already been added —
  // every later launch would then re-run `ALTER TABLE prompts ADD COLUMN copy_count` and throw
  // "duplicate column" forever, wedging getDb() (and local/guest use) until reinstall.
  if (currentVersion < 2) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(MIGRATION_V1)
      await db.runAsync(
        'INSERT OR IGNORE INTO vaults (id, name, type, created_at) VALUES (?, ?, ?, ?)',
        LOCAL_SPACE_ID,
        'Kho cá nhân',
        'personal',
        Date.now(),
      )
      await db.execAsync('ALTER TABLE prompts ADD COLUMN copy_count INTEGER NOT NULL DEFAULT 0')
      await db.execAsync('PRAGMA user_version = 2')
    })
  }

  // PRAGMA user_version is set INSIDE the same transaction as the v3 schema rewrite (spec §9:
  // one transaction). MIGRATION_V3 creates/drops tables without IF NOT EXISTS/IF EXISTS guards
  // for the rename dance, so a crash between the schema change and a separate version bump
  // would leave user_version < 3 while the tables already exist — a rerun would then fail
  // trying to re-create them. Setting the pragma inside the transaction makes the whole v3
  // upgrade atomic: it either fully commits (tables + version) or fully rolls back.
  if (currentVersion < 3) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(MIGRATION_V3)
      await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`)
    })
  }
}
