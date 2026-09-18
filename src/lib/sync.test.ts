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

  it('counts a failed runAsync without throwing', async () => {
    const rows = [
      { id: 'p1', vault_id: 'v1', title: 'T1', content: 'C1', category: null, tags: null, is_favorite: 0, created_at: 1, updated_at: 2 },
    ];
    const runAsync = jest.fn().mockRejectedValue(new Error('db error'));
    const db = { getAllAsync: jest.fn().mockResolvedValue(rows), runAsync };
    (getDb as jest.Mock).mockResolvedValue(db);
    (supabase.auth.getUser as jest.Mock).mockResolvedValue({ data: { user: { id: 'user-1' } } });
    const upsert = jest.fn().mockResolvedValue({ error: null });
    (supabase.from as jest.Mock).mockReturnValue({ upsert });

    const result = await pushLocalPromptsToCloud();

    expect(result).toEqual({ synced: 0, failed: 1 });
  });
});

import { PERSONAL_VAULT_ID } from './db';
import { pullCloudPromptsToLocal } from './sync';

describe('pullCloudPromptsToLocal', () => {
  it('inserts a cloud row that does not exist locally', async () => {
    const cloudRows = [
      { id: 'p1', title: 'T1', content: 'C1', category: null, tags: null, is_favorite: 0, created_at: 1, updated_at: 5 },
    ];
    const getFirstAsync = jest.fn().mockResolvedValue(null);
    const runAsync = jest.fn();
    const db = { getFirstAsync, runAsync };
    (getDb as jest.Mock).mockResolvedValue(db);
    (supabase.auth.getUser as jest.Mock).mockResolvedValue({ data: { user: { id: 'user-1' } } });
    const select = jest.fn().mockResolvedValue({ data: cloudRows, error: null });
    (supabase.from as jest.Mock).mockReturnValue({ select: jest.fn().mockReturnValue({ eq: select }) });

    const result = await pullCloudPromptsToLocal();

    expect(runAsync).toHaveBeenCalledWith(
      `INSERT INTO prompts (id, vault_id, title, content, category, tags, is_favorite, created_at, updated_at, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      'p1', PERSONAL_VAULT_ID, 'T1', 'C1', null, null, 0, 1, 5, 5
    );
    expect(result).toEqual({ pulled: 1 });
  });

  it('overwrites a local row only when the cloud row is newer', async () => {
    const cloudRows = [
      { id: 'p1', title: 'T1-new', content: 'C1-new', category: null, tags: null, is_favorite: 0, created_at: 1, updated_at: 10 },
    ];
    const getFirstAsync = jest.fn().mockResolvedValue({ updated_at: 3 });
    const runAsync = jest.fn();
    const db = { getFirstAsync, runAsync };
    (getDb as jest.Mock).mockResolvedValue(db);
    (supabase.auth.getUser as jest.Mock).mockResolvedValue({ data: { user: { id: 'user-1' } } });
    const select = jest.fn().mockResolvedValue({ data: cloudRows, error: null });
    (supabase.from as jest.Mock).mockReturnValue({ select: jest.fn().mockReturnValue({ eq: select }) });

    const result = await pullCloudPromptsToLocal();

    expect(runAsync).toHaveBeenCalledWith(
      'UPDATE prompts SET title = ?, content = ?, category = ?, tags = ?, is_favorite = ?, updated_at = ?, synced_at = ? WHERE id = ?',
      'T1-new', 'C1-new', null, null, 0, 10, 10, 'p1'
    );
    expect(result).toEqual({ pulled: 1 });
  });

  it('skips a local row that is already newer than or equal to the cloud row', async () => {
    const cloudRows = [
      { id: 'p1', title: 'T1-old', content: 'C1-old', category: null, tags: null, is_favorite: 0, created_at: 1, updated_at: 3 },
    ];
    const getFirstAsync = jest.fn().mockResolvedValue({ updated_at: 5 });
    const runAsync = jest.fn();
    const db = { getFirstAsync, runAsync };
    (getDb as jest.Mock).mockResolvedValue(db);
    (supabase.auth.getUser as jest.Mock).mockResolvedValue({ data: { user: { id: 'user-1' } } });
    const select = jest.fn().mockResolvedValue({ data: cloudRows, error: null });
    (supabase.from as jest.Mock).mockReturnValue({ select: jest.fn().mockReturnValue({ eq: select }) });

    const result = await pullCloudPromptsToLocal();

    expect(runAsync).not.toHaveBeenCalled();
    expect(result).toEqual({ pulled: 0 });
  });
});
