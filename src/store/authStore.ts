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
        await logout()
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
    // Tokens are still valid here (signOut() below revokes them), so make a best-effort
    // attempt to flush pending outbox rows before they're wiped. Never block sign-out on
    // this and never let a failure (offline, server error) stop it.
    await runSync().catch(() => undefined)
    // Cold start with "keep me signed in" off: go through the same shared sign-out
    // seam as an explicit logout (ruling P3).
    await useAuthStore.getState().signOut()
    return
  }
  try {
    await useAuthStore.getState().refreshUser()
  } catch {
    // Offline: keep the persisted user. An expired session clears it via onTokensCleared.
  }
}

export const selectIsSignedIn = (state: AuthState) => state.user !== null
