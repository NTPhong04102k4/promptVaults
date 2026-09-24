import * as Linking from 'expo-linking'
import * as WebBrowser from 'expo-web-browser'
import type { Session } from '@supabase/supabase-js'

import { setOAuthInProgress } from './oauthState'
import { supabase } from './supabase'

export type SignUpInput = {
  email: string
  password: string
  firstName: string
  lastName: string
  username: string
}

export type SignInInput = {
  email: string
  password: string
}

export async function signUpWithEmail(input: SignUpInput): Promise<void> {
  const { error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: {
        username: input.username,
        first_name: input.firstName,
        last_name: input.lastName,
      },
    },
  })
  if (error) throw new Error(error.code ?? error.message)
}

export async function signInWithEmail(input: SignInInput): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({
    email: input.email,
    password: input.password,
  })
  if (error) throw new Error(error.code ?? error.message)
}

export async function getSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession()
  return data.session
}

export function onAuthStateChange(cb: (session: Session | null) => void): () => void {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => cb(session))
  return () => data.subscription.unsubscribe()
}

export async function signInWithGoogle(): Promise<void> {
  setOAuthInProgress(true)
  try {
    const redirectTo = Linking.createURL('onboarding/sync')

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, skipBrowserRedirect: true },
    })
    if (error) throw new Error(error.message)
    if (!data.url) throw new Error('missing_oauth_url')

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo)
    if (result.type !== 'success') return

    const params = new URLSearchParams(result.url.split('#')[1] ?? '')
    const accessToken = params.get('access_token')
    const refreshToken = params.get('refresh_token')
    if (!accessToken || !refreshToken) throw new Error('missing_tokens')

    const { error: sessionError } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    })
    if (sessionError) throw new Error(sessionError.message)
  } finally {
    setOAuthInProgress(false)
  }
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut()
}
