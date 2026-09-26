import { normalizeTokens, setTokens } from './tokenStore'

// Hướng B: AioKin's /auth/finalize/{provider} only does window.opener.postMessage(payload)
// then window.close() (built for a web popup — see AuthController.BuildOAuthPopupHtml). A
// mobile WebView has no window.opener, so OAUTH_OPENER_SHIM below fakes one that forwards the
// payload to RN via ReactNativeWebView.postMessage, which arrives here as a JSON string.
export type OAuthProvider = 'google' | 'facebook'

type OAuthPopupSuccess = {
  type: string
  accessToken: string
  refreshToken: string
  expiresIn: number
  tokenType: string
}
type OAuthPopupError = { type: string; error: string }
type OAuthPopupPayload = OAuthPopupSuccess | OAuthPopupError

function isSuccess(payload: OAuthPopupPayload): payload is OAuthPopupSuccess {
  return typeof payload.type === 'string' && payload.type.endsWith('_SUCCESS')
}

export type OAuthMessageResult = { ok: true } | { ok: false; error: string }

export async function handleOAuthPopupMessage(raw: string): Promise<OAuthMessageResult> {
  let payload: OAuthPopupPayload
  try {
    payload = JSON.parse(raw)
  } catch {
    return { ok: false, error: 'invalid_message' }
  }
  if (!isSuccess(payload)) return { ok: false, error: (payload as OAuthPopupError).error ?? 'oauth_failed' }

  await setTokens(normalizeTokens(payload))
  return { ok: true }
}

// Injected before every navigation (react-native-webview re-runs this on each page load), so
// it survives the redirect chain out to the provider and back to our own finalize page.
export const OAUTH_OPENER_SHIM = `
(function () {
  window.opener = {
    postMessage: function (data) {
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(data));
    }
  };
  true;
})();
`

// Google (and increasingly other providers) reject sign-in from a browser whose user agent
// looks like an embedded WebView ("disallowed_useragent" / "This browser may not be secure").
// A normal mobile-Chrome UA string avoids that check; there is no officially supported
// alternative short of a native SDK or a server-side redirect the app can't control.
export const OAUTH_WEBVIEW_USER_AGENT =
  'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36'
