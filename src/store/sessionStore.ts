import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';

type SessionState = {
  session: Session | null;
  loading: boolean;
  setSession: (session: Session | null) => void;
};

export const useSessionStore = create<SessionState>((set) => ({
  session: null,
  loading: true,
  setSession: (session) => set({ session, loading: false }),
}));
