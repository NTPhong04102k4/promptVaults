import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

export type SignUpInput = {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  username: string;
};

export type SignInInput = {
  email: string;
  password: string;
};

export async function signUpWithEmail(input: SignUpInput): Promise<void> {
  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
  });
  if (error) throw new Error(error.message);
  if (!data.user) throw new Error('sign_up_failed');

  const { error: profileError } = await supabase.from('profiles').insert({
    id: data.user.id,
    username: input.username,
    first_name: input.firstName,
    last_name: input.lastName,
  });
  if (profileError) throw new Error(profileError.message);
}

export async function signInWithEmail(input: SignInInput): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({
    email: input.email,
    password: input.password,
  });
  if (error) throw new Error(error.message);
}

export async function getSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export function onAuthStateChange(cb: (session: Session | null) => void): () => void {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => cb(session));
  return () => data.subscription.unsubscribe();
}
