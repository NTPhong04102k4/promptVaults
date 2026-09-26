import { GoogleSignin, isErrorWithCode, statusCodes } from '@react-native-google-signin/google-signin'

// Cung mot Web Client ID da cau hinh o backend (Authentication:Google:ClientId) — id_token
// SDK native tra ve phai co audience trung gia tri nay de server verify duoc (GoogleJsonWebSignature).
const GOOGLE_WEB_CLIENT_ID = '86525619019-b73k4qc2a18osvcoai35ilj6rimdc7hd.apps.googleusercontent.com'

let configured = false

function ensureConfigured() {
  if (configured) return
  GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID })
  configured = true
}

export type GoogleNativeSignInResult =
  | { ok: true; idToken: string }
  | { ok: false; cancelled: true }
  | { ok: false; cancelled: false; error: string }

export async function signInWithGoogleNative(): Promise<GoogleNativeSignInResult> {
  ensureConfigured()
  try {
    await GoogleSignin.hasPlayServices()
    const response = await GoogleSignin.signIn()
    if (response.type !== 'success' || !response.data.idToken) {
      return { ok: false, cancelled: true }
    }
    return { ok: true, idToken: response.data.idToken }
  } catch (e) {
    if (isErrorWithCode(e) && e.code === statusCodes.SIGN_IN_CANCELLED) {
      return { ok: false, cancelled: true }
    }
    return { ok: false, cancelled: false, error: e instanceof Error ? e.message : 'google_sign_in_failed' }
  }
}
