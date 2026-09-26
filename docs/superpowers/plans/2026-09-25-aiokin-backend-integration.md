# AioKin Backend Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Supabase Auth and `supabase.from('prompts')` with the AioKin ASP.NET Core API — opaque-token auth, Spaces, and an offline-first outbox → `/sync/push` / `/sync/pull` engine with a side-by-side conflict screen — and end with no Supabase client in the app.

**Architecture:** `src/services/apiClient.ts` learns AioKin's `OperationResult` envelope, bearer tokens and single-flight refresh-on-401; tokens and a stable `deviceId` live in `expo-secure-store`. Local SQLite moves to schema v3 (`spaces`, `sync_outbox`, `sync_state`, `sync_conflicts`); every write to a synced space enqueues an outbox row in the same transaction, and `syncEngine.runSync()` pushes then pulls per space on write / foreground / reconnect / background-task triggers. Tasks that only need endpoints that exist in the backend today come first; later tasks name the backend plan they wait for.

**Tech Stack:** Expo SDK ~57, React Native 0.86, expo-router, expo-sqlite (hand-written SQL), expo-secure-store, expo-crypto, expo-device, zustand 5, jest-expo + better-sqlite3 mock. Added: `expo-task-manager`, `expo-background-task`, `expo-network` (Task 16), `@sbaiahmed1/react-native-biometrics` (Task 22). Removed: `@supabase/supabase-js` (Task 24).

**Spec:** `docs/superpowers/specs/2026-09-25-aiokin-backend-integration-design.md`

> **Revision 2026-09-26.** Tasks 11–19 and 22–23 were corrected against the implemented backend (`AioKin` branch `feat/promptvault-merge` @ `49299e0`): push batch wrapper + `rejected` status, omit-means-unchanged category/tags/variables, inline PascalCase `snapshotJson`, typed pull change items, `newVersion`/`isDeleted` from resolve, author-or-manager authorization, enveloped biometric challenge. Every correction is listed with file/line evidence in spec §0; drift affecting already-implemented Tasks 1–10, 13, 20–21 is listed in spec §0.1 (not silently edited). **Decide spec drift D1 (prompt `description`) before implementing Task 14.**

## Global Constraints

- **Read the versioned Expo docs before writing code** (`AGENTS.md`): https://docs.expo.dev/versions/v57.0.0/ — especially `expo-secure-store`, `expo-sqlite`, `expo-background-task`, `expo-task-manager`, `expo-network`.
- **Backend contract is the AioKin repo, never guessed.** Routes/field names come from spec §4–§11 (which cite `AuthController.cs`, `AccountController.cs`, and the 2026-09-25 backend plans). If a backend response differs from what a task says, stop and update the spec, don't adapt silently.
- **Raw (non-envelope) endpoints:** `POST /auth/login`, `POST /auth/refresh-token` (snake_case `TokenResponse`). Everything else the app calls — **including `POST /auth/biometric/challenge`** (corrected 2026-09-26, spec §0 C25) — is an `OperationResult` envelope.
- **Sync never sends `deviceId`.** Push/pull/resolve take the device from the caller's session (spec §0 C4, C12).
- **No client-specific endpoints may be requested.** Missing capabilities go to spec §15 "Backend gaps".
- **Guest/local use is never gated behind login.** `LOCAL_SPACE_ID` always exists and works offline.
- **Biometric app lock (`appLock.ts`, `biometric.ts`) keeps its current behaviour**; biometric *login* is separate code.
- **Secrets:** `.env` is git-ignored (`.env*`) and must never be staged. `EXPO_PUBLIC_API_BASE_URL` goes there (e.g. `EXPO_PUBLIC_API_BASE_URL=https://<aiokin-host>`), no trailing slash.
- **UI copy is Vietnamese with diacritics**, matching existing screens.
- **GitNexus rules from `CLAUDE.md` apply:** run `impact({target, direction: "upstream"})` before editing an existing symbol and `detect_changes()` before each commit.
- **Every task ends green:** `npx jest` and `npx tsc --noEmit` both pass. (Task 1 adds `/.claude/` to Jest's `testPathIgnorePatterns` so stale worktrees under `.claude/worktrees` stop running.)
- **`src/navigation/routes.ts` has uncommitted user changes on this branch** (the `welcome` route). Before Task 7, confirm with the user that those are committed; never revert them.
- **Style:** no semicolons, single quotes, 2-space indent, `@/` imports (match `src/lib/*.ts`).

## Review Focus

- **Two authed requests hit 401 at the same time.** The backend rotates refresh tokens, so two refreshes log the user out. Expect exactly one `/auth/refresh-token` call — pinned in Task 3.
- **Offline during refresh.** A network error while refreshing must not clear tokens (offline ≠ signed out) — pinned in Task 3.
- **A prompt edited while its insert is in flight.** The edit must not be lost or merged into the in-flight row, and its `base_version` must follow the insert's `newVersion` — pinned in Tasks 13 and 14.
- **Lost response to an insert, then retry.** The backend now answers an identical retried insert with `applied` (gap G10 closed); a conflict whose remote equals what we sent (e.g. the same edit on two devices) must still auto-resolve with `keep_remote` instead of bothering the user — pinned in Task 14.
- **A push that "succeeds" with failed entries.** `/sync/push` returns 200 with a `SyncPushBatchResponse`; per-entry `rejected`/`conflict` must be read from `results[]`, and a generic `rejected` must be retried, not dropped — pinned in Task 14.
- **Wiping data the app doesn't model.** The payload must omit `tags`/`variables` (omitted = unchanged, `[]` = clear) and only send `clearCategory: true` on an update whose category the user emptied — pinned in Task 14.
- **Pull overwriting "your version" of an open conflict.** Pull must skip prompts with an open `sync_conflicts` row as well as pending outbox rows — pinned in Task 15.
- **Upgrading a device that already has v2 data.** All prompts, favourites, copy counts and FTS search must survive the v3 rebuild — pinned in Task 9.

## Backend dependency map

| Tasks | Needs in AioKin |
|---|---|
| 1–8 | Nothing new — endpoints exist today (`AuthController`, `AccountController`). Device fields are sent early; ASP.NET ignores unknown properties until `2026-09-25-token-session-management.md` lands. |
| 9–10, 13, 21 | Nothing (local only) |
| 11–12 | `2026-09-25-promptvault-space-and-prompt-domain.md` — merged on backend `feat/promptvault-merge` |
| 14–19 | `2026-09-25-promptvault-sync-engine.md` — merged on backend `feat/promptvault-merge` (through `49299e0`) |
| 20 | `2026-09-25-token-session-management.md` — merged |
| 22–23 | `2026-09-25-biometric-device-login.md` — merged; spec gap G2 (`userCode` in `/account/me`) closed |
| 24 | Nothing |

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `src/services/apiClient.ts` | fetch wrapper: envelope unwrap, `ApiError(status, code, message)`, bearer, refresh-on-401 | 1, 3 |
| `src/services/apiClient.auth.test.ts` | auth/refresh tests | 3 |
| `src/lib/tokenStore.ts` | tokens in SecureStore, `normalizeTokens`, cleared-event | 2 |
| `src/lib/deviceIdentity.ts` | stable `deviceId`, `deviceName`, `platform` | 2 |
| `src/lib/authApi.ts` | `/auth/*`, `/account/me` calls | 4 |
| `src/lib/authForm.ts` | validators + backend error-code → field mapping | 5, 8 |
| `src/store/authStore.ts` | persisted user built from `/account/me` | 6 |
| `src/app/onboarding/{login,signup,verify-email,sync}.tsx` | rewired to `authApi` | 7, 17 |
| `src/app/onboarding/{forgot-password,reset-password}.tsx` | 3-step reset | 8 |
| `src/lib/db.ts` | schema v3 migration, `LOCAL_SPACE_ID` | 9 |
| `__mocks__/expo-sqlite.js` | + `withTransactionAsync` | 9 |
| `src/lib/prompts.ts` | `spaceId`, outbox enqueue on synced spaces, write listener | 9, 13 |
| `src/lib/categoryId.ts` | deterministic category UUIDs | 10 |
| `src/lib/spaces.ts` | `/spaces/me`, `/spaces/team`, local `spaces` table | 11 |
| `src/store/spaceStore.ts` | `currentSpaceId`, `ownerUserId` | 12 |
| `src/app/vault-switcher.tsx` | Space switcher | 12 |
| `src/lib/outbox.ts` | enqueue/coalesce/claim/release | 13 |
| `src/lib/syncPush.ts` | `/sync/push`, payload building, `restorePromptFromServer` | 14 |
| `src/lib/syncPull.ts` | `/sync/pull` (incremental + inline snapshot), category-name resolution | 15 |
| `src/lib/syncEngine.ts`, `src/lib/backgroundSync.ts` | single-flight run + triggers | 16 |
| `src/lib/accountData.ts` | sign-in preparation, adoption, sign-out wipe | 17 |
| `src/lib/conflicts.ts`, `src/app/conflict.tsx` | resolve API + side-by-side UI | 18, 19 |
| `src/lib/sessions.ts`, `src/app/sessions.tsx` | device sessions | 20 |
| `src/lib/biometricSignature.ts` | raw→DER ECDSA normalisation | 21 |
| `src/lib/biometricLogin.ts` | enable/disable/sign-in with device key | 22 |
| deleted: `src/lib/{auth,sync,supabase}.ts` (+tests), `src/store/sessionStore.ts` (+test), `supabase/` | Supabase removal | 7, 24 |

---

### Task 1: API client — envelope unwrapping and error codes

**Depends on:** nothing new.

**Files:**
- Modify: `src/services/apiClient.ts` (whole file)
- Modify: `src/services/apiClient.test.ts` (append cases)
- Modify: `package.json` (`jest.testPathIgnorePatterns`)

**Interfaces:**
- Produces: `class ApiError { status: number; code: string; message: string }` (constructor `(status, code, message)`); `type RequestOptions = { envelope?: boolean; auth?: boolean; headers?: Record<string, string> }`; `apiClient.get/post/put/patch/delete<T>`; internal helpers exported for Task 3: `rawFetch`, `toApiError`, `parseBody`.

- [ ] **Step 1: Ignore stale worktrees in Jest**

In `package.json` → `"jest"` add:

```json
    "testPathIgnorePatterns": ["/node_modules/", "/.claude/"],
```

Run: `npx jest 2>&1 | tail -4` → Expected: only `src/**` suites run, all PASS.

- [ ] **Step 2: Write the failing tests** — append to `src/services/apiClient.test.ts` (inside the existing `describe('apiClient', …)`, before its closing `})`):

```ts
  it('unwraps an OperationResult envelope and returns data', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ success: true, message: 'ok', data: { id: 7 } }),
    }) as unknown as typeof fetch

    await expect(apiClient.get('https://example.com/account/me')).resolves.toEqual({ id: 7 })
  })

  it('returns the raw body when envelope is false', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ access_token: 'a', refresh_token: 'r', expires_in: 900 }),
    }) as unknown as typeof fetch

    await expect(
      apiClient.post('https://example.com/auth/login', {}, { envelope: false }),
    ).resolves.toEqual({ access_token: 'a', refresh_token: 'r', expires_in: 900 })
  })

  it('exposes the backend errorCode on ApiError', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 409,
      statusText: 'Conflict',
      json: async () => ({ success: false, errorCode: 'EmailExists', message: 'Email nay da duoc su dung.' }),
    }) as unknown as typeof fetch

    await expect(apiClient.post('https://example.com/auth/register', {})).rejects.toMatchObject({
      status: 409,
      code: 'EmailExists',
      message: 'Email nay da duoc su dung.',
    })
  })

  it('uses http_<status> as the code when the error body has none', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      json: async () => {
        throw new Error('not json')
      },
    }) as unknown as typeof fetch

    await expect(apiClient.get('https://example.com/x')).rejects.toMatchObject({ code: 'http_502' })
  })

  it('maps a fetch failure to a network ApiError', async () => {
    globalThis.fetch = jest.fn().mockRejectedValue(new TypeError('Network request failed')) as unknown as typeof fetch

    await expect(apiClient.get('https://example.com/x')).rejects.toMatchObject({
      status: 0,
      code: 'network',
    })
  })
```

- [ ] **Step 3: Run to verify failure**

Run: `npx jest src/services/apiClient.test.ts`
Expected: FAIL — `code` is undefined, envelope not unwrapped, `envelope` option unknown.

- [ ] **Step 4: Replace `src/services/apiClient.ts`**

```ts
export class ApiError extends Error {
  status: number
  code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

export type RequestOptions = {
  // Unwrap AioKin's OperationResult envelope (default true). Pass false for the raw
  // endpoints: /auth/login, /auth/refresh-token, /auth/biometric/challenge.
  envelope?: boolean
  // Attach the bearer token and refresh it on 401 (Task 3).
  auth?: boolean
  headers?: Record<string, string>
}

type Envelope = {
  success: boolean
  errorCode?: string | null
  message?: string | null
  data?: unknown
}

const BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? ''

function resolveUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path
  return `${BASE_URL}${path}`
}

function isEnvelope(value: unknown): value is Envelope {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { success?: unknown }).success === 'boolean'
  )
}

export async function rawFetch(
  method: string,
  path: string,
  body: unknown,
  headers: Record<string, string>,
): Promise<Response> {
  const finalHeaders: Record<string, string> = { ...headers }
  if (body !== undefined && !finalHeaders['Content-Type']) {
    finalHeaders['Content-Type'] = 'application/json'
  }
  try {
    return await fetch(resolveUrl(path), {
      method,
      headers: finalHeaders,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    })
  } catch {
    throw new ApiError(0, 'network', 'Không có kết nối mạng.')
  }
}

export async function toApiError(response: Response): Promise<ApiError> {
  let code = `http_${response.status}`
  let message = response.statusText
  try {
    const body = await response.json()
    if (body && typeof body.errorCode === 'string') code = body.errorCode
    if (body && typeof body.message === 'string') message = body.message
  } catch {
    // no JSON body — keep http_<status> / statusText
  }
  return new ApiError(response.status, code, message)
}

export async function parseBody<T>(response: Response, envelope: boolean): Promise<T> {
  if (response.status === 204) return undefined as T
  const text = await response.text()
  const body: unknown = text ? JSON.parse(text) : undefined
  if (envelope && isEnvelope(body)) {
    if (!body.success) {
      throw new ApiError(
        response.status,
        body.errorCode ?? 'operation_failed',
        body.message ?? 'Operation failed',
      )
    }
    return body.data as T
  }
  return body as T
}

async function request<T>(
  method: string,
  path: string,
  body: unknown,
  options: RequestOptions = {},
): Promise<T> {
  const response = await rawFetch(method, path, body, options.headers ?? {})
  if (!response.ok) throw await toApiError(response)
  return parseBody<T>(response, options.envelope ?? true)
}

export const apiClient = {
  get: <T>(path: string, options?: RequestOptions) => request<T>('GET', path, undefined, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('POST', path, body, options),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('PUT', path, body, options),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('PATCH', path, body, options),
  delete: <T>(path: string, options?: RequestOptions) =>
    request<T>('DELETE', path, undefined, options),
}
```

- [ ] **Step 5: Run tests and type-check**

Run: `npx jest src/services/apiClient.test.ts && npx tsc --noEmit`
Expected: PASS (the 6 original cases still pass — bodies without `success` are returned as-is).

- [ ] **Step 6: Commit**

```bash
git add package.json src/services/apiClient.ts src/services/apiClient.test.ts
git commit -m "feat(api): unwrap AioKin OperationResult and expose error codes"
```

---

### Task 2: Token store and device identity

**Depends on:** nothing new.

**Files:**
- Create: `src/lib/tokenStore.ts`, `src/lib/tokenStore.test.ts`
- Create: `src/lib/deviceIdentity.ts`, `src/lib/deviceIdentity.test.ts`

**Interfaces:**
- Produces (`tokenStore`): `type StoredTokens = { accessToken: string; refreshToken: string; expiresAt: number }`; `type RawTokens`; `normalizeTokens(raw: RawTokens, now?: number): StoredTokens`; `getTokens(): Promise<StoredTokens | null>`; `setTokens(t): Promise<void>`; `clearTokens(reason: 'signout' | 'expired'): Promise<void>`; `onTokensCleared(listener): () => void`; `resetTokenCacheForTests(): void`.
- Produces (`deviceIdentity`): `type DeviceInfo = { deviceId: string; deviceName: string; platform: string }`; `getDeviceId(): Promise<string>`; `getDeviceInfo(): Promise<DeviceInfo>`; `resetDeviceIdCacheForTests(): void`.

- [ ] **Step 1: Write the failing tests**

`src/lib/tokenStore.test.ts`:

```ts
const mockSecure = new Map<string, string>()
jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK: 'AFTER_FIRST_UNLOCK',
  getItemAsync: async (key: string) => mockSecure.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => {
    mockSecure.set(key, value)
  },
  deleteItemAsync: async (key: string) => {
    mockSecure.delete(key)
  },
}))

import {
  clearTokens,
  getTokens,
  normalizeTokens,
  onTokensCleared,
  resetTokenCacheForTests,
  setTokens,
} from './tokenStore'

beforeEach(() => {
  mockSecure.clear()
  resetTokenCacheForTests()
})

describe('normalizeTokens', () => {
  it('accepts the snake_case TokenResponse of /auth/login', () => {
    expect(
      normalizeTokens({ access_token: 'a', refresh_token: 'r', expires_in: 60 }, 1_000),
    ).toEqual({ accessToken: 'a', refreshToken: 'r', expiresAt: 61_000 })
  })

  it('accepts the camelCase data of /auth/verify-otp', () => {
    expect(normalizeTokens({ accessToken: 'a', refreshToken: 'r', expiresIn: 60 }, 0)).toEqual({
      accessToken: 'a',
      refreshToken: 'r',
      expiresAt: 60_000,
    })
  })

  it('rejects a response without both tokens', () => {
    expect(() => normalizeTokens({ access_token: 'a' })).toThrow('invalid_token_response')
  })
})

describe('token persistence', () => {
  it('round-trips through SecureStore', async () => {
    await setTokens({ accessToken: 'a', refreshToken: 'r', expiresAt: 5 })
    resetTokenCacheForTests()
    expect(await getTokens()).toEqual({ accessToken: 'a', refreshToken: 'r', expiresAt: 5 })
  })

  it('clearTokens removes them and notifies listeners with the reason', async () => {
    const listener = jest.fn()
    const stop = onTokensCleared(listener)
    await setTokens({ accessToken: 'a', refreshToken: 'r', expiresAt: 5 })

    await clearTokens('expired')

    expect(await getTokens()).toBeNull()
    expect(mockSecure.size).toBe(0)
    expect(listener).toHaveBeenCalledWith('expired')
    stop()
  })

  it('treats a corrupt stored value as signed out', async () => {
    mockSecure.set('aiokin.tokens', '{not json')
    expect(await getTokens()).toBeNull()
  })
})
```

`src/lib/deviceIdentity.test.ts`:

```ts
const mockSecure = new Map<string, string>()
jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK: 'AFTER_FIRST_UNLOCK',
  getItemAsync: async (key: string) => mockSecure.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => {
    mockSecure.set(key, value)
  },
}))
let mockUuidCounter = 0
jest.mock('expo-crypto', () => ({
  randomUUID: () => `uuid-${(mockUuidCounter += 1)}`,
}))
jest.mock('expo-device', () => ({ deviceName: 'Pixel của An', modelName: 'Pixel 8' }))

import { Platform } from 'react-native'

import { getDeviceId, getDeviceInfo, resetDeviceIdCacheForTests } from './deviceIdentity'

beforeEach(() => {
  mockSecure.clear()
  resetDeviceIdCacheForTests()
})

describe('deviceIdentity', () => {
  it('generates the id once and reuses it', async () => {
    const first = await getDeviceId()
    const second = await getDeviceId()
    expect(first).toBe(second)
    expect(mockSecure.get('aiokin.deviceId')).toBe(first)
  })

  it('reads a previously stored id after a restart', async () => {
    mockSecure.set('aiokin.deviceId', 'persisted-id')
    expect(await getDeviceId()).toBe('persisted-id')
  })

  it('reports name and platform', async () => {
    const info = await getDeviceInfo()
    expect(info.deviceName).toBe('Pixel của An')
    expect(info.platform).toBe(Platform.OS)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest src/lib/tokenStore.test.ts src/lib/deviceIdentity.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write `src/lib/tokenStore.ts`**

```ts
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
```

- [ ] **Step 4: Write `src/lib/deviceIdentity.ts`**

```ts
import { Platform } from 'react-native'
import * as Crypto from 'expo-crypto'
import * as Device from 'expo-device'
import * as SecureStore from 'expo-secure-store'

const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
}
const DEVICE_ID_KEY = 'aiokin.deviceId'

// One identity for sessions (token-session-management), sync (/sync/push deviceId) and
// biometric credentials — see spec §5.
export type DeviceInfo = { deviceId: string; deviceName: string; platform: string }

let pending: Promise<string> | null = null

export function getDeviceId(): Promise<string> {
  if (!pending) {
    pending = (async () => {
      const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY, OPTIONS)
      if (existing) return existing
      const id = Crypto.randomUUID()
      await SecureStore.setItemAsync(DEVICE_ID_KEY, id, OPTIONS)
      return id
    })()
    pending.catch(() => {
      pending = null
    })
  }
  return pending
}

export async function getDeviceInfo(): Promise<DeviceInfo> {
  return {
    deviceId: await getDeviceId(),
    deviceName: Device.deviceName ?? Device.modelName ?? 'Unknown device',
    platform: Platform.OS,
  }
}

export function resetDeviceIdCacheForTests(): void {
  pending = null
}
```

- [ ] **Step 5: Run tests and type-check**

Run: `npx jest src/lib/tokenStore.test.ts src/lib/deviceIdentity.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/tokenStore.ts src/lib/tokenStore.test.ts src/lib/deviceIdentity.ts src/lib/deviceIdentity.test.ts
git commit -m "feat(auth): add secure token store and stable device identity"
```

---

### Task 3: Bearer auth and single-flight refresh-on-401

**Depends on:** `POST /auth/refresh-token` (exists today).

**Files:**
- Modify: `src/services/apiClient.ts` (`request` function only)
- Create: `src/services/apiClient.auth.test.ts`

**Interfaces:**
- Consumes: `getTokens`, `setTokens`, `clearTokens`, `normalizeTokens`, `RawTokens` (Task 2); `getDeviceInfo` (Task 2).
- Produces: `RequestOptions.auth === true` attaches `Authorization: Bearer`, refreshes once on 401 (single-flight), rejects with `ApiError(401, 'session_expired')` or `ApiError(401, 'not_signed_in')`.

- [ ] **Step 1: Write the failing tests** — `src/services/apiClient.auth.test.ts`:

```ts
const mockSecure = new Map<string, string>()
jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK: 'AFTER_FIRST_UNLOCK',
  getItemAsync: async (key: string) => mockSecure.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => {
    mockSecure.set(key, value)
  },
  deleteItemAsync: async (key: string) => {
    mockSecure.delete(key)
  },
}))
jest.mock('@/lib/deviceIdentity', () => ({
  getDeviceInfo: async () => ({ deviceId: 'dev-1', deviceName: 'Pixel', platform: 'android' }),
}))

import { getTokens, onTokensCleared, resetTokenCacheForTests, setTokens } from '@/lib/tokenStore'

import { apiClient } from './apiClient'

type Handler = (url: string, init: RequestInit) => { status: number; body?: unknown }

function mockFetch(handler: Handler) {
  const fn = jest.fn(async (url: string, init: RequestInit) => {
    const { status, body } = handler(url, init)
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: String(status),
      text: async () => (body === undefined ? '' : JSON.stringify(body)),
      json: async () => body,
    }
  })
  globalThis.fetch = fn as unknown as typeof fetch
  return fn
}

function authHeader(init: RequestInit): string | undefined {
  return (init.headers as Record<string, string>).Authorization
}

const originalFetch = globalThis.fetch

