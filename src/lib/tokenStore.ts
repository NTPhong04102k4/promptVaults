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

// A session is identified by its refresh token (rotated only by a refresh of that same session).
function isCurrent(expected: StoredTokens): boolean {
  return cache != null && cache.refreshToken === expected.refreshToken
}

// Compare-and-set variants for callers whose network call may settle LATE — after a sign-out,
// possibly after a different account signed in (Task 17 fix round 4). They only ever act on
// the exact session they started from; a newer session (or an already-cleared store) is never
// touched. The check and the in-memory write run in one synchronous step after the await, so
// nothing can interleave between them. A user-initiated sign-out uses plain clearTokens():
// it must clear whatever session is current, unconditionally.
export async function clearTokensIfCurrent(
  expected: StoredTokens,
  reason: TokensClearedReason,
): Promise<boolean> {
  await getTokens()
  if (!isCurrent(expected)) return false
  await clearTokens(reason)
  return true
}

export async function replaceTokensIfCurrent(
  expected: StoredTokens,
  next: StoredTokens,
): Promise<boolean> {
  await getTokens()
  if (!isCurrent(expected)) return false
  await setTokens(next)
  return true
}

// Persisted marker bracketing authStore.signOut()'s destructive sequence (tokens cleared →
// synced data wiped). If the app dies in between, the next cold start sees it and finishes the
// sign-out before rendering — otherwise the previous account's synced data would be left on
// disk with no tokens to trigger another sign-out (Task 17 fix round 4). Best-effort both
// ways: a keystore fault must never block a sign-out nor lock the app on cold start.
const SIGNOUT_PENDING_KEY = 'aiokin.signout_pending'

export async function setSignOutPending(pending: boolean): Promise<void> {
  try {
    if (pending) await SecureStore.setItemAsync(SIGNOUT_PENDING_KEY, '1', OPTIONS)
    else await SecureStore.deleteItemAsync(SIGNOUT_PENDING_KEY, OPTIONS)
  } catch {
    // Best effort — see above.
  }
}

export async function isSignOutPending(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(SIGNOUT_PENDING_KEY, OPTIONS)) !== null
  } catch {
    return false
  }
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
