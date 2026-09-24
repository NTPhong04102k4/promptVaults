jest.mock('./supabase', () => ({
  supabase: {
    auth: {
      signUp: jest.fn(),
      signInWithPassword: jest.fn(),
      verifyOtp: jest.fn(),
      resend: jest.fn(),
      resetPasswordForEmail: jest.fn(),
      getSession: jest.fn(),
      onAuthStateChange: jest.fn(),
    },
    from: jest.fn(),
  },
}))

jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: jest.fn(),
}))
jest.mock('expo-linking', () => ({
  createURL: jest.fn(() => 'promptvaults://onboarding/sync'),
}))

import * as WebBrowser from 'expo-web-browser'

import {
  resendSignupCode,
  sendPasswordReset,
  signInWithEmail,
  signInWithGoogle,
  signOut,
  signUpWithEmail,
  verifySignupCode,
} from './auth'
import { supabase } from './supabase'

describe('signUpWithEmail', () => {
  it('signs up with profile fields passed as user metadata', async () => {
    ;(supabase.auth.signUp as jest.Mock).mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    })

    await signUpWithEmail({
      email: 'a@b.com',
      password: 'secret123',
      firstName: 'An',
      lastName: 'Nguyen',
      username: 'annguyen',
    })

    expect(supabase.auth.signUp).toHaveBeenCalledWith({
      email: 'a@b.com',
      password: 'secret123',
      options: {
        data: {
          username: 'annguyen',
          first_name: 'An',
          last_name: 'Nguyen',
        },
      },
    })
  })

  it('reports that email verification is needed when no session is returned', async () => {
    ;(supabase.auth.signUp as jest.Mock).mockResolvedValue({
      data: { user: { id: 'user-1' }, session: null },
      error: null,
    })

    const result = await signUpWithEmail({
      email: 'a@b.com',
      password: 'secret123',
      firstName: 'An',
      lastName: 'Nguyen',
      username: 'annguyen',
    })

    expect(result).toEqual({ needsVerification: true })
  })

  it('reports no verification needed when a session is returned', async () => {
    ;(supabase.auth.signUp as jest.Mock).mockResolvedValue({
      data: { user: { id: 'user-1' }, session: { access_token: 'x' } },
      error: null,
    })

    const result = await signUpWithEmail({
      email: 'a@b.com',
      password: 'secret123',
      firstName: 'An',
      lastName: 'Nguyen',
      username: 'annguyen',
    })

    expect(result).toEqual({ needsVerification: false })
  })

  it('throws when sign up fails', async () => {
    ;(supabase.auth.signUp as jest.Mock).mockResolvedValue({
      data: { user: null },
      error: { code: 'user_already_exists', message: 'User already registered' },
    })

    await expect(
      signUpWithEmail({
        email: 'a@b.com',
        password: 'secret123',
        firstName: 'An',
        lastName: 'Nguyen',
        username: 'annguyen',
      }),
    ).rejects.toThrow('user_already_exists')
  })
})

describe('signInWithEmail', () => {
  it('calls supabase signInWithPassword', async () => {
    ;(supabase.auth.signInWithPassword as jest.Mock).mockResolvedValue({ error: null })

    await signInWithEmail({ email: 'a@b.com', password: 'secret123' })

    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'a@b.com',
      password: 'secret123',
    })
  })

  it('throws on invalid credentials', async () => {
    ;(supabase.auth.signInWithPassword as jest.Mock).mockResolvedValue({
      error: { code: 'invalid_credentials', message: 'Invalid login credentials' },
    })

    await expect(signInWithEmail({ email: 'a@b.com', password: 'wrong' })).rejects.toThrow(
      'invalid_credentials',
    )
  })
})

describe('signInWithGoogle', () => {
  it('opens the OAuth URL from supabase and sets the session on success', async () => {
    ;(supabase.auth.signInWithOAuth as jest.Mock) = jest.fn().mockResolvedValue({
      data: { url: 'https://supabase.example/oauth/google' },
      error: null,
    })
    ;(WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({
      type: 'success',
      url: 'promptvaults://onboarding/sync#access_token=abc&refresh_token=def',
    })
    supabase.auth.setSession = jest.fn().mockResolvedValue({ error: null })

    await signInWithGoogle()

    expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: 'promptvaults://onboarding/sync', skipBrowserRedirect: true },
    })
    expect(WebBrowser.openAuthSessionAsync).toHaveBeenCalledWith(
      'https://supabase.example/oauth/google',
      'promptvaults://onboarding/sync',
    )
    expect(supabase.auth.setSession).toHaveBeenCalledWith({
      access_token: 'abc',
      refresh_token: 'def',
    })
  })

  it('does nothing when the user cancels', async () => {
    ;(supabase.auth.signInWithOAuth as jest.Mock) = jest.fn().mockResolvedValue({
      data: { url: 'https://supabase.example/oauth/google' },
      error: null,
    })
    ;(WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({ type: 'cancel' })
    supabase.auth.setSession = jest.fn()

    await signInWithGoogle()

    expect(supabase.auth.setSession).not.toHaveBeenCalled()
  })
})

describe('signOut', () => {
  it('calls supabase auth signOut', async () => {
    ;(supabase.auth.signOut as jest.Mock) = jest.fn().mockResolvedValue({ error: null })

    await signOut()

    expect(supabase.auth.signOut).toHaveBeenCalled()
  })
})

describe('verifySignupCode', () => {
  it('verifies the 6-digit signup code for the email', async () => {
    ;(supabase.auth.verifyOtp as jest.Mock).mockResolvedValue({ error: null })

    await verifySignupCode('a@b.com', '123456')

    expect(supabase.auth.verifyOtp).toHaveBeenCalledWith({
      email: 'a@b.com',
      token: '123456',
      type: 'signup',
    })
  })

  it('throws the error code when the code is wrong or expired', async () => {
    ;(supabase.auth.verifyOtp as jest.Mock).mockResolvedValue({
      error: { code: 'otp_expired', message: 'Token has expired or is invalid' },
    })

    await expect(verifySignupCode('a@b.com', '000000')).rejects.toThrow('otp_expired')
  })
})

describe('resendSignupCode', () => {
  it('asks supabase to resend the signup email', async () => {
    ;(supabase.auth.resend as jest.Mock).mockResolvedValue({ error: null })

    await resendSignupCode('a@b.com')

    expect(supabase.auth.resend).toHaveBeenCalledWith({ type: 'signup', email: 'a@b.com' })
  })
})

describe('sendPasswordReset', () => {
  it('sends a reset link that deep-links back into the app', async () => {
    ;(supabase.auth.resetPasswordForEmail as jest.Mock).mockResolvedValue({ error: null })

    await sendPasswordReset('a@b.com')

    expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith('a@b.com', {
      redirectTo: 'promptvaults://onboarding/sync',
    })
  })

  it('throws when supabase rejects the request', async () => {
    ;(supabase.auth.resetPasswordForEmail as jest.Mock).mockResolvedValue({
      error: { code: 'over_email_send_rate_limit', message: 'rate limited' },
    })

    await expect(sendPasswordReset('a@b.com')).rejects.toThrow('over_email_send_rate_limit')
  })
})
