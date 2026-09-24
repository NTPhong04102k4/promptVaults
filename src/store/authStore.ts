import type { Session } from '@supabase/supabase-js'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

import { getSession, onAuthStateChange, signOut as supabaseSignOut } from '@/lib/auth'
import { LargeSecureStore } from '@/lib/secureStorage'

// Tokens stay in Supabase's own (encrypted) storage — this store only keeps
// what the UI needs to render instantly on cold start.
export type AuthUser = {
  id: string
  email: string | null
  username: string | null
  firstName: string | null
  lastName: string | null
}

type AuthState = {
  user: AuthUser | null
  hasOnboarded: boolean
  // "Keep me signed in" — when false, the session is dropped on the next cold start.
  keepSignedIn: boolean
  // true once persisted state has been read back from storage.
  hydrated: boolean
  setSession: (session: Session | null) => void
  completeOnboarding: () => void
  setKeepSignedIn: (keep: boolean) => void
  signOut: () => Promise<void>
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

export function toAuthUser(session: Session | null): AuthUser | null {
  if (!session) return null
  const meta = session.user.user_metadata
  return {
    id: session.user.id,
    email: session.user.email ?? null,
    username: readString(meta.username),
    firstName: readString(meta.first_name),
    lastName: readString(meta.last_name),
  }
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      hasOnboarded: false,
      keepSignedIn: true,
      hydrated: false,
      setSession: (session) => set({ user: toAuthUser(session) }),
      completeOnboarding: () => set({ hasOnboarded: true }),
      setKeepSignedIn: (keep) => set({ keepSignedIn: keep }),
      signOut: async () => {
        await supabaseSignOut()
        set({ user: null })
      },
    }),
    {
      name: 'auth-store',
      version: 1,
      storage: createJSONStorage(() => LargeSecureStore),
      partialize: (state) => ({
        user: state.user,
        hasOnboarded: state.hasOnboarded,
        keepSignedIn: state.keepSignedIn,
      }),
      onRehydrateStorage: () => () => useAuthStore.setState({ hydrated: true }),
    },
  ),
)

// Keep the store in sync with Supabase. Call once from the root layout; returns unsubscribe.
export function startAuthListener(): () => void {
  const { setSession } = useAuthStore.getState()
  restoreSession().then(setSession)
  return onAuthStateChange(setSession)
}

async function restoreSession(): Promise<Session | null> {
  if (!useAuthStore.persist.hasHydrated()) {
    await new Promise<void>((resolve) => {
      const unsubscribe = useAuthStore.persist.onFinishHydration(() => {
        unsubscribe()
        resolve()
      })
    })
  }
  if (useAuthStore.getState().keepSignedIn) return getSession()
  await supabaseSignOut()
  return null
}

export const selectIsSignedIn = (state: AuthState) => state.user !== null