beforeEach(async () => {
  mockSecure.clear()
  resetTokenCacheForTests()
  await setTokens({ accessToken: 'old-access', refreshToken: 'old-refresh', expiresAt: Date.now() + 600_000 })
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('apiClient auth', () => {
  it('attaches the bearer token', async () => {
    const fetchMock = mockFetch(() => ({ status: 200, body: { success: true, data: 1 } }))
    await apiClient.get('/account/me', { auth: true })
    expect(authHeader(fetchMock.mock.calls[0]![1])).toBe('Bearer old-access')
  })

  it('rejects with not_signed_in when there are no tokens', async () => {
    mockSecure.clear()
    resetTokenCacheForTests()
    mockFetch(() => ({ status: 200 }))
    await expect(apiClient.get('/account/me', { auth: true })).rejects.toMatchObject({
      status: 401,
      code: 'not_signed_in',
    })
  })

  it('refreshes once on 401 and retries with the new token', async () => {
    const fetchMock = mockFetch((url, init) => {
      if (url.endsWith('/auth/refresh-token')) {
        expect(JSON.parse(init.body as string)).toEqual({
          refreshToken: 'old-refresh',
          deviceId: 'dev-1',
          deviceName: 'Pixel',
          platform: 'android',
        })
        return { status: 200, body: { access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 900 } }
      }
      return authHeader(init) === 'Bearer new-access'
        ? { status: 200, body: { success: true, data: 'ok' } }
        : { status: 401, body: { success: false, errorCode: 'Unauthorized', message: 'x' } }
    })

    await expect(apiClient.get('/account/me', { auth: true })).resolves.toBe('ok')
    expect(fetchMock.mock.calls.filter(([u]) => u.endsWith('/auth/refresh-token'))).toHaveLength(1)
    expect((await getTokens())?.refreshToken).toBe('new-refresh')
  })

  it('shares one refresh between concurrent 401s (refresh tokens rotate)', async () => {
    const fetchMock = mockFetch((url, init) => {
      if (url.endsWith('/auth/refresh-token')) {
        return { status: 200, body: { access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 900 } }
      }
      return authHeader(init) === 'Bearer new-access'
        ? { status: 200, body: { success: true, data: url } }
        : { status: 401, body: { success: false, errorCode: 'Unauthorized', message: 'x' } }
    })

    await Promise.all([
      apiClient.get('/a', { auth: true }),
      apiClient.get('/b', { auth: true }),
      apiClient.get('/c', { auth: true }),
    ])

    expect(fetchMock.mock.calls.filter(([u]) => u.endsWith('/auth/refresh-token'))).toHaveLength(1)
  })

  it('clears tokens with reason "expired" when the refresh token is rejected', async () => {
    const listener = jest.fn()
    const stop = onTokensCleared(listener)
    mockFetch((url) =>
      url.endsWith('/auth/refresh-token')
        ? { status: 401, body: { success: false, errorCode: 'InvalidRefreshToken', message: 'x' } }
        : { status: 401, body: { success: false, errorCode: 'Unauthorized', message: 'x' } },
    )

    await expect(apiClient.get('/account/me', { auth: true })).rejects.toMatchObject({
      code: 'session_expired',
    })
    expect(listener).toHaveBeenCalledWith('expired')
    expect(await getTokens()).toBeNull()
    stop()
  })

  it('keeps tokens when the refresh fails because the device is offline', async () => {
    globalThis.fetch = jest.fn(async (url: string) => {
      if (url.endsWith('/auth/refresh-token')) throw new TypeError('Network request failed')
      return { ok: false, status: 401, statusText: '401', json: async () => ({}), text: async () => '' }
    }) as unknown as typeof fetch

    await expect(apiClient.get('/account/me', { auth: true })).rejects.toMatchObject({ code: 'network' })
    expect((await getTokens())?.refreshToken).toBe('old-refresh')
  })

  it('refreshes first when the stored access token is already expired', async () => {
    await setTokens({ accessToken: 'old-access', refreshToken: 'old-refresh', expiresAt: Date.now() - 1 })
    const fetchMock = mockFetch((url) =>
      url.endsWith('/auth/refresh-token')
        ? { status: 200, body: { access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 900 } }
        : { status: 200, body: { success: true, data: 1 } },
    )

    await apiClient.get('/account/me', { auth: true })

    expect(fetchMock.mock.calls[0]![0]).toMatch(/\/auth\/refresh-token$/)
    expect(authHeader(fetchMock.mock.calls[1]![1])).toBe('Bearer new-access')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest src/services/apiClient.auth.test.ts`
Expected: FAIL — no `Authorization` header is sent.

- [ ] **Step 3: Implement** — in `src/services/apiClient.ts` add imports at the top and replace `request`:

```ts
import { getDeviceInfo } from '@/lib/deviceIdentity'
import {
  clearTokens,
  getTokens,
  normalizeTokens,
  type RawTokens,
  setTokens,
} from '@/lib/tokenStore'
```

```ts
const EXPIRY_SKEW_MS = 30_000

function sessionExpired(): ApiError {
  return new ApiError(401, 'session_expired', 'Phiên đăng nhập đã hết hạn.')
}

let refreshing: Promise<boolean> | null = null

// Single-flight: /auth/refresh-token rotates (revokes) the refresh token, so two
// concurrent refreshes would make the second one fail and sign the user out.
function refreshTokens(): Promise<boolean> {
  if (!refreshing) {
    refreshing = (async () => {
      const tokens = await getTokens()
      if (!tokens) return false
      const device = await getDeviceInfo()
      // rawFetch throws ApiError('network') when offline — tokens are kept in that case.
      const response = await rawFetch(
        'POST',
        '/auth/refresh-token',
        { refreshToken: tokens.refreshToken, ...device },
        {},
      )
      if (response.status === 400 || response.status === 401 || response.status === 422) {
        await clearTokens('expired')
        return false
      }
      if (!response.ok) throw await toApiError(response)
      await setTokens(normalizeTokens(await parseBody<RawTokens>(response, false)))
      return true
    })().finally(() => {
      refreshing = null
    })
  }
  return refreshing
}

async function currentAccessToken(): Promise<string> {
  let tokens = await getTokens()
  if (!tokens) throw new ApiError(401, 'not_signed_in', 'Bạn chưa đăng nhập.')
  if (Date.now() > tokens.expiresAt - EXPIRY_SKEW_MS) {
    if (!(await refreshTokens())) throw sessionExpired()
    tokens = await getTokens()
    if (!tokens) throw sessionExpired()
  }
  return tokens.accessToken
}

async function request<T>(
  method: string,
  path: string,
  body: unknown,
  options: RequestOptions = {},
): Promise<T> {
  const envelope = options.envelope ?? true
  const headers = options.headers ?? {}

  if (!options.auth) {
    const response = await rawFetch(method, path, body, headers)
    if (!response.ok) throw await toApiError(response)
    return parseBody<T>(response, envelope)
  }

  const send = (token: string) =>
    rawFetch(method, path, body, { ...headers, Authorization: `Bearer ${token}` })

  const sentToken = await currentAccessToken()
  let response = await send(sentToken)
  if (response.status === 401) {
    // A concurrent request may already have refreshed while this one was in flight —
    // then just retry with the new token instead of rotating the refresh token again.
    const stored = await getTokens()
    const alreadyRefreshed = stored !== null && stored.accessToken !== sentToken
    if (!alreadyRefreshed && !(await refreshTokens())) throw sessionExpired()
    const fresh = await getTokens()
    if (!fresh) throw sessionExpired()
    response = await send(fresh.accessToken)
    if (response.status === 401) {
      await clearTokens('expired')
      throw sessionExpired()
    }
  }
  if (!response.ok) throw await toApiError(response)
  return parseBody<T>(response, envelope)
}
```

- [ ] **Step 4: Run tests and type-check**

Run: `npx jest src/services && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/apiClient.ts src/services/apiClient.auth.test.ts
git commit -m "feat(api): bearer auth with single-flight refresh on 401"
```

---

### Task 4: `authApi` — AioKin auth and account calls

**Depends on:** `/auth/register`, `/auth/verify-otp`, `/auth/resend-otp`, `/auth/login`, `/auth/forgot-password`, `/auth/forgot-password/verify-otp`, `/auth/reset-password`, `/auth/logout`, `GET|PATCH /account/me` — all exist today.

**Files:**
- Create: `src/lib/authApi.ts`, `src/lib/authApi.test.ts`

**Interfaces:**
- Consumes: `apiClient` (Tasks 1, 3), token store, device identity (Task 2).
- Produces:
  - `type AccountProfile = { userID: string; userCode?: string | null; firstName: string | null; lastName: string | null; fullName: string | null; email: string | null; username: string; image: string | null; socialProvider: string | null; hasPassword: boolean }` (camelCase of `LoginResponse`; `userCode` only after gap G2)
  - `register(input: { username: string; email: string; password: string }): Promise<void>`
  - `verifyOtp(email: string, otpCode: string): Promise<AccountProfile>` (stores tokens)
  - `resendOtp(email: string): Promise<void>`
  - `login(usernameOrPhoneOrEmail: string, password: string): Promise<void>` (stores tokens)
  - `forgotPassword(email: string): Promise<void>`
  - `verifyPasswordOtp(email: string, otpCode: string): Promise<{ expiresInMinutes: number }>`
  - `resetPassword(email: string, temporaryPassword: string, newPassword: string): Promise<void>`
  - `getMe(): Promise<AccountProfile>`; `updateMe(patch: { firstName?: string; lastName?: string }): Promise<void>`
  - `logout(): Promise<void>` (best-effort server call, always clears tokens with reason `'signout'`)

- [ ] **Step 1: Write the failing tests** — `src/lib/authApi.test.ts`:

```ts
const mockSecure = new Map<string, string>()
jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK: 'AFTER_FIRST_UNLOCK',
  getItemAsync: async (key: string) => mockSecure.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => {
    mockSecure.set(key, value)
  },
  deleteItemAsync: async (key: string) => {
    mockSecure.delete(key)
  },
}))
jest.mock('./deviceIdentity', () => ({
  getDeviceInfo: async () => ({ deviceId: 'dev-1', deviceName: 'Pixel', platform: 'android' }),
}))

import { login, logout, register, resetPassword, verifyOtp, verifyPasswordOtp } from './authApi'
import { getTokens, resetTokenCacheForTests, setTokens } from './tokenStore'

const profile = {
  userID: 'u-1',
  firstName: null,
  lastName: null,
  fullName: null,
  email: 'a@b.com',
  username: 'annguyen',
  image: null,
  socialProvider: null,
  hasPassword: true,
}

function mockFetchOnce(status: number, body: unknown) {
  const fn = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    text: async () => JSON.stringify(body),
    json: async () => body,
  })
  globalThis.fetch = fn as unknown as typeof fetch
  return fn
}

function sentBody(fn: jest.Mock): unknown {
  return JSON.parse((fn.mock.calls[0]![1] as RequestInit).body as string)
}

const originalFetch = globalThis.fetch
beforeEach(() => {
  mockSecure.clear()
  resetTokenCacheForTests()
})
afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('authApi', () => {
  it('register posts username/email/password only', async () => {
    const fn = mockFetchOnce(200, { success: true, message: 'ok' })
    await register({ username: 'annguyen', email: 'a@b.com', password: 'secret1' })
    expect(fn.mock.calls[0]![0]).toMatch(/\/auth\/register$/)
    expect(sentBody(fn)).toEqual({ username: 'annguyen', email: 'a@b.com', password: 'secret1' })
  })

  it('verifyOtp sends device info, stores tokens and returns the user', async () => {
    const fn = mockFetchOnce(201, {
      success: true,
      data: { accessToken: 'a', refreshToken: 'r', expiresIn: 900, tokenType: 'Bearer', user: profile },
    })

    const user = await verifyOtp('a@b.com', '123456')

    expect(sentBody(fn)).toEqual({
      email: 'a@b.com',
      otpCode: '123456',
      deviceId: 'dev-1',
      deviceName: 'Pixel',
      platform: 'android',
    })
    expect(user.username).toBe('annguyen')
    expect((await getTokens())?.accessToken).toBe('a')
  })

  it('login reads the raw snake_case TokenResponse', async () => {
    const fn = mockFetchOnce(200, {
      access_token: 'a',
      refresh_token: 'r',
      expires_in: 900,
      token_type: 'Bearer',
      scope: 'Customer',
    })

    await login('annguyen', 'secret1')

    expect(sentBody(fn)).toEqual({
      usernameOrPhoneOrEmail: 'annguyen',
      password: 'secret1',
      deviceId: 'dev-1',
      deviceName: 'Pixel',
      platform: 'android',
    })
    expect((await getTokens())?.refreshToken).toBe('r')
  })

  it('login surfaces InvalidCredentials as an ApiError code', async () => {
    mockFetchOnce(401, { success: false, errorCode: 'InvalidCredentials', message: 'x' })
    await expect(login('a@b.com', 'wrong1')).rejects.toMatchObject({ code: 'InvalidCredentials' })
  })

  it('verifyPasswordOtp returns the temporary password lifetime', async () => {
    mockFetchOnce(200, { success: true, data: { step: 'temp_password_sent', expiresInMinutes: 3 } })
    await expect(verifyPasswordOtp('a@b.com', '123456')).resolves.toEqual({
      step: 'temp_password_sent',
      expiresInMinutes: 3,
    })
  })

  it('resetPassword sends email, temporaryPassword, newPassword', async () => {
    const fn = mockFetchOnce(200, { success: true })
    await resetPassword('a@b.com', 'Ab12Cd34', 'newpass1')
    expect(sentBody(fn)).toEqual({
      email: 'a@b.com',
      temporaryPassword: 'Ab12Cd34',
      newPassword: 'newpass1',
    })
  })

  it('logout clears tokens even when the server call fails', async () => {
    await setTokens({ accessToken: 'a', refreshToken: 'r', expiresAt: Date.now() + 600_000 })
    globalThis.fetch = jest.fn().mockRejectedValue(new TypeError('offline')) as unknown as typeof fetch

    await logout()

    expect(await getTokens()).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest src/lib/authApi.test.ts`
Expected: FAIL — `./authApi` not found.

- [ ] **Step 3: Write `src/lib/authApi.ts`**

```ts
import { apiClient } from '@/services/apiClient'

import { getDeviceInfo } from './deviceIdentity'
import { clearTokens, getTokens, normalizeTokens, type RawTokens, setTokens } from './tokenStore'

// camelCase of AioKin's LoginResponse (Models/ViewModel/Auth/User/LoginResponse.cs).
// userCode is not returned today — spec gap G2.
export type AccountProfile = {
  userID: string
  userCode?: string | null
  firstName: string | null
  lastName: string | null
  fullName: string | null
  email: string | null
  username: string
  image: string | null
  socialProvider: string | null
  hasPassword: boolean
}

type VerifyOtpData = {
  accessToken: string
  refreshToken: string
  expiresIn: number
  tokenType: string
  user: AccountProfile
}

export async function register(input: {
  username: string
  email: string
  password: string
}): Promise<void> {
  await apiClient.post('/auth/register', input)
}

export async function verifyOtp(email: string, otpCode: string): Promise<AccountProfile> {
  const device = await getDeviceInfo()
  const data = await apiClient.post<VerifyOtpData>('/auth/verify-otp', {
    email,
    otpCode,
    ...device,
  })
  await setTokens(normalizeTokens(data))
  return data.user
}

export async function resendOtp(email: string): Promise<void> {
  await apiClient.post('/auth/resend-otp', { email })
}

export async function login(usernameOrPhoneOrEmail: string, password: string): Promise<void> {
  const device = await getDeviceInfo()
  const raw = await apiClient.post<RawTokens>(
    '/auth/login',
    { usernameOrPhoneOrEmail, password, ...device },
    { envelope: false },
  )
  await setTokens(normalizeTokens(raw))
}

export async function forgotPassword(email: string): Promise<void> {
  await apiClient.post('/auth/forgot-password', { email })
}

export async function verifyPasswordOtp(
  email: string,
  otpCode: string,
): Promise<{ expiresInMinutes: number }> {
  return apiClient.post('/auth/forgot-password/verify-otp', { email, otpCode })
}

export async function resetPassword(
  email: string,
  temporaryPassword: string,
  newPassword: string,
): Promise<void> {
  await apiClient.post('/auth/reset-password', { email, temporaryPassword, newPassword })
}

export async function getMe(): Promise<AccountProfile> {
  return apiClient.get<AccountProfile>('/account/me', { auth: true })
}

export async function updateMe(patch: { firstName?: string; lastName?: string }): Promise<void> {
  await apiClient.patch('/account/me', patch, { auth: true })
}

export async function logout(): Promise<void> {
  const tokens = await getTokens()
  try {
    if (tokens) {
      await apiClient.post('/auth/logout', { refreshToken: tokens.refreshToken }, { auth: true })
    }
  } catch {
    // Best effort: offline or already-revoked sessions still sign out locally.
  } finally {
    await clearTokens('signout')
  }
}
```

- [ ] **Step 4: Run tests and type-check**

Run: `npx jest src/lib/authApi.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/authApi.ts src/lib/authApi.test.ts
git commit -m "feat(auth): add AioKin auth/account API module"
```

---

### Task 5: Map AioKin error codes in `authForm`

**Depends on:** nothing new.

**Files:**
- Modify: `src/lib/authForm.ts` (`MIN_PASSWORD_LENGTH` comment, `AUTH_ERRORS`, `toAuthError`)
- Modify: `src/lib/authForm.test.ts` (`validatePassword` test name, whole `describe('toAuthError')`)

**Interfaces:**
- Consumes: `ApiError` (Task 1).
- Produces: `toAuthError(error: unknown): { field: AuthErrorField; message: string }` keyed by `ApiError.code`.

- [ ] **Step 1: Write the failing tests** — in `src/lib/authForm.test.ts` rename `'enforces the Supabase minimum length'` to `'enforces the AioKin minimum length (6)'`, add `import { ApiError } from '@/services/apiClient'` at the top, and replace the whole `describe('toAuthError', …)` block with:

```ts
describe('toAuthError', () => {
  const apiError = (code: string, message = 'server message') => new ApiError(400, code, message)

  it('routes AioKin error codes to their field', () => {
    expect(toAuthError(apiError('InvalidCredentials')).field).toBe('password')
    expect(toAuthError(apiError('EmailExists')).field).toBe('email')
    expect(toAuthError(apiError('UsernameExists'))).toEqual({
      field: 'username',
      message: 'Username đã được sử dụng.',
    })
    expect(toAuthError(apiError('InvalidOtp')).field).toBe('code')
    expect(toAuthError(apiError('InvalidTemporaryPassword')).field).toBe('code')
  })

  it('explains an expired registration', () => {
    expect(toAuthError(apiError('RegistrationDataNotFound')).message).toBe(
      'Phiên đăng ký đã hết hạn, vui lòng đăng ký lại.',
    )
  })

  it('shows the server message for validation and conflict errors', () => {
    expect(toAuthError(apiError('ValidationError', 'Mat khau toi thieu 6 ky tu.'))).toEqual({
      field: 'form',
      message: 'Mat khau toi thieu 6 ky tu.',
    })
  })

  it('reports being offline', () => {
    expect(toAuthError(new ApiError(0, 'network', 'x')).message).toBe('Không có kết nối mạng.')
  })

  it('falls back to a generic form error', () => {
    expect(toAuthError(new Error('boom'))).toEqual({
      field: 'form',
      message: 'Có lỗi xảy ra, thử lại sau.',
    })
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest src/lib/authForm.test.ts`
Expected: FAIL — `InvalidCredentials` falls through to `form`.

- [ ] **Step 3: Implement** — in `src/lib/authForm.ts`:

Add at the top: `import { ApiError } from '@/services/apiClient'`

Change the constant comment: `export const MIN_PASSWORD_LENGTH = 6 // AioKin LoginRequest/RegisterRequest MinLength(6)`

Replace everything from `const AUTH_ERRORS` to the end of the file with:

```ts
// Keys are AioKin OperationResult.errorCode values (AuthController / OperationResultHttpExtensions).
const AUTH_ERRORS: Record<string, { field: AuthErrorField; message: string }> = {
  EmailExists: { field: 'email', message: 'Email này đã được đăng ký.' },
  UsernameExists: { field: 'username', message: 'Username đã được sử dụng.' },
  InvalidCredentials: { field: 'password', message: 'Thông tin đăng nhập không đúng.' },
  AccountLocked: {
    field: 'form',
    message: 'Tài khoản đang bị khoá tạm thời do nhập sai nhiều lần, thử lại sau ít phút.',
  },
  UserInactive: { field: 'form', message: 'Tài khoản đã bị vô hiệu hoá.' },
  InvalidOtp: { field: 'code', message: 'Mã không đúng hoặc đã hết hạn.' },
  InvalidTemporaryPassword: { field: 'code', message: 'Mật khẩu tạm không đúng hoặc đã hết hạn.' },
  RegistrationDataNotFound: {
    field: 'form',
    message: 'Phiên đăng ký đã hết hạn, vui lòng đăng ký lại.',
  },
  TooManyRequests: { field: 'form', message: 'Bạn thao tác quá nhanh, thử lại sau ít phút.' },
  EmailSendFailed: { field: 'form', message: 'Không gửi được email, thử lại sau.' },
  OtpGenerationFailed: { field: 'form', message: 'Không gửi được email, thử lại sau.' },
  network: { field: 'form', message: 'Không có kết nối mạng.' },
}

// Codes whose server message is the most useful thing to show.
const SERVER_MESSAGE_CODES = new Set(['ValidationError', 'Conflict'])

export function toAuthError(error: unknown): { field: AuthErrorField; message: string } {
  if (error instanceof ApiError) {
    const known = AUTH_ERRORS[error.code]
    if (known) return known
    if (SERVER_MESSAGE_CODES.has(error.code)) return { field: 'form', message: error.message }
  }
  return { field: 'form', message: 'Có lỗi xảy ra, thử lại sau.' }
}
```

- [ ] **Step 4: Run tests and type-check**

Run: `npx jest src/lib/authForm.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/authForm.ts src/lib/authForm.test.ts
git commit -m "feat(auth): map AioKin error codes to form fields"
```

---

### Task 6: `authStore` on top of `/account/me`

**Depends on:** `GET /account/me`, `POST /auth/logout` (exist today).

**Files:**
- Modify: `src/store/authStore.ts` (whole file)
- Modify: `src/store/authStore.test.ts` (whole file)

**Interfaces:**
- Consumes: `getMe`, `logout`, `AccountProfile` (Task 4); `getTokens`, `onTokensCleared` (Task 2).
- Produces: `type AuthUser = { id: string; email: string | null; username: string | null; firstName: string | null; lastName: string | null; userCode: string | null }`; `toAuthUser(profile: AccountProfile | null): AuthUser | null`; store actions `setUser(profile)`, `refreshUser(): Promise<void>`, `signOut(): Promise<void>`, `completeOnboarding()`, `setKeepSignedIn(keep)`; `startAuthListener(): () => void`; `selectIsSignedIn`. `setSession` is removed.

- [ ] **Step 1: Write the failing tests** — replace `src/store/authStore.test.ts`:

```ts
jest.mock('@/lib/authApi', () => ({
  getMe: jest.fn(),
  logout: jest.fn(),
}))
jest.mock('@/lib/tokenStore', () => ({
  getTokens: jest.fn(),
  onTokensCleared: jest.fn(),
}))

const mockMemory = new Map<string, string>()
jest.mock('@/lib/secureStorage', () => ({
  LargeSecureStore: {
    getItem: jest.fn(async (key: string) => mockMemory.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      mockMemory.set(key, value)
    }),
    removeItem: jest.fn(async (key: string) => {
      mockMemory.delete(key)
    }),
  },
}))

import { type AccountProfile, getMe, logout } from '@/lib/authApi'
import { getTokens, onTokensCleared } from '@/lib/tokenStore'

import { startAuthListener, toAuthUser, useAuthStore } from './authStore'

const profile: AccountProfile = {
  userID: 'user-1',
  firstName: 'An',
  lastName: '',
  fullName: 'An',
  email: 'a@b.com',
  username: 'annguyen',
  image: null,
  socialProvider: null,
  hasPassword: true,
}
const tokens = { accessToken: 'access-secret', refreshToken: 'refresh-secret', expiresAt: 1 }
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

beforeEach(() => {
  useAuthStore.setState({ user: null, hasOnboarded: false, keepSignedIn: true })
  jest.clearAllMocks()
  ;(onTokensCleared as jest.Mock).mockReturnValue(jest.fn())
})

describe('toAuthUser', () => {
  it('maps the AioKin profile, treating empty strings as null', () => {
    expect(toAuthUser(profile)).toEqual({
      id: 'user-1',
      email: 'a@b.com',
      username: 'annguyen',
      firstName: 'An',
      lastName: null,
      userCode: null,
    })
  })

  it('returns null without a profile', () => {
    expect(toAuthUser(null)).toBeNull()
  })
})

describe('useAuthStore persistence', () => {
  it('persists user and flags but never tokens', async () => {
    useAuthStore.getState().setUser(profile)
    useAuthStore.getState().completeOnboarding()
    await Promise.resolve()

    const stored = mockMemory.get('auth-store')
    expect(JSON.parse(stored!).state).toEqual({
      user: toAuthUser(profile),
      hasOnboarded: true,
      keepSignedIn: true,
    })
    expect(stored).not.toContain('secret')
  })

  it('marks itself hydrated after rehydrating', async () => {
    await useAuthStore.persist.rehydrate()
    expect(useAuthStore.getState().hydrated).toBe(true)
  })
})

describe('auth actions', () => {
  it('signOut logs out on the server and clears the user', async () => {
    useAuthStore.getState().setUser(profile)
    await useAuthStore.getState().signOut()
    expect(logout).toHaveBeenCalled()
    expect(useAuthStore.getState().user).toBeNull()
  })

  it('startAuthListener loads /account/me when tokens exist', async () => {
    ;(getTokens as jest.Mock).mockResolvedValue(tokens)
    ;(getMe as jest.Mock).mockResolvedValue(profile)
    await useAuthStore.persist.rehydrate()

    startAuthListener()
    await flush()

    expect(useAuthStore.getState().user?.id).toBe('user-1')
  })

  it('startAuthListener keeps the persisted user when offline', async () => {
    useAuthStore.setState({ user: toAuthUser(profile) })
    ;(getTokens as jest.Mock).mockResolvedValue(tokens)
    ;(getMe as jest.Mock).mockRejectedValue(Object.assign(new Error('x'), { code: 'network' }))
    await useAuthStore.persist.rehydrate()

    startAuthListener()
    await flush()

    expect(useAuthStore.getState().user?.id).toBe('user-1')
  })

  it('startAuthListener clears the user when there are no tokens', async () => {
    useAuthStore.setState({ user: toAuthUser(profile) })
    ;(getTokens as jest.Mock).mockResolvedValue(null)
    await useAuthStore.persist.rehydrate()

    startAuthListener()
    await flush()

    expect(useAuthStore.getState().user).toBeNull()
  })

  it('drops the session on cold start when "keep me signed in" was off', async () => {
    ;(getTokens as jest.Mock).mockResolvedValue(tokens)
    useAuthStore.setState({ user: toAuthUser(profile), keepSignedIn: false })
    await Promise.resolve()
    await useAuthStore.persist.rehydrate()

    startAuthListener()
    await flush()

    expect(logout).toHaveBeenCalled()
    expect(getMe).not.toHaveBeenCalled()
    expect(useAuthStore.getState().user).toBeNull()
  })

  it('clears the user when tokens are cleared elsewhere (expired refresh)', () => {
    let listener: (reason: string) => void = () => undefined
    ;(onTokensCleared as jest.Mock).mockImplementation((fn) => {
      listener = fn
      return jest.fn()
    })
    ;(getTokens as jest.Mock).mockResolvedValue(null)
    useAuthStore.setState({ user: toAuthUser(profile) })

    startAuthListener()
    listener('expired')

    expect(useAuthStore.getState().user).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest src/store/authStore.test.ts`
Expected: FAIL — `setUser` is not a function / `userCode` missing.

- [ ] **Step 3: Replace `src/store/authStore.ts`**

```ts
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

import { type AccountProfile, getMe, logout } from '@/lib/authApi'
import { LargeSecureStore } from '@/lib/secureStorage'
import { getTokens, onTokensCleared } from '@/lib/tokenStore'

// Tokens live in src/lib/tokenStore (SecureStore) — this store only keeps what the UI
// needs to render instantly on cold start.
export type AuthUser = {
  id: string
  email: string | null
  username: string | null
  firstName: string | null
  lastName: string | null
  // Needed by biometric login; AioKin does not return it yet (spec gap G2).
  userCode: string | null
}

type AuthState = {
  user: AuthUser | null
  hasOnboarded: boolean
  // "Keep me signed in" — when false, the session is dropped on the next cold start.
  keepSignedIn: boolean
  // true once persisted state has been read back from storage.
  hydrated: boolean
  setUser: (profile: AccountProfile | null) => void
  refreshUser: () => Promise<void>
  completeOnboarding: () => void
  setKeepSignedIn: (keep: boolean) => void
  signOut: () => Promise<void>
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

export function toAuthUser(profile: AccountProfile | null): AuthUser | null {
  if (!profile) return null
  return {
    id: profile.userID,
    email: readString(profile.email),
    username: readString(profile.username),
    firstName: readString(profile.firstName),
    lastName: readString(profile.lastName),
    userCode: readString(profile.userCode),
  }
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      hasOnboarded: false,
      keepSignedIn: true,
      hydrated: false,
      setUser: (profile) => set({ user: toAuthUser(profile) }),
      refreshUser: async () => set({ user: toAuthUser(await getMe()) }),
      completeOnboarding: () => set({ hasOnboarded: true }),
      setKeepSignedIn: (keep) => set({ keepSignedIn: keep }),
      signOut: async () => {
        await logout()
        set({ user: null })
      },
    }),
    {
      name: 'auth-store',
      version: 2,
      storage: createJSONStorage(() => LargeSecureStore),
      partialize: (state) => ({
        user: state.user,
        hasOnboarded: state.hasOnboarded,
        keepSignedIn: state.keepSignedIn,
      }),
      // v1 users were built from a Supabase session and are meaningless to AioKin.
      migrate: (persisted, version) => {
        const state = persisted as AuthState
        return (version < 2 ? { ...state, user: null } : state) as AuthState
      },
      onRehydrateStorage: () => () => useAuthStore.setState({ hydrated: true }),
    },
  ),
)

// Call once from the root layout; returns unsubscribe.
export function startAuthListener(): () => void {
  const stop = onTokensCleared(() => useAuthStore.setState({ user: null }))
  restoreSession().catch(() => undefined)
  return stop
}

async function restoreSession(): Promise<void> {
  if (!useAuthStore.persist.hasHydrated()) {
    await new Promise<void>((resolve) => {
      const unsubscribe = useAuthStore.persist.onFinishHydration(() => {
        unsubscribe()
        resolve()
      })
    })
  }
  const tokens = await getTokens()
  if (!tokens) {
    useAuthStore.setState({ user: null })
    return
  }
  if (!useAuthStore.getState().keepSignedIn) {
    await logout()
    useAuthStore.setState({ user: null })
    return
  }
  try {
    await useAuthStore.getState().refreshUser()
  } catch {
    // Offline: keep the persisted user. An expired session clears it via onTokensCleared.
  }
}

export const selectIsSignedIn = (state: AuthState) => state.user !== null
```

- [ ] **Step 4: Run tests and type-check**

Run: `npx jest src/store && npx tsc --noEmit`
Expected: PASS. (`src/lib/auth.ts` still exists and still compiles; nothing imports `setSession` any more.)

- [ ] **Step 5: Commit**

```bash
git add src/store/authStore.ts src/store/authStore.test.ts
git commit -m "feat(auth): build authStore on AioKin /account/me"
```

---

### Task 7: Rewire sign-up, verify and login screens; delete Supabase auth and table sync

**Depends on:** Tasks 4–6. Confirm `src/navigation/routes.ts` user changes are committed first (Global Constraints).

**Files:**
- Modify: `src/navigation/routes.ts` (`verifyEmail` params)
- Modify: `src/app/onboarding/signup.tsx`, `login.tsx`, `verify-email.tsx`, `sync.tsx`
- Modify: `src/app/_layout.tsx` (session-expired alert)
- Delete: `src/lib/auth.ts`, `src/lib/auth.test.ts`, `src/lib/sync.ts`, `src/lib/sync.test.ts`

**Interfaces:**
- Consumes: `register`, `verifyOtp`, `resendOtp`, `login`, `updateMe` (Task 4); `toAuthError` (Task 5); `useAuthStore().refreshUser` (Task 6); `onTokensCleared` (Task 2).
- Produces: `RouteParams.verifyEmail = { email: string; fullName?: string }`. After sign-in screens call `resetTo('home')` (Task 17 changes this to the adoption screen). Google buttons are removed (spec §6.1, gap G1).

- [ ] **Step 1: Route params** — in `src/navigation/routes.ts`:

```ts
  verifyEmail: { email: string; fullName?: string }
```

- [ ] **Step 2: `signup.tsx`**

Replace the imports block from `import { Image } from 'expo-image'` through `import { makeStyles } from '@/theme'` with:

```ts
import { AuthLayout, Button, Checkbox, FooterPrompt, TextField } from '@/components/ui'
import { register } from '@/lib/authApi'
import {
  type AuthErrorField,
  toAuthError,
  validateEmail,
  validatePassword,
  validateUsername,
} from '@/lib/authForm'
import { replace } from '@/navigation'
import { makeStyles } from '@/theme'
```

Replace `handleSignup` and delete `handleGoogle`:

```ts
  async function handleSignup() {
    const next = validate()
    setErrors(next)
    if (Object.keys(next).length > 0) return

    setLoading(true)
    try {
      // AioKin RegisterRequest has no name fields — the name is saved after OTP verification.
      await register({ username, email: email.trim(), password })
      replace('verifyEmail', { email: email.trim(), fullName: fullName.trim() })
    } catch (e) {
      const { field, message } = toAuthError(e)
      setErrors({ [field]: message })
    } finally {
      setLoading(false)
    }
  }
```

In the JSX delete the Google `<Button variant="tonal" … />` and `<OrDivider … />`; in `useStyles` delete `googleLogo`. (Google returns with gap G1.)

- [ ] **Step 3: `verify-email.tsx`**

Imports:

```ts
import { resendOtp, updateMe, verifyOtp } from '@/lib/authApi'
import { splitFullName, toAuthError } from '@/lib/authForm'
import { resetTo, useRouteParams } from '@/navigation'
import { useAuthStore } from '@/store'
import { makeStyles, text } from '@/theme'
```

(remove the `@/lib/auth` import and `replace` from `@/navigation`). Route params and handlers:

```ts
  const { email = '', fullName = '' } = useRouteParams('verifyEmail')
```

```ts
  async function handleVerify() {
    setError(null)
    setLoading(true)
    try {
      await verifyOtp(email, code)
      if (fullName) {
        try {
          await updateMe(splitFullName(fullName))
        } catch {
          // Name is cosmetic; the account exists and the user is signed in.
        }
      }
      await useAuthStore.getState().refreshUser()
      resetTo('home')
    } catch (e) {
      setError(toAuthError(e).message)
      setCode('')
    } finally {
      setLoading(false)
    }
  }

  async function handleResend() {
    if (cooldown > 0) return
    setError(null)
    try {
      await resendOtp(email)
      setNotice('Đã gửi lại mã, kiểm tra hộp thư của bạn.')
      setCooldown(RESEND_COOLDOWN_SECONDS)
    } catch (e) {
      setError(toAuthError(e).message)
    }
  }
```

- [ ] **Step 4: `login.tsx`**

Replace the imports from `import { Image } from 'expo-image'` through `import { makeStyles, text } from '@/theme'` with:

```ts
import { AuthLayout, Button, Checkbox, FooterPrompt, TextField } from '@/components/ui'
import { login } from '@/lib/authApi'
import { type AuthErrorField, toAuthError } from '@/lib/authForm'
import { push, replace, resetTo, useRouteParams } from '@/navigation'
import { useAuthStore } from '@/store'
import { makeStyles, text } from '@/theme'
```

Replace `handleLogin`, delete `handleGoogle`:

```ts
  async function handleLogin() {
    const next: Errors = {}
    if (!email.trim()) next.email = 'Vui lòng nhập email hoặc username.'
    if (!password) next.password = 'Vui lòng nhập mật khẩu.'
    setErrors(next)
    if (Object.keys(next).length > 0) return

    setLoading(true)
    try {
      await login(email.trim(), password)
      await useAuthStore.getState().refreshUser()
      resetTo('home')
    } catch (e) {
      const { field, message } = toAuthError(e)
      setErrors({ [field]: message })
    } finally {
      setLoading(false)
    }
  }
```

In the JSX: delete the `<View style={styles.googleGap}>…</View>` block and `<OrDivider … />`; change the first `TextField` to `label="Email hoặc username"`, `placeholder="ban@gmail.com"`, `keyboardType="email-address"`, `autoComplete="username"`, `textContentType="username"`. In `useStyles` delete `googleGap` and `googleLogo`.

- [ ] **Step 5: `sync.tsx` (temporary until Task 17)** — replace the file:

```tsx
import { Pressable, View } from 'react-native'

import { ThemedText } from '@/components/Themed'
import { resetTo } from '@/navigation'
import { makeStyles } from '@/theme'

// Cloud sync moves to the AioKin sync engine (plan Tasks 14–17). Until then this screen
// only explains that prompts stay on this device.
export default function SyncScreen() {
  const styles = useStyles()

  return (
    <View style={styles.container}>
      <ThemedText variant="titleLarge" style={styles.center}>
        Đồng bộ đang được nâng cấp
      </ThemedText>
      <ThemedText color="secondary" style={styles.center}>
        Prompt của bạn vẫn được lưu an toàn trên máy này. Đồng bộ giữa các thiết bị sẽ bật lại
        trong bản cập nhật tới.
      </ThemedText>
      <Pressable onPress={() => resetTo('home')}>
        <ThemedText color="primary" style={styles.center}>
          Về trang chủ
        </ThemedText>
      </Pressable>
    </View>
  )
}

const useStyles = makeStyles(({ spacing }) => ({
  container: { flex: 1, justifyContent: 'center', padding: spacing.xl, gap: spacing.lg },
  center: { textAlign: 'center' },
}))
```

- [ ] **Step 6: Session-expired alert** — in `src/app/_layout.tsx` add `Alert` to the `react-native` import, `import { onTokensCleared } from '@/lib/tokenStore'`, and after `useEffect(() => startAuthListener(), [])`:

```tsx
  useEffect(
    () =>
      onTokensCleared((reason) => {
        if (reason === 'expired') {
          Alert.alert('Phiên đăng nhập đã hết hạn', 'Vui lòng đăng nhập lại để tiếp tục đồng bộ.')
        }
      }),
    [],
  )
```

- [ ] **Step 7: Delete Supabase auth and table sync**

```bash
git rm src/lib/auth.ts src/lib/auth.test.ts src/lib/sync.ts src/lib/sync.test.ts
```

- [ ] **Step 8: Verify**

Run: `npx tsc --noEmit && npx jest`
Expected: PASS. `grep -rn "@/lib/auth'" src` → no output.

Manual (dev build, `EXPO_PUBLIC_API_BASE_URL` pointing at AioKin): sign up → OTP e-mail → verify → Profile shows name; sign out; log in with username; wrong password shows "Thông tin đăng nhập không đúng." under the password field.

- [ ] **Step 9: Commit**

```bash
git add src/navigation/routes.ts src/app/_layout.tsx src/app/onboarding/signup.tsx src/app/onboarding/login.tsx src/app/onboarding/verify-email.tsx src/app/onboarding/sync.tsx
git commit -m "feat(auth): sign up, verify and log in through AioKin; drop Supabase auth"
```

---

### Task 8: Three-step password reset

**Depends on:** `/auth/forgot-password`, `/auth/forgot-password/verify-otp`, `/auth/reset-password` (exist today).

**Files:**
- Modify: `src/lib/authForm.ts`, `src/lib/authForm.test.ts` (`validateTemporaryPassword`)
- Modify: `src/navigation/routes.ts` (`resetPassword`)
- Modify: `src/app/_layout.tsx` (register screen)
- Modify: `src/app/onboarding/forgot-password.tsx`
- Create: `src/app/onboarding/reset-password.tsx`

**Interfaces:**
- Consumes: `forgotPassword`, `verifyPasswordOtp`, `resetPassword` (Task 4).
- Produces: `validateTemporaryPassword(value: string): string | null`; route `resetPassword: '/onboarding/reset-password'` with params `{ email: string }`.

- [ ] **Step 1: Failing test** — append to `src/lib/authForm.test.ts` (and add `validateTemporaryPassword` to its import list):

```ts
describe('validateTemporaryPassword', () => {
  it('requires the 8-character temporary password AioKin e-mails', () => {
    expect(validateTemporaryPassword('')).toBe('Vui lòng nhập mật khẩu tạm.')
    expect(validateTemporaryPassword('abc')).toBe('Mật khẩu tạm gồm 8 ký tự.')
    expect(validateTemporaryPassword(' Ab12Cd34 ')).toBeNull()
  })
})
```

Run: `npx jest src/lib/authForm.test.ts` → FAIL (not exported).

- [ ] **Step 2: Implement** — add to `src/lib/authForm.ts` after `validateUsername`:

```ts
// AioKin ResetPasswordRequest.TemporaryPassword is StringLength(8, MinimumLength = 8).
export function validateTemporaryPassword(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return 'Vui lòng nhập mật khẩu tạm.'
  return trimmed.length === 8 ? null : 'Mật khẩu tạm gồm 8 ký tự.'
}
```

Run: `npx jest src/lib/authForm.test.ts` → PASS.

- [ ] **Step 3: Route + stack** — `src/navigation/routes.ts`: add `resetPassword: '/onboarding/reset-password',` after `forgotPassword` in `ROUTES`, and `resetPassword: { email: string }` in `RouteParams`. `src/app/_layout.tsx`: add `<Stack.Screen name="onboarding/reset-password" />` after `onboarding/forgot-password`.

- [ ] **Step 4: `forgot-password.tsx`** — change imports to `import { forgotPassword } from '@/lib/authApi'` and `import { push, replace, useRouteParams } from '@/navigation'`; remove the `sent` state, the notice `<Text>` and its style; replace `handleSubmit`:

```ts
  async function handleSubmit() {
    const emailError = validateEmail(email)
    setError(emailError)
    if (emailError) return

    setLoading(true)
    try {
      // Always 200 whether or not the address exists (AuthController.ForgotPassword).
      await forgotPassword(email.trim())
      push('resetPassword', { email: email.trim() })
    } catch (e) {
      setError(toAuthError(e).message)
    } finally {
      setLoading(false)
    }
  }
```

Set the subtitle to `"Nhập email đã đăng ký. Chúng tôi sẽ gửi mã xác minh gồm 6 số."`, the button to `<Button label="Gửi mã" onPress={handleSubmit} loading={loading} />`, and `onChangeText={setEmail}`. Delete the now-unused `useStyles`/`makeStyles`/`Text` imports if nothing else uses them.

- [ ] **Step 5: Create `src/app/onboarding/reset-password.tsx`**

```tsx
import { useState } from 'react'
import { Text, View } from 'react-native'

import { AuthLayout, Button, OtpInput, TextField } from '@/components/ui'
import { resetPassword, verifyPasswordOtp } from '@/lib/authApi'
import { toAuthError, validatePassword, validateTemporaryPassword } from '@/lib/authForm'
import { replace, useRouteParams } from '@/navigation'
import { makeStyles, text } from '@/theme'

const CODE_LENGTH = 6

type Errors = { code?: string; temp?: string; password?: string; confirm?: string; form?: string }

// AioKin reset is 3 steps: OTP → temporary password by e-mail (3 min) → new password.
export default function ResetPasswordScreen() {
  const styles = useStyles()
  const { email = '' } = useRouteParams('resetPassword')
  const [step, setStep] = useState<'otp' | 'reset'>('otp')
  const [code, setCode] = useState('')
  const [temporaryPassword, setTemporaryPassword] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [minutes, setMinutes] = useState(3)
  const [errors, setErrors] = useState<Errors>({})
  const [loading, setLoading] = useState(false)

  async function handleVerifyCode() {
    setErrors({})
    setLoading(true)
    try {
      const { expiresInMinutes } = await verifyPasswordOtp(email, code)
      setMinutes(expiresInMinutes)
      setStep('reset')
    } catch (e) {
      setErrors({ code: toAuthError(e).message })
      setCode('')
    } finally {
      setLoading(false)
    }
  }

  async function handleReset() {
    const next: Errors = {}
    const tempError = validateTemporaryPassword(temporaryPassword)
    if (tempError) next.temp = tempError
    const passwordError = validatePassword(password)
    if (passwordError) next.password = passwordError
    if (confirm !== password) next.confirm = 'Mật khẩu nhập lại không khớp.'
    setErrors(next)
    if (Object.keys(next).length > 0) return

    setLoading(true)
    try {
      await resetPassword(email, temporaryPassword.trim(), password)
      replace('login', { email })
    } catch (e) {
      const { field, message } = toAuthError(e)
      setErrors(field === 'code' ? { temp: message } : { form: message })
    } finally {
      setLoading(false)
    }
  }

  if (step === 'otp') {
    return (
      <AuthLayout
        align="start"
        title="Nhập mã xác minh"
        subtitle={`Chúng tôi đã gửi mã ${CODE_LENGTH} số tới ${email}.`}
      >
        <View style={styles.codeSection}>
          <OtpInput value={code} onChange={setCode} length={CODE_LENGTH} error={!!errors.code} />
          {errors.code && <Text style={styles.error}>{errors.code}</Text>}
        </View>
        <Button
          label="Xác minh"
          onPress={handleVerifyCode}
          loading={loading}
          disabled={code.length < CODE_LENGTH}
        />
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      align="start"
      title="Đặt mật khẩu mới"
      subtitle={`Mật khẩu tạm đã được gửi tới ${email} và có hiệu lực ${minutes} phút.`}
    >
      <View style={styles.fields}>
        <TextField
          label="Mật khẩu tạm"
          autoCapitalize="none"
          autoCorrect={false}
          value={temporaryPassword}
          onChangeText={setTemporaryPassword}
          error={errors.temp}
        />
        <TextField
          label="Mật khẩu mới"
          placeholder="••••••••"
          secure
          autoComplete="new-password"
          textContentType="newPassword"
          value={password}
          onChangeText={setPassword}
          error={errors.password}
        />
        <TextField
          label="Nhập lại mật khẩu mới"
          placeholder="••••••••"
          secure
          autoComplete="new-password"
          textContentType="newPassword"
          value={confirm}
          onChangeText={setConfirm}
          error={errors.confirm}
        />
      </View>
      {errors.form && <Text style={styles.error}>{errors.form}</Text>}
      <Button label="Đổi mật khẩu" onPress={handleReset} loading={loading} />
    </AuthLayout>
  )
}

const useStyles = makeStyles(({ colors, typography, spacing }) => ({
  codeSection: { gap: spacing.md },
  fields: { gap: spacing.lg },
  label: { ...text('titleMedium', 'semiBold'), color: colors.onSurface },
  error: { ...typography.bodySmall, color: colors.error },
}))
```

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit && npx jest`
Expected: PASS. Manual: forgot password → OTP → temp password from e-mail + new password → login screen with e-mail prefilled → log in with the new password.

- [ ] **Step 7: Commit**

```bash
git add src/lib/authForm.ts src/lib/authForm.test.ts src/navigation/routes.ts src/app/_layout.tsx src/app/onboarding/forgot-password.tsx src/app/onboarding/reset-password.tsx
git commit -m "feat(auth): three-step AioKin password reset"
```

---

### Task 9: SQLite schema v3 (spaces, outbox, sync state, conflicts)

**Depends on:** nothing (local only). Existing user data must survive — see Review Focus.

**Files:**
- Modify: `src/lib/db.ts` (whole file)
- Modify: `src/lib/db.test.ts` (whole file)
- Modify: `__mocks__/expo-sqlite.js` (add `withTransactionAsync`)
- Modify: `src/lib/prompts.ts` (`vault_id` → `space_id`, `vaultId` → `spaceId`, add `version`/`hasConflict`)
- Modify: `src/lib/prompts.test.ts`, `src/hooks/usePrompts.ts`, `src/app/prompt-edit.tsx` (rename only)

**Interfaces:**
- Produces: `LOCAL_SPACE_ID` (replaces `PERSONAL_VAULT_ID`, same value); `migrate(db): Promise<void>` (exported for tests); tables `spaces`, `prompts(space_id, version, has_conflict)`, `sync_outbox`, `sync_state`, `sync_conflicts` exactly as spec §9; `Prompt = { id, spaceId, title, content, category, isFavorite, copyCount, createdAt, updatedAt, version, hasConflict }`; `listPrompts(spaceId, options)`; `CreatePromptInput = { spaceId, title, content, category }`.

- [ ] **Step 1: Give the SQLite mock transactions** — in `__mocks__/expo-sqlite.js` add to `MockSQLiteDatabase` (after `getAllAsync`):

```js
  async withTransactionAsync(task) {
    this.db.exec('BEGIN')
    try {
      await task()
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }
```

- [ ] **Step 2: Write the failing tests** — replace `src/lib/db.test.ts`:

```ts
import * as SQLite from 'expo-sqlite'

import { getDb, LOCAL_SPACE_ID, migrate } from './db'

// The exact v2 schema shipped before this plan (db.ts DATABASE_VERSION = 2).
const V2_SCHEMA = `
  CREATE TABLE vaults (
    id TEXT PRIMARY KEY, name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('personal','group')), created_at INTEGER NOT NULL
  );
  CREATE TABLE prompts (
    id TEXT PRIMARY KEY, vault_id TEXT NOT NULL REFERENCES vaults(id),
    title TEXT NOT NULL, content TEXT NOT NULL, category TEXT, tags TEXT,
    is_favorite INTEGER DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
    synced_at INTEGER
  );
  CREATE VIRTUAL TABLE prompts_fts USING fts5(
    title, content, category, tags, content='prompts', content_rowid='rowid'
  );
  CREATE TRIGGER prompts_ai AFTER INSERT ON prompts BEGIN
    INSERT INTO prompts_fts(rowid, title, content, category, tags)
    VALUES (new.rowid, new.title, new.content, new.category, new.tags);
  END;
  CREATE TRIGGER prompts_ad AFTER DELETE ON prompts BEGIN
    INSERT INTO prompts_fts(prompts_fts, rowid, title, content, category, tags)
    VALUES ('delete', old.rowid, old.title, old.content, old.category, old.tags);
  END;
  CREATE TRIGGER prompts_au AFTER UPDATE ON prompts BEGIN
    INSERT INTO prompts_fts(prompts_fts, rowid, title, content, category, tags)
    VALUES ('delete', old.rowid, old.title, old.content, old.category, old.tags);
    INSERT INTO prompts_fts(rowid, title, content, category, tags)
    VALUES (new.rowid, new.title, new.content, new.category, new.tags);
  END;
  ALTER TABLE prompts ADD COLUMN copy_count INTEGER NOT NULL DEFAULT 0;
  INSERT INTO vaults VALUES ('00000000-0000-4000-8000-000000000001', 'Kho cá nhân', 'personal', 1);
  PRAGMA user_version = 2;
`

async function schemaNames(db: SQLite.SQLiteDatabase): Promise<string[]> {
  const rows = await db.getAllAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type IN ('table','trigger')",
  )
  return rows.map((r) => r.name)
}

describe('getDb (fresh install)', () => {
  it('creates schema v3 with the local space', async () => {
    const db = await getDb()
    const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version')
    expect(version?.user_version).toBe(3)

    const local = await db.getFirstAsync<{ kind: string; name: string }>(
      'SELECT kind, name FROM spaces WHERE id = ?',
      LOCAL_SPACE_ID,
    )
    expect(local).toEqual({ kind: 'local', name: 'Trên máy này' })

    const names = await schemaNames(db)
    expect(names).toEqual(
      expect.arrayContaining([
        'spaces', 'prompts', 'prompts_fts', 'sync_outbox', 'sync_state', 'sync_conflicts',
        'prompts_ai', 'prompts_ad', 'prompts_au',
      ]),
    )
    expect(names).not.toContain('vaults')

    const cols = (await db.getAllAsync<{ name: string }>("PRAGMA table_info('prompts')")).map((c) => c.name)
    expect(cols).toEqual(expect.arrayContaining(['space_id', 'version', 'has_conflict', 'copy_count']))
    expect(cols).not.toContain('vault_id')
  })
})

describe('migrate v2 → v3', () => {
  it('keeps every prompt, favourite, copy count and full-text search', async () => {
    const db = await SQLite.openDatabaseAsync('upgrade-test.db')
    await db.execAsync(V2_SCHEMA)
    await db.runAsync(
      `INSERT INTO prompts (id, vault_id, title, content, category, is_favorite, copy_count, created_at, updated_at, synced_at)
       VALUES ('p1', ?, 'Viết caption', 'Nội dung A', 'Marketing', 1, 5, 1, 2, 3),
              ('p2', ?, 'Tóm tắt', 'Nội dung B', NULL, 0, 0, 1, 2, NULL)`,
      LOCAL_SPACE_ID,
      LOCAL_SPACE_ID,
    )

    await migrate(db)

    const rows = await db.getAllAsync(
      'SELECT id, space_id, is_favorite, copy_count, version, has_conflict, synced_at FROM prompts ORDER BY id',
    )
    expect(rows).toEqual([
      { id: 'p1', space_id: LOCAL_SPACE_ID, is_favorite: 1, copy_count: 5, version: 0, has_conflict: 0, synced_at: null },
      { id: 'p2', space_id: LOCAL_SPACE_ID, is_favorite: 0, copy_count: 0, version: 0, has_conflict: 0, synced_at: null },
    ])

    const found = await db.getAllAsync("SELECT rowid FROM prompts_fts WHERE prompts_fts MATCH 'caption'")
    expect(found).toHaveLength(1)

    await db.runAsync("UPDATE prompts SET title = 'Viết slogan' WHERE id = 'p1'")
    const afterUpdate = await db.getAllAsync("SELECT rowid FROM prompts_fts WHERE prompts_fts MATCH 'slogan'")
    expect(afterUpdate).toHaveLength(1)

    const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version')
    expect(version?.user_version).toBe(3)
  })
})
```

- [ ] **Step 3: Run to verify failure**

Run: `npx jest src/lib/db.test.ts`
Expected: FAIL — `LOCAL_SPACE_ID`/`migrate` not exported.

- [ ] **Step 4: Replace `src/lib/db.ts`**

```ts
import * as SQLite from 'expo-sqlite'

// The on-device space for guests and not-yet-adopted prompts. Same UUID the v1/v2
// "personal vault" used, so existing rows need no rewrite.
export const LOCAL_SPACE_ID = '00000000-0000-4000-8000-000000000001'

const DATABASE_VERSION = 3

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync('promptvaults.db').then(async (db) => {
      await migrate(db)
      return db
    })
  }
  return dbPromise
}

const FTS_TRIGGERS = `
  CREATE TRIGGER IF NOT EXISTS prompts_ai AFTER INSERT ON prompts BEGIN
    INSERT INTO prompts_fts(rowid, title, content, category, tags)
    VALUES (new.rowid, new.title, new.content, new.category, new.tags);
  END;

  CREATE TRIGGER IF NOT EXISTS prompts_ad AFTER DELETE ON prompts BEGIN
    INSERT INTO prompts_fts(prompts_fts, rowid, title, content, category, tags)
    VALUES ('delete', old.rowid, old.title, old.content, old.category, old.tags);
  END;

  CREATE TRIGGER IF NOT EXISTS prompts_au AFTER UPDATE ON prompts BEGIN
    INSERT INTO prompts_fts(prompts_fts, rowid, title, content, category, tags)
    VALUES ('delete', old.rowid, old.title, old.content, old.category, old.tags);
    INSERT INTO prompts_fts(rowid, title, content, category, tags)
    VALUES (new.rowid, new.title, new.content, new.category, new.tags);
  END;
`

const MIGRATION_V1 = `
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS vaults (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('personal','group')),
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS prompts (
    id TEXT PRIMARY KEY,
    vault_id TEXT NOT NULL REFERENCES vaults(id),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT,
    tags TEXT,
    is_favorite INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    synced_at INTEGER
  );

  CREATE VIRTUAL TABLE IF NOT EXISTS prompts_fts USING fts5(
    title, content, category, tags,
    content='prompts', content_rowid='rowid'
  );
  ${FTS_TRIGGERS}
`

// vaults.type has CHECK(type IN ('personal','group')) and prompts.vault_id references it,
// so prompts is rebuilt. rowid is copied explicitly to keep prompts_fts aligned, and the
// 'rebuild' command makes FTS consistent regardless.
const MIGRATION_V3 = `
  CREATE TABLE spaces (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK(kind IN ('local','personal','family','team')),
    name TEXT NOT NULL,
    can_manage INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  INSERT INTO spaces (id, kind, name, can_manage, created_at)
    SELECT id, 'local', 'Trên máy này', 1, created_at FROM vaults WHERE type = 'personal';

  CREATE TABLE prompts_v3 (
    id TEXT PRIMARY KEY,
    space_id TEXT NOT NULL REFERENCES spaces(id),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT,
    tags TEXT,
    is_favorite INTEGER DEFAULT 0,
    copy_count INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    synced_at INTEGER,
    version INTEGER NOT NULL DEFAULT 0,
    has_conflict INTEGER NOT NULL DEFAULT 0
  );
  INSERT INTO prompts_v3 (rowid, id, space_id, title, content, category, tags, is_favorite,
                          copy_count, created_at, updated_at, synced_at)
    SELECT rowid, id, vault_id, title, content, category, tags, is_favorite,
           copy_count, created_at, updated_at, NULL FROM prompts;

  DROP TRIGGER IF EXISTS prompts_ai;
  DROP TRIGGER IF EXISTS prompts_ad;
  DROP TRIGGER IF EXISTS prompts_au;
  DROP TABLE prompts;
  ALTER TABLE prompts_v3 RENAME TO prompts;
  CREATE INDEX idx_prompts_space ON prompts(space_id, updated_at);
  ${FTS_TRIGGERS}
  INSERT INTO prompts_fts(prompts_fts) VALUES('rebuild');
  DROP TABLE vaults;

  CREATE TABLE sync_outbox (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    space_id TEXT NOT NULL,
    prompt_id TEXT NOT NULL,
    operation TEXT NOT NULL CHECK(operation IN ('insert','update','delete')),
    base_version INTEGER NOT NULL,
    in_flight INTEGER NOT NULL DEFAULT 0,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX idx_outbox_space ON sync_outbox(space_id, seq);
  CREATE INDEX idx_outbox_prompt ON sync_outbox(prompt_id);

  CREATE TABLE sync_state (
    space_id TEXT PRIMARY KEY,
    cursor INTEGER NOT NULL DEFAULT 0,
    last_pulled_at INTEGER
  );

  CREATE TABLE sync_conflicts (
    conflict_id TEXT PRIMARY KEY,
    space_id TEXT NOT NULL,
    prompt_id TEXT NOT NULL,
    local_payload TEXT,
    remote_payload TEXT NOT NULL,
    remote_version INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
`

export async function migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version')
  const currentVersion = row?.user_version ?? 0
  if (currentVersion >= DATABASE_VERSION) return

  if (currentVersion < 1) {
    await db.execAsync(MIGRATION_V1)
    await db.runAsync(
      'INSERT OR IGNORE INTO vaults (id, name, type, created_at) VALUES (?, ?, ?, ?)',
      LOCAL_SPACE_ID,
      'Kho cá nhân',
      'personal',
      Date.now(),
    )
  }

  if (currentVersion < 2) {
    await db.execAsync('ALTER TABLE prompts ADD COLUMN copy_count INTEGER NOT NULL DEFAULT 0')
  }

  if (currentVersion < 3) {
    await db.withTransactionAsync(() => db.execAsync(MIGRATION_V3))
  }

  await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`)
}
```

- [ ] **Step 5: Rename the vault concept in `src/lib/prompts.ts`**

Apply these exact edits:
- `export type Prompt`: replace `vaultId: string` with `spaceId: string`; add `version: number` and `hasConflict: boolean` after `updatedAt`.
- `type PromptRow`: replace `vault_id: string` with `space_id: string`; add `version: number` and `has_conflict: number`.
- `SELECT_COLUMNS`:
  ```ts
  const SELECT_COLUMNS =
    'id, space_id, title, content, category, is_favorite, copy_count, created_at, updated_at, version, has_conflict'
  ```
- `fromRow`: `spaceId: row.space_id,` and add `version: row.version, hasConflict: row.has_conflict === 1,`.
- `listPrompts(spaceId: string, options: ListPromptsOptions = {})`: `const conditions = ['p.space_id = ?']`, `const params: (string | number)[] = [spaceId]`, and the SELECT list becomes
  `SELECT p.id, p.space_id, p.title, p.content, p.category, p.is_favorite, p.copy_count, p.created_at, p.updated_at, p.version, p.has_conflict`.
- `CreatePromptInput`: `spaceId: string` instead of `vaultId`.
- `createPrompt`: INSERT column list `(id, space_id, title, content, category, is_favorite, copy_count, created_at, updated_at)`, bind `input.spaceId`; the returned object has `spaceId: input.spaceId` and ends with `version: 0, hasConflict: false`.

- [ ] **Step 6: Update callers**

```bash
sed -i 's/PERSONAL_VAULT_ID/LOCAL_SPACE_ID/g; s/vaultId:/spaceId:/g' src/lib/prompts.test.ts src/hooks/usePrompts.ts src/app/prompt-edit.tsx
```

Check: `grep -rn "PERSONAL_VAULT_ID\|vaultId\|vault_id" src` → no output.

- [ ] **Step 7: Run tests and type-check**

Run: `npx jest src/lib && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add __mocks__/expo-sqlite.js src/lib/db.ts src/lib/db.test.ts src/lib/prompts.ts src/lib/prompts.test.ts src/hooks/usePrompts.ts src/app/prompt-edit.tsx
git commit -m "feat(db): schema v3 with spaces, outbox, sync state and conflicts"
```

---

### Task 10: Deterministic category ids

**Depends on:** nothing (local only).

**Files:**
- Create: `src/lib/categoryId.ts`, `src/lib/categoryId.test.ts`

**Interfaces:**
- Consumes: `PROMPT_CATEGORIES` (`src/lib/prompts.ts`).
- Produces: `categoryIdFor(spaceId: string, name: string): Promise<string>` (lowercase UUID, version nibble 8, RFC 9562 variant); `categoryNameFor(spaceId: string, categoryId: string | null): Promise<string | null>`.

- [ ] **Step 1: Write the failing tests** — `src/lib/categoryId.test.ts`:

```ts
jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: async (_algorithm: string, value: string) =>
    require('crypto').createHash('sha256').update(value).digest('hex'),
}))

import { categoryIdFor, categoryNameFor } from './categoryId'

const UUID_V8 = /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('categoryIdFor', () => {
  it('is a stable v8 UUID per (space, name)', async () => {
    const a = await categoryIdFor('space-1', 'Marketing')
    expect(a).toMatch(UUID_V8)
    expect(await categoryIdFor('space-1', ' marketing ')).toBe(a)
    expect(await categoryIdFor('space-2', 'Marketing')).not.toBe(a)
  })
})

describe('categoryNameFor', () => {
  it('maps an id produced by any device back to the app category', async () => {
    const id = await categoryIdFor('space-1', 'Năng suất')
    expect(await categoryNameFor('space-1', id.toUpperCase())).toBe('Năng suất')
  })

  it('returns null for ids created by other clients or no category', async () => {
    expect(await categoryNameFor('space-1', '11111111-1111-4111-8111-111111111111')).toBeNull()
    expect(await categoryNameFor('space-1', null)).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify failure** — `npx jest src/lib/categoryId.test.ts` → FAIL (module not found).

- [ ] **Step 3: Write `src/lib/categoryId.ts`**

```ts
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
```

- [ ] **Step 4: Run tests and type-check** — `npx jest src/lib/categoryId.test.ts && npx tsc --noEmit` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/categoryId.ts src/lib/categoryId.test.ts
git commit -m "feat(sync): deterministic category ids per space"
```

---

### Task 11: Spaces — `/spaces/me`, `/spaces/team`, local mirror

**Depends on:** `2026-09-25-promptvault-space-and-prompt-domain.md` (`SpacesController`) deployed — merged on the backend.

**Contract (verified 2026-09-26, spec §0 C23):** `GET /spaces/me` → envelope `data: SpaceResponse[]`; `POST /spaces/team { name }` (1–120 chars) → envelope `data: SpaceResponse` with `canManage: true` (creator is Owner); `SpaceResponse = { spaceUuid, spaceType: 'Personal'|'Family'|'Team', name, canManage, createdAtMillis }` (`AioKin/Models/ViewModel/Vault/SpaceResponse.cs`). The personal space is auto-created on `GET /spaces/me` and named `"Personal"`. Errors: `422 ValidationError` (bad name), `404 UserNotFound`. Member endpoints (`GET/POST /spaces/{uuid}/members`, `DELETE /spaces/{uuid}/members/{userUuid}`) exist but are out of scope for this plan.

**Files:**
- Create: `src/lib/spaces.ts`, `src/lib/spaces.test.ts`

**Interfaces:**
- Consumes: `apiClient` (auth), `getDb`, `LOCAL_SPACE_ID`.
- Produces: `type SpaceKind = 'local' | 'personal' | 'family' | 'team'`; `type Space = { id: string; kind: SpaceKind; name: string; canManage: boolean; createdAt: number }`; `listSpaces(): Promise<Space[]>`; `getSpace(id): Promise<Space | null>`; `fetchAndStoreMySpaces(): Promise<Space[]>` (remote spaces only; stale ones and their data removed locally); `createTeamSpace(name): Promise<Space>`; `wipeSyncedSpaces(): Promise<void>`.

- [ ] **Step 1: Write the failing tests** — `src/lib/spaces.test.ts`:

```ts
jest.mock('@/services/apiClient', () => ({
  apiClient: { get: jest.fn(), post: jest.fn() },
}))

import { apiClient } from '@/services/apiClient'

import { getDb, LOCAL_SPACE_ID } from './db'
import { createTeamSpace, fetchAndStoreMySpaces, listSpaces, wipeSyncedSpaces } from './spaces'

const personal = {
  spaceUuid: 'aaaaaaaa-0000-4000-8000-000000000001',
  spaceType: 'Personal',
  name: 'Personal',
  canManage: true,
  createdAtMillis: 10,
}
const team = {
  spaceUuid: 'bbbbbbbb-0000-4000-8000-000000000002',
  spaceType: 'Team',
  name: 'Team A',
  canManage: false,
  createdAtMillis: 20,
}

beforeEach(async () => {
  jest.clearAllMocks()
  const db = await getDb()
  await db.execAsync(`
    DELETE FROM prompts; DELETE FROM sync_outbox; DELETE FROM sync_state; DELETE FROM sync_conflicts;
    DELETE FROM spaces WHERE kind <> 'local';
  `)
})

describe('spaces', () => {
  it('mirrors /spaces/me and keeps the local space first', async () => {
    ;(apiClient.get as jest.Mock).mockResolvedValue([team, personal])

    const remote = await fetchAndStoreMySpaces()

    expect(apiClient.get).toHaveBeenCalledWith('/spaces/me', { auth: true })
    expect(remote.map((s) => s.kind)).toEqual(['team', 'personal'])
    expect((await listSpaces()).map((s) => s.id)).toEqual([
      LOCAL_SPACE_ID,
      personal.spaceUuid,
      team.spaceUuid,
    ])
  })

  it('removes spaces the user lost access to, with their prompts and outbox', async () => {
    ;(apiClient.get as jest.Mock).mockResolvedValueOnce([personal, team])
    await fetchAndStoreMySpaces()
    const db = await getDb()
    await db.runAsync(
      "INSERT INTO prompts (id, space_id, title, content, created_at, updated_at) VALUES ('p1', ?, 't', 'c', 1, 1)",
      team.spaceUuid,
    )
    await db.runAsync(
      "INSERT INTO sync_outbox (space_id, prompt_id, operation, base_version, created_at) VALUES (?, 'p1', 'insert', 0, 1)",
      team.spaceUuid,
    )

    ;(apiClient.get as jest.Mock).mockResolvedValueOnce([personal])
    await fetchAndStoreMySpaces()

    expect(await db.getFirstAsync('SELECT id FROM prompts WHERE id = ?', 'p1')).toBeNull()
    expect(await db.getFirstAsync('SELECT seq FROM sync_outbox')).toBeNull()
    expect((await listSpaces()).map((s) => s.kind)).toEqual(['local', 'personal'])
  })

  it('ignores space types it does not know', async () => {
    ;(apiClient.get as jest.Mock).mockResolvedValue([personal, { ...team, spaceType: 'Galaxy' }])
    expect(await fetchAndStoreMySpaces()).toHaveLength(1)
  })

  it('creates a team space (the creator is Owner, so canManage is true)', async () => {
    ;(apiClient.post as jest.Mock).mockResolvedValue({ ...team, canManage: true })
    const space = await createTeamSpace('Team A')
    expect(apiClient.post).toHaveBeenCalledWith('/spaces/team', { name: 'Team A' }, { auth: true })
    expect(space).toEqual({ id: team.spaceUuid, kind: 'team', name: 'Team A', canManage: true, createdAt: 20 })
  })

  it('wipeSyncedSpaces keeps only the local space and its prompts', async () => {
    ;(apiClient.get as jest.Mock).mockResolvedValue([personal])
    await fetchAndStoreMySpaces()
    const db = await getDb()
    await db.runAsync(
      "INSERT INTO prompts (id, space_id, title, content, created_at, updated_at) VALUES ('mine', ?, 't', 'c', 1, 1), ('synced', ?, 't', 'c', 1, 1)",
      LOCAL_SPACE_ID,
      personal.spaceUuid,
    )

    await wipeSyncedSpaces()

    const ids = (await db.getAllAsync<{ id: string }>('SELECT id FROM prompts')).map((r) => r.id)
    expect(ids).toEqual(['mine'])
    expect((await listSpaces()).map((s) => s.kind)).toEqual(['local'])
  })
})
```

- [ ] **Step 2: Run to verify failure** — `npx jest src/lib/spaces.test.ts` → FAIL (module not found).

- [ ] **Step 3: Write `src/lib/spaces.ts`**

```ts
import type { SQLiteDatabase } from 'expo-sqlite'

import { apiClient } from '@/services/apiClient'

import { getDb } from './db'

export type SpaceKind = 'local' | 'personal' | 'family' | 'team'

export type Space = {
  id: string
  kind: SpaceKind
  name: string
  canManage: boolean
  createdAt: number
}

// AioKin SpaceResponse (AioKin/Models/ViewModel/Vault/SpaceResponse.cs).
type SpaceResponse = {
  spaceUuid: string
  spaceType: string
  name: string
  canManage: boolean
  createdAtMillis: number
}

type SpaceRow = { id: string; kind: SpaceKind; name: string; can_manage: number; created_at: number }

function fromRow(row: SpaceRow): Space {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    canManage: row.can_manage === 1,
    createdAt: row.created_at,
  }
}

function fromResponse(response: SpaceResponse): Space | null {
  const kind = response.spaceType.toLowerCase()
  if (kind !== 'personal' && kind !== 'family' && kind !== 'team') return null
  return {
    id: response.spaceUuid,
    kind,
    name: response.name,
    canManage: response.canManage,
    createdAt: response.createdAtMillis,
  }
}

async function upsertSpace(db: SQLiteDatabase, space: Space): Promise<void> {
  await db.runAsync(
    `INSERT INTO spaces (id, kind, name, can_manage, created_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, name = excluded.name, can_manage = excluded.can_manage`,
    space.id,
    space.kind,
    space.name,
    space.canManage ? 1 : 0,
    space.createdAt,
  )
}

// Caller owns the transaction.
async function removeSpaceData(db: SQLiteDatabase, spaceId: string): Promise<void> {
  await db.runAsync('DELETE FROM prompts WHERE space_id = ?', spaceId)
  await db.runAsync('DELETE FROM sync_outbox WHERE space_id = ?', spaceId)
  await db.runAsync('DELETE FROM sync_state WHERE space_id = ?', spaceId)
  await db.runAsync('DELETE FROM sync_conflicts WHERE space_id = ?', spaceId)
  await db.runAsync('DELETE FROM spaces WHERE id = ?', spaceId)
}

export async function listSpaces(): Promise<Space[]> {
  const db = await getDb()
  const rows = await db.getAllAsync<SpaceRow>(
    `SELECT id, kind, name, can_manage, created_at FROM spaces
     ORDER BY CASE kind WHEN 'local' THEN 0 WHEN 'personal' THEN 1 ELSE 2 END, created_at`,
  )
  return rows.map(fromRow)
}

export async function getSpace(id: string): Promise<Space | null> {
  const db = await getDb()
  const row = await db.getFirstAsync<SpaceRow>(
    'SELECT id, kind, name, can_manage, created_at FROM spaces WHERE id = ?',
    id,
  )
  return row ? fromRow(row) : null
}

// GET /spaces/me also auto-creates the personal space on the backend.
export async function fetchAndStoreMySpaces(): Promise<Space[]> {
  const response = await apiClient.get<SpaceResponse[]>('/spaces/me', { auth: true })
  const spaces = response.map(fromResponse).filter((s): s is Space => s !== null)
  const keep = new Set(spaces.map((s) => s.id))
  const db = await getDb()
  await db.withTransactionAsync(async () => {
    for (const space of spaces) await upsertSpace(db, space)
    const existing = await db.getAllAsync<{ id: string }>("SELECT id FROM spaces WHERE kind <> 'local'")
    for (const { id } of existing) {
      if (!keep.has(id)) await removeSpaceData(db, id)
    }
  })
  return spaces
}

export async function createTeamSpace(name: string): Promise<Space> {
  const response = await apiClient.post<SpaceResponse>('/spaces/team', { name }, { auth: true })
  const space = fromResponse(response)
  if (!space) throw new Error('unexpected_space_type')
  const db = await getDb()
  await upsertSpace(db, space)
  return space
}

export async function wipeSyncedSpaces(): Promise<void> {
  const db = await getDb()
  await db.withTransactionAsync(async () => {
    const synced = await db.getAllAsync<{ id: string }>("SELECT id FROM spaces WHERE kind <> 'local'")
    for (const { id } of synced) await removeSpaceData(db, id)
  })
}
```

- [ ] **Step 4: Run tests and type-check** — `npx jest src/lib/spaces.test.ts && npx tsc --noEmit` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/spaces.ts src/lib/spaces.test.ts
git commit -m "feat(spaces): mirror AioKin spaces locally"
```

---

### Task 12: Current space store and the Space switcher

**Depends on:** Task 11 (and therefore the space-and-prompt-domain backend plan).

**Files:**
- Create: `src/store/spaceStore.ts`, `src/store/spaceStore.test.ts`
- Modify: `src/store/index.ts`
- Modify: `src/app/vault-switcher.tsx` (whole file)
- Modify: `src/hooks/usePrompts.ts`, `src/app/prompt-edit.tsx`

**Interfaces:**
- Produces: `useSpaceStore` with `{ currentSpaceId: string; ownerUserId: string | null; setCurrentSpace(id: string): void; setOwner(userId: string | null): void; reset(): void }`, persisted as `space-store` in AsyncStorage.

- [ ] **Step 1: Write the failing tests** — `src/store/spaceStore.test.ts`:

```ts
const mockStorage = new Map<string, string>()
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: async (key: string) => mockStorage.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      mockStorage.set(key, value)
    },
    removeItem: async (key: string) => {
      mockStorage.delete(key)
    },
  },
}))

import { LOCAL_SPACE_ID } from '@/lib/db'

import { useSpaceStore } from './spaceStore'

beforeEach(() => useSpaceStore.getState().reset())

describe('spaceStore', () => {
  it('starts on the local space with no owner', () => {
    expect(useSpaceStore.getState().currentSpaceId).toBe(LOCAL_SPACE_ID)
    expect(useSpaceStore.getState().ownerUserId).toBeNull()
  })

  it('persists the current space and owner', async () => {
    useSpaceStore.getState().setCurrentSpace('space-1')
    useSpaceStore.getState().setOwner('user-1')
    await Promise.resolve()
    expect(JSON.parse(mockStorage.get('space-store')!).state).toEqual({
      currentSpaceId: 'space-1',
      ownerUserId: 'user-1',
    })
  })

  it('reset returns to the local space', () => {
    useSpaceStore.getState().setCurrentSpace('space-1')
    useSpaceStore.getState().reset()
    expect(useSpaceStore.getState().currentSpaceId).toBe(LOCAL_SPACE_ID)
  })
})
```

- [ ] **Step 2: Run to verify failure** — `npx jest src/store/spaceStore.test.ts` → FAIL.

- [ ] **Step 3: Write `src/store/spaceStore.ts`**

```ts
import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

import { LOCAL_SPACE_ID } from '@/lib/db'

type SpaceState = {
  currentSpaceId: string
  // Whose synced spaces are in SQLite — a different account signing in wipes them first.
  ownerUserId: string | null
  setCurrentSpace: (id: string) => void
  setOwner: (userId: string | null) => void
  reset: () => void
}

export const useSpaceStore = create<SpaceState>()(
  persist(
    (set) => ({
      currentSpaceId: LOCAL_SPACE_ID,
      ownerUserId: null,
      setCurrentSpace: (id) => set({ currentSpaceId: id }),
      setOwner: (userId) => set({ ownerUserId: userId }),
      reset: () => set({ currentSpaceId: LOCAL_SPACE_ID, ownerUserId: null }),
    }),
    {
      name: 'space-store',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        currentSpaceId: state.currentSpaceId,
        ownerUserId: state.ownerUserId,
      }),
    },
  ),
)
```

Add to `src/store/index.ts`: `export { useSpaceStore } from './spaceStore'`

- [ ] **Step 4: Use the current space**

`src/hooks/usePrompts.ts`: replace `import { LOCAL_SPACE_ID } from '@/lib/db'` with `import { useSpaceStore } from '@/store'`; inside the hook add `const spaceId = useSpaceStore((state) => state.currentSpaceId)`; call `listPrompts(spaceId, { category, query, favoritesOnly })`; `reload`'s dependency array becomes `[spaceId, category, query, favoritesOnly]`.

`src/app/prompt-edit.tsx`: replace the `LOCAL_SPACE_ID` import with `import { useSpaceStore } from '@/store'`; in `createPrompt({...})` use `spaceId: useSpaceStore.getState().currentSpaceId,`.

- [ ] **Step 5: Replace `src/app/vault-switcher.tsx`**

```tsx
import { useCallback, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useFocusEffect } from 'expo-router'

import { Icon } from '@/components/Icon'
import { Button, TextField } from '@/components/ui'
import { toAuthError } from '@/lib/authForm'
import { createTeamSpace, fetchAndStoreMySpaces, listSpaces, type Space } from '@/lib/spaces'
import { goBack, push } from '@/navigation'
import { useAuthStore, useSpaceStore } from '@/store'
import { makeStyles, text, useTheme } from '@/theme'

function spaceLabel(space: Space): string {
  if (space.kind === 'local') return 'Trên máy này'
  if (space.kind === 'personal') return 'Kho cá nhân'
  return space.name
}

export default function VaultSwitcherScreen() {
  const styles = useStyles()
  const { colors } = useTheme()
  const user = useAuthStore((state) => state.user)
  const currentSpaceId = useSpaceStore((state) => state.currentSpaceId)
  const setCurrentSpace = useSpaceStore((state) => state.setCurrentSpace)
  const [spaces, setSpaces] = useState<Space[]>([])
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useFocusEffect(
    useCallback(() => {
      let active = true
      listSpaces().then((local) => {
        if (active) setSpaces(local)
      })
      if (user) {
        fetchAndStoreMySpaces()
          .then(() => listSpaces())
          .then((fresh) => {
            if (active) setSpaces(fresh)
          })
          .catch(() => undefined) // offline: keep the local list
      }
      return () => {
        active = false
      }
    }, [user]),
  )

  function choose(space: Space) {
    setCurrentSpace(space.id)
    goBack('home')
  }

  async function handleCreate() {
    if (!name.trim()) {
      setError('Vui lòng nhập tên kho.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const space = await createTeamSpace(name.trim())
      setCurrentSpace(space.id)
      goBack('home')
    } catch (e) {
      setError(toAuthError(e).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Chọn kho lưu trữ</Text>

      {spaces.map((space) => (
        <Pressable key={space.id} style={styles.row} onPress={() => choose(space)}>
          <View style={styles.rowLeading}>
            <Icon
              name={space.kind === 'family' || space.kind === 'team' ? 'home' : 'lock'}
              size={20}
              color={colors.onSurfaceVariant}
            />
            <Text style={styles.label}>{spaceLabel(space)}</Text>
          </View>
          {space.id === currentSpaceId && <Icon name="check" size={20} color={colors.primary} />}
        </Pressable>
      ))}

      {creating ? (
        <View style={styles.createForm}>
          <TextField label="Tên kho" value={name} onChangeText={setName} error={error} />
          <Button label="Tạo" onPress={handleCreate} loading={saving} />
        </View>
      ) : (
        <Pressable style={styles.row} onPress={() => (user ? setCreating(true) : push('login'))}>
          <View style={styles.rowLeading}>
            <Icon name="add" size={20} color={colors.primary} />
            <Text style={styles.newLabel}>
              {user ? 'Tạo kho mới' : 'Đăng nhập để tạo kho nhóm'}
            </Text>
          </View>
        </Pressable>
      )}
    </View>
  )
}

const useStyles = makeStyles(({ colors, spacing }) => ({
  container: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  title: { ...text('headlineSmall'), color: colors.onSurface, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
  },
  rowLeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  label: { ...text('bodyLarge'), color: colors.onSurface },
  newLabel: { ...text('bodyLarge'), color: colors.primary },
  createForm: { gap: spacing.md },
}))
```

(`Icon` names `lock`, `check`, `add`, `home` are already used in the app; `TextField.error` accepts `string | null | undefined`.)

Note (2026-09-26, spec §0 C18): in family/team spaces where `canManage` is false the user may still create prompts and edit **their own**, but edits/deletes of other members' prompts are rejected by the server. The app cannot tell who authored a prompt (gap G13), so this task does not hide any edit UI; Task 14 restores the server copy when such an edit is rejected.

- [ ] **Step 6: Verify** — `npx jest src/store && npx tsc --noEmit` → PASS. Manual: signed in → switcher lists "Trên máy này" and "Kho cá nhân"; creating "Team A" switches to it and Home is empty.

- [ ] **Step 7: Commit**

```bash
git add src/store/spaceStore.ts src/store/spaceStore.test.ts src/store/index.ts src/app/vault-switcher.tsx src/hooks/usePrompts.ts src/app/prompt-edit.tsx
git commit -m "feat(spaces): current-space store and AioKin space switcher"
```

---

### Task 13: Outbox and outbox-writing prompt mutations

**Depends on:** Task 9 (local only).

> **Already implemented** (commits `2235810`, `b4ae55d`). The shipped code differs from the text below in two ways that later tasks rely on (spec §0.1 D5): `completeRow(db, seq, newVersion?)` also rebases other queued, non-in-flight rows of the same prompt onto `newVersion`; `claimBatch` returns at most one row per prompt, never a row whose prompt already has one in flight, and skips prompts with `has_conflict = 1`. Tasks 14 and 18 are written against the shipped signatures. No backend contract change affects this task.

**Files:**
- Create: `src/lib/outbox.ts`, `src/lib/outbox.test.ts`
- Modify: `src/lib/prompts.ts` (`createPrompt`, `updatePrompt`, `deletePrompt`, new `setPromptWriteListener`)
- Modify: `src/lib/prompts.test.ts` (append)

**Interfaces:**
- Produces (`outbox`): `type OutboxOperation = 'insert' | 'update' | 'delete'`; `type OutboxRow = { seq: number; space_id: string; prompt_id: string; operation: OutboxOperation; base_version: number; attempts: number }`; `enqueue(db, spaceId, promptId, operation, baseVersion): Promise<void>`; `claimBatch(db, spaceId, limit): Promise<OutboxRow[]>`; `completeRow(db, seq): Promise<void>`; `releaseRows(db, seqs: number[], error: string): Promise<void>`; `resetInFlight(db): Promise<void>`; `hasPending(db, promptId): Promise<boolean>`; `pendingCount(db): Promise<number>`.
- Produces (`prompts`): `setPromptWriteListener(listener: (() => void) | null): void` — called after any write to a non-local space.

- [ ] **Step 1: Write the failing tests** — `src/lib/outbox.test.ts`:

```ts
import { getDb } from './db'
import { claimBatch, enqueue, hasPending, pendingCount, releaseRows, resetInFlight } from './outbox'

type Row = { prompt_id: string; operation: string; base_version: number; in_flight: number }

async function rows(): Promise<Row[]> {
  const db = await getDb()
  return db.getAllAsync<Row>(
    'SELECT prompt_id, operation, base_version, in_flight FROM sync_outbox ORDER BY seq',
  )
}

beforeEach(async () => {
  const db = await getDb()
  await db.execAsync('DELETE FROM sync_outbox')
})

describe('enqueue coalescing', () => {
  it('insert then update stays a single insert', async () => {
    const db = await getDb()
    await enqueue(db, 's', 'p', 'insert', 0)
    await enqueue(db, 's', 'p', 'update', 0)
    expect(await rows()).toEqual([{ prompt_id: 'p', operation: 'insert', base_version: 0, in_flight: 0 }])
  })

  it('insert then delete removes the row — the server never saw it', async () => {
    const db = await getDb()
    await enqueue(db, 's', 'p', 'insert', 0)
    await enqueue(db, 's', 'p', 'delete', 0)
    expect(await rows()).toEqual([])
  })

  it('update then update keeps the original base version', async () => {
    const db = await getDb()
    await enqueue(db, 's', 'p', 'update', 3)
    await enqueue(db, 's', 'p', 'update', 3)
    expect(await rows()).toEqual([{ prompt_id: 'p', operation: 'update', base_version: 3, in_flight: 0 }])
  })

  it('update then delete becomes a delete on the same base', async () => {
    const db = await getDb()
    await enqueue(db, 's', 'p', 'update', 3)
    await enqueue(db, 's', 'p', 'delete', 3)
    expect(await rows()).toEqual([{ prompt_id: 'p', operation: 'delete', base_version: 3, in_flight: 0 }])
  })

  it('never touches an in-flight row — a new row is queued instead', async () => {
    const db = await getDb()
    await enqueue(db, 's', 'p', 'insert', 0)
    await claimBatch(db, 's', 50)
    await enqueue(db, 's', 'p', 'update', 0)
    expect(await rows()).toEqual([
      { prompt_id: 'p', operation: 'insert', base_version: 0, in_flight: 1 },
      { prompt_id: 'p', operation: 'update', base_version: 0, in_flight: 0 },
    ])
  })
})

describe('claim / release', () => {
  it('claims oldest rows of one space and releases them with the error', async () => {
    const db = await getDb()
    await enqueue(db, 's1', 'a', 'insert', 0)
    await enqueue(db, 's2', 'b', 'insert', 0)
    await enqueue(db, 's1', 'c', 'insert', 0)

    const batch = await claimBatch(db, 's1', 1)
    expect(batch.map((r) => r.prompt_id)).toEqual(['a'])

    await releaseRows(db, batch.map((r) => r.seq), 'network')
    const released = await db.getFirstAsync(
      "SELECT in_flight, attempts, last_error FROM sync_outbox WHERE prompt_id = 'a'",
    )
    expect(released).toEqual({ in_flight: 0, attempts: 1, last_error: 'network' })
    expect(await pendingCount(db)).toBe(3)
    expect(await hasPending(db, 'b')).toBe(true)
  })

  it('resetInFlight recovers rows left in flight by a killed app', async () => {
    const db = await getDb()
    await enqueue(db, 's', 'p', 'insert', 0)
    await claimBatch(db, 's', 50)
    await resetInFlight(db)
    expect((await rows())[0]?.in_flight).toBe(0)
  })
})
```

Append to `src/lib/prompts.test.ts` (add `import { getDb } from './db'` and `setPromptWriteListener` to the existing `./prompts` import):

```ts
describe('prompts in a synced space', () => {
  const SPACE = 'aaaaaaaa-0000-4000-8000-00000000000a'

  beforeAll(async () => {
    const db = await getDb()
    await db.runAsync(
      "INSERT OR IGNORE INTO spaces (id, kind, name, can_manage, created_at) VALUES (?, 'personal', 'P', 1, 1)",
      SPACE,
    )
  })

  async function outboxFor(promptId: string) {
    const db = await getDb()
    return db.getAllAsync<{ operation: string }>(
      'SELECT operation FROM sync_outbox WHERE prompt_id = ? ORDER BY seq',
      promptId,
    )
  }

  it('create + edit queue one insert and notify the write listener', async () => {
    const listener = jest.fn()
    setPromptWriteListener(listener)

    const created = await createPrompt({ spaceId: SPACE, title: 'A', content: 'B', category: null })
    await updatePrompt(created.id, { title: 'A2', content: 'B2', category: 'Marketing' })

    expect(await outboxFor(created.id)).toEqual([{ operation: 'insert' }])
    expect(listener).toHaveBeenCalledTimes(2)
    setPromptWriteListener(null)
  })

  it('create + delete leaves nothing to push', async () => {
    const created = await createPrompt({ spaceId: SPACE, title: 'A', content: 'B', category: null })
    await deletePrompt(created.id)
    expect(await outboxFor(created.id)).toEqual([])
  })

  it('local-space writes never touch the outbox', async () => {
    const created = await createPrompt({ spaceId: LOCAL_SPACE_ID, title: 'A', content: 'B', category: null })
    expect(await outboxFor(created.id)).toEqual([])
  })
})
```

- [ ] **Step 2: Run to verify failure** — `npx jest src/lib/outbox.test.ts src/lib/prompts.test.ts` → FAIL.

- [ ] **Step 3: Write `src/lib/outbox.ts`**

```ts
import type { SQLiteDatabase } from 'expo-sqlite'

export type OutboxOperation = 'insert' | 'update' | 'delete'

export type OutboxRow = {
  seq: number
  space_id: string
  prompt_id: string
  operation: OutboxOperation
  base_version: number
  attempts: number
}

// Coalesces against the prompt's pending row that is NOT in flight (spec §11.1). An
// in-flight row is never modified, so an edit made during a push is never lost.
// Caller owns the transaction.
export async function enqueue(
  db: SQLiteDatabase,
  spaceId: string,
  promptId: string,
  operation: OutboxOperation,
  baseVersion: number,
): Promise<void> {
  const pending = await db.getFirstAsync<{ seq: number; operation: OutboxOperation }>(
    'SELECT seq, operation FROM sync_outbox WHERE prompt_id = ? AND in_flight = 0 ORDER BY seq DESC LIMIT 1',
    promptId,
  )

  if (!pending) {
    await db.runAsync(
      'INSERT INTO sync_outbox (space_id, prompt_id, operation, base_version, created_at) VALUES (?, ?, ?, ?, ?)',
      spaceId,
      promptId,
      operation,
      baseVersion,
      Date.now(),
    )
    return
  }

  if (pending.operation === 'insert' && operation === 'delete') {
    // Dropping the row is only safe if no earlier copy is already on its way to the server.
    const inFlight = await db.getFirstAsync<{ seq: number }>(
      'SELECT seq FROM sync_outbox WHERE prompt_id = ? AND in_flight = 1',
      promptId,
    )
    if (inFlight) {
      await db.runAsync("UPDATE sync_outbox SET operation = 'delete' WHERE seq = ?", pending.seq)
    } else {
      await db.runAsync('DELETE FROM sync_outbox WHERE seq = ?', pending.seq)
    }
    return
  }

  if (pending.operation === 'update' && operation === 'delete') {
    await db.runAsync("UPDATE sync_outbox SET operation = 'delete' WHERE seq = ?", pending.seq)
  }
  // insert+update, update+update: the payload is built at push time from the current row.
}

export async function claimBatch(
  db: SQLiteDatabase,
  spaceId: string,
  limit: number,
): Promise<OutboxRow[]> {
  const rows = await db.getAllAsync<OutboxRow>(
    `SELECT seq, space_id, prompt_id, operation, base_version, attempts FROM sync_outbox
     WHERE space_id = ? AND in_flight = 0 ORDER BY seq LIMIT ?`,
    spaceId,
    limit,
  )
  for (const row of rows) {
    await db.runAsync('UPDATE sync_outbox SET in_flight = 1 WHERE seq = ?', row.seq)
  }
  return rows
}

export async function completeRow(db: SQLiteDatabase, seq: number): Promise<void> {
  await db.runAsync('DELETE FROM sync_outbox WHERE seq = ?', seq)
}

export async function releaseRows(db: SQLiteDatabase, seqs: number[], error: string): Promise<void> {
  for (const seq of seqs) {
    await db.runAsync(
      'UPDATE sync_outbox SET in_flight = 0, attempts = attempts + 1, last_error = ? WHERE seq = ?',
      error,
      seq,
    )
  }
}

export async function resetInFlight(db: SQLiteDatabase): Promise<void> {
  await db.runAsync('UPDATE sync_outbox SET in_flight = 0 WHERE in_flight = 1')
}

export async function hasPending(db: SQLiteDatabase, promptId: string): Promise<boolean> {
  const row = await db.getFirstAsync<{ seq: number }>(
    'SELECT seq FROM sync_outbox WHERE prompt_id = ? LIMIT 1',
    promptId,
  )
  return row !== null
}

export async function pendingCount(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM sync_outbox')
  return row?.n ?? 0
}
```

- [ ] **Step 4: Enqueue from `src/lib/prompts.ts`**

Add imports `import type { SQLiteDatabase } from 'expo-sqlite'` and `import { enqueue } from './outbox'`. Add after `toFtsQuery`:

```ts
let writeListener: (() => void) | null = null

// syncEngine registers here (Task 16) so prompts.ts never imports the sync layer.
export function setPromptWriteListener(listener: (() => void) | null): void {
  writeListener = listener
}

async function isSyncedSpace(db: SQLiteDatabase, spaceId: string): Promise<boolean> {
  const row = await db.getFirstAsync<{ kind: string }>('SELECT kind FROM spaces WHERE id = ?', spaceId)
  return row !== null && row.kind !== 'local'
}
```

Replace `createPrompt`, `updatePrompt`, `deletePrompt`:

```ts
export async function createPrompt(input: CreatePromptInput): Promise<Prompt> {
  const db = await getDb()
  const id = Crypto.randomUUID()
  const now = Date.now()
  const synced = await isSyncedSpace(db, input.spaceId)
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO prompts (id, space_id, title, content, category, is_favorite, copy_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)`,
      id,
      input.spaceId,
      input.title,
      input.content,
      input.category,
      now,
      now,
    )
    if (synced) await enqueue(db, input.spaceId, id, 'insert', 0)
  })
  if (synced) writeListener?.()
  return {
    id,
    spaceId: input.spaceId,
    title: input.title,
    content: input.content,
    category: input.category,
    isFavorite: false,
    copyCount: 0,
    createdAt: now,
    updatedAt: now,
    version: 0,
    hasConflict: false,
  }
}

export async function updatePrompt(id: string, input: UpdatePromptInput): Promise<void> {
  const db = await getDb()
  const row = await db.getFirstAsync<{ space_id: string; version: number }>(
    'SELECT space_id, version FROM prompts WHERE id = ?',
    id,
  )
  if (!row) return
  const synced = await isSyncedSpace(db, row.space_id)
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'UPDATE prompts SET title = ?, content = ?, category = ?, updated_at = ? WHERE id = ?',
      input.title,
      input.content,
      input.category,
      Date.now(),
      id,
    )
    if (synced) await enqueue(db, row.space_id, id, 'update', row.version)
  })
  if (synced) writeListener?.()
}

export async function deletePrompt(id: string): Promise<void> {
  const db = await getDb()
  const row = await db.getFirstAsync<{ space_id: string; version: number }>(
    'SELECT space_id, version FROM prompts WHERE id = ?',
    id,
  )
  if (!row) return
  const synced = await isSyncedSpace(db, row.space_id)
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM prompts WHERE id = ?', id)
    if (synced) await enqueue(db, row.space_id, id, 'delete', row.version)
  })
  if (synced) writeListener?.()
}
```

`setFavorite` and `recordCopy` stay unchanged (device-local, spec §9).

- [ ] **Step 5: Run tests and type-check** — `npx jest src/lib && npx tsc --noEmit` → PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/outbox.ts src/lib/outbox.test.ts src/lib/prompts.ts src/lib/prompts.test.ts
git commit -m "feat(sync): outbox with coalescing, written in the same transaction as prompts"
```

---

### Task 14: Push — `POST /sync/push`

**Depends on:** `2026-09-25-promptvault-sync-engine.md` Task 2 — merged on the backend. Task 13 (implemented). **Blocking decision:** spec drift D1 (prompt `description`) — see the note under Step 3.

**Contract (verified 2026-09-26 — spec §0 C1–C7, C18–C21; `AioKin/Models/InputModel/Vault/SyncPushRequest.cs`, `AioKin/Models/ViewModel/Vault/SyncPushBatchResponse.cs`, `SyncPushResponse.cs`, `AioKin/Services/Vault/SyncService.cs:63-810`):**
- Request `{ spaceUuid, entities: [{ promptId, operation: 'insert'|'update'|'delete', baseVersion, payload | null }] }` — **no `deviceId`** (taken from the session).
- `payload = { title, content, description, categoryId?, categoryName?, clearCategory?, tags?, variables? }`. Omitted `categoryId` = unchanged, `clearCategory: true` = clear; omitted `tags`/`variables` = unchanged, `[]` = **clear**. This app never sends `tags`/`variables`. `description` is always replaced.
- Response envelope `data = { results: [{ promptId, status: 'applied'|'conflict'|'rejected', newVersion?, remote?, conflictId?, error? }], appliedCount, conflictCount, rejectedCount, hasFailures }` — 200 even when entries fail.
- `remote` (conflict only) = `{ promptId, title, content, description, categoryId, categoryName: null, version, hasConflict, isDeleted, tags, variables }`.
- `rejected`: permission (`error` starts with `"Ban khong co quyen"` — only the author or a `canManage` member may update/delete someone else's prompt) is permanent; any other `error` may be a transient server fault (gap G14) and must be retried.
- Identical retried insert → `applied` with the existing `newVersion`; delete of an unknown prompt → `applied` without `newVersion`.
- Whole request: `403 Forbidden` when the caller is not a member of the space.

**Files:**
- Create: `src/lib/syncPush.ts`, `src/lib/syncPush.test.ts`
- Modify: `src/lib/outbox.ts` (`claimBatch` gains an optional `skipSeqs`), `src/lib/outbox.test.ts` (append)

**Interfaces:**
- Consumes: `claimBatch`, `completeRow(db, seq, newVersion?)`, `releaseRows`, `hasPending`, `OutboxOperation` (Task 13, as implemented); `categoryIdFor` (Task 10); `apiClient`.
- Produces: `type PromptPayload = { title: string; content: string; description: string | null; categoryId?: string; categoryName?: string; clearCategory?: true }`; `type RemotePrompt = { promptId: string; title: string; content: string; description: string | null; categoryId: string | null; categoryName: string | null; version: number; isDeleted: boolean }`; `type ResolveResponse = { promptId: string; newVersion: number; isDeleted: boolean }`; `buildPayload(spaceId, { title, content, category }, mode: 'insert' | 'update'): Promise<PromptPayload>`; `forceSnapshot(db, spaceId): Promise<void>`; `PERMISSION_REJECTED_PREFIX`; `type PushOutcome = { applied: number; conflicts: number; rejected: number; remaining: boolean }`; `pushSpace(spaceId: string, options?: { batchSize?: number; skipSeqs?: Set<number> }): Promise<PushOutcome>`.
- Changes (`outbox`): `claimBatch(db, spaceId, limit, skipSeqs: readonly number[] = [])`.

- [ ] **Step 1: Write the failing tests** — `src/lib/syncPush.test.ts`:

```ts
jest.mock('@/services/apiClient', () => ({ apiClient: { post: jest.fn() } }))
jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: async (_a: string, value: string) =>
    require('crypto').createHash('sha256').update(value).digest('hex'),
}))

import { apiClient } from '@/services/apiClient'

import { categoryIdFor } from './categoryId'
import { getDb } from './db'
import { enqueue } from './outbox'
import { pushSpace } from './syncPush'

const SPACE = 'aaaaaaaa-0000-4000-8000-000000000001'
const post = apiClient.post as jest.Mock

// AioKin SyncPushBatchResponse (Models/ViewModel/Vault/SyncPushBatchResponse.cs).
function batch(results: Array<Record<string, unknown>>) {
  const count = (status: string) => results.filter((r) => r.status === status).length
  return {
    results,
    appliedCount: count('applied'),
    conflictCount: count('conflict'),
    rejectedCount: count('rejected'),
    hasFailures: count('conflict') + count('rejected') > 0,
  }
}

function remote(overrides: Record<string, unknown> = {}) {
  return {
    promptId: 'p1',
    title: 'Bản khác',
    content: 'Khác',
    description: null,
    categoryId: null,
    categoryName: null,
    version: 2,
    hasConflict: true,
    isDeleted: false,
    tags: [],
    variables: [],
    ...overrides,
  }
}

async function seedPrompt(id: string, version = 0, category: string | null = 'Marketing') {
  const db = await getDb()
  await db.runAsync(
    `INSERT INTO prompts (id, space_id, title, content, category, created_at, updated_at, version)
     VALUES (?, ?, 'Tiêu đề', 'Nội dung', ?, 1, 1, ?)`,
    id,
    SPACE,
    category,
    version,
  )
}

beforeEach(async () => {
  post.mockReset()
  const db = await getDb()
  await db.execAsync(
    'DELETE FROM prompts; DELETE FROM sync_outbox; DELETE FROM sync_conflicts; DELETE FROM sync_state;',
  )
  await db.runAsync(
    "INSERT OR IGNORE INTO spaces (id, kind, name, can_manage, created_at) VALUES (?, 'personal', 'P', 1, 1)",
    SPACE,
  )
})

describe('pushSpace', () => {
  it('sends the AioKin request shape and applies newVersion from the batch response', async () => {
    const db = await getDb()
    await seedPrompt('p1')
    await enqueue(db, SPACE, 'p1', 'insert', 0)
    post.mockResolvedValue(batch([{ promptId: 'p1', status: 'applied', newVersion: 1 }]))

    const outcome = await pushSpace(SPACE)

    expect(post).toHaveBeenCalledWith(
      '/sync/push',
      {
        spaceUuid: SPACE,
        entities: [
          {
            promptId: 'p1',
            operation: 'insert',
            baseVersion: 0,
            payload: {
              title: 'Tiêu đề',
              content: 'Nội dung',
              description: null,
              categoryId: await categoryIdFor(SPACE, 'Marketing'),
              categoryName: 'Marketing',
            },
          },
        ],
      },
      { auth: true },
    )
    const body = post.mock.calls[0]![1]
    expect(body).not.toHaveProperty('deviceId') // device comes from the session (spec §0 C4)
    expect(body.entities[0].payload).not.toHaveProperty('tags') // omitted = unchanged (C6)
    expect(body.entities[0].payload).not.toHaveProperty('variables')
    expect(outcome).toEqual({ applied: 1, conflicts: 0, rejected: 0, remaining: false })
    expect(await db.getFirstAsync('SELECT version FROM prompts WHERE id = ?', 'p1')).toEqual({ version: 1 })
    expect(await db.getFirstAsync('SELECT seq FROM sync_outbox')).toBeNull()
  })

  it('clears the category only on an update whose category is empty', async () => {
    const db = await getDb()
    await seedPrompt('new', 0, null)
    await seedPrompt('old', 3, null)
    await enqueue(db, SPACE, 'new', 'insert', 0)
    await enqueue(db, SPACE, 'old', 'update', 3)
    post.mockResolvedValue(
      batch([
        { promptId: 'new', status: 'applied', newVersion: 1 },
        { promptId: 'old', status: 'applied', newVersion: 4 },
      ]),
    )

    await pushSpace(SPACE)

    const [insert, update] = post.mock.calls[0]![1].entities
    expect(insert.payload).toEqual({ title: 'Tiêu đề', content: 'Nội dung', description: null })
    expect(update.payload).toEqual({
      title: 'Tiêu đề',
      content: 'Nội dung',
      description: null,
      clearCategory: true,
    })
  })

  it('rebases an edit made while the insert was in flight and asks for another round', async () => {
    const db = await getDb()
    await seedPrompt('p1')
    await enqueue(db, SPACE, 'p1', 'insert', 0)
    post.mockImplementation(async () => {
      await enqueue(db, SPACE, 'p1', 'update', 0) // user edits during the request
      return batch([{ promptId: 'p1', status: 'applied', newVersion: 1 }])
    })

    const outcome = await pushSpace(SPACE)

    expect(outcome.remaining).toBe(true)
    expect(await db.getAllAsync('SELECT operation, base_version FROM sync_outbox')).toEqual([
      { operation: 'update', base_version: 1 },
    ])
  })

  it('stores a real conflict for the user', async () => {
    const db = await getDb()
    await seedPrompt('p1', 1)
    await enqueue(db, SPACE, 'p1', 'update', 1)
    post.mockResolvedValue(batch([{ promptId: 'p1', status: 'conflict', conflictId: 'c-1', remote: remote() }]))

    const outcome = await pushSpace(SPACE)

    expect(outcome.conflicts).toBe(1)
    const conflict = await db.getFirstAsync<{ remote_version: number; local_payload: string; remote_payload: string }>(
      "SELECT remote_version, local_payload, remote_payload FROM sync_conflicts WHERE conflict_id = 'c-1'",
    )
    expect(conflict?.remote_version).toBe(2)
    expect(JSON.parse(conflict!.local_payload).title).toBe('Tiêu đề')
    expect(JSON.parse(conflict!.remote_payload).isDeleted).toBe(false)
    expect(await db.getFirstAsync('SELECT has_conflict FROM prompts WHERE id = ?', 'p1')).toEqual({ has_conflict: 1 })
  })

  it('auto-resolves a conflict whose remote already holds exactly what we sent', async () => {
    const db = await getDb()
    await seedPrompt('p1', 1)
    await enqueue(db, SPACE, 'p1', 'update', 1)
    post
      .mockResolvedValueOnce(
        batch([
          {
            promptId: 'p1',
            status: 'conflict',
            conflictId: 'c-2',
            remote: remote({ title: 'Tiêu đề', content: 'Nội dung', categoryId: await categoryIdFor(SPACE, 'Marketing'), version: 2 }),
          },
        ]),
      )
      .mockResolvedValueOnce({ promptId: 'p1', newVersion: 2, isDeleted: false }) // ResolveConflictResponse

    const outcome = await pushSpace(SPACE)

    expect(post).toHaveBeenLastCalledWith('/sync/conflicts/c-2/resolve', { resolution: 'keep_remote' }, { auth: true })
    expect(outcome).toMatchObject({ applied: 1, conflicts: 0 })
    expect(await db.getFirstAsync('SELECT conflict_id FROM sync_conflicts')).toBeNull()
    expect(await db.getFirstAsync('SELECT version, has_conflict FROM prompts WHERE id = ?', 'p1')).toEqual({
      version: 2,
      has_conflict: 0,
    })
  })

  it('auto-resolves our delete against a prompt that is already deleted remotely', async () => {
    const db = await getDb()
    await enqueue(db, SPACE, 'gone', 'delete', 1)
    post
      .mockResolvedValueOnce(
        batch([{ promptId: 'gone', status: 'conflict', conflictId: 'c-3', remote: remote({ promptId: 'gone', isDeleted: true }) }]),
      )
      .mockResolvedValueOnce({ promptId: 'gone', newVersion: 2, isDeleted: true })

    const outcome = await pushSpace(SPACE)

    expect(outcome).toMatchObject({ applied: 1, conflicts: 0 })
    expect(await db.getFirstAsync('SELECT seq FROM sync_outbox')).toBeNull()
    expect(await db.getFirstAsync('SELECT conflict_id FROM sync_conflicts')).toBeNull()
  })

  it('a permission rejection drops the row and forces a snapshot to restore the server copy', async () => {
    const db = await getDb()
    await seedPrompt('p1', 3)
    await db.runAsync("INSERT INTO sync_state (space_id, cursor) VALUES (?, 77)", SPACE)
    await enqueue(db, SPACE, 'p1', 'update', 3)
    post.mockResolvedValue(
      batch([{ promptId: 'p1', status: 'rejected', error: 'Ban khong co quyen sua prompt nay.' }]),
    )

    const outcome = await pushSpace(SPACE)

    expect(outcome).toMatchObject({ applied: 0, rejected: 1, remaining: false })
    expect(await db.getFirstAsync('SELECT seq FROM sync_outbox')).toBeNull()
    expect(await db.getFirstAsync('SELECT cursor FROM sync_state WHERE space_id = ?', SPACE)).toEqual({ cursor: 0 })
  })

  it('any other rejection keeps the row for a later run and skips it for the rest of this run', async () => {
    const db = await getDb()
    await seedPrompt('p1')
    await enqueue(db, SPACE, 'p1', 'insert', 0)
    post.mockResolvedValue(batch([{ promptId: 'p1', status: 'rejected', error: 'Khong the ap dung thay doi nay.' }]))
    const skipSeqs = new Set<number>()

    const first = await pushSpace(SPACE, { skipSeqs })
    const second = await pushSpace(SPACE, { skipSeqs })

    expect(first.rejected).toBe(1)
    expect(second).toEqual({ applied: 0, conflicts: 0, rejected: 0, remaining: false })
    expect(post).toHaveBeenCalledTimes(1)
    expect(await db.getFirstAsync('SELECT in_flight, attempts, last_error FROM sync_outbox')).toEqual({
      in_flight: 0,
      attempts: 1,
      last_error: 'rejected: Khong the ap dung thay doi nay.',
    })
  })

  it('releases the batch and rethrows when the request fails', async () => {
    const db = await getDb()
    await seedPrompt('p1')
    await enqueue(db, SPACE, 'p1', 'insert', 0)
    post.mockRejectedValue(Object.assign(new Error('offline'), { code: 'network' }))

    await expect(pushSpace(SPACE)).rejects.toThrow('offline')
    expect(await db.getFirstAsync('SELECT in_flight, attempts FROM sync_outbox')).toEqual({
      in_flight: 0,
      attempts: 1,
    })
  })

  it('holds back a locally deleted prompt that has an unresolved conflict', async () => {
    const db = await getDb()
    // No prompts row (deleted locally), so claimBatch's has_conflict filter can't see the conflict.
    await db.runAsync(
      "INSERT INTO sync_conflicts (conflict_id, space_id, prompt_id, local_payload, remote_payload, remote_version, created_at) VALUES ('c-4', ?, 'p1', NULL, '{}', 2, 1)",
      SPACE,
    )
    await enqueue(db, SPACE, 'p1', 'delete', 1)

    const outcome = await pushSpace(SPACE)

    expect(post).not.toHaveBeenCalled()
    expect(outcome.remaining).toBe(false)
    expect(await db.getFirstAsync('SELECT in_flight FROM sync_outbox')).toEqual({ in_flight: 0 })
  })
})
```

Append to `src/lib/outbox.test.ts`:

```ts
describe('claimBatch skipSeqs', () => {
  it('never returns a skipped row, nor a later row of the same prompt', async () => {
    const db = await getDb()
    await enqueue(db, 's', 'a', 'insert', 0)
    await enqueue(db, 's', 'b', 'insert', 0)
    const [a] = await claimBatch(db, 's', 1)
    await releaseRows(db, [a!.seq], 'rejected: x')

    const batch = await claimBatch(db, 's', 50, [a!.seq])

    expect(batch.map((r) => r.prompt_id)).toEqual(['b'])
  })
})
```

- [ ] **Step 2: Run to verify failure** — `npx jest src/lib/syncPush.test.ts src/lib/outbox.test.ts` → FAIL (module not found / extra argument ignored).

- [ ] **Step 3: `claimBatch` skip list** — in `src/lib/outbox.ts` (run `impact({target: "claimBatch", direction: "upstream"})` first), give `claimBatch` a fourth parameter and splice it into the existing query; everything else stays as implemented:

```ts
export async function claimBatch(
  db: SQLiteDatabase,
  spaceId: string,
  limit: number,
  // Rows already rejected earlier in this sync run (Task 16 passes one set per space per run).
  skipSeqs: readonly number[] = [],
): Promise<OutboxRow[]> {
  const skip = skipSeqs.length > 0 ? `AND o.seq NOT IN (${skipSeqs.map(() => '?').join(', ')})` : ''
  const rows = await db.getAllAsync<OutboxRow>(
    `SELECT o.seq, o.space_id, o.prompt_id, o.operation, o.base_version, o.attempts
     FROM sync_outbox o
     LEFT JOIN prompts p ON p.id = o.prompt_id
     WHERE o.space_id = ? AND o.in_flight = 0 AND COALESCE(p.has_conflict, 0) = 0 ${skip}
       AND NOT EXISTS (
         SELECT 1 FROM sync_outbox o2
         WHERE o2.prompt_id = o.prompt_id AND (o2.in_flight = 1 OR o2.seq < o.seq)
       )
     ORDER BY o.seq LIMIT ?`,
    spaceId,
    ...skipSeqs,
    limit,
  )
  for (const row of rows) {
    await db.runAsync('UPDATE sync_outbox SET in_flight = 1 WHERE seq = ?', row.seq)
  }
  return rows
}
```

(The `NOT EXISTS … o2.seq < o.seq` clause already keeps a later row of a skipped prompt back, so per-prompt ordering holds.)

> **Description (spec drift D1) — decide before writing Step 4.** The server replaces `description` on every update, and schema v3 has no `description` column, so the code below sends `description: null`, which **erases** a description written by the web/Kotlin client whenever the prompt is edited on the app. Recommended: first add a schema v4 migration (`ALTER TABLE prompts ADD COLUMN description TEXT`, `PRAGMA user_version = 4`) as its own task, then read `description` here and write it in Task 15/18. If the user accepts the loss instead, keep the code as written.

- [ ] **Step 4: Write `src/lib/syncPush.ts`**

```ts
import type { SQLiteDatabase } from 'expo-sqlite'

import { apiClient } from '@/services/apiClient'

import { categoryIdFor } from './categoryId'
import { getDb } from './db'
import { claimBatch, completeRow, hasPending, type OutboxOperation, releaseRows } from './outbox'

// AioKin PromptPayload (Models/InputModel/Vault/SyncPushRequest.cs). Absent keys mean
// "leave unchanged" on the server: tags/variables are never sent (no UI for them, and []
// would wipe them); categoryId/categoryName only when a category is set; clearCategory only
// on an update whose category is empty (spec §0 C5–C7).
export type PromptPayload = {
  title: string
  content: string
  description: string | null // always null until spec drift D1 is decided
  categoryId?: string
  categoryName?: string
  clearCategory?: true
}

// PromptDetailResponse sent as SyncPushResponse.remote (conflicts only). categoryName is
// always null here — only categoryId is filled (spec §0 C19).
export type RemotePrompt = {
  promptId: string
  title: string
  content: string
  description: string | null
  categoryId: string | null
  categoryName: string | null
  version: number
  isDeleted: boolean
}

// AioKin ResolveConflictResponse (Models/ViewModel/Vault/ResolveConflictResponse.cs).
export type ResolveResponse = { promptId: string; newVersion: number; isDeleted: boolean }

type PushEntry = {
  promptId: string
  operation: OutboxOperation
  baseVersion: number
  payload: PromptPayload | null
}

type PushResult = {
  promptId: string
  status: 'applied' | 'conflict' | 'rejected'
  newVersion?: number | null
  remote?: RemotePrompt | null
  conflictId?: string | null
  error?: string | null
}

type PushBatchResponse = {
  results: PushResult[]
  appliedCount: number
  conflictCount: number
  rejectedCount: number
  hasFailures: boolean
}

export type PushOutcome = { applied: number; conflicts: number; rejected: number; remaining: boolean }

// SyncService rejects edits/deletes of someone else's prompt by a non-manager with
// "Ban khong co quyen sua/xoa prompt nay." — permanent. Every other rejection may be a
// transient server fault (spec §0 C3, gap G14), so it is retried on a later run.
export const PERMISSION_REJECTED_PREFIX = 'Ban khong co quyen'

export async function buildPayload(
  spaceId: string,
  prompt: { title: string; content: string; category: string | null },
  mode: 'insert' | 'update',
): Promise<PromptPayload> {
  const payload: PromptPayload = { title: prompt.title, content: prompt.content, description: null }
  if (prompt.category) {
    payload.categoryId = await categoryIdFor(spaceId, prompt.category)
    payload.categoryName = prompt.category
  } else if (mode === 'update') {
    payload.clearCategory = true
  }
  return payload
}

// The next pull of this space returns a full snapshot (since = 0 always does, spec §0 C10),
// which overwrites every prompt that has no pending row or open conflict.
export async function forceSnapshot(db: SQLiteDatabase, spaceId: string): Promise<void> {
  await db.runAsync('UPDATE sync_state SET cursor = 0 WHERE space_id = ?', spaceId)
}

function sameContent(sent: PromptPayload, remote: RemotePrompt): boolean {
  return (
    !remote.isDeleted &&
    sent.title === remote.title &&
    sent.content === remote.content &&
    (sent.description ?? null) === (remote.description ?? null) &&
    (sent.categoryId?.toLowerCase() ?? null) === (remote.categoryId?.toLowerCase() ?? null)
  )
}

async function unclaim(db: SQLiteDatabase, seq: number): Promise<void> {
  await db.runAsync('UPDATE sync_outbox SET in_flight = 0 WHERE seq = ?', seq)
}

async function markApplied(
  db: SQLiteDatabase,
  promptId: string,
  seq: number,
  newVersion: number | null,
): Promise<void> {
  await db.withTransactionAsync(async () => {
    if (newVersion === null) {
      await completeRow(db, seq) // e.g. delete of a prompt the server never had (spec §0 C21)
      return
    }
    // completeRow also rebases edits queued while this row was in flight (Task 13).
    await completeRow(db, seq, newVersion)
    await db.runAsync(
      'UPDATE prompts SET version = ?, synced_at = ?, has_conflict = 0 WHERE id = ?',
      newVersion,
      Date.now(),
      promptId,
    )
  })
}

async function recordConflict(
  db: SQLiteDatabase,
  spaceId: string,
  seq: number,
  promptId: string,
  conflictId: string,
  payload: PromptPayload | null,
  remote: RemotePrompt,
): Promise<void> {
  await db.withTransactionAsync(async () => {
    await completeRow(db, seq)
    await db.runAsync(
      `INSERT OR REPLACE INTO sync_conflicts
         (conflict_id, space_id, prompt_id, local_payload, remote_payload, remote_version, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      conflictId,
      spaceId,
      promptId,
      payload ? JSON.stringify(payload) : null,
      JSON.stringify(remote),
      remote.version,
      Date.now(),
    )
    await db.runAsync('UPDATE prompts SET has_conflict = 1 WHERE id = ?', promptId)
  })
}

export async function pushSpace(
  spaceId: string,
  options: { batchSize?: number; skipSeqs?: Set<number> } = {},
): Promise<PushOutcome> {
  const batchSize = options.batchSize ?? 50
  const skipSeqs = options.skipSeqs ?? new Set<number>()
  const outcome: PushOutcome = { applied: 0, conflicts: 0, rejected: 0, remaining: false }
  const db = await getDb()
  const rows = await claimBatch(db, spaceId, batchSize, [...skipSeqs])
  if (rows.length === 0) return outcome

  const entries: PushEntry[] = []
  const sent = new Map<string, { seq: number; operation: OutboxOperation; payload: PromptPayload | null }>()

  for (const row of rows) {
    // claimBatch filters on prompts.has_conflict, which a locally deleted prompt no longer has.
    const blocked = await db.getFirstAsync<{ conflict_id: string }>(
      'SELECT conflict_id FROM sync_conflicts WHERE prompt_id = ?',
      row.prompt_id,
    )
    if (blocked) {
      await unclaim(db, row.seq) // waits for the user to resolve (Task 18)
      continue
    }
    let payload: PromptPayload | null = null
    if (row.operation !== 'delete') {
      const prompt = await db.getFirstAsync<{ title: string; content: string; category: string | null }>(
        'SELECT title, content, category FROM prompts WHERE id = ?',
        row.prompt_id,
      )
      if (!prompt) {
        await completeRow(db, row.seq) // deleted locally meanwhile; its delete row follows
        continue
      }
      payload = await buildPayload(spaceId, prompt, row.operation)
    }
    entries.push({ promptId: row.prompt_id, operation: row.operation, baseVersion: row.base_version, payload })
    sent.set(row.prompt_id.toLowerCase(), { seq: row.seq, operation: row.operation, payload })
  }

  if (entries.length === 0) return outcome

  let response: PushBatchResponse
  try {
    response = await apiClient.post<PushBatchResponse>(
      '/sync/push',
      { spaceUuid: spaceId, entities: entries },
      { auth: true },
    )
  } catch (error) {
    await releaseRows(
      db,
      [...sent.values()].map((s) => s.seq),
      error instanceof Error ? error.message : String(error),
    )
    throw error
  }

  const answered = new Set<string>()
  let followUp = false

  // HTTP 200 / success:true even when entries failed — read every result (spec §0 C1).
  for (const result of response.results) {
    const key = result.promptId.toLowerCase()
    const entry = sent.get(key)
    if (!entry) continue
    answered.add(key)

    if (result.status === 'applied') {
      await markApplied(db, result.promptId, entry.seq, result.newVersion ?? null)
      outcome.applied += 1
      if (await hasPending(db, result.promptId)) followUp = true // a rebased edit is now claimable
      continue
    }

    if (result.status === 'rejected') {
      outcome.rejected += 1
      if (result.error?.startsWith(PERMISSION_REJECTED_PREFIX)) {
        // Not this user's prompt to change (spec §0 C18). Drop the edit; the snapshot pulled
        // right after this push restores the server copy.
        await db.withTransactionAsync(async () => {
          await completeRow(db, entry.seq)
          await forceSnapshot(db, spaceId)
        })
      } else {
        await releaseRows(db, [entry.seq], `rejected: ${result.error ?? ''}`)
        skipSeqs.add(entry.seq)
      }
      continue
    }

    if (result.status !== 'conflict' || !result.conflictId || !result.remote) {
      await releaseRows(db, [entry.seq], `unexpected_result: ${result.status}`)
      skipSeqs.add(entry.seq)
      continue
    }

    const remote = result.remote
    // Both sides already agree — our delete vs a remote delete, or identical content (e.g.
    // the same edit made on two devices). keep_remote writes nothing server-side and is
    // allowed for every member, so nothing is chosen over anything (no LWW).
    const identical =
      entry.operation === 'delete'
        ? remote.isDeleted
        : entry.payload !== null && sameContent(entry.payload, remote)
    if (identical) {
      try {
        const resolved = await apiClient.post<ResolveResponse>(
          `/sync/conflicts/${result.conflictId}/resolve`,
          { resolution: 'keep_remote' },
          { auth: true },
        )
        await markApplied(db, result.promptId, entry.seq, resolved.newVersion)
        outcome.applied += 1
        continue
      } catch {
        // Could not auto-resolve — show it to the user like any other conflict.
      }
    }

    await recordConflict(db, spaceId, entry.seq, result.promptId, result.conflictId, entry.payload, remote)
    outcome.conflicts += 1
  }

  const unanswered = [...sent.entries()].filter(([key]) => !answered.has(key)).map(([, s]) => s.seq)
  if (unanswered.length > 0) {
    await releaseRows(db, unanswered, 'no_result')
    for (const seq of unanswered) skipSeqs.add(seq)
  }

  outcome.remaining = rows.length === batchSize || followUp
  return outcome
}
```

- [ ] **Step 5: Run tests and type-check** — `npx jest src/lib/syncPush.test.ts src/lib/outbox.test.ts && npx tsc --noEmit` → PASS.

- [ ] **Step 6: Commit** (`detect_changes()` first)

```bash
git add src/lib/syncPush.ts src/lib/syncPush.test.ts src/lib/outbox.ts src/lib/outbox.test.ts
git commit -m "feat(sync): push outbox to /sync/push with batch results, rejections and conflict capture"
```

---

### Task 15: Pull — `GET /sync/pull` (incremental + inline snapshot)

**Depends on:** `2026-09-25-promptvault-sync-engine.md` Task 3 — merged on the backend; `GET /prompts/categories` (space-and-prompt-domain plan, gap G5) — merged. Task 14 (`forceSnapshot` uses the same `sync_state` row).

**Contract (verified 2026-09-26 — spec §0 C8–C14, C22, C24; `AioKin/Models/ViewModel/Vault/SyncPullResponse.cs`, `AioKin/Services/Vault/SyncService.cs:94-421`):**
- `GET /sync/pull?spaceUuid=&since=` → envelope `data = { isSnapshot, snapshotJson, changes, resumeCursor }`.
- `since = 0` **always** yields a snapshot; with `since > 0` a snapshot also comes back when retention was exceeded or > 500 rows are pending.
- `snapshotJson` is a JSON **string** with **PascalCase** keys: `{ SpaceUuid, GeneratedAt, Prompts: [{ PromptId, Title, Content, Description, CategoryId, Version, Tags, Variables }] }`; deleted prompts are not in it.
- `changes[] = { syncLogId, entityType: 'prompt', entityId, operation: 'insert'|'update'|'delete', version, tagsVariablesOnly, prompt: { title, content, description, categoryId, isDeleted, tags, variables } | null }` (camelCase; `prompt` is null only for `'delete'`). A push delete arrives as `operation: 'update'` + `prompt.isDeleted: true`.
- `tagsVariablesOnly` rows keep the prompt's current version (no bump) — ignore them; gate content with `version >=`.
- Own (user, device) writes are filtered out server-side; rows younger than ~10 s are held back until a later pull.
- `GET /prompts/categories?spaceUuid=` → envelope `data = [{ id, name }]`.
- Errors: `403 Forbidden` (not a member), `503 SyncUnavailable`.

**Files:**
- Create: `src/lib/syncPull.ts`, `src/lib/syncPull.test.ts`

**Interfaces:**
- Consumes: `hasPending` (Task 13); `categoryNameFor` (Task 10); `apiClient`.
- Produces: `getCursor(spaceId: string): Promise<number>`; `parseSnapshot(json: string): SnapshotPrompt[]`; `pullSpace(spaceId: string): Promise<{ applied: number; snapshot: boolean }>`.

- [ ] **Step 1: Write the failing tests** — `src/lib/syncPull.test.ts`:

```ts
jest.mock('@/services/apiClient', () => ({ apiClient: { get: jest.fn() } }))
jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: async (_a: string, value: string) =>
    require('crypto').createHash('sha256').update(value).digest('hex'),
}))

import { apiClient } from '@/services/apiClient'

import { categoryIdFor } from './categoryId'
import { getDb } from './db'
import { enqueue } from './outbox'
import { getCursor, pullSpace } from './syncPull'

const SPACE = 'aaaaaaaa-0000-4000-8000-000000000001'
const get = apiClient.get as jest.Mock

// AioKin SyncChangeItem / SyncPromptChangePayload (camelCase, typed — no raw row JSON).
function change(
  syncLogId: number,
  id: string,
  version: number,
  prompt: Record<string, unknown> | null,
  extra: Record<string, unknown> = {},
) {
  return {
    syncLogId,
    entityType: 'prompt',
    entityId: id,
    operation: 'update',
    version,
    tagsVariablesOnly: false,
    prompt:
      prompt === null
        ? null
        : { description: null, categoryId: null, isDeleted: false, tags: [], variables: [], ...prompt },
    ...extra,
  }
}

function incremental(resumeCursor: number, changes: unknown[]) {
  return { isSnapshot: false, snapshotJson: null, resumeCursor, changes }
}

// Seeded rows are favourites with copy_count 9, to prove pull never touches them.
async function seed(id: string, title: string, version: number, category: string | null = null) {
  const db = await getDb()
  await db.runAsync(
    `INSERT INTO prompts (id, space_id, title, content, category, is_favorite, copy_count, created_at, updated_at, version)
     VALUES (?, ?, ?, ?, ?, 1, 9, 1, 1, ?)`,
    id,
    SPACE,
    title,
    title,
    category,
    version,
  )
}

beforeEach(async () => {
  get.mockReset()
  const db = await getDb()
  await db.execAsync(
    'DELETE FROM prompts; DELETE FROM sync_outbox; DELETE FROM sync_state; DELETE FROM sync_conflicts;',
  )
  await db.runAsync(
    "INSERT OR IGNORE INTO spaces (id, kind, name, can_manage, created_at) VALUES (?, 'personal', 'P', 1, 1)",
    SPACE,
  )
})

describe('pullSpace (snapshot — since = 0 always returns one)', () => {
  it('parses the PascalCase snapshotJson, replaces the space and keeps device-local fields', async () => {
    await seed('keep', 'Old', 1)
    await seed('stale', 'x', 1)
    const categoryId = await categoryIdFor(SPACE, 'Marketing')
    get.mockResolvedValue({
      isSnapshot: true,
      changes: [],
      resumeCursor: 900,
      snapshotJson: JSON.stringify({
        SpaceUuid: SPACE,
        GeneratedAt: '2026-09-26T00:00:00Z',
        Prompts: [
          { PromptId: 'keep', Title: 'T-keep', Content: 'C', Description: null, CategoryId: categoryId, Version: 7, Tags: [], Variables: [] },
          { PromptId: 'new', Title: 'T-new', Content: 'C', Description: null, CategoryId: null, Version: 2, Tags: [], Variables: [] },
        ],
      }),
    })

    const result = await pullSpace(SPACE)

    expect(get).toHaveBeenCalledWith(`/sync/pull?spaceUuid=${SPACE}&since=0`, { auth: true })
    expect(result).toEqual({ applied: 2, snapshot: true })
    const db = await getDb()
    expect(await db.getAllAsync('SELECT id, title, category, is_favorite, version FROM prompts ORDER BY id')).toEqual([
      { id: 'keep', title: 'T-keep', category: 'Marketing', is_favorite: 1, version: 7 },
      { id: 'new', title: 'T-new', category: null, is_favorite: 0, version: 2 },
    ])
    expect(await getCursor(SPACE)).toBe(900)
  })

  it('never touches prompts with pending changes or an open conflict', async () => {
    await seed('pending', 'Mine', 1)
    await seed('conflicted', 'Mine too', 1)
    const db = await getDb()
    await enqueue(db, SPACE, 'pending', 'update', 1)
    await db.runAsync(
      "INSERT INTO sync_conflicts (conflict_id, space_id, prompt_id, local_payload, remote_payload, remote_version, created_at) VALUES ('c', ?, 'conflicted', NULL, '{}', 2, 1)",
      SPACE,
    )
    get.mockResolvedValue({ isSnapshot: true, changes: [], resumeCursor: 5, snapshotJson: JSON.stringify({ Prompts: [] }) })

    await pullSpace(SPACE)

    expect(await db.getAllAsync('SELECT id, title FROM prompts ORDER BY id')).toEqual([
      { id: 'conflicted', title: 'Mine too' },
      { id: 'pending', title: 'Mine' },
    ])
  })
})

describe('pullSpace (incremental)', () => {
  beforeEach(async () => {
    const db = await getDb()
    await db.runAsync('INSERT INTO sync_state (space_id, cursor) VALUES (?, 10)', SPACE)
  })

  it('inserts new prompts, maps a derived category id and stores the cursor', async () => {
    const categoryId = await categoryIdFor(SPACE, 'Marketing')
    get.mockResolvedValue(
      incremental(42, [change(42, 'p1', 3, { title: 'T', content: 'C', categoryId }, { operation: 'insert' })]),
    )

    const result = await pullSpace(SPACE)

    expect(get).toHaveBeenCalledWith(`/sync/pull?spaceUuid=${SPACE}&since=10`, { auth: true })
    expect(result).toEqual({ applied: 1, snapshot: false })
    const db = await getDb()
    expect(await db.getFirstAsync('SELECT title, category, version FROM prompts WHERE id = ?', 'p1')).toEqual({
      title: 'T',
      category: 'Marketing',
      version: 3,
    })
    expect(await getCursor(SPACE)).toBe(42)
  })

  it('names categories created by other clients via /prompts/categories, fetched once', async () => {
    const foreign = '11111111-1111-4111-8111-111111111111'
    get.mockImplementation(async (path: string) =>
      path.startsWith('/prompts/categories')
        ? [{ id: foreign.toUpperCase(), name: 'Du lịch' }]
        : incremental(3, [
            change(2, 'a', 1, { title: 'A', content: 'A', categoryId: foreign }),
            change(3, 'b', 1, { title: 'B', content: 'B', categoryId: foreign }),
          ]),
    )

    await pullSpace(SPACE)

    expect(get).toHaveBeenCalledWith(`/prompts/categories?spaceUuid=${SPACE}`, { auth: true })
    expect(get.mock.calls.filter(([p]) => String(p).startsWith('/prompts/categories'))).toHaveLength(1)
    const db = await getDb()
    expect(await db.getAllAsync('SELECT id, category FROM prompts ORDER BY id')).toEqual([
      { id: 'a', category: 'Du lịch' },
      { id: 'b', category: 'Du lịch' },
    ])
  })

  it('keeps the local category when an id cannot be named', async () => {
    await seed('p1', 'Old', 1, 'Marketing')
    get.mockImplementation(async (path: string) =>
      path.startsWith('/prompts/categories')
        ? []
        : incremental(3, [change(3, 'p1', 2, { title: 'New', content: 'New', categoryId: '22222222-2222-4222-8222-222222222222' })]),
    )

    await pullSpace(SPACE)

    const db = await getDb()
    expect(await db.getFirstAsync("SELECT title, category FROM prompts WHERE id = 'p1'")).toEqual({
      title: 'New',
      category: 'Marketing',
    })
  })

  it('updates content but keeps device-local favourite and copy count', async () => {
    await seed('p1', 'Old', 1)
    get.mockResolvedValue(incremental(5, [change(5, 'p1', 2, { title: 'New', content: 'New' })]))

    await pullSpace(SPACE)

    const db = await getDb()
    expect(
      await db.getFirstAsync('SELECT title, is_favorite, copy_count, version FROM prompts WHERE id = ?', 'p1'),
    ).toEqual({ title: 'New', is_favorite: 1, copy_count: 9, version: 2 })
  })

  it('applies soft deletes (update + isDeleted) and hard deletes (prompt null), never downgrades', async () => {
    await seed('soft', 'x', 1)
    await seed('hard', 'x', 1)
    await seed('newer', 'Mine', 5)
    get.mockResolvedValue(
      incremental(9, [
        change(7, 'soft', 2, { title: 'x', content: 'x', isDeleted: true }),
        change(8, 'hard', 2, null, { operation: 'delete' }),
        change(9, 'newer', 4, { title: 'Stale', content: 'Stale' }),
      ]),
    )

    await pullSpace(SPACE)

    const db = await getDb()
    expect(await db.getAllAsync('SELECT id, title FROM prompts ORDER BY id')).toEqual([{ id: 'newer', title: 'Mine' }])
  })

  it('ignores tag/variable-only rows and applies a content row with an equal version (>=)', async () => {
    await seed('p1', 'Old', 3)
    get.mockResolvedValue(
      incremental(12, [
        change(11, 'p1', 3, { title: 'LIVE ROW — must not be applied', content: 'x' }, { tagsVariablesOnly: true }),
        change(12, 'p1', 3, { title: 'Same version', content: 'y' }),
      ]),
    )

    const result = await pullSpace(SPACE)

    expect(result.applied).toBe(1)
    const db = await getDb()
    expect(await db.getFirstAsync("SELECT title FROM prompts WHERE id = 'p1'")).toEqual({ title: 'Same version' })
    expect(await getCursor(SPACE)).toBe(12)
  })

  it('skips prompts with pending local changes but still advances the cursor', async () => {
    await seed('p1', 'Mine', 1)
    const db = await getDb()
    await enqueue(db, SPACE, 'p1', 'update', 1)
    get.mockResolvedValue(incremental(13, [change(13, 'p1', 2, { title: 'Theirs', content: 'Theirs' })]))

    await pullSpace(SPACE)

    expect(await db.getFirstAsync("SELECT title FROM prompts WHERE id = 'p1'")).toEqual({ title: 'Mine' })
    expect(await getCursor(SPACE)).toBe(13)
  })
})
```

- [ ] **Step 2: Run to verify failure** — `npx jest src/lib/syncPull.test.ts` → FAIL.

- [ ] **Step 3: Write `src/lib/syncPull.ts`**

```ts
import type { SQLiteDatabase } from 'expo-sqlite'

import { apiClient } from '@/services/apiClient'

import { categoryNameFor } from './categoryId'
import { getDb } from './db'
import { hasPending } from './outbox'

// AioKin SyncPullResponse (Models/ViewModel/Vault/SyncPullResponse.cs), camelCase.
type ChangePrompt = {
  title: string
  content: string
  description: string | null
  categoryId: string | null
  isDeleted: boolean
}

type ChangeItem = {
  syncLogId: number
  entityType: string
  entityId: string
  operation: string // 'insert' | 'update' | 'delete'
  version: number
  tagsVariablesOnly: boolean
  prompt: ChangePrompt | null // null only for a hard 'delete'
}

type PullResponse = {
  isSnapshot: boolean
  snapshotJson: string | null
  changes: ChangeItem[]
  resumeCursor: number
}

export type SnapshotPrompt = {
  promptId: string
  title: string
  content: string
  categoryId: string | null
  version: number
}

// undefined = "could not name this id" → keep the local category (spec §9).
type ResolvedCategory = string | null | undefined

type Prepared =
  | { id: string; deleted: true }
  | { id: string; deleted: false; title: string; content: string; category: ResolvedCategory; version: number }

// snapshotJson is written with default System.Text.Json options, i.e. PascalCase keys
// (SyncService.BuildSnapshotFallbackAsync) — read either casing.
function field(source: Record<string, unknown>, camel: string): unknown {
  if (camel in source) return source[camel]
  return source[camel.charAt(0).toUpperCase() + camel.slice(1)]
}

export function parseSnapshot(json: string): SnapshotPrompt[] {
  const root = JSON.parse(json) as Record<string, unknown>
  const prompts = (field(root, 'prompts') ?? []) as Record<string, unknown>[]
  return prompts.map((p) => ({
    promptId: String(field(p, 'promptId')),
    title: String(field(p, 'title') ?? ''),
    content: String(field(p, 'content') ?? ''),
    categoryId: (field(p, 'categoryId') as string | null | undefined) ?? null,
    version: Number(field(p, 'version') ?? 0),
  }))
}

// Derived ids of PROMPT_CATEGORIES first (no network), then the space's categories list,
// fetched at most once per pull (GET /prompts/categories, spec §0 C24).
function categoryResolver(spaceId: string): (categoryId: string | null) => Promise<ResolvedCategory> {
  let remote: Map<string, string> | null = null
  return async (categoryId) => {
    if (!categoryId) return null
    const derived = await categoryNameFor(spaceId, categoryId)
    if (derived) return derived
    if (!remote) {
      try {
        const list = await apiClient.get<{ id: string; name: string }[]>(
          `/prompts/categories?spaceUuid=${encodeURIComponent(spaceId)}`,
          { auth: true },
        )
        remote = new Map(list.map((c) => [c.id.toLowerCase(), c.name]))
      } catch {
        remote = new Map()
      }
    }
    return remote.get(categoryId.toLowerCase())
  }
}

export async function getCursor(spaceId: string): Promise<number> {
  const db = await getDb()
  const row = await db.getFirstAsync<{ cursor: number }>(
    'SELECT cursor FROM sync_state WHERE space_id = ?',
    spaceId,
  )
  return row?.cursor ?? 0
}

async function setCursor(db: SQLiteDatabase, spaceId: string, cursor: number): Promise<void> {
  await db.runAsync(
    `INSERT INTO sync_state (space_id, cursor, last_pulled_at) VALUES (?, ?, ?)
     ON CONFLICT(space_id) DO UPDATE SET cursor = excluded.cursor, last_pulled_at = excluded.last_pulled_at`,
    spaceId,
    cursor,
    Date.now(),
  )
}

// Pending outbox rows win locally (the push surfaces any divergence); an open conflict's
// local row is "your version" on the conflict screen and must not be overwritten.
async function isLocked(db: SQLiteDatabase, promptId: string): Promise<boolean> {
  if (await hasPending(db, promptId)) return true
  const conflict = await db.getFirstAsync<{ conflict_id: string }>(
    'SELECT conflict_id FROM sync_conflicts WHERE prompt_id = ? LIMIT 1',
    promptId,
  )
  return conflict !== null
}

// Keeps is_favorite and copy_count — device-local (spec §9). `>=`, not `>`: two change rows
// of one prompt can share a version (spec §0 C13).
async function upsertRemote(
  db: SQLiteDatabase,
  spaceId: string,
  id: string,
  fields: { title: string; content: string; category: ResolvedCategory; version: number },
): Promise<void> {
  const now = Date.now()
  const keepLocalCategory = fields.category === undefined
  await db.runAsync(
    `INSERT INTO prompts (id, space_id, title, content, category, is_favorite, copy_count,
                          created_at, updated_at, synced_at, version, has_conflict)
     VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, 0)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       content = excluded.content,
       category = ${keepLocalCategory ? 'prompts.category' : 'excluded.category'},
       updated_at = excluded.updated_at,
       synced_at = excluded.synced_at,
       version = excluded.version
     WHERE excluded.version >= prompts.version`,
    id,
    spaceId,
    fields.title,
    fields.content,
    fields.category ?? null,
    now,
    now,
    now,
    fields.version,
  )
}

async function applySnapshot(db: SQLiteDatabase, spaceId: string, response: PullResponse): Promise<number> {
  const prompts = parseSnapshot(response.snapshotJson ?? '{}')
  const resolveCategory = categoryResolver(spaceId)
  const categories = new Map<string, ResolvedCategory>()
  for (const p of prompts) categories.set(p.promptId, await resolveCategory(p.categoryId))

  let applied = 0
  await db.withTransactionAsync(async () => {
    const keep = new Set(prompts.map((p) => p.promptId.toLowerCase()))
    const local = await db.getAllAsync<{ id: string }>('SELECT id FROM prompts WHERE space_id = ?', spaceId)
    for (const { id } of local) {
      if (!keep.has(id.toLowerCase()) && !(await isLocked(db, id))) {
        await db.runAsync('DELETE FROM prompts WHERE id = ?', id)
      }
    }
    for (const p of prompts) {
      if (await isLocked(db, p.promptId)) continue
      await upsertRemote(db, spaceId, p.promptId, {
        title: p.title,
        content: p.content,
        category: categories.get(p.promptId),
        version: p.version,
      })
      applied += 1
    }
    await setCursor(db, spaceId, response.resumeCursor)
  })
  return applied
}

export async function pullSpace(spaceId: string): Promise<{ applied: number; snapshot: boolean }> {
  const db = await getDb()
  const since = await getCursor(spaceId)
  const response = await apiClient.get<PullResponse>(
    `/sync/pull?spaceUuid=${encodeURIComponent(spaceId)}&since=${since}`,
    { auth: true },
  )

  if (response.isSnapshot) {
    return { applied: await applySnapshot(db, spaceId, response), snapshot: true }
  }

  // Category names may need network/hashing — resolve before opening the transaction.
  const resolveCategory = categoryResolver(spaceId)
  const prepared: Prepared[] = []
  for (const item of response.changes) {
    if (item.entityType !== 'prompt') continue
    // Tag/variable-only delta: the app stores no tags, and its title/content are the live
    // row, not history (spec §0 C13).
    if (item.tagsVariablesOnly) continue
    if (item.operation === 'delete' || !item.prompt || item.prompt.isDeleted) {
      prepared.push({ id: item.entityId, deleted: true })
      continue
    }
    prepared.push({
      id: item.entityId,
      deleted: false,
      title: item.prompt.title,
      content: item.prompt.content,
      category: await resolveCategory(item.prompt.categoryId),
      version: item.version,
    })
  }

  let applied = 0
  await db.withTransactionAsync(async () => {
    for (const change of prepared) {
      if (await isLocked(db, change.id)) continue
      if (change.deleted) {
        await db.runAsync('DELETE FROM prompts WHERE id = ? AND space_id = ?', change.id, spaceId)
      } else {
        await upsertRemote(db, spaceId, change.id, change)
      }
      applied += 1
    }
    await setCursor(db, spaceId, response.resumeCursor)
  })
  return { applied, snapshot: false }
}
```

- [ ] **Step 4: Run tests and type-check** — `npx jest src/lib/syncPull.test.ts && npx tsc --noEmit` → PASS.

- [ ] **Step 5: Commit** (`detect_changes()` first)

```bash
git add src/lib/syncPull.ts src/lib/syncPull.test.ts
git commit -m "feat(sync): pull /sync/pull changes and inline snapshots"
```

---

### Task 16: Sync engine and background/foreground triggers

**Depends on:** Tasks 14–15.

**Contract notes (2026-09-26, spec §0 C3, C22):** a push `rejected` entry is counted, not thrown; a generic rejection must not be re-sent within the same run (one `skipSeqs` set per space per run, passed to `pushSpace`), so a stuck row can't burn all push rounds or starve newer rows. A `403 Forbidden` from push or pull means the user lost access to that space → refresh `/spaces/me` once at the end of the run (Task 11 drops the space and its rows). `503 SyncUnavailable` from pull is just an error for that space this run.

**Files:**
- Create: `src/lib/syncEngine.ts`, `src/lib/syncEngine.test.ts`, `src/lib/backgroundSync.ts`
- Modify: `src/app/_layout.tsx`, `app.json`, `package.json` (+ lockfiles)

**Interfaces:**
- Consumes: `pushSpace(spaceId, { skipSeqs })`, `pullSpace`, `resetInFlight`, `setPromptWriteListener`, `getTokens`, `fetchAndStoreMySpaces` (Task 11), `ApiError`.
- Produces: `type SyncSummary = { pushed: number; conflicts: number; rejected: number; pulled: number; errors: number }`; `runSync(): Promise<SyncSummary>` (single-flight, no-op when signed out); `requestSync(delayMs?: number): void` (debounced, default 2000); `startSyncTriggers(): () => void`; `SYNC_TASK = 'promptvault-sync'`; `registerBackgroundSync(): Promise<void>`.

- [ ] **Step 1: Install the Expo modules** (read their v57 docs first):

```bash
npx expo install expo-task-manager expo-background-task expo-network
```

Add `"expo-background-task"` to `app.json` → `expo.plugins`. Confirm the iOS background mode is generated: `npx expo config --type introspect | grep -A3 UIBackgroundModes` → contains `processing`.

- [ ] **Step 2: Write the failing tests** — `src/lib/syncEngine.test.ts`:

```ts
jest.mock('./syncPush', () => ({ pushSpace: jest.fn() }))
jest.mock('./syncPull', () => ({ pullSpace: jest.fn() }))
jest.mock('./spaces', () => ({ fetchAndStoreMySpaces: jest.fn(async () => []) }))
jest.mock('./tokenStore', () => ({ getTokens: jest.fn() }))
jest.mock('expo-network', () => ({ addNetworkStateListener: jest.fn(() => ({ remove: jest.fn() })) }))
jest.mock('@/services/apiClient', () => {
  class ApiError extends Error {
    status: number
    code: string
    constructor(status: number, code: string, message: string) {
      super(message)
      this.status = status
      this.code = code
    }
  }
  return { ApiError }
})

import { ApiError } from '@/services/apiClient'

import { getDb } from './db'
import { fetchAndStoreMySpaces } from './spaces'
import { runSync } from './syncEngine'
import { pullSpace } from './syncPull'
import { pushSpace } from './syncPush'
import { getTokens } from './tokenStore'

const idle = { applied: 0, conflicts: 0, rejected: 0, remaining: false }

beforeEach(async () => {
  jest.clearAllMocks()
  const db = await getDb()
  await db.execAsync("DELETE FROM spaces WHERE kind <> 'local'")
  await db.execAsync(
    "INSERT INTO spaces (id, kind, name, can_manage, created_at) VALUES ('s1', 'personal', 'P', 1, 1), ('s2', 'team', 'T', 0, 2)",
  )
  ;(getTokens as jest.Mock).mockResolvedValue({ accessToken: 'a', refreshToken: 'r', expiresAt: 1 })
  ;(pushSpace as jest.Mock).mockResolvedValue(idle)
  ;(pullSpace as jest.Mock).mockResolvedValue({ applied: 1, snapshot: false })
})

describe('runSync', () => {
  it('pushes then pulls every synced space, never the local one', async () => {
    const summary = await runSync()
    expect((pushSpace as jest.Mock).mock.calls.map((c) => c[0])).toEqual(['s1', 's2'])
    expect((pullSpace as jest.Mock).mock.calls.map((c) => c[0])).toEqual(['s1', 's2'])
    expect(summary).toEqual({ pushed: 0, conflicts: 0, rejected: 0, pulled: 2, errors: 0 })
  })

  it('keeps pushing while the outbox has more rows, sharing one skip set per space', async () => {
    ;(pushSpace as jest.Mock)
      .mockResolvedValueOnce({ applied: 49, conflicts: 0, rejected: 1, remaining: true })
      .mockResolvedValueOnce({ applied: 3, conflicts: 1, rejected: 0, remaining: false })
    const summary = await runSync()
    expect(summary).toMatchObject({ pushed: 52, conflicts: 1, rejected: 1 })
    const [first, second] = (pushSpace as jest.Mock).mock.calls
    expect(first![1].skipSeqs).toBe(second![1].skipSeqs)
  })

  it('refreshes the space list once when a space answers 403', async () => {
    ;(pullSpace as jest.Mock).mockRejectedValueOnce(new ApiError(403, 'Forbidden', 'Ban khong thuoc space nay.'))
    const summary = await runSync()
    expect(summary.errors).toBe(1)
    expect(fetchAndStoreMySpaces).toHaveBeenCalledTimes(1)
  })

  it('is single-flight', async () => {
    await Promise.all([runSync(), runSync(), runSync()])
    expect(pullSpace).toHaveBeenCalledTimes(2)
  })

  it('does nothing when signed out', async () => {
    ;(getTokens as jest.Mock).mockResolvedValue(null)
    await runSync()
    expect(pushSpace).not.toHaveBeenCalled()
  })

  it('an error in one space does not stop the others', async () => {
    ;(pushSpace as jest.Mock).mockRejectedValueOnce(new Error('offline'))
    const summary = await runSync()
    expect(summary.errors).toBe(1)
    expect(pullSpace).toHaveBeenCalledWith('s2')
  })
})
```

- [ ] **Step 3: Run to verify failure** — `npx jest src/lib/syncEngine.test.ts` → FAIL.

- [ ] **Step 4: Write `src/lib/syncEngine.ts`**

```ts
import { AppState } from 'react-native'
import * as Network from 'expo-network'

import { ApiError } from '@/services/apiClient'

import { getDb } from './db'
import { resetInFlight } from './outbox'
import { setPromptWriteListener } from './prompts'
import { fetchAndStoreMySpaces } from './spaces'
import { pullSpace } from './syncPull'
import { pushSpace } from './syncPush'
import { getTokens } from './tokenStore'

export type SyncSummary = { pushed: number; conflicts: number; rejected: number; pulled: number; errors: number }

const MAX_PUSH_ROUNDS = 10

let running: Promise<SyncSummary> | null = null
let timer: ReturnType<typeof setTimeout> | null = null

async function doSync(): Promise<SyncSummary> {
  const summary: SyncSummary = { pushed: 0, conflicts: 0, rejected: 0, pulled: 0, errors: 0 }
  if (!(await getTokens())) return summary

  const db = await getDb()
  await resetInFlight(db) // rows left in flight by a killed app
  const spaces = await db.getAllAsync<{ id: string }>(
    "SELECT id FROM spaces WHERE kind <> 'local' ORDER BY created_at",
  )

  let lostAccess = false
  for (const { id } of spaces) {
    // Rows rejected in this run are retried on the next run, never in a later round of this
    // one (spec §11.2) — otherwise one stuck row could eat every round.
    const skipSeqs = new Set<number>()
    try {
      for (let round = 0; round < MAX_PUSH_ROUNDS; round += 1) {
        const outcome = await pushSpace(id, { skipSeqs })
        summary.pushed += outcome.applied
        summary.conflicts += outcome.conflicts
        summary.rejected += outcome.rejected
        if (!outcome.remaining) break
      }
      // Also brings the snapshot a permission rejection asked for (Task 14 forceSnapshot).
      summary.pulled += (await pullSpace(id)).applied
    } catch (error) {
      summary.errors += 1
      if (error instanceof ApiError && error.status === 403) lostAccess = true
    }
  }
  // Removed from a family/team: /spaces/me no longer lists it, so its local rows are dropped.
  if (lostAccess) await fetchAndStoreMySpaces().catch(() => undefined)
  return summary
}

export function runSync(): Promise<SyncSummary> {
  if (!running) {
    running = doSync().finally(() => {
      running = null
    })
  }
  return running
}

export function requestSync(delayMs = 2000): void {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    void runSync()
  }, delayMs)
}

// Triggers from spec §11.4: local writes, foreground, connectivity regained, start-up.
export function startSyncTriggers(): () => void {
  setPromptWriteListener(() => requestSync())

  const appSubscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') requestSync(0)
  })

  let online = true
  const networkSubscription = Network.addNetworkStateListener((state) => {
    const reachable = state.isInternetReachable ?? state.isConnected ?? false
    if (reachable && !online) requestSync(0)
    online = reachable
  })

  requestSync(0)

  return () => {
    setPromptWriteListener(null)
    appSubscription.remove()
    networkSubscription.remove()
  }
}
```

- [ ] **Step 5: Write `src/lib/backgroundSync.ts`**

```ts
import * as BackgroundTask from 'expo-background-task'
import * as TaskManager from 'expo-task-manager'

import { runSync } from './syncEngine'

export const SYNC_TASK = 'promptvault-sync'

// Must run at module scope (imported by the root layout) so the task exists when the OS
// launches the app headless.
TaskManager.defineTask(SYNC_TASK, async () => {
  try {
    const summary = await runSync()
    return summary.errors > 0
      ? BackgroundTask.BackgroundTaskResult.Failed
      : BackgroundTask.BackgroundTaskResult.Success
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed
  }
})

export async function registerBackgroundSync(): Promise<void> {
  const status = await BackgroundTask.getStatusAsync()
  if (status !== BackgroundTask.BackgroundTaskStatus.Available) return
  if (await TaskManager.isTaskRegisteredAsync(SYNC_TASK)) return
  // minutes; the OS decides the real schedule.
  await BackgroundTask.registerTaskAsync(SYNC_TASK, { minimumInterval: 15 })
}
```

- [ ] **Step 6: Wire into `src/app/_layout.tsx`** — add imports `import { registerBackgroundSync } from '@/lib/backgroundSync'` and `import { startSyncTriggers } from '@/lib/syncEngine'`, and next to the other effects:

```tsx
  useEffect(() => {
    registerBackgroundSync().catch(() => undefined)
    return startSyncTriggers()
  }, [])
```

- [ ] **Step 7: Verify** — `npx jest && npx tsc --noEmit` → PASS. Manual (dev build, signed in): create a prompt in "Kho cá nhân" → within ~2 s it appears in the backend (`GET /prompts?spaceUuid=`); airplane mode → edit → back online → change arrives without opening any screen.

- [ ] **Step 8: Commit**

```bash
git add src/lib/syncEngine.ts src/lib/syncEngine.test.ts src/lib/backgroundSync.ts src/app/_layout.tsx app.json package.json package-lock.json yarn.lock
git commit -m "feat(sync): single-flight sync engine with foreground, network and background triggers"
```

---

### Task 17: First-login adoption, account switching and sign-out wipe

**Depends on:** Tasks 11–16.

**Contract check (2026-09-26):** no request/response shape in this task changed. Adopted prompts are pushed as `insert` rows by Task 14 (the creator becomes the author, so later edits are never permission-rejected). A snapshot on the first pull of a fresh space (`since = 0`, spec §0 C10) is expected and harmless. `pendingChanges()` also counts rows that were `rejected` and are waiting for a later run, which is exactly what the sign-out warning should include.

**Files:**
- Create: `src/lib/accountData.ts`, `src/lib/accountData.test.ts`
- Modify: `src/app/onboarding/sync.tsx` (whole file)
- Modify: `src/app/onboarding/login.tsx`, `src/app/onboarding/verify-email.tsx` (post-sign-in route)
- Modify: `src/app/(drawers)/(tabs)/profile.tsx` (sign-out)

**Interfaces:**
- Consumes: `fetchAndStoreMySpaces`, `wipeSyncedSpaces`, `Space` (Task 11); `useSpaceStore` (Task 12); `enqueue`, `pendingCount` (Task 13); `runSync` (Task 16).
- Produces: `prepareSignedInUser(userId: string): Promise<Space | null>`; `countLocalPrompts(): Promise<number>`; `adoptLocalPrompts(personalSpaceId: string): Promise<number>`; `pendingChanges(): Promise<number>`; `clearSyncedData(): Promise<void>`.

- [ ] **Step 1: Write the failing tests** — `src/lib/accountData.test.ts`:

```ts
jest.mock('@/services/apiClient', () => ({ apiClient: { get: jest.fn() } }))
const mockStorage = new Map<string, string>()
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: async (key: string) => mockStorage.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      mockStorage.set(key, value)
    },
    removeItem: async (key: string) => {
      mockStorage.delete(key)
    },
  },
}))

import { apiClient } from '@/services/apiClient'
import { useSpaceStore } from '@/store/spaceStore'

import { adoptLocalPrompts, clearSyncedData, countLocalPrompts, prepareSignedInUser } from './accountData'
import { getDb, LOCAL_SPACE_ID } from './db'

const PERSONAL = 'aaaaaaaa-0000-4000-8000-000000000001'

beforeEach(async () => {
  useSpaceStore.getState().reset()
  ;(apiClient.get as jest.Mock).mockResolvedValue([
    { spaceUuid: PERSONAL, spaceType: 'Personal', name: 'Personal', canManage: true, createdAtMillis: 1 },
  ])
  const db = await getDb()
  await db.execAsync(
    "DELETE FROM prompts; DELETE FROM sync_outbox; DELETE FROM spaces WHERE kind <> 'local';",
  )
})

describe('prepareSignedInUser', () => {
  it('stores spaces, records the owner and switches to the personal space', async () => {
    const personal = await prepareSignedInUser('user-1')
    expect(personal?.id).toBe(PERSONAL)
    expect(useSpaceStore.getState()).toMatchObject({ currentSpaceId: PERSONAL, ownerUserId: 'user-1' })
  })

  it("wipes the previous account's synced data when a different user signs in", async () => {
    await prepareSignedInUser('user-1')
    const db = await getDb()
    await db.runAsync(
      "INSERT INTO prompts (id, space_id, title, content, created_at, updated_at) VALUES ('theirs', ?, 't', 'c', 1, 1)",
      PERSONAL,
    )

    await prepareSignedInUser('user-2')

    expect(await db.getFirstAsync("SELECT id FROM prompts WHERE id = 'theirs'")).toBeNull()
    expect(useSpaceStore.getState().ownerUserId).toBe('user-2')
  })
})

describe('adoptLocalPrompts', () => {
  it('moves local prompts into the personal space and queues one insert each', async () => {
    await prepareSignedInUser('user-1')
    const db = await getDb()
    await db.runAsync(
      "INSERT INTO prompts (id, space_id, title, content, created_at, updated_at) VALUES ('a', ?, 't', 'c', 1, 1), ('b', ?, 't', 'c', 1, 1)",
      LOCAL_SPACE_ID,
      LOCAL_SPACE_ID,
    )
    expect(await countLocalPrompts()).toBe(2)

    expect(await adoptLocalPrompts(PERSONAL)).toBe(2)

    expect(await countLocalPrompts()).toBe(0)
    expect(await db.getAllAsync('SELECT prompt_id, operation, base_version FROM sync_outbox ORDER BY prompt_id')).toEqual([
      { prompt_id: 'a', operation: 'insert', base_version: 0 },
      { prompt_id: 'b', operation: 'insert', base_version: 0 },
    ])
  })
})

describe('clearSyncedData', () => {
  it('keeps local prompts and returns to the local space', async () => {
    await prepareSignedInUser('user-1')
    const db = await getDb()
    await db.runAsync(
      "INSERT INTO prompts (id, space_id, title, content, created_at, updated_at) VALUES ('local', ?, 't', 'c', 1, 1)",
      LOCAL_SPACE_ID,
    )

    await clearSyncedData()

    expect(await countLocalPrompts()).toBe(1)
    expect(useSpaceStore.getState()).toMatchObject({ currentSpaceId: LOCAL_SPACE_ID, ownerUserId: null })
  })
})
```

- [ ] **Step 2: Run to verify failure** — `npx jest src/lib/accountData.test.ts` → FAIL.

- [ ] **Step 3: Write `src/lib/accountData.ts`**

```ts
import { useSpaceStore } from '@/store/spaceStore'

import { getDb, LOCAL_SPACE_ID } from './db'
import { enqueue, pendingCount } from './outbox'
import { fetchAndStoreMySpaces, type Space, wipeSyncedSpaces } from './spaces'

export async function prepareSignedInUser(userId: string): Promise<Space | null> {
  const { ownerUserId } = useSpaceStore.getState()
  if (ownerUserId !== null && ownerUserId !== userId) {
    await wipeSyncedSpaces()
    useSpaceStore.getState().reset()
  }
  useSpaceStore.getState().setOwner(userId)

  const spaces = await fetchAndStoreMySpaces()
  const personal = spaces.find((s) => s.kind === 'personal') ?? null
  if (personal && useSpaceStore.getState().currentSpaceId === LOCAL_SPACE_ID) {
    useSpaceStore.getState().setCurrentSpace(personal.id)
  }
  return personal
}

export async function countLocalPrompts(): Promise<number> {
  const db = await getDb()
  const row = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM prompts WHERE space_id = ?',
    LOCAL_SPACE_ID,
  )
  return row?.n ?? 0
}

// Spec §10.3: idempotent — adopted prompts leave the local space.
export async function adoptLocalPrompts(personalSpaceId: string): Promise<number> {
  const db = await getDb()
  let adopted = 0
  await db.withTransactionAsync(async () => {
    const rows = await db.getAllAsync<{ id: string }>(
      'SELECT id FROM prompts WHERE space_id = ?',
      LOCAL_SPACE_ID,
    )
    await db.runAsync(
      'UPDATE prompts SET space_id = ?, version = 0, synced_at = NULL WHERE space_id = ?',
      personalSpaceId,
      LOCAL_SPACE_ID,
    )
    for (const { id } of rows) await enqueue(db, personalSpaceId, id, 'insert', 0)
    adopted = rows.length
  })
  return adopted
}

export async function pendingChanges(): Promise<number> {
  return pendingCount(await getDb())
}

export async function clearSyncedData(): Promise<void> {
  await wipeSyncedSpaces()
  useSpaceStore.getState().reset()
}
```

- [ ] **Step 4: Replace `src/app/onboarding/sync.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, View } from 'react-native'

import { ThemedText } from '@/components/Themed'
import { Button } from '@/components/ui'
import { adoptLocalPrompts, countLocalPrompts, prepareSignedInUser } from '@/lib/accountData'
import type { Space } from '@/lib/spaces'
import { runSync } from '@/lib/syncEngine'
import { replace, resetTo } from '@/navigation'
import { useAuthStore } from '@/store'
import { makeStyles, useTheme } from '@/theme'

type Phase = 'loading' | 'ask' | 'working' | 'done' | 'error'

// Shown after every sign-in and from Settings → "Sao lưu & đồng bộ" (spec §10.3).
export default function SyncScreen() {
  const styles = useStyles()
  const { colors } = useTheme()
  const userId = useAuthStore((state) => state.user?.id ?? null)
  const email = useAuthStore((state) => state.user?.email ?? null)
  const [phase, setPhase] = useState<Phase>('loading')
  const [localCount, setLocalCount] = useState(0)
  const [personal, setPersonal] = useState<Space | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) {
      replace('login')
      return
    }
    let active = true
    ;(async () => {
      try {
        const space = await prepareSignedInUser(userId)
        const count = await countLocalPrompts()
        if (!active) return
        setPersonal(space)
        setLocalCount(count)
        if (count === 0 || !space) {
          void runSync()
          resetTo('home')
          return
        }
        setPhase('ask')
      } catch {
        if (!active) return
        setMessage('Không kết nối được máy chủ. Prompt vẫn được lưu trên máy này.')
        setPhase('error')
      }
    })()
    return () => {
      active = false
    }
  }, [userId])

  async function handleAdopt() {
    if (!personal) return
    setPhase('working')
    const adopted = await adoptLocalPrompts(personal.id)
    const summary = await runSync()
    setMessage(
      summary.errors > 0
        ? `Đã chuyển ${adopted} prompt vào Kho cá nhân. Sẽ tải lên khi có mạng.`
        : `Đã đưa ${adopted} prompt lên Kho cá nhân.`,
    )
    setPhase('done')
  }

  function handleLater() {
    void runSync()
    resetTo('home')
  }

  if (phase === 'loading' || phase === 'working') {
    return (
      <View style={styles.container}>
        <ActivityIndicator color={colors.primary} />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {phase === 'ask' && (
        <>
          <ThemedText variant="titleLarge" style={styles.center}>
            Đồng bộ prompt trên máy này?
          </ThemedText>
          <ThemedText color="secondary" style={styles.center}>
            Đưa {localCount} prompt trên máy này vào Kho cá nhân của {email ?? 'tài khoản'} để dùng trên
            mọi thiết bị.
          </ThemedText>
          <Button label="Đưa lên" onPress={handleAdopt} />
        </>
      )}

      {(phase === 'done' || phase === 'error') && message && (
        <ThemedText color={phase === 'error' ? 'error' : 'primary'} style={styles.center}>
          {message}
        </ThemedText>
      )}

      <Pressable onPress={phase === 'ask' ? handleLater : () => resetTo('home')}>
        <ThemedText color="primary" style={styles.center}>
          {phase === 'ask' ? 'Để sau' : 'Về trang chủ'}
        </ThemedText>
      </Pressable>
    </View>
  )
}

const useStyles = makeStyles(({ spacing }) => ({
  container: { flex: 1, justifyContent: 'center', padding: spacing.xl, gap: spacing.lg },
  center: { textAlign: 'center' },
}))
```

- [ ] **Step 5: Route sign-ins through it** — in `login.tsx` and `verify-email.tsx` replace `resetTo('home')` with `replace('sync')` (import `replace` from `@/navigation`; drop `resetTo` if unused).

- [ ] **Step 6: Sign-out in `profile.tsx`** — add imports `import { Alert } from 'react-native'` (merge into the existing import), `import { clearSyncedData, pendingChanges } from '@/lib/accountData'`, `import { runSync } from '@/lib/syncEngine'`; add inside the component:

```tsx
  async function handleSignOut() {
    const finish = async () => {
      await signOut()
      await clearSyncedData()
      replace('welcome')
    }
    const pending = await pendingChanges()
    if (pending === 0) {
      await finish()
      return
    }
    Alert.alert(
      'Còn thay đổi chưa đồng bộ',
      `Có ${pending} thay đổi chưa đồng bộ. Đăng xuất sẽ mất chúng.`,
      [
        { text: 'Huỷ', style: 'cancel' },
        {
          text: 'Đồng bộ rồi đăng xuất',
          onPress: async () => {
            await runSync()
            if ((await pendingChanges()) === 0) await finish()
            else Alert.alert('Chưa đồng bộ xong', 'Hãy thử lại khi có mạng.')
          },
        },
        { text: 'Vẫn đăng xuất', style: 'destructive', onPress: finish },
      ],
    )
  }
```

and change the "Đăng xuất" row to `onPress={handleSignOut}`.

- [ ] **Step 7: Verify** — `npx jest && npx tsc --noEmit` → PASS. Manual: as guest create 2 prompts → sign in → "Đưa 2 prompt…" → "Đưa lên" → they show in "Kho cá nhân" and on the backend; sign out with airplane mode on after an edit → warning dialog appears.

- [ ] **Step 8: Commit**

```bash
git add src/lib/accountData.ts src/lib/accountData.test.ts src/app/onboarding/sync.tsx src/app/onboarding/login.tsx src/app/onboarding/verify-email.tsx "src/app/(drawers)/(tabs)/profile.tsx"
git commit -m "feat(sync): adopt local prompts on first sign-in and wipe synced data on sign-out"
```

---

### Task 18: Conflict resolution library

**Depends on:** `2026-09-25-promptvault-sync-engine.md` Task 4 (`POST /sync/conflicts/{id}/resolve`) — merged on the backend. Tasks 13 (implemented), 14, 16.

**Contract (verified 2026-09-26 — spec §0 C15–C18; `AioKin/Models/InputModel/Vault/ResolveConflictRequest.cs`, `AioKin/Models/ViewModel/Vault/ResolveConflictResponse.cs`, `AioKin/Services/Vault/SyncService.cs:829-1032`):**
- Body `{ resolution: 'keep_local' | 'keep_remote' | 'merged', mergedPayload? }` (`mergedPayload` = `PromptPayload`, required for `merged`). No space/device fields — the space comes from the stored conflict, the device from the session.
- Success → envelope `data = { promptId, newVersion, isDeleted }` — apply it directly, no follow-up pull (gap G8 closed).
- `keep_remote` writes nothing and is allowed for any member. `keep_local` replays the stored local operation: a local **delete** soft-deletes (`isDeleted: true`, gap G9 closed), a local edit is applied and **undeletes** a remotely deleted prompt. `merged` always undeletes.
- Errors: `403 Forbidden` for `keep_local`/`merged` by a non-author member without `canManage` (or a non-member); `409 Conflict` when the live row changed since the conflict was recorded; `404 NotFound` when the conflict is already resolved or the prompt is gone; `422 ValidationError` for a bad resolution or payload.

Rules (spec §12):
- "Your version" is the **current local row** (edits made after the conflict are included). If it is unchanged since the conflict (`updated_at <= created_at`) send `keep_local`, else `merged` with the current row (`buildPayload(…, 'update')`, so an emptied category is sent as `clearCategory: true`).
- On success every resolution drops the prompt's outbox rows, deletes the `sync_conflicts` row, clears `has_conflict`, sets `version = newVersion`, and deletes the local row when `isDeleted` is true; then `runSync()` flushes other queued work.
- `403` on `keep_local`/`merged` → return `'forbidden'`; nothing changes locally (the UI then offers only `keep_remote`).
- `409`/`404` → the server-side conflict can no longer be resolved. Drop the local conflict record and re-express the user's choice as a normal outbox row based on `remote_version` (`update` with the chosen content, or `delete`); for `keep_remote` force a snapshot instead. Return `'requeued'`. The next push applies it or raises a fresh conflict against the current server state — no data is silently chosen.

**Files:**
- Create: `src/lib/conflicts.ts`, `src/lib/conflicts.test.ts`

**Interfaces:**
- Consumes: `buildPayload`, `forceSnapshot`, `PromptPayload`, `RemotePrompt`, `ResolveResponse` (Task 14); `enqueue` (Task 13); `categoryNameFor` (Task 10); `runSync` (Task 16); `ApiError`, `apiClient` (Task 1).
- Produces: `type ConflictRecord = { conflictId: string; spaceId: string; promptId: string; local: PromptPayload | null; remote: RemotePrompt; remoteVersion: number; createdAt: number }`; `type LocalVersion = { title: string; content: string; category: string | null; updatedAt: number }`; `type ResolveOutcome = 'resolved' | 'requeued' | 'forbidden'`; `getConflictForPrompt(promptId): Promise<ConflictRecord | null>`; `getLocalVersion(promptId): Promise<LocalVersion | null>`; `resolveKeepRemote(c): Promise<ResolveOutcome>`; `resolveKeepLocal(c): Promise<ResolveOutcome>`; `resolveMerged(c, merged: { title: string; content: string; category: string | null }): Promise<ResolveOutcome>`.

- [ ] **Step 1: Write the failing tests** — `src/lib/conflicts.test.ts`:

```ts
jest.mock('@/services/apiClient', () => {
  class ApiError extends Error {
    status: number
    code: string
    constructor(status: number, code: string, message: string) {
      super(message)
      this.status = status
      this.code = code
    }
  }
  return { ApiError, apiClient: { post: jest.fn() } }
})
jest.mock('./syncEngine', () => ({ runSync: jest.fn(async () => undefined) }))
jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: async (_a: string, value: string) =>
    require('crypto').createHash('sha256').update(value).digest('hex'),
}))

import { ApiError, apiClient } from '@/services/apiClient'

import {
  getConflictForPrompt,
  resolveKeepLocal,
  resolveKeepRemote,
  resolveMerged,
} from './conflicts'
import { getDb } from './db'
import { runSync } from './syncEngine'

const SPACE = 'aaaaaaaa-0000-4000-8000-000000000001'
const post = apiClient.post as jest.Mock
const CONFLICT_AT = 1_000

function remote(overrides: Record<string, unknown> = {}) {
  return {
    promptId: 'p1',
    title: 'Máy chủ',
    content: 'Nội dung máy chủ',
    description: null,
    categoryId: null,
    categoryName: null,
    version: 4,
    isDeleted: false,
    ...overrides,
  }
}

async function seed({ withLocalRow = true, localUpdatedAt = 500, remoteDeleted = false } = {}) {
  const db = await getDb()
  if (withLocalRow) {
    await db.runAsync(
      `INSERT INTO prompts (id, space_id, title, content, category, created_at, updated_at, version, has_conflict)
       VALUES ('p1', ?, 'Của tôi', 'Nội dung của tôi', 'Marketing', 1, ?, 3, 1)`,
      SPACE,
      localUpdatedAt,
    )
  }
  await db.runAsync(
    `INSERT INTO sync_conflicts (conflict_id, space_id, prompt_id, local_payload, remote_payload, remote_version, created_at)
     VALUES ('c-1', ?, 'p1', ?, ?, 4, ?)`,
    SPACE,
    withLocalRow ? JSON.stringify({ title: 'Của tôi', content: 'Nội dung của tôi', description: null }) : null,
    JSON.stringify(remote({ isDeleted: remoteDeleted })),
    CONFLICT_AT,
  )
  await db.runAsync(
    "INSERT INTO sync_outbox (space_id, prompt_id, operation, base_version, created_at) VALUES (?, 'p1', 'update', 3, 1)",
    SPACE,
  )
}

beforeEach(async () => {
  post.mockReset()
  ;(runSync as jest.Mock).mockClear()
  const db = await getDb()
  await db.execAsync('DELETE FROM prompts; DELETE FROM sync_outbox; DELETE FROM sync_conflicts; DELETE FROM sync_state;')
  await db.runAsync(
    "INSERT OR IGNORE INTO spaces (id, kind, name, can_manage, created_at) VALUES (?, 'personal', 'P', 1, 1)",
    SPACE,
  )
})

async function state() {
  const db = await getDb()
  return {
    prompt: await db.getFirstAsync('SELECT title, version, has_conflict FROM prompts WHERE id = ?', 'p1'),
    outbox: await db.getAllAsync('SELECT operation, base_version FROM sync_outbox'),
    conflict: await db.getFirstAsync('SELECT conflict_id FROM sync_conflicts'),
  }
}

describe('conflicts', () => {
  it('keep_remote writes the server copy with the returned version', async () => {
    await seed()
    post.mockResolvedValue({ promptId: 'p1', newVersion: 4, isDeleted: false })

    expect(await resolveKeepRemote((await getConflictForPrompt('p1'))!)).toBe('resolved')

    expect(post).toHaveBeenCalledWith('/sync/conflicts/c-1/resolve', { resolution: 'keep_remote' }, { auth: true })
    expect(await state()).toEqual({
      prompt: { title: 'Máy chủ', version: 4, has_conflict: 0 },
      outbox: [],
      conflict: null,
    })
    expect(runSync).toHaveBeenCalled()
  })

  it('keep_remote on a remotely deleted prompt deletes it locally', async () => {
    await seed({ remoteDeleted: true })
    post.mockResolvedValue({ promptId: 'p1', newVersion: 4, isDeleted: true })

    await resolveKeepRemote((await getConflictForPrompt('p1'))!)

    expect((await state()).prompt).toBeNull()
  })

  it('keep_local when the local row is unchanged since the conflict', async () => {
    await seed({ localUpdatedAt: 500 })
    post.mockResolvedValue({ promptId: 'p1', newVersion: 5, isDeleted: false })

    await resolveKeepLocal((await getConflictForPrompt('p1'))!)

    expect(post).toHaveBeenCalledWith('/sync/conflicts/c-1/resolve', { resolution: 'keep_local' }, { auth: true })
    expect((await state()).prompt).toEqual({ title: 'Của tôi', version: 5, has_conflict: 0 })
  })

  it('sends the current row as merged when it was edited after the conflict', async () => {
    await seed({ localUpdatedAt: 2_000 })
    post.mockResolvedValue({ promptId: 'p1', newVersion: 5, isDeleted: false })

    await resolveKeepLocal((await getConflictForPrompt('p1'))!)

    const body = post.mock.calls[0]![1]
    expect(body.resolution).toBe('merged')
    expect(body.mergedPayload).toMatchObject({ title: 'Của tôi', content: 'Nội dung của tôi', categoryName: 'Marketing' })
    expect(body.mergedPayload).not.toHaveProperty('tags')
  })

  it('"Vẫn xoá": keep_local on a local delete lets the server delete it (gap G9 closed)', async () => {
    await seed({ withLocalRow: false })
    post.mockResolvedValue({ promptId: 'p1', newVersion: 5, isDeleted: true })

    await resolveKeepLocal((await getConflictForPrompt('p1'))!)

    expect(post).toHaveBeenCalledWith('/sync/conflicts/c-1/resolve', { resolution: 'keep_local' }, { auth: true })
    expect(await state()).toEqual({ prompt: null, outbox: [], conflict: null })
  })

  it('merged writes the chosen content locally and clears an emptied category', async () => {
    await seed()
    post.mockResolvedValue({ promptId: 'p1', newVersion: 5, isDeleted: false })

    await resolveMerged((await getConflictForPrompt('p1'))!, { title: 'Gộp', content: 'Cả hai', category: null })

    expect(post.mock.calls[0]![1]).toEqual({
      resolution: 'merged',
      mergedPayload: { title: 'Gộp', content: 'Cả hai', description: null, clearCategory: true },
    })
    expect((await state()).prompt).toEqual({ title: 'Gộp', version: 5, has_conflict: 0 })
  })

  it('403 on keep_local reports forbidden and changes nothing', async () => {
    await seed()
    post.mockRejectedValue(new ApiError(403, 'Forbidden', 'Ban khong co quyen sua prompt nay.'))

    expect(await resolveKeepLocal((await getConflictForPrompt('p1'))!)).toBe('forbidden')
    expect((await state()).conflict).toEqual({ conflict_id: 'c-1' })
  })

  it('409 re-queues the chosen content on the recorded remote version', async () => {
    await seed()
    post.mockRejectedValue(new ApiError(409, 'Conflict', 'Du lieu tren server da thay doi'))

    expect(await resolveKeepLocal((await getConflictForPrompt('p1'))!)).toBe('requeued')
    expect(await state()).toEqual({
      prompt: { title: 'Của tôi', version: 4, has_conflict: 0 },
      outbox: [{ operation: 'update', base_version: 4 }],
      conflict: null,
    })
  })

  it('404 on keep_remote forces a snapshot so the pull restores the server copy', async () => {
    await seed()
    const db = await getDb()
    await db.runAsync('INSERT INTO sync_state (space_id, cursor) VALUES (?, 50)', SPACE)
    post.mockRejectedValue(new ApiError(404, 'NotFound', 'Khong tim thay xung dot can xu ly.'))

    expect(await resolveKeepRemote((await getConflictForPrompt('p1'))!)).toBe('requeued')
    expect(await db.getFirstAsync('SELECT cursor FROM sync_state WHERE space_id = ?', SPACE)).toEqual({ cursor: 0 })
    expect((await state()).conflict).toBeNull()
  })

  it('leaves everything untouched when the server is unreachable', async () => {
    await seed()
    post.mockRejectedValue(new Error('offline'))
    await expect(resolveKeepRemote((await getConflictForPrompt('p1'))!)).rejects.toThrow('offline')
    expect((await state()).conflict).toEqual({ conflict_id: 'c-1' })
  })
})
```

- [ ] **Step 2: Run to verify failure** — `npx jest src/lib/conflicts.test.ts` → FAIL.

- [ ] **Step 3: Write `src/lib/conflicts.ts`**

```ts
import type { SQLiteDatabase } from 'expo-sqlite'

import { ApiError, apiClient } from '@/services/apiClient'

import { categoryNameFor } from './categoryId'
import { getDb } from './db'
import { enqueue } from './outbox'
import { runSync } from './syncEngine'
import {
  buildPayload,
  forceSnapshot,
  type PromptPayload,
  type RemotePrompt,
  type ResolveResponse,
} from './syncPush'

export type ConflictRecord = {
  conflictId: string
  spaceId: string
  promptId: string
  local: PromptPayload | null // null = the local side was a delete
  remote: RemotePrompt // remote.isDeleted = deleted on another device
  remoteVersion: number
  createdAt: number
}

export type LocalVersion = {
  title: string
  content: string
  category: string | null
  updatedAt: number
}

export type ResolveOutcome = 'resolved' | 'requeued' | 'forbidden'

type Content = { title: string; content: string; category: string | null }

// What the user chose, re-expressed as a normal outbox operation when the server-side
// conflict can no longer be resolved (409/404, spec §0 C17).
type Choice = { kind: 'remote' } | { kind: 'content'; value: Content } | { kind: 'delete' }

type ConflictRow = {
  conflict_id: string
  space_id: string
  prompt_id: string
  local_payload: string | null
  remote_payload: string
  remote_version: number
  created_at: number
}

export async function getConflictForPrompt(promptId: string): Promise<ConflictRecord | null> {
  const db = await getDb()
  const row = await db.getFirstAsync<ConflictRow>(
    'SELECT * FROM sync_conflicts WHERE prompt_id = ? ORDER BY created_at DESC LIMIT 1',
    promptId,
  )
  if (!row) return null
  return {
    conflictId: row.conflict_id,
    spaceId: row.space_id,
    promptId: row.prompt_id,
    local: row.local_payload ? (JSON.parse(row.local_payload) as PromptPayload) : null,
    remote: JSON.parse(row.remote_payload) as RemotePrompt,
    remoteVersion: row.remote_version,
    createdAt: row.created_at,
  }
}

export async function getLocalVersion(promptId: string): Promise<LocalVersion | null> {
  const db = await getDb()
  const row = await db.getFirstAsync<{ title: string; content: string; category: string | null; updated_at: number }>(
    'SELECT title, content, category, updated_at FROM prompts WHERE id = ?',
    promptId,
  )
  return row ? { title: row.title, content: row.content, category: row.category, updatedAt: row.updated_at } : null
}

async function postResolve(
  c: ConflictRecord,
  body: { resolution: 'keep_local' | 'keep_remote' | 'merged'; mergedPayload?: PromptPayload },
): Promise<ResolveResponse | 'stale' | 'forbidden'> {
  try {
    return await apiClient.post<ResolveResponse>(`/sync/conflicts/${c.conflictId}/resolve`, body, { auth: true })
  } catch (error) {
    if (error instanceof ApiError) {
      // Only the author or a canManage member may keep_local/merged (spec §0 C18).
      if (error.status === 403 && body.resolution !== 'keep_remote') return 'forbidden'
      if (error.status === 404 || error.status === 409) return 'stale'
    }
    throw error // offline / 5xx: nothing changes, the user can retry
  }
}

async function writeContent(db: SQLiteDatabase, c: ConflictRecord, content: Content, version: number): Promise<void> {
  const now = Date.now()
  await db.runAsync(
    `INSERT INTO prompts (id, space_id, title, content, category, created_at, updated_at, synced_at, version, has_conflict)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
     ON CONFLICT(id) DO UPDATE SET title = excluded.title, content = excluded.content,
       category = excluded.category, updated_at = excluded.updated_at, synced_at = excluded.synced_at,
       version = excluded.version, has_conflict = 0`,
    c.promptId,
    c.spaceId,
    content.title,
    content.content,
    content.category,
    now,
    now,
    now,
    version,
  )
}

async function clearConflict(db: SQLiteDatabase, c: ConflictRecord): Promise<void> {
  await db.runAsync('DELETE FROM sync_outbox WHERE prompt_id = ?', c.promptId)
  await db.runAsync('DELETE FROM sync_conflicts WHERE conflict_id = ?', c.conflictId)
}

// Success path: the server's answer is authoritative for version and deletion (G8/G9 closed).
async function settle(c: ConflictRecord, resolved: ResolveResponse, content: Content | null): Promise<void> {
  const db = await getDb()
  await db.withTransactionAsync(async () => {
    await clearConflict(db, c)
    if (resolved.isDeleted) {
      await db.runAsync('DELETE FROM prompts WHERE id = ?', c.promptId)
    } else if (content) {
      await writeContent(db, c, content, resolved.newVersion)
    } else {
      await db.runAsync(
        'UPDATE prompts SET version = ?, has_conflict = 0, synced_at = ? WHERE id = ?',
        resolved.newVersion,
        Date.now(),
        c.promptId,
      )
    }
  })
  void runSync()
}

async function requeue(c: ConflictRecord, choice: Choice): Promise<void> {
  const db = await getDb()
  await db.withTransactionAsync(async () => {
    await clearConflict(db, c)
    if (choice.kind === 'remote') {
      await db.runAsync('UPDATE prompts SET has_conflict = 0 WHERE id = ?', c.promptId)
      await forceSnapshot(db, c.spaceId)
    } else if (choice.kind === 'delete') {
      await db.runAsync('DELETE FROM prompts WHERE id = ?', c.promptId)
      await enqueue(db, c.spaceId, c.promptId, 'delete', c.remoteVersion)
    } else {
      await writeContent(db, c, choice.value, c.remoteVersion)
      await enqueue(db, c.spaceId, c.promptId, 'update', c.remoteVersion)
    }
  })
  void runSync()
}

async function finish(
  c: ConflictRecord,
  answer: ResolveResponse | 'stale' | 'forbidden',
  content: Content | null,
  choice: Choice,
): Promise<ResolveOutcome> {
  if (answer === 'forbidden') return 'forbidden'
  if (answer === 'stale') {
    await requeue(c, choice)
    return 'requeued'
  }
  await settle(c, answer, content)
  return 'resolved'
}

export async function resolveKeepRemote(c: ConflictRecord): Promise<ResolveOutcome> {
  const answer = await postResolve(c, { resolution: 'keep_remote' })
  const local = await getLocalVersion(c.promptId)
  // A push conflict's remote carries categoryId only (categoryName is null, spec §0 C19):
  // name it from the app's derived ids, else keep the local name.
  let category: string | null = null
  if (c.remote.categoryId) {
    category = (await categoryNameFor(c.spaceId, c.remote.categoryId)) ?? local?.category ?? null
  }
  return finish(c, answer, { title: c.remote.title, content: c.remote.content, category }, { kind: 'remote' })
}

export async function resolveKeepLocal(c: ConflictRecord): Promise<ResolveOutcome> {
  const local = await getLocalVersion(c.promptId)

  if (!local) {
    // "Vẫn xoá": the server replays the stored local delete (G9 closed).
    const answer = await postResolve(c, { resolution: 'keep_local' })
    return finish(c, answer, null, { kind: 'delete' })
  }

  const content: Content = { title: local.title, content: local.content, category: local.category }
  const answer =
    local.updatedAt > c.createdAt
      ? await postResolve(c, { resolution: 'merged', mergedPayload: await buildPayload(c.spaceId, content, 'update') })
      : await postResolve(c, { resolution: 'keep_local' })
  return finish(c, answer, null, { kind: 'content', value: content })
}

export async function resolveMerged(c: ConflictRecord, merged: Content): Promise<ResolveOutcome> {
  const answer = await postResolve(c, {
    resolution: 'merged',
    mergedPayload: await buildPayload(c.spaceId, merged, 'update'),
  })
  return finish(c, answer, merged, { kind: 'content', value: merged })
}
```

- [ ] **Step 4: Run tests and type-check** — `npx jest src/lib/conflicts.test.ts && npx tsc --noEmit` → PASS.

- [ ] **Step 5: Commit** (`detect_changes()` first)

```bash
git add src/lib/conflicts.ts src/lib/conflicts.test.ts
git commit -m "feat(sync): conflict resolution via /sync/conflicts/{id}/resolve"
```

---

### Task 19: Side-by-side conflict screen

**Depends on:** Task 18.

**Files:**
- Create: `src/app/conflict.tsx`
- Modify: `src/navigation/routes.ts`, `src/app/_layout.tsx`, `src/app/prompt-detail.tsx`

**Interfaces:**
- Consumes: `getConflictForPrompt`, `getLocalVersion`, `resolveKeepRemote`, `resolveKeepLocal`, `resolveMerged`, `ResolveOutcome` (Task 18); `Prompt.hasConflict` (Task 9).
- Produces: route `conflict: '/conflict'` with params `{ promptId: string }`.

Three situations (spec §12): edit vs edit; local delete vs remote edit (`local === null`); local edit vs remote delete (`conflict.remote.isDeleted`). `'forbidden'` (a non-author member in a shared space, spec §0 C18) leaves only "Giữ bản máy chủ" enabled; `'requeued'` (server moved on) tells the user their choice will be synced again.

- [ ] **Step 1: Route + stack** — `routes.ts`: `conflict: '/conflict',` in `ROUTES` and `conflict: { promptId: string }` in `RouteParams` (**`routes.ts` has uncommitted user changes on this branch — confirm with the user and never revert them**). `_layout.tsx`: `<Stack.Screen name="conflict" options={{ presentation: 'modal' }} />`.

- [ ] **Step 2: Create `src/app/conflict.tsx`**

```tsx
import { useCallback, useState } from 'react'
import { Alert, ScrollView, Text, TextInput, View } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'

import { Button, IconButton, TextField } from '@/components/ui'
import { toAuthError } from '@/lib/authForm'
import {
  type ConflictRecord,
  getConflictForPrompt,
  getLocalVersion,
  type LocalVersion,
  resolveKeepLocal,
  resolveKeepRemote,
  resolveMerged,
  type ResolveOutcome,
} from '@/lib/conflicts'
import { useResponsive } from '@/hooks/useResponsive'
import { goBack, useRouteParams } from '@/navigation'
import { makeStyles, text, useTheme } from '@/theme'

export default function ConflictScreen() {
  const styles = useStyles()
  const { colors } = useTheme()
  const { promptId } = useRouteParams('conflict')
  const [conflict, setConflict] = useState<ConflictRecord | null>(null)
  const [local, setLocal] = useState<LocalVersion | null>(null)
  const [merging, setMerging] = useState(false)
  const [forbidden, setForbidden] = useState(false)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [busy, setBusy] = useState(false)
  const { isCompact } = useResponsive()

  useFocusEffect(
    useCallback(() => {
      getConflictForPrompt(promptId).then(setConflict)
      getLocalVersion(promptId).then(setLocal)
    }, [promptId]),
  )

  async function run(action: () => Promise<ResolveOutcome>) {
    setBusy(true)
    try {
      const outcome = await action()
      if (outcome === 'forbidden') {
        setForbidden(true)
        setMerging(false)
        Alert.alert(
          'Không có quyền sửa',
          'Bạn chỉ có thể giữ bản trên máy chủ vì prompt này do thành viên khác tạo.',
        )
        return
      }
      if (outcome === 'requeued') {
        Alert.alert(
          'Bản trên máy chủ vừa thay đổi',
          'Lựa chọn của bạn sẽ được đồng bộ lại. Nếu vẫn khác, bạn sẽ được hỏi lại.',
        )
      }
      goBack('home')
    } catch (e) {
      Alert.alert('Chưa giải quyết được', toAuthError(e).message)
    } finally {
      setBusy(false)
    }
  }

  function startMerge() {
    setTitle(local?.title ?? conflict?.remote.title ?? '')
    setContent(local?.content ?? conflict?.remote.content ?? '')
    setMerging(true)
  }

  if (!conflict) return <SafeAreaView style={styles.safe} />

  const deletedLocally = local === null
  const deletedRemotely = conflict.remote.isDeleted

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <IconButton name="close" accessibilityLabel="Đóng" onPress={() => goBack('home')} />
        <Text style={styles.topTitle}>Xung đột đồng bộ</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {merging ? (
          <>
            <TextField label="Tiêu đề" value={title} onChangeText={setTitle} />
            <TextInput
              style={[styles.textarea, { color: colors.onSurface }]}
              multiline
              value={content}
              onChangeText={setContent}
            />
            <Button
              label="Lưu bản gộp"
              loading={busy}
              disabled={!title.trim() || !content.trim()}
              onPress={() =>
                run(() =>
                  resolveMerged(conflict, {
                    title: title.trim(),
                    content: content.trim(),
                    category: local?.category ?? null,
                  }),
                )
              }
            />
          </>
        ) : (
          <>
            <View style={isCompact ? styles.stack : styles.columns}>
              <View style={styles.panel}>
                <Text style={styles.panelLabel}>Bản của bạn</Text>
                {deletedLocally ? (
                  <Text style={styles.body}>Bạn đã xoá prompt này.</Text>
                ) : (
                  <>
                    <Text style={styles.panelTitle}>{local.title}</Text>
                    <Text style={styles.body}>{local.content}</Text>
                  </>
                )}
              </View>
              <View style={styles.panel}>
                <Text style={styles.panelLabel}>Bản trên máy chủ</Text>
                {deletedRemotely ? (
                  <Text style={styles.body}>Prompt đã bị xoá trên thiết bị khác.</Text>
                ) : (
                  <>
                    <Text style={styles.panelTitle}>{conflict.remote.title}</Text>
                    <Text style={styles.body}>{conflict.remote.content}</Text>
                  </>
                )}
              </View>
            </View>

            <Button
              label={deletedLocally ? 'Vẫn xoá' : 'Giữ bản của tôi'}
              loading={busy}
              disabled={forbidden}
              onPress={() => run(() => resolveKeepLocal(conflict))}
            />
            <Button
              variant="tonal"
              label={
                deletedLocally ? 'Khôi phục bản máy chủ' : deletedRemotely ? 'Chấp nhận xoá' : 'Giữ bản máy chủ'
              }
              disabled={busy}
              onPress={() => run(() => resolveKeepRemote(conflict))}
            />
            {!deletedLocally && (
              <Button variant="tonal" label="Gộp" disabled={busy || forbidden} onPress={startMerge} />
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const useStyles = makeStyles(({ colors, typography, shape, spacing }) => ({
  safe: { flex: 1, backgroundColor: colors.surface },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm },
  topTitle: { ...text('titleLarge'), color: colors.onSurface },
  content: { padding: spacing.lg, gap: spacing.lg },
  columns: { flexDirection: 'row', gap: spacing.md },
  stack: { gap: spacing.md },
  panel: {
    flex: 1,
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: shape.medium,
    backgroundColor: colors.surfaceContainerLowest,
  },
  panelLabel: { ...text('labelMedium', 'medium'), color: colors.primary },
  panelTitle: { ...text('titleMedium', 'semiBold'), color: colors.onSurface },
  body: { ...typography.bodyMedium, color: colors.onSurfaceVariant },
  textarea: {
    minHeight: 160,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: shape.small,
    textAlignVertical: 'top',
    ...typography.bodyLarge,
  },
}))
```

`useResponsive()` exposes `isCompact` (width < 600) — side-by-side on medium/expanded windows, stacked on phones.

- [ ] **Step 3: Banner in `src/app/prompt-detail.tsx`** — import `push` is already there; directly after the top-bar `<View style={styles.topBar}>…</View>` insert:

```tsx
      {prompt.hasConflict && (
        <Pressable style={styles.conflictBanner} onPress={() => push('conflict', { promptId: prompt.id })}>
          <Text style={styles.conflictText}>Prompt này có xung đột đồng bộ — Giải quyết</Text>
        </Pressable>
      )}
```

add `Pressable` to the `react-native` import, and to `useStyles`:

```ts
  conflictBanner: {
    marginHorizontal: spacing.lg,
    padding: spacing.md,
    borderRadius: shape.medium,
    backgroundColor: colors.errorContainer,
  },
  conflictText: { ...text('bodyMedium', 'semiBold'), color: colors.onErrorContainer },
```

(`errorContainer`/`onErrorContainer` are M3 roles in `src/theme/colors.ts`; destructure `shape`/`spacing` in `makeStyles` if the file doesn't already.) A prompt deleted locally has no detail screen; its conflict is reached from the sync status in Settings → "Sao lưu & đồng bộ" (list rows from `sync_conflicts` whose prompt is missing) — or accepted as a follow-up if that list does not exist yet.

- [ ] **Step 4: Verify** — `npx tsc --noEmit && npx jest` → PASS. Manual: (a) edit the same prompt on two devices offline, bring both online → the second sees the banner → each button resolves and both devices converge after the next sync; (b) delete on one device, edit on the other → "Vẫn xoá" removes it everywhere; (c) in a team space where you are a plain Member, edit a prompt another member created → the push is rejected and the server copy comes back (Task 14); a conflict on such a prompt only allows "Giữ bản máy chủ".

- [ ] **Step 5: Commit** (`detect_changes()` first)

```bash
git add src/app/conflict.tsx src/navigation/routes.ts src/app/_layout.tsx src/app/prompt-detail.tsx
git commit -m "feat(sync): side-by-side conflict resolution screen"
```

---

### Task 20: Device sessions screen

**Depends on:** `2026-09-25-token-session-management.md` Tasks 3–4 deployed.

**Files:**
- Create: `src/lib/sessions.ts`, `src/lib/sessions.test.ts`, `src/app/sessions.tsx`
- Modify: `src/navigation/routes.ts`, `src/app/_layout.tsx`, `src/app/(drawers)/(tabs)/profile.tsx`

**Interfaces:**
- Produces: `type DeviceSession = { id: string; deviceName: string | null; platform: string | null; issuedAt: number; isCurrent: boolean }` (B-SES `SessionResponse`, `issuedAt` = unix seconds); `listSessions(): Promise<DeviceSession[]>` (current first, then newest); `revokeSession(id): Promise<void>`; `describeSession(s, now?): { title: string; subtitle: string }`; route `sessions: '/sessions'`.

- [ ] **Step 1: Write the failing tests** — `src/lib/sessions.test.ts`:

```ts
jest.mock('@/services/apiClient', () => ({ apiClient: { get: jest.fn(), delete: jest.fn() } }))

import { apiClient } from '@/services/apiClient'

import { describeSession, listSessions, revokeSession } from './sessions'

describe('sessions', () => {
  it('lists the current device first, then newest', async () => {
    ;(apiClient.get as jest.Mock).mockResolvedValue([
      { id: 'a', deviceName: 'Old', platform: 'ios', issuedAt: 100, isCurrent: false },
      { id: 'b', deviceName: 'This', platform: 'android', issuedAt: 50, isCurrent: true },
      { id: 'c', deviceName: 'New', platform: 'web', issuedAt: 200, isCurrent: false },
    ])
    expect((await listSessions()).map((s) => s.id)).toEqual(['b', 'c', 'a'])
    expect(apiClient.get).toHaveBeenCalledWith('/account/sessions', { auth: true })
  })

  it('revokes by public id', async () => {
    await revokeSession('abc123def456')
    expect(apiClient.delete).toHaveBeenCalledWith('/account/sessions/abc123def456', { auth: true })
  })

  it('describes unknown devices and platforms', () => {
    const now = 1_000_000_000_000
    expect(
      describeSession({ id: 'x', deviceName: null, platform: null, issuedAt: now / 1000 - 30, isCurrent: false }, now),
    ).toEqual({ title: 'Thiết bị không rõ', subtitle: 'Không rõ · Đăng nhập Vừa xong' })
    expect(
      describeSession({ id: 'y', deviceName: 'Pixel', platform: 'android', issuedAt: now / 1000 - 30, isCurrent: true }, now).subtitle,
    ).toBe('Android · Đăng nhập Vừa xong')
  })
})
```

- [ ] **Step 2: Run to verify failure** — `npx jest src/lib/sessions.test.ts` → FAIL.

- [ ] **Step 3: Write `src/lib/sessions.ts`**

```ts
import { apiClient } from '@/services/apiClient'

import { formatRelativeTime } from './format'

// token-session-management plan Task 3: SessionResponse ({ id, deviceName, platform, issuedAt, isCurrent }).
export type DeviceSession = {
  id: string
  deviceName: string | null
  platform: string | null
  issuedAt: number // unix seconds
  isCurrent: boolean
}

const PLATFORM_LABELS: Record<string, string> = { android: 'Android', ios: 'iOS', web: 'Web' }

export async function listSessions(): Promise<DeviceSession[]> {
  const sessions = await apiClient.get<DeviceSession[]>('/account/sessions', { auth: true })
  return [...sessions].sort(
    (a, b) => Number(b.isCurrent) - Number(a.isCurrent) || b.issuedAt - a.issuedAt,
  )
}

export async function revokeSession(id: string): Promise<void> {
  await apiClient.delete(`/account/sessions/${encodeURIComponent(id)}`, { auth: true })
}

export function describeSession(
  session: DeviceSession,
  now: number = Date.now(),
): { title: string; subtitle: string } {
  const platform = (session.platform && PLATFORM_LABELS[session.platform.toLowerCase()]) || 'Không rõ'
  const elapsedMs = now - session.issuedAt * 1000
  return {
    title: session.deviceName || 'Thiết bị không rõ',
    subtitle: `${platform} · Đăng nhập ${formatRelativeTime(Date.now() - elapsedMs)}`,
  }
}
```

- [ ] **Step 4: Create `src/app/sessions.tsx`**

```tsx
import { useCallback, useState } from 'react'
import { Alert, FlatList, Text, View } from 'react-native'
import { useFocusEffect } from 'expo-router'

import { Button } from '@/components/ui'
import { toAuthError } from '@/lib/authForm'
import { type DeviceSession, describeSession, listSessions, revokeSession } from '@/lib/sessions'
import { makeStyles, text } from '@/theme'

export default function SessionsScreen() {
  const styles = useStyles()
  const [sessions, setSessions] = useState<DeviceSession[]>([])
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    listSessions()
      .then((list) => {
        setSessions(list)
        setError(null)
      })
      .catch((e) => setError(toAuthError(e).message))
  }, [])

  useFocusEffect(load)

  function confirmRevoke(session: DeviceSession) {
    Alert.alert('Đăng xuất thiết bị?', describeSession(session).title, [
      { text: 'Huỷ', style: 'cancel' },
      {
        text: 'Đăng xuất',
        style: 'destructive',
        onPress: async () => {
          try {
            await revokeSession(session.id)
            load()
          } catch (e) {
            Alert.alert('Không đăng xuất được', toAuthError(e).message)
          }
        },
      },
    ])
  }

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.content}
      data={sessions}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={error ? <Text style={styles.error}>{error}</Text> : null}
      // Access sessions are not revoked on refresh, so a device can appear twice (gap G7).
      renderItem={({ item }) => {
        const { title, subtitle } = describeSession(item)
        return (
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.title}>
                {title}
                {item.isCurrent ? ' · Thiết bị này' : ''}
              </Text>
              <Text style={styles.subtitle}>{subtitle}</Text>
            </View>
            {!item.isCurrent && (
              <Button variant="tonal" label="Đăng xuất" onPress={() => confirmRevoke(item)} />
            )}
          </View>
        )
      }}
    />
  )
}

const useStyles = makeStyles(({ colors, typography, spacing }) => ({
  list: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.lg, gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowText: { flex: 1, gap: spacing.xxs },
  title: { ...text('titleMedium', 'medium'), color: colors.onSurface },
  subtitle: { ...typography.bodyMedium, color: colors.onSurfaceVariant },
  error: { ...typography.bodySmall, color: colors.error },
}))
```

- [ ] **Step 5: Wire it** — `routes.ts`: `sessions: '/sessions',` and `sessions: undefined`. `_layout.tsx`: `<Stack.Screen name="sessions" options={{ headerShown: true, title: 'Thiết bị đăng nhập' }} />`. `profile.tsx`: inside the `user ?` branch, before "Đăng xuất": `<SettingsRow icon="settings" label="Thiết bị đăng nhập" onPress={() => push('sessions')} />` (wrap both rows in a fragment).

- [ ] **Step 6: Verify** — `npx jest && npx tsc --noEmit` → PASS. Manual: sign in on two devices → each lists both, the other device's "Đăng xuất" signs it out within one request (its next API call gets `session_expired`).

- [ ] **Step 7: Commit**

```bash
git add src/lib/sessions.ts src/lib/sessions.test.ts src/app/sessions.tsx src/navigation/routes.ts src/app/_layout.tsx "src/app/(drawers)/(tabs)/profile.tsx"
git commit -m "feat(auth): device sessions screen"
```

---

### Task 21: ECDSA signature normalisation (raw r‖s → DER)

**Depends on:** nothing (pure).

**Files:**
- Create: `src/lib/biometricSignature.ts`, `src/lib/biometricSignature.test.ts`

**Interfaces:**
- Produces: `isDerSignature(bytes: Uint8Array): boolean`; `rawToDer(raw: Uint8Array): Uint8Array`; `ensureDerSignature(base64: string): string` (throws `'unsupported_signature_format'`). B-AUTH §7 requires DER (`Rfc3279DerSequence`).

- [ ] **Step 1: Write the failing tests** — `src/lib/biometricSignature.test.ts`:

```ts
import { createPublicKey, generateKeyPairSync, randomBytes, sign, verify } from 'crypto'

import { ensureDerSignature } from './biometricSignature'

describe('ensureDerSignature', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })

  it('converts IEEE P1363 (raw r||s) signatures to DER that verifies', () => {
    // 64 iterations hit leading-zero and high-bit r/s values.
    for (let i = 0; i < 64; i += 1) {
      const nonce = randomBytes(32)
      const raw = sign('sha256', nonce, { key: privateKey, dsaEncoding: 'ieee-p1363' })
      const der = Buffer.from(ensureDerSignature(raw.toString('base64')), 'base64')
      expect(verify('sha256', nonce, { key: createPublicKey(publicKey), dsaEncoding: 'der' }, der)).toBe(true)
    }
  })

  it('passes DER signatures through unchanged', () => {
    const der = sign('sha256', randomBytes(32), { key: privateKey, dsaEncoding: 'der' }).toString('base64')
    expect(ensureDerSignature(der)).toBe(der)
  })

  it('rejects anything else', () => {
    expect(() => ensureDerSignature(Buffer.from('nope').toString('base64'))).toThrow(
      'unsupported_signature_format',
    )
  })
})
```

- [ ] **Step 2: Run to verify failure** — `npx jest src/lib/biometricSignature.test.ts` → FAIL.

- [ ] **Step 3: Write `src/lib/biometricSignature.ts`**

```ts
// AioKin verifies with DSASignatureFormat.Rfc3279DerSequence (biometric plan, B-AUTH §7).
// The chosen native library does not document its output encoding, so normalise here.

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  bytes.forEach((b) => {
    binary += String.fromCharCode(b)
  })
  return btoa(binary)
}

function derInteger(value: Uint8Array): number[] {
  let start = 0
  while (start < value.length - 1 && value[start] === 0) start += 1
  const trimmed = Array.from(value.slice(start))
  if ((trimmed[0] ?? 0) & 0x80) trimmed.unshift(0) // keep it positive
  return [0x02, trimmed.length, ...trimmed]
}

export function rawToDer(raw: Uint8Array): Uint8Array {
  const r = derInteger(raw.slice(0, 32))
  const s = derInteger(raw.slice(32, 64))
  return Uint8Array.from([0x30, r.length + s.length, ...r, ...s])
}

export function isDerSignature(bytes: Uint8Array): boolean {
  if (bytes.length < 8 || bytes[0] !== 0x30 || bytes[1] !== bytes.length - 2) return false
  let offset = 2
  for (let k = 0; k < 2; k += 1) {
    if (bytes[offset] !== 0x02) return false
    const length = bytes[offset + 1] ?? 0
    if (length < 1 || length > 33) return false
    offset += 2 + length
  }
  return offset === bytes.length
}

export function ensureDerSignature(base64: string): string {
  const bytes = base64ToBytes(base64)
  if (isDerSignature(bytes)) return base64
  if (bytes.length === 64) return bytesToBase64(rawToDer(bytes))
  throw new Error('unsupported_signature_format')
}
```

- [ ] **Step 4: Run tests and type-check** — `npx jest src/lib/biometricSignature.test.ts && npx tsc --noEmit` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/biometricSignature.ts src/lib/biometricSignature.test.ts
git commit -m "feat(auth): normalise ECDSA signatures to DER for biometric login"
```

---

### Task 22: Biometric login library (device key + challenge/verify)

**Depends on:** `2026-09-25-biometric-device-login.md` — merged on the backend; spec gap G2 — closed (`/account/me` returns `userCode`, already read by Task 6's `toAuthUser`). Task 21 (implemented).

**Contract (verified 2026-09-26 — spec §0 C25–C28; `AioKin/Controllers/Auth/BiometricController.cs`, `AioKin/Models/InputModel/Auth/Biometric/BiometricRequests.cs`, `AioKin/Services/Auth/Biometric/BiometricAuthService.cs`, `BiometricSignature.cs`):**
- `POST /auth/biometric/register` (auth) `{ deviceId ≤100, deviceName? ≤120, platform? ≤20, publicKey ≤256 }` → envelope, no data. `deviceId` **must equal the deviceId of the current session** (the one sent at login), else `403 Forbidden`; `publicKey` must be base64 SPKI of a **P-256** key, else `400 InvalidPublicKey`.
- `POST /auth/biometric/challenge` (anonymous, rate-limited) `{ userCode, deviceId }` → **envelope** `data = { challengeId, nonce }` — *corrected: the first draft treated it as raw.* Always 200 regardless of enrollment; `500 InternalError` if the server can't store the challenge.
- `POST /auth/biometric/verify` (anonymous, strict rate limit) `{ challengeId, signature }` → envelope `data = TokenResponse` (snake_case). Signature = base64 **DER** ECDSA-SHA256 over the raw nonce bytes. Every failure = `401 InvalidCredentials`. Success revokes the device's previous sessions.
- `DELETE /auth/biometric/{deviceId}` (auth) → `404 NotFound` when nothing is enrolled; revoking the caller's own device does not sign it out.

**Files:**
- Modify: `package.json` (+ lockfiles), `app.json`
- Create: `src/lib/biometricLogin.ts`, `src/lib/biometricLogin.test.ts`

**Interfaces:**
- Consumes: `ensureDerSignature` (Task 21); `getDeviceId`, `getDeviceInfo` (Task 2); `setTokens`, `normalizeTokens`, `RawTokens` (Task 2); `setOAuthInProgress` (`src/lib/oauthState.ts`, suppresses the app-lock re-check while the OS prompt is up).
- Produces: `type BiometricEnrollment = { userCode: string; email: string | null }`; `getBiometricEnrollment(): Promise<BiometricEnrollment | null>`; `enableBiometricLogin(user: { userCode: string | null; email: string | null }): Promise<void>`; `disableBiometricLogin(): Promise<void>`; `forgetBiometricForOtherUser(userCode: string | null): Promise<void>`; `signInWithBiometric(): Promise<'signed_in' | 'cancelled'>`.

- [ ] **Step 1: Spike on a real device (go/no-go for the library, spec §8.1)**

```bash
npx expo install @sbaiahmed1/react-native-biometrics
```

Add to `app.json` plugins: `["@sbaiahmed1/react-native-biometrics", { "faceIDPermission": "Cho phép PromptVault dùng Face ID để đăng nhập." }]`. Run `npx expo prebuild --clean && npx expo run:android` (and `run:ios` on a Mac). Check `node_modules/@sbaiahmed1/react-native-biometrics/lib/typescript/**/index.d.ts` for the exact exported names used below (`createKeys`, `deleteKeys`, `signWithOptions`, `SignatureAlgorithm`, `InputEncoding`); adjust the imports if they differ. On the device, temporarily call `createKeys('aiokin.biometric', 'ec256')` then `signWithOptions({ keyAlias: 'aiokin.biometric', data: 'AAAA', inputEncoding: InputEncoding.Base64, algorithm: SignatureAlgorithm.SHA256withECDSA })` and log `publicKey.length` / signature length.
**No-go** (build fails on RN 0.86 / Expo 57, or no EC key): stop and replace this task with a local Expo Module (`modules/device-key`, Kotlin `KeyPairGenerator("EC", "AndroidKeyStore")` + `setUserAuthenticationRequired(true)` + `BiometricPrompt.CryptoObject(Signature("SHA256withECDSA"))`; Swift `SecKeyCreateRandomKey` with `kSecAttrTokenIDSecureEnclave` + `.biometryCurrentSet` and `SecKeyCreateSignature(.ecdsaSignatureMessageX962SHA256)`, public key = 26-byte P-256 SPKI header + `SecKeyCopyExternalRepresentation`) exposing the same three functions — the rest of this task is unchanged.

- [ ] **Step 2: Write the failing tests** — `src/lib/biometricLogin.test.ts`:

```ts
const mockSecure = new Map<string, string>()
jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK: 'AFTER_FIRST_UNLOCK',
  getItemAsync: async (key: string) => mockSecure.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => {
    mockSecure.set(key, value)
  },
  deleteItemAsync: async (key: string) => {
    mockSecure.delete(key)
  },
}))
jest.mock('@sbaiahmed1/react-native-biometrics', () => ({
  createKeys: jest.fn(async () => ({ publicKey: 'SPKI-BASE64' })),
  deleteKeys: jest.fn(async () => ({ success: true })),
  signWithOptions: jest.fn(),
  SignatureAlgorithm: { SHA256withECDSA: 'SHA256withECDSA' },
  InputEncoding: { Base64: 'base64' },
}))
jest.mock('@/services/apiClient', () => {
  class ApiError extends Error {
    status: number
    code: string
    constructor(status: number, code: string, message: string) {
      super(message)
      this.status = status
      this.code = code
    }
  }
  return { ApiError, apiClient: { post: jest.fn(), delete: jest.fn() } }
})
jest.mock('./deviceIdentity', () => ({
  getDeviceId: async () => 'dev-1',
  getDeviceInfo: async () => ({ deviceId: 'dev-1', deviceName: 'Pixel', platform: 'android' }),
}))
jest.mock('./biometricSignature', () => ({ ensureDerSignature: (s: string) => `der(${s})` }))

import { deleteKeys, signWithOptions } from '@sbaiahmed1/react-native-biometrics'

import { ApiError, apiClient } from '@/services/apiClient'

import {
  disableBiometricLogin,
  enableBiometricLogin,
  forgetBiometricForOtherUser,
  getBiometricEnrollment,
  signInWithBiometric,
} from './biometricLogin'
import { getTokens, resetTokenCacheForTests } from './tokenStore'

const post = apiClient.post as jest.Mock

beforeEach(() => {
  mockSecure.clear()
  resetTokenCacheForTests()
  jest.clearAllMocks()
})

describe('biometricLogin', () => {
  it('enable registers the public key for this device', async () => {
    await enableBiometricLogin({ userCode: 'USR_1', email: 'a@b.com' })
    expect(post).toHaveBeenCalledWith(
      '/auth/biometric/register',
      { deviceId: 'dev-1', deviceName: 'Pixel', platform: 'android', publicKey: 'SPKI-BASE64' },
      { auth: true },
    )
    expect(await getBiometricEnrollment()).toEqual({ userCode: 'USR_1', email: 'a@b.com' })
  })

  it('refuses to enable without a userCode', async () => {
    await expect(enableBiometricLogin({ userCode: null, email: null })).rejects.toThrow('user_code_unavailable')
  })

  it('a 403 on register (session bound to another deviceId) deletes the key and reports it', async () => {
    post.mockRejectedValueOnce(new ApiError(403, 'Forbidden', 'Chi duoc dang ky sinh trac cho chinh thiet bi...'))
    await expect(enableBiometricLogin({ userCode: 'USR_1', email: null })).rejects.toThrow('biometric_device_mismatch')
    expect(deleteKeys).toHaveBeenCalledWith('aiokin.biometric')
    expect(await getBiometricEnrollment()).toBeNull()
  })

  it('signs the nonce and stores the tokens from the envelope', async () => {
    await enableBiometricLogin({ userCode: 'USR_1', email: null })
    post.mockReset()
    post
      .mockResolvedValueOnce({ challengeId: 'ch-1', nonce: 'NONCE' }) // envelope data, unwrapped by apiClient
      .mockResolvedValueOnce({ access_token: 'a', refresh_token: 'r', expires_in: 900 })
    ;(signWithOptions as jest.Mock).mockResolvedValue({ success: true, signature: 'SIG' })

    await expect(signInWithBiometric()).resolves.toBe('signed_in')

    // Envelope endpoint (spec §0 C25): default options, no `envelope: false`.
    expect(post).toHaveBeenNthCalledWith(1, '/auth/biometric/challenge', {
      userCode: 'USR_1',
      deviceId: 'dev-1',
    })
    expect(signWithOptions).toHaveBeenCalledWith(
      expect.objectContaining({ keyAlias: 'aiokin.biometric', data: 'NONCE', inputEncoding: 'base64', algorithm: 'SHA256withECDSA' }),
    )
    expect(post).toHaveBeenNthCalledWith(2, '/auth/biometric/verify', { challengeId: 'ch-1', signature: 'der(SIG)' })
    expect((await getTokens())?.accessToken).toBe('a')
  })

  it('returns cancelled when the user dismisses the OS prompt', async () => {
    await enableBiometricLogin({ userCode: 'USR_1', email: null })
    post.mockReset().mockResolvedValueOnce({ challengeId: 'ch-1', nonce: 'NONCE' })
    ;(signWithOptions as jest.Mock).mockResolvedValue({ success: false, error: 'cancelled' })

    await expect(signInWithBiometric()).resolves.toBe('cancelled')
    expect(post).toHaveBeenCalledTimes(1)
  })

  it('disable revokes on the server and deletes the key even when offline', async () => {
    await enableBiometricLogin({ userCode: 'USR_1', email: null })
    ;(apiClient.delete as jest.Mock).mockRejectedValue(new Error('offline'))

    await disableBiometricLogin()

    expect(apiClient.delete).toHaveBeenCalledWith('/auth/biometric/dev-1', { auth: true })
    expect(deleteKeys).toHaveBeenCalledWith('aiokin.biometric')
    expect(await getBiometricEnrollment()).toBeNull()
  })

  it("forgets another account's enrollment", async () => {
    await enableBiometricLogin({ userCode: 'USR_1', email: null })
    await forgetBiometricForOtherUser('USR_2')
    expect(await getBiometricEnrollment()).toBeNull()
  })
})
```

- [ ] **Step 3: Run to verify failure** — `npx jest src/lib/biometricLogin.test.ts` → FAIL.

- [ ] **Step 4: Write `src/lib/biometricLogin.ts`**

```ts
import {
  createKeys,
  deleteKeys,
  InputEncoding,
  SignatureAlgorithm,
  signWithOptions,
} from '@sbaiahmed1/react-native-biometrics'
import * as SecureStore from 'expo-secure-store'

import { ApiError, apiClient } from '@/services/apiClient'

import { ensureDerSignature } from './biometricSignature'
import { getDeviceId, getDeviceInfo } from './deviceIdentity'
import { setOAuthInProgress } from './oauthState'
import { normalizeTokens, type RawTokens, setTokens } from './tokenStore'

// Biometric LOGIN (server challenge/response, biometric-device-login plan). Unrelated to
// the local app lock in appLock.ts / biometric.ts.
const KEY_ALIAS = 'aiokin.biometric'
const ENROLLMENT_KEY = 'aiokin.biometricLogin'
const OPTIONS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK }

export type BiometricEnrollment = { userCode: string; email: string | null }

export async function getBiometricEnrollment(): Promise<BiometricEnrollment | null> {
  const stored = await SecureStore.getItemAsync(ENROLLMENT_KEY, OPTIONS)
  try {
    return stored ? (JSON.parse(stored) as BiometricEnrollment) : null
  } catch {
    return null
  }
}

export async function enableBiometricLogin(user: {
  userCode: string | null
  email: string | null
}): Promise<void> {
  if (!user.userCode) throw new Error('user_code_unavailable') // profile not loaded yet
  // EC P-256 in Secure Enclave / Android Keystore, biometric-gated per use.
  const { publicKey } = await createKeys(KEY_ALIAS, 'ec256')
  const device = await getDeviceInfo()
  try {
    // deviceId must be the one this session was issued for (sent at login) — the server
    // compares it with the session and answers 403 otherwise (spec §0 C26).
    await apiClient.post(
      '/auth/biometric/register',
      { ...device, deviceName: device.deviceName.slice(0, 120), publicKey },
      { auth: true },
    )
  } catch (error) {
    await deleteKeys(KEY_ALIAS) // never keep a key the server doesn't know
    if (error instanceof ApiError && error.status === 403) throw new Error('biometric_device_mismatch')
    throw error // 400 InvalidPublicKey (not P-256 SPKI), network, …
  }
  const enrollment: BiometricEnrollment = { userCode: user.userCode, email: user.email }
  await SecureStore.setItemAsync(ENROLLMENT_KEY, JSON.stringify(enrollment), OPTIONS)
}

export async function disableBiometricLogin(): Promise<void> {
  try {
    await apiClient.delete(`/auth/biometric/${encodeURIComponent(await getDeviceId())}`, { auth: true })
  } catch {
    // Best effort (404 = already revoked server-side, e.g. by logout-all): the local key is
    // deleted anyway, so this device can no longer sign. Revoking our own device does not
    // sign us out (spec §0 C28).
  }
  await deleteKeys(KEY_ALIAS)
  await SecureStore.deleteItemAsync(ENROLLMENT_KEY, OPTIONS)
}

export async function forgetBiometricForOtherUser(userCode: string | null): Promise<void> {
  const enrollment = await getBiometricEnrollment()
  if (enrollment && enrollment.userCode !== userCode) {
    await deleteKeys(KEY_ALIAS)
    await SecureStore.deleteItemAsync(ENROLLMENT_KEY, OPTIONS)
  }
}

export async function signInWithBiometric(): Promise<'signed_in' | 'cancelled'> {
  const enrollment = await getBiometricEnrollment()
  if (!enrollment) throw new Error('biometric_not_enrolled')

  // OperationResult envelope — BiometricController.Challenge → ToActionResult (spec §0 C25).
  const challenge = await apiClient.post<{ challengeId: string; nonce: string }>(
    '/auth/biometric/challenge',
    { userCode: enrollment.userCode, deviceId: await getDeviceId() },
  )

  setOAuthInProgress(true) // the OS prompt backgrounds the app; don't trigger app lock
  let result: { success: boolean; signature?: string }
  try {
    result = await signWithOptions({
      keyAlias: KEY_ALIAS,
      data: challenge.nonce, // server signs Convert.FromBase64String(nonce) → sign the bytes
      inputEncoding: InputEncoding.Base64,
      algorithm: SignatureAlgorithm.SHA256withECDSA,
      promptTitle: 'Đăng nhập PromptVault',
      cancelButtonText: 'Huỷ',
      disableDeviceFallback: true,
    })
  } finally {
    setOAuthInProgress(false)
  }
  if (!result.success || !result.signature) return 'cancelled'

  // Envelope whose data is the snake_case TokenResponse.
  const tokens = await apiClient.post<RawTokens>('/auth/biometric/verify', {
    challengeId: challenge.challengeId,
    signature: ensureDerSignature(result.signature),
  })
  await setTokens(normalizeTokens(tokens))
  return 'signed_in'
}
```

- [ ] **Step 5: Run tests and type-check** — `npx jest src/lib/biometricLogin.test.ts && npx tsc --noEmit` → PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json yarn.lock app.json src/lib/biometricLogin.ts src/lib/biometricLogin.test.ts
git commit -m "feat(auth): biometric device-key login against AioKin"
```

---

### Task 23: Biometric login UI (Settings toggle, login button)

**Depends on:** Task 22. (Gap G2 is closed, so `user.userCode` is populated after `/account/me` and the toggle appears for every signed-in user on a device with biometrics.)

**Files:**
- Modify: `src/app/(drawers)/settings.tsx`, `src/app/onboarding/login.tsx`, `src/app/onboarding/sync.tsx`

**Interfaces:**
- Consumes: `getBiometricEnrollment`, `enableBiometricLogin`, `disableBiometricLogin`, `forgetBiometricForOtherUser`, `signInWithBiometric` (Task 22); `isBiometricAvailable` (existing).

- [ ] **Step 1: Settings toggle** — in `settings.tsx` add imports `import { disableBiometricLogin, enableBiometricLogin, getBiometricEnrollment } from '@/lib/biometricLogin'`, `import { toAuthError } from '@/lib/authForm'`, `import { useAuthStore } from '@/store'`; state and handler:

```tsx
  const user = useAuthStore((state) => state.user)
  const [biometricLogin, setBiometricLogin] = useState(false)

  useEffect(() => {
    getBiometricEnrollment().then((e) => setBiometricLogin(e !== null))
  }, [])

  async function handleToggleBiometricLogin(next: boolean) {
    try {
      if (next) {
        await enableBiometricLogin({ userCode: user?.userCode ?? null, email: user?.email ?? null })
      } else {
        await disableBiometricLogin()
      }
      setBiometricLogin(next)
    } catch (e) {
      // 403 on register: this session was issued for a different deviceId (spec §0 C26).
      const message =
        e instanceof Error && e.message === 'biometric_device_mismatch'
          ? 'Hãy đăng xuất rồi đăng nhập lại trên thiết bị này, sau đó bật lại.'
          : toAuthError(e).message
      Alert.alert('Không đổi được cài đặt', message)
    }
  }
```

and after the app-lock row (distinct label — spec §8):

```tsx
      {user?.userCode && biometricAvailable && (
        <SettingsRow
          icon="lock"
          label="Đăng nhập bằng vân tay / Face ID"
          onPress={() => handleToggleBiometricLogin(!biometricLogin)}
          trailing={
            <Switch
              value={biometricLogin}
              onValueChange={handleToggleBiometricLogin}
              trackColor={{ false: colors.surfaceContainerHighest, true: colors.primary }}
              thumbColor={biometricLogin ? colors.onPrimary : colors.outline}
            />
          }
        />
      )}
```

- [ ] **Step 2: Login button** — in `login.tsx` add `import { useEffect } from 'react'` (merge), `import { getBiometricEnrollment, signInWithBiometric } from '@/lib/biometricLogin'`; inside the component:

```tsx
  const [biometricReady, setBiometricReady] = useState(false)

  useEffect(() => {
    getBiometricEnrollment().then((e) => setBiometricReady(e !== null))
  }, [])

  async function handleBiometric() {
    setErrors({})
    setLoading(true)
    try {
      if ((await signInWithBiometric()) === 'signed_in') {
        await useAuthStore.getState().refreshUser()
        replace('sync')
      }
    } catch {
      // Server answers every failure with the same InvalidCredentials by design.
      setErrors({ form: 'Không đăng nhập được bằng sinh trắc học, hãy dùng mật khẩu.' })
    } finally {
      setLoading(false)
    }
  }
```

and above the e-mail fields:

```tsx
      {biometricReady && (
        <Button variant="tonal" label="Đăng nhập bằng vân tay / Face ID" onPress={handleBiometric} disabled={loading} />
      )}
```

- [ ] **Step 3: Different account → forget old enrollment** — in `sync.tsx` import `forgetBiometricForOtherUser` and `useAuthStore` selector for `userCode` (`const userCode = useAuthStore((s) => s.user?.userCode ?? null)`), and at the start of the effect's async block: `await forgetBiometricForOtherUser(userCode).catch(() => undefined)`.

- [ ] **Step 4: Verify** — `npx tsc --noEmit && npx jest` → PASS. Manual (device, current backend): enable in Settings → sign out → login screen shows the biometric button → Face ID/fingerprint → signed in; disable → button gone; app-lock toggle still behaves exactly as before.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(drawers)/settings.tsx" src/app/onboarding/login.tsx src/app/onboarding/sync.tsx
git commit -m "feat(auth): biometric login toggle and login button"
```

---

### Task 24: Remove Supabase from the app

**Depends on:** Tasks 1–8 at minimum (nothing imports Supabase after Task 7).

**Files:**
- Delete: `src/lib/supabase.ts`, `src/lib/supabase.test.ts`, `src/store/sessionStore.ts`, `src/store/sessionStore.test.ts`, `supabase/` (old Supabase schema — the backend owns the database now)
- Modify: `package.json` (+ lockfiles), `src/lib/secureStorage.ts` comment if it mentions Supabase
- Local only (never committed): `.env`, `.env.local`

- [ ] **Step 1: Confirm nothing uses Supabase**

Run: `grep -rn "supabase\|sessionStore" src --include=*.ts --include=*.tsx | grep -v "src/lib/supabase\|src/store/sessionStore"`
Expected: no output.

- [ ] **Step 2: Delete files and the dependency**

```bash
git rm src/lib/supabase.ts src/lib/supabase.test.ts src/store/sessionStore.ts src/store/sessionStore.test.ts
git rm -r supabase
npm uninstall @supabase/supabase-js
```

(If the team uses yarn, also run `yarn remove @supabase/supabase-js` so `yarn.lock` matches.)

- [ ] **Step 3: Env vars (local, not committed)** — in `.env` and `.env.local` delete `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_KEY`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; ensure `EXPO_PUBLIC_API_BASE_URL=<AioKin base URL>` is present. Remove the same keys from EAS environment variables if they were added there (`eas env:list`).

- [ ] **Step 4: Verify**

Run: `grep -rni "supabase" src package.json app.json` → no output. `npx tsc --noEmit && npx jest` → PASS. `npx expo start` → app boots, guest mode works, sign-in works.

- [ ] **Step 5: `detect_changes()` and commit**

```bash
git add package.json package-lock.json yarn.lock
git commit -m "chore: remove Supabase client, schema and env usage"
```

---

## Self-review notes

- **Spec coverage:** §4 → Tasks 1, 3; §5 → 2; §6 → 4–8; §6.1 (OAuth) → Google removed in Task 7, implementation deferred to gap G1; §7 → 20; §8 → 21–23; §9 → 9, 10; §10 → 11, 12, 17; §11 → 13–16; §12 → 18, 19; §13 → 3, 5, 7, 16, 17; §15 → each gap is referenced where the client works around it; §16 → task order.
- **Type consistency checked:** `LOCAL_SPACE_ID`, `Space`, `PromptPayload`, `RemotePrompt`, `RawTokens`, `normalizeTokens`, `runSync`, `enqueue(db, spaceId, promptId, op, baseVersion)` are used with the same names/signatures in every task.
- **2026-09-26 revision (backend `49299e0`):** Tasks 14–19 and 22–23 re-derived from the implemented backend (spec §0 C1–C30). Signatures that changed and are used consistently: `buildPayload(spaceId, prompt, 'insert' | 'update')`; `pushSpace(spaceId, { batchSize?, skipSeqs? })` → `{ applied, conflicts, rejected, remaining }`; `claimBatch(db, spaceId, limit, skipSeqs?)`; `completeRow(db, seq, newVersion?)` (as implemented in Task 13); `forceSnapshot(db, spaceId)`; `ResolveResponse`; `ResolveOutcome = 'resolved' | 'requeued' | 'forbidden'`; `SyncSummary.rejected`. No test mocks the removed shapes (`snapshotUrl`, `payloadJson`, bare push arrays, raw challenge).
- **Open decision before Task 14:** spec drift D1 (`description` is replaced on every update; schema v3 has no column for it).
- **Known manual-only checks:** background task scheduling, biometric key generation, OS prompts — each task lists its device check.
