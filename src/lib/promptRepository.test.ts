jest.mock('expo-crypto', () => {
  let counter = 0;
  return {
    randomUUID: jest.fn(() => `test-uuid-${++counter}`),
  };
});

import { getDb, PERSONAL_VAULT_ID } from './db';
import { getPrompts, getPromptById, savePrompt, deletePrompt, toggleFavorite } from './promptRepository';

describe('promptRepository', () => {
  it('creates a new prompt with a generated id and no synced_at', async () => {
    const created = await savePrompt({
      title: 'Test prompt',
      content: 'Test content',
      category: 'Video ngắn',
      tags: 'a,b',
      is_favorite: 0,
    });

    expect(created.id).toBe('test-uuid-1');
    expect(created.vault_id).toBe(PERSONAL_VAULT_ID);
    expect(created.synced_at).toBeNull();
    expect(created.created_at).toBe(created.updated_at);

    const fetched = await getPromptById(created.id);
    expect(fetched).toEqual(created);
  });

  it('updates an existing prompt by id and bumps updated_at', async () => {
    const created = await savePrompt({
      title: 'Original',
      content: 'Original content',
      category: null,
      tags: null,
      is_favorite: 0,
    });

    const updated = await savePrompt({
      id: created.id,
      title: 'Updated title',
      content: 'Updated content',
      category: 'Email',
      tags: 'x',
      is_favorite: 1,
    });

    expect(updated.id).toBe(created.id);
    expect(updated.title).toBe('Updated title');
    expect(updated.is_favorite).toBe(1);
    expect(updated.updated_at).toBeGreaterThanOrEqual(created.updated_at);

    const fetched = await getPromptById(created.id);
    expect(fetched?.title).toBe('Updated title');
  });

  it('preserves synced_at on update so a previously-synced prompt is marked unsynced again', async () => {
    const created = await savePrompt({
      title: 'Synced',
      content: 'Content',
      category: null,
      tags: null,
      is_favorite: 0,
    });

    const db = await getDb();
    await db.runAsync('UPDATE prompts SET synced_at = ? WHERE id = ?', created.updated_at, created.id);

    const updated = await savePrompt({
      id: created.id,
      title: 'Synced (edited)',
      content: 'Content',
      category: null,
      tags: null,
      is_favorite: 0,
    });

    const fetched = await getPromptById(created.id);
    expect(fetched?.synced_at).toBe(created.updated_at);
    expect(updated.updated_at).toBeGreaterThanOrEqual(created.updated_at);
  });

  it('deletes a prompt', async () => {
    const created = await savePrompt({
      title: 'To delete',
      content: 'Content',
      category: null,
      tags: null,
      is_favorite: 0,
    });

    await deletePrompt(created.id);

    const fetched = await getPromptById(created.id);
    expect(fetched).toBeNull();
  });

  it('toggles favorite in both directions', async () => {
    const created = await savePrompt({
      title: 'Favorite test',
      content: 'Content',
      category: null,
      tags: null,
      is_favorite: 0,
    });

    const toggledOn = await toggleFavorite(created.id);
    expect(toggledOn).toBe(1);

    const toggledOff = await toggleFavorite(created.id);
    expect(toggledOff).toBe(0);
  });

  it('returns 0 when toggling favorite on a nonexistent id', async () => {
    const result = await toggleFavorite('does-not-exist');
    expect(result).toBe(0);
  });

  it('orders prompts by updated_at descending and scopes by vault', async () => {
    const first = await savePrompt({ title: 'First', content: 'Content', category: null, tags: null, is_favorite: 0 });
    const second = await savePrompt({ title: 'Second', content: 'Content', category: null, tags: null, is_favorite: 0 });

    const db = await getDb();
    await db.runAsync('UPDATE prompts SET updated_at = ? WHERE id = ?', 1000, first.id);
    await db.runAsync('UPDATE prompts SET updated_at = ? WHERE id = ?', 2000, second.id);

    const list = await getPrompts();
    const firstIndex = list.findIndex((p) => p.id === first.id);
    const secondIndex = list.findIndex((p) => p.id === second.id);
    expect(secondIndex).toBeLessThan(firstIndex);

    const otherVaultList = await getPrompts('some-other-vault-id');
    expect(otherVaultList.find((p) => p.id === first.id)).toBeUndefined();
  });
});
