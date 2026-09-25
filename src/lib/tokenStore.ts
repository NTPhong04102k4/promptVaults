import * as SecureStore from 'expo-secure-store'

// AFTER_FIRST_UNLOCK: the background sync task must read tokens while the phone is locked.
const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
}
const TOKENS_KEY = 'aiokin.tokens'

export type StoredTokens = { accessToken: string; refreshToken: string; expiresAt: number }
export type TokensClearedReason = 'signout' | 'expired'

// /auth/login and /auth/refresh-token return snake_case (TokenResponse has JsonPropertyName);
// /auth/verify-otp returns a camelCase anonymous object.
export type RawTokens = {
  access_token?: string
  refresh_token?: string | null
  expires_in?: number
  accessToken?: string
  refreshToken?: string | null
  expiresIn?: number
}

export function normalizeTokens(raw: RawTokens, now: number = Date.now()): StoredTokens {
  const accessToken = raw.accessToken ?? raw.access_token
  const refreshToken = raw.refreshToken ?? raw.refresh_token
  const expiresIn = raw.expiresIn ?? raw.expires_in ?? 0
  if (!accessToken || !refreshToken) throw new Error('invalid_token_response')
  return { accessToken, refreshToken, expiresAt: now + expiresIn * 1000 }
}

let cache: StoredTokens | null | undefined
const listeners = new Set<(reason: TokensClearedReason) => void>()

export async function getTokens(): Promise<StoredTokens | null> {
  if (cache !== undefined) return cache
  const stored = await SecureStore.getItemAsync(TOKENS_KEY, OPTIONS)
  try {
    cache = stored ? (JSON.parse(stored) as StoredTokens) : null
  } catch {
    cache = null
  }
  return cache
}

export async function setTokens(tokens: StoredTokens): Promise<void> {
  cache = tokens
  await SecureStore.setItemAsync(TOKENS_KEY, JSON.stringify(tokens), OPTIONS)
}

export async function clearTokens(reason: TokensClearedReason): Promise<void> {
  cache = null
  await SecureStore.deleteItemAsync(TOKENS_KEY, OPTIONS)
  listeners.forEach((listener) => listener(reason))
}

export function onTokensCleared(listener: (reason: TokensClearedReason) => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function resetTokenCacheForTests(): void {
  cache = undefined
}
