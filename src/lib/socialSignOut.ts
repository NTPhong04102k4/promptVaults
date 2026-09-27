import { GoogleSignin } from '@react-native-google-signin/google-signin'
import { LoginManager } from 'react-native-fbsdk-next'

// authStore.signOut() only clears AioKin's own tokens — the Google/Facebook SDKs cache their
// own device-level session independently. Without this, signInWithGoogleNative()/
// signInWithFacebookNative() on the next login silently reuse the previous account (no picker),
// which breaks manual account switching and the parallel WebView/native testing in login.tsx.
// Best-effort like revokeSession(): the app's own session is already gone by the time this
// runs, so a native SDK failure (never configured, offline, provider outage) must never block
// or fail sign-out over it.
export async function signOutSocialProviders(): Promise<void> {
  try {
    await GoogleSignin.signOut()
  } catch {
    // best-effort — see above
  }
  try {
    LoginManager.logOut()
  } catch {
    // best-effort — see above
  }
}
