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
