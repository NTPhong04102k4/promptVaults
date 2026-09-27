import { useRef } from 'react'
import { ActivityIndicator, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { WebView, type WebViewMessageEvent } from 'react-native-webview'

import { IconButton } from '@/components/ui'
import {
  handleOAuthPopupMessage,
  OAUTH_OPENER_SHIM,
  OAUTH_WEBVIEW_USER_AGENT,
  type OAuthProvider,
} from '@/lib/oauthWebLogin'
import { goBack, replace, useRouteParams } from '@/navigation'
import { resolveUrl } from '@/services/apiClient'
import { useAuthStore } from '@/store'
import { makeStyles, text } from '@/theme'

const PROVIDER_TITLE: Record<OAuthProvider, string> = {
  google: 'Đăng nhập với Google',
  facebook: 'Đăng nhập với Facebook',
}

export default function OAuthWebViewScreen() {
  const styles = useStyles()
  const { provider } = useRouteParams('oauthWebview')
  // The finalize page can fire its postMessage more than once (react-native-webview re-runs
  // the injected shim on every navigation); only the first result should ever be acted on.
  const settled = useRef(false)

  // ReactNativeWebView.postMessage is injected into every frame this WebView ever loads —
  // including the provider's own pages mid-redirect, not just our finalize page — so a message
  // is only trustworthy when it actually came from finalize. There's no origin on
  // WebViewMessageEvent, so nativeEvent.url (the page that called postMessage) is the closest
  // proxy available.
  const finalizeUrlPrefix = resolveUrl(`/auth/finalize/${provider}`)

  async function handleMessage(event: WebViewMessageEvent) {
    if (settled.current) return
    if (!event.nativeEvent.url.startsWith(finalizeUrlPrefix)) return
    const result = await handleOAuthPopupMessage(event.nativeEvent.data)
    if (settled.current) return
    settled.current = true

    if (result.ok) {
      await useAuthStore.getState().refreshUser()
      replace('sync')
    } else {
      goBack('welcome')
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <IconButton name="close" accessibilityLabel="Đóng" onPress={() => goBack('welcome')} />
        <Text style={styles.title}>{PROVIDER_TITLE[provider]}</Text>
        <View style={styles.spacer} />
      </View>

      <WebView
        source={{ uri: resolveUrl(`/auth/login/${provider}`) }}
        injectedJavaScriptBeforeContentLoaded={OAUTH_OPENER_SHIM}
        onMessage={handleMessage}
        userAgent={OAUTH_WEBVIEW_USER_AGENT}
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loading}>
            <ActivityIndicator />
          </View>
        )}
        style={styles.webview}
      />
    </SafeAreaView>
  )
}

const useStyles = makeStyles(({ colors, spacing }) => ({
  safe: { flex: 1, backgroundColor: colors.surface },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
  },
  title: { ...text('titleMedium', 'medium'), color: colors.onSurface },
  spacer: { width: 40 },
  webview: { flex: 1 },
  loading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
}))
