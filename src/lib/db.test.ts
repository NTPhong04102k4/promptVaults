import { getDb, PERSONAL_VAULT_ID } from './db';

describe('getDb', () => {
  it('creates the vaults and prompts tables and seeds the personal vault', async () => {
    const db = await getDb();
    const vault = await db.getFirstAsync<{ id: string; type: string }>(
      'SELECT id, type FROM vaults WHERE id = ?',
      PERSONAL_VAULT_ID
    );
    expect(vault?.type).toBe('personal');

    const cols = await db.getAllAsync<{ name: string }>("PRAGMA table_info('prompts')");
    const colNames = cols.map((c) => c.name);
    expect(colNames).toEqual(
      expect.arrayContaining([
        'id', 'vault_id', 'title', 'content', 'category', 'tags',
        'is_favorite', 'created_at', 'updated_at', 'synced_at',
      ])
    );

    // Assert prompts_fts virtual table exists
    const ftsTables = await db.getAllAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='prompts_fts'"
    );
    expect(ftsTables.length).toBe(1);

    // Assert all three triggers exist
    const triggers = await db.getAllAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='trigger' AND name IN ('prompts_ai','prompts_ad','prompts_au')"
    );
    expect(triggers.length).toBe(3);
    const triggerNames = triggers.map((t) => t.name).sort();
    expect(triggerNames).toEqual(['prompts_ad', 'prompts_ai', 'prompts_au']);
  });

  it('syncs FTS5 when inserting prompts', async () => {
    const db = await getDb();

    // Insert a prompt into the personal vault
    const promptId = 'test-prompt-1';
    const now = Date.now();
    await db.runAsync(
      `INSERT INTO prompts (id, vault_id, title, content, category, tags, is_favorite, created_at, updated_at, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      promptId,
      PERSONAL_VAULT_ID,
      'Test Prompt',
      'This is test content for searching',
      'test-category',
      'tag1,tag2',
      0,
      now,
      now,
      null
    );

    // Verify the prompt appears in FTS5
    const ftsResults = await db.getAllAsync<{ rowid: number }>(
      "SELECT rowid FROM prompts_fts WHERE title MATCH 'Test'"
    );
    expect(ftsResults.length).toBeGreaterThan(0);
  });
});
