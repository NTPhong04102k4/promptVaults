import * as Crypto from 'expo-crypto';
import { getDb, PERSONAL_VAULT_ID } from './db';
import type { Prompt } from './types';

export type SavePromptInput = {
  id?: string;
  vault_id?: string;
  title: string;
  content: string;
  category: string | null;
  tags: string | null;
  is_favorite: number;
};

export async function getPrompts(vaultId: string = PERSONAL_VAULT_ID): Promise<Prompt[]> {
  const db = await getDb();
  return db.getAllAsync<Prompt>(
    'SELECT * FROM prompts WHERE vault_id = ? ORDER BY updated_at DESC',
    vaultId
  );
}

export async function getPromptById(id: string): Promise<Prompt | null> {
  const db = await getDb();
  return db.getFirstAsync<Prompt>('SELECT * FROM prompts WHERE id = ?', id);
}

export async function savePrompt(input: SavePromptInput): Promise<Prompt> {
  const db = await getDb();
  const now = Date.now();

  if (input.id) {
    const existing = await getPromptById(input.id);
    if (existing) {
      await db.runAsync(
        'UPDATE prompts SET title = ?, content = ?, category = ?, tags = ?, is_favorite = ?, updated_at = ? WHERE id = ?',
        input.title,
        input.content,
        input.category,
        input.tags,
        input.is_favorite,
        now,
        input.id
      );
      return { ...existing, ...input, id: input.id, updated_at: now };
    }
  }

  const id = input.id ?? Crypto.randomUUID();
  const vaultId = input.vault_id ?? PERSONAL_VAULT_ID;
  await db.runAsync(
    'INSERT INTO prompts (id, vault_id, title, content, category, tags, is_favorite, created_at, updated_at, synced_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    id,
    vaultId,
    input.title,
    input.content,
    input.category,
    input.tags,
    input.is_favorite,
    now,
    now,
    null
  );
  return {
    id,
    vault_id: vaultId,
    title: input.title,
    content: input.content,
    category: input.category,
    tags: input.tags,
    is_favorite: input.is_favorite,
    created_at: now,
    updated_at: now,
    synced_at: null,
  };
}

export async function deletePrompt(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM prompts WHERE id = ?', id);
}

export async function toggleFavorite(id: string): Promise<number> {
  const db = await getDb();
  const existing = await getPromptById(id);
  if (!existing) return 0;
  const next = existing.is_favorite === 1 ? 0 : 1;
  await db.runAsync('UPDATE prompts SET is_favorite = ?, updated_at = ? WHERE id = ?', next, Date.now(), id);
  return next;
}
