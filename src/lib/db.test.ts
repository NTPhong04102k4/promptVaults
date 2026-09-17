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
  });
});
