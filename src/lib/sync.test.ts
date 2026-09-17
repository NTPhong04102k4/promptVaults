jest.mock('./db', () => ({
  getDb: jest.fn(),
  PERSONAL_VAULT_ID: '00000000-0000-4000-8000-000000000001',
}));
jest.mock('./supabase', () => ({
  supabase: {
    auth: { getUser: jest.fn() },
    from: jest.fn(),
  },
}));

import { getDb } from './db';
import { supabase } from './supabase';
import { pushLocalPromptsToCloud } from './sync';

describe('pushLocalPromptsToCloud', () => {
  it('upserts unsynced rows and marks them synced', async () => {
    const rows = [
      { id: 'p1', vault_id: 'v1', title: 'T1', content: 'C1', category: null, tags: null, is_favorite: 0, created_at: 1, updated_at: 2 },
    ];
    const runAsync = jest.fn();
    const db = { getAllAsync: jest.fn().mockResolvedValue(rows), runAsync };
    (getDb as jest.Mock).mockResolvedValue(db);
    (supabase.auth.getUser as jest.Mock).mockResolvedValue({ data: { user: { id: 'user-1' } } });
    const upsert = jest.fn().mockResolvedValue({ error: null });
    (supabase.from as jest.Mock).mockReturnValue({ upsert });

    const result = await pushLocalPromptsToCloud();

    expect(upsert).toHaveBeenCalledWith([
      { id: 'p1', user_id: 'user-1', title: 'T1', content: 'C1', category: null, tags: null, is_favorite: 0, created_at: 1, updated_at: 2 },
    ]);
    expect(runAsync).toHaveBeenCalledWith('UPDATE prompts SET synced_at = ? WHERE id = ?', expect.any(Number), 'p1');
    expect(result).toEqual({ synced: 1, failed: 0 });
  });

  it('counts a failed upsert without throwing', async () => {
    const rows = [
      { id: 'p1', vault_id: 'v1', title: 'T1', content: 'C1', category: null, tags: null, is_favorite: 0, created_at: 1, updated_at: 2 },
    ];
    const db = { getAllAsync: jest.fn().mockResolvedValue(rows), runAsync: jest.fn() };
    (getDb as jest.Mock).mockResolvedValue(db);
    (supabase.auth.getUser as jest.Mock).mockResolvedValue({ data: { user: { id: 'user-1' } } });
    const upsert = jest.fn().mockResolvedValue({ error: { message: 'network error' } });
    (supabase.from as jest.Mock).mockReturnValue({ upsert });

    const result = await pushLocalPromptsToCloud();

    expect(result).toEqual({ synced: 0, failed: 1 });
  });
});
