export type Prompt = {
  id: string;
  vault_id: string;
  title: string;
  content: string;
  category: string | null;
  tags: string | null;
  is_favorite: number;
  created_at: number;
  updated_at: number;
  synced_at: number | null;
};
