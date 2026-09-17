import { getDb } from './db';
import { supabase } from './supabase';

type LocalPromptRow = {
  id: string;
  vault_id: string;
  title: string;
  content: string;
  category: string | null;
  tags: string | null;
  is_favorite: number;
  created_at: number;
  updated_at: number;
};

export async function pushLocalPromptsToCloud(): Promise<{ synced: number; failed: number }> {
  const db = await getDb();
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error('not_authenticated');

  const rows = await db.getAllAsync<LocalPromptRow>(
    'SELECT id, vault_id, title, content, category, tags, is_favorite, created_at, updated_at FROM prompts WHERE synced_at IS NULL OR updated_at > synced_at'
  );

  let synced = 0;
  let failed = 0;

  for (const row of rows) {
    const { error } = await supabase.from('prompts').upsert([
      {
        id: row.id,
        user_id: userId,
        title: row.title,
        content: row.content,
        category: row.category,
        tags: row.tags,
        is_favorite: row.is_favorite,
        created_at: row.created_at,
        updated_at: row.updated_at,
      },
    ]);

    if (error) {
      failed += 1;
      continue;
    }

    try {
      await db.runAsync('UPDATE prompts SET synced_at = ? WHERE id = ?', Date.now(), row.id);
      synced += 1;
    } catch {
      failed += 1;
    }
  }

  return { synced, failed };
}
