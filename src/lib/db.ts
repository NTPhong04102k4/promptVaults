import * as SQLite from 'expo-sqlite'

export const PERSONAL_VAULT_ID = '00000000-0000-4000-8000-000000000001'

const DATABASE_VERSION = 1

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync('promptvaults.db').then(async (db) => {
      await migrate(db)
      return db
    })
  }
  return dbPromise
}

async function migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version')
  const currentVersion = row?.user_version ?? 0
  if (currentVersion >= DATABASE_VERSION) return

  await db.execAsync(`
    PRAGMA journal_mode = WAL;

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
  `)

  await db.runAsync(
    'INSERT OR IGNORE INTO vaults (id, name, type, created_at) VALUES (?, ?, ?, ?)',
    PERSONAL_VAULT_ID,
    'Kho cá nhân',
    'personal',
    Date.now(),
  )

  await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`)
}
