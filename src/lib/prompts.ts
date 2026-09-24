import * as Crypto from 'expo-crypto'

import { getDb } from './db'

// Sample data uses these three; the create/edit sheet lets picking only from this set.
export const PROMPT_CATEGORIES = ['Marketing', 'Content', 'Năng suất'] as const
export type PromptCategory = (typeof PROMPT_CATEGORIES)[number]

export type Prompt = {
  id: string
  vaultId: string
  title: string
  content: string
  category: string | null
  isFavorite: boolean
  copyCount: number
  createdAt: number
  updatedAt: number
}

type PromptRow = {
  id: string
  vault_id: string
  title: string
  content: string
  category: string | null
  is_favorite: number
  copy_count: number
  created_at: number
  updated_at: number
}

const SELECT_COLUMNS =
  'id, vault_id, title, content, category, is_favorite, copy_count, created_at, updated_at'

function fromRow(row: PromptRow): Prompt {
  return {
    id: row.id,
    vaultId: row.vault_id,
    title: row.title,
    content: row.content,
    category: row.category,
    isFavorite: row.is_favorite === 1,
    copyCount: row.copy_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// Quotes each word for FTS5 and suffixes it with `*` for prefix matching,
// so free-text punctuation in the query can't break the MATCH syntax.
function toFtsQuery(query: string): string {
  return query
    .trim()
    .split(/\s+/)
    .map((word) => `"${word.replace(/"/g, '""')}"*`)
    .join(' ')
}

export type ListPromptsOptions = {
  category?: string | null
  favoritesOnly?: boolean
  query?: string
}

export async function listPrompts(
  vaultId: string,
  options: ListPromptsOptions = {},
): Promise<Prompt[]> {
  const db = await getDb()
  const conditions = ['p.vault_id = ?']
  const params: (string | number)[] = [vaultId]

  const query = options.query?.trim()
  if (query) {
    conditions.push('p.rowid IN (SELECT rowid FROM prompts_fts WHERE prompts_fts MATCH ?)')
    params.push(toFtsQuery(query))
  }
  if (options.category) {
    conditions.push('p.category = ?')
    params.push(options.category)
  }
  if (options.favoritesOnly) {
    conditions.push('p.is_favorite = 1')
  }

  const rows = await db.getAllAsync<PromptRow>(
    `SELECT p.id, p.vault_id, p.title, p.content, p.category, p.is_favorite, p.copy_count, p.created_at, p.updated_at
     FROM prompts p
     WHERE ${conditions.join(' AND ')}
     ORDER BY p.updated_at DESC`,
    ...params,
  )
  return rows.map(fromRow)
}

export async function getPrompt(id: string): Promise<Prompt | null> {
  const db = await getDb()
  const row = await db.getFirstAsync<PromptRow>(
    `SELECT ${SELECT_COLUMNS} FROM prompts WHERE id = ?`,
    id,
  )
  return row ? fromRow(row) : null
}

export type CreatePromptInput = {
  vaultId: string
  title: string
  content: string
  category: string | null
}

export async function createPrompt(input: CreatePromptInput): Promise<Prompt> {
  const db = await getDb()
  const id = Crypto.randomUUID()
  const now = Date.now()
  await db.runAsync(
    `INSERT INTO prompts (id, vault_id, title, content, category, is_favorite, copy_count, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)`,
    id,
    input.vaultId,
    input.title,
    input.content,
    input.category,
    now,
    now,
  )
  return {
    id,
    vaultId: input.vaultId,
    title: input.title,
    content: input.content,
    category: input.category,
    isFavorite: false,
    copyCount: 0,
    createdAt: now,
    updatedAt: now,
  }
}

export type UpdatePromptInput = { title: string; content: string; category: string | null }

export async function updatePrompt(id: string, input: UpdatePromptInput): Promise<void> {
  const db = await getDb()
  await db.runAsync(
    'UPDATE prompts SET title = ?, content = ?, category = ?, updated_at = ? WHERE id = ?',
    input.title,
    input.content,
    input.category,
    Date.now(),
    id,
  )
}

export async function deletePrompt(id: string): Promise<void> {
  const db = await getDb()
  await db.runAsync('DELETE FROM prompts WHERE id = ?', id)
}

export async function setFavorite(id: string, isFavorite: boolean): Promise<void> {
  const db = await getDb()
  await db.runAsync('UPDATE prompts SET is_favorite = ? WHERE id = ?', isFavorite ? 1 : 0, id)
}

// Bumps the copy counter without touching updated_at — copying isn't an edit.
export async function recordCopy(id: string): Promise<number> {
  const db = await getDb()
  await db.runAsync('UPDATE prompts SET copy_count = copy_count + 1 WHERE id = ?', id)
  const row = await db.getFirstAsync<{ copy_count: number }>(
    'SELECT copy_count FROM prompts WHERE id = ?',
    id,
  )
  return row?.copy_count ?? 0
}
