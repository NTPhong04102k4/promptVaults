import * as Crypto from 'expo-crypto'

import { PROMPT_CATEGORIES } from './prompts'

// /sync/push wants a client-generated categoryId. Deriving it from (space, name) makes every
// device produce the same id for "Marketing" in a space, so the server never gets two
// same-named categories with different ids (sync-engine plan, Review Focus).
export async function categoryIdFor(spaceId: string, name: string): Promise<string> {
  const hex = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${spaceId}:${name.trim().toLowerCase()}`,
  )
  const chars = hex.slice(0, 32).split('')
  chars[12] = '8' // version 8 (custom)
  chars[16] = ((parseInt(chars[16] ?? '0', 16) & 0x3) | 0x8).toString(16) // RFC 9562 variant
  const h = chars.join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`
}

// Categories created by other clients can't be named — no category endpoint (spec gap G5).
export async function categoryNameFor(
  spaceId: string,
  categoryId: string | null,
): Promise<string | null> {
  if (!categoryId) return null
  const wanted = categoryId.toLowerCase()
  for (const name of PROMPT_CATEGORIES) {
    if ((await categoryIdFor(spaceId, name)) === wanted) return name
  }
  return null
}
