jest.mock('./supabase', () => ({
  supabase: {
    auth: {
      signUp: jest.fn(),
      signInWithPassword: jest.fn(),
      getSession: jest.fn(),
      onAuthStateChange: jest.fn(),
    },
    from: jest.fn(),
  },
}));

jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: jest.fn(),
}));
jest.mock('expo-linking', () => ({
  createURL: jest.fn(() => 'promptvaults://onboarding/sync'),
}));

import * as WebBrowser from 'expo-web-browser';
import { supabase } from './supabase';
import { signUpWithEmail, signInWithEmail, signInWithGoogle } from './auth';

describe('signUpWithEmail', () => {
  it('signs up then inserts a profile row for the new user', async () => {
    (supabase.auth.signUp as jest.Mock).mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });
    const insert = jest.fn().mockResolvedValue({ error: null });
    (supabase.from as jest.Mock).mockReturnValue({ insert });

    await signUpWithEmail({
      email: 'a@b.com',
      password: 'secret123',
      firstName: 'An',
      lastName: 'Nguyen',
      username: 'annguyen',
    });

    expect(supabase.auth.signUp).toHaveBeenCalledWith({
      email: 'a@b.com',
      password: 'secret123',
    });
    expect(supabase.from).toHaveBeenCalledWith('profiles');
    expect(insert).toHaveBeenCalledWith({
      id: 'user-1',
      username: 'annguyen',
      first_name: 'An',
      last_name: 'Nguyen',
    });
  });

  it('throws when sign up fails', async () => {
    (supabase.auth.signUp as jest.Mock).mockResolvedValue({
      data: { user: null },
      error: { message: 'user_already_exists' },
    });

    await expect(
      signUpWithEmail({
        email: 'a@b.com',
        password: 'secret123',
        firstName: 'An',
        lastName: 'Nguyen',
        username: 'annguyen',
      })
    ).rejects.toThrow('user_already_exists');
  });
});

describe('signInWithEmail', () => {
  it('calls supabase signInWithPassword', async () => {
    (supabase.auth.signInWithPassword as jest.Mock).mockResolvedValue({ error: null });

    await signInWithEmail({ email: 'a@b.com', password: 'secret123' });

    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'a@b.com',
      password: 'secret123',
    });
  });

  it('throws on invalid credentials', async () => {
    (supabase.auth.signInWithPassword as jest.Mock).mockResolvedValue({
      error: { message: 'invalid_credentials' },
    });

    await expect(signInWithEmail({ email: 'a@b.com', password: 'wrong' })).rejects.toThrow(
      'invalid_credentials'
    );
  });
});

describe('signInWithGoogle', () => {
  it('opens the OAuth URL from supabase and sets the session on success', async () => {
    (supabase.auth.signInWithOAuth as jest.Mock) = jest.fn().mockResolvedValue({
      data: { url: 'https://supabase.example/oauth/google' },
      error: null,
    });
    (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({
      type: 'success',
      url: 'promptvaults://onboarding/sync#access_token=abc&refresh_token=def',
    });
    (supabase.auth as any).setSession = jest.fn().mockResolvedValue({ error: null });

    await signInWithGoogle();

    expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: 'promptvaults://onboarding/sync', skipBrowserRedirect: true },
    });
    expect(WebBrowser.openAuthSessionAsync).toHaveBeenCalledWith(
      'https://supabase.example/oauth/google',
      'promptvaults://onboarding/sync'
    );
    expect(supabase.auth.setSession).toHaveBeenCalledWith({
      access_token: 'abc',
      refresh_token: 'def',
    });
  });

  it('does nothing when the user cancels', async () => {
    (supabase.auth.signInWithOAuth as jest.Mock) = jest.fn().mockResolvedValue({
      data: { url: 'https://supabase.example/oauth/google' },
      error: null,
    });
    (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({ type: 'cancel' });
    (supabase.auth as any).setSession = jest.fn();

    await signInWithGoogle();

    expect(supabase.auth.setSession).not.toHaveBeenCalled();
  });
});
