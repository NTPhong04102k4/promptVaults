import { AccessToken, LoginManager } from 'react-native-fbsdk-next'

export type FacebookNativeSignInResult =
  | { ok: true; accessToken: string }
  | { ok: false; cancelled: true }
  | { ok: false; cancelled: false; error: string }

export async function signInWithFacebookNative(): Promise<FacebookNativeSignInResult> {
  try {
    const result = await LoginManager.logInWithPermissions(['public_profile', 'email'])
    if (result.isCancelled) return { ok: false, cancelled: true }

    const token = await AccessToken.getCurrentAccessToken()
    if (!token?.accessToken) return { ok: false, cancelled: false, error: 'facebook_no_access_token' }

    return { ok: true, accessToken: token.accessToken }
  } catch (e) {
    return { ok: false, cancelled: false, error: e instanceof Error ? e.message : 'facebook_sign_in_failed' }
  }
}
