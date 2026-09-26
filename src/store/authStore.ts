import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

import { clearSyncedData } from '@/lib/accountData'
import { type AccountProfile, getMe, logout } from '@/lib/authApi'
import { LargeSecureStore } from '@/lib/secureStorage'
import { awaitIdle, runSync } from '@/lib/syncEngine'
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
  // true while a cold-start sign-out (keepSignedIn=false) is flushing/wiping. _layout.tsx
  // gates rendering on this so a stale signed-in account's data is never shown, even briefly
  // (Task 17 fix round 2, issue 1). Never persisted — always starts true.
  restoring: boolean
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

// apiClient has no request timeout/AbortController, so any of signOut()'s network-dependent
// steps (the best-effort flush, logout()'s server-side revoke) could otherwise hang on a
// stalled network (captive portal, half-open connection) for as long as the OS TCP timeout —
// Task 17 fix rounds 2 (the flush) and 3 (logout() itself; every awaited step needs a ceiling).
const NETWORK_STEP_TIMEOUT_MS = 5000

// Resolves with `promise`'s value (or undefined on timeout/rejection) after at most `ms`.
// Clears its timer either way, so a fast-settling promise never leaves a real timer dangling.
// Promise.resolve() also tolerates a non-promise/thenable input (e.g. a bare `jest.fn()` mock).
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  return new Promise<T | undefined>((resolve) => {
    const timer = setTimeout(() => resolve(undefined), ms)
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      () => {
        clearTimeout(timer)
        resolve(undefined)
      },
    )
  })
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      hasOnboarded: false,
      keepSignedIn: true,
      hydrated: false,
      restoring: true,
      setUser: (profile) => set({ user: toAuthUser(profile) }),
      refreshUser: async () => {
        set({ user: toAuthUser(await getMe()) })
      },
      completeOnboarding: () => set({ hasOnboarded: true }),
      setKeepSignedIn: (keep) => set({ keepSignedIn: keep }),
      // Single shared sign-out seam: explicit logout AND the keepSignedIn=false cold-start
      // sign-out both go through this function (ruling P3), and this is the ONE place the
      // synced-data wipe happens (Task 17) — never duplicate it at a call site. awaitIdle()
      // closes the race where a sync already mid-flight would otherwise finish writing the
      // old account's rows back to disk after clearSyncedData() wipes them.
      signOut: async () => {
        // logout() already treats a failed/offline server-side revoke as best-effort and
        // always clears local tokens itself (src/lib/authApi.ts) — but apiClient has no
        // request timeout, so a stalled network could still hang the POST forever. Bounding
        // it here means EVERY awaited step in signOut() now has a ceiling, not just the
        // sync flush (Task 17 fix round 3, issue 1).
        await withTimeout(logout(), NETWORK_STEP_TIMEOUT_MS)
        await awaitIdle()
        await clearSyncedData()
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
  // The ENTIRE body is wrapped so `restoring` reliably clears no matter which step throws —
  // e.g. getTokens() faulting (SecureStore/Android keystore issues happen for real) — or which
  // branch runs. Before this task's fixes any such failure still rendered the app; leaving it
  // ungated now would otherwise lock the splash screen forever on every future launch (Task 17
  // fix round 3, issue 2).
  try {
    if (!useAuthStore.getState().hydrated) {
      // Waits on the store's own `hydrated` flag rather than persist's onFinishHydration: on a
      // FAILED rehydrate (e.g. a corrupt/inaccessible SecureStore entry), zustand still invokes
      // onRehydrateStorage's returned callback (which sets `hydrated: true` below) but never
      // fires onFinishHydration listeners — awaiting that event would hang here forever
      // (confirmed against the installed zustand version; fix round 3, issue 2).
      await new Promise<void>((resolve) => {
        const unsubscribe = useAuthStore.subscribe((state) => {
          if (state.hydrated) {
            unsubscribe()
            resolve()
          }
        })
      })
    }
    const tokens = await getTokens()
    if (!tokens) {
      useAuthStore.setState({ user: null })
      return
    }
    if (!useAuthStore.getState().keepSignedIn) {
      // Tokens are still valid here (signOut() below revokes them), so make a best-effort,
      // TIME-BOUNDED attempt to flush pending outbox rows before they're wiped. Never block
      // sign-out on this and never let a failure (offline, server error, timeout) stop it.
      await withTimeout(runSync(), NETWORK_STEP_TIMEOUT_MS)
      // Cold start with "keep me signed in" off: go through the same shared sign-out
      // seam as an explicit logout (ruling P3). signOut() itself bounds every one of its
      // network-dependent steps, so it completes even if this flush timed out.
      await useAuthStore.getState().signOut()
      return
    }
    // Normal "stay signed in" cold start: nothing to hide, so let the UI render right away —
    // refreshUser() below finishes in the background, unaffected by the outer finally below.
    useAuthStore.setState({ restoring: false })
    try {
      await useAuthStore.getState().refreshUser()
    } catch {
      // Offline: keep the persisted user. An expired session clears it via onTokensCleared.
    }
  } finally {
    // `restoring` stays true for the whole keepSignedIn=false branch above (so _layout.tsx
    // never renders the previous account's still-live data — fix round 2, issue 1); every
    // other path already cleared it explicitly, so this is a harmless no-op there.
    useAuthStore.setState({ restoring: false })
  }
}

export const selectIsSignedIn = (state: AuthState) => state.user !== null
