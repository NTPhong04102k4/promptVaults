import { getDeviceInfo } from '@/lib/deviceIdentity'
import {
  clearTokensIfCurrent,
  getTokens,
  normalizeTokens,
  type RawTokens,
  replaceTokensIfCurrent,
} from '@/lib/tokenStore'

export class ApiError extends Error {
  status: number
  code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

export type RequestOptions = {
  // Unwrap AioKin's OperationResult envelope (default true). Pass false for the raw
  // endpoints: /auth/login, /auth/refresh-token, /auth/biometric/challenge.
  envelope?: boolean
  // Attach the bearer token and refresh it on 401 (Task 3).
  auth?: boolean
  headers?: Record<string, string>
  // Return a 401 as an ApiError as-is: no refresh attempt, no token clearing, no
  // "expired" event. Used by an explicit sign-out so a dead session doesn't trigger
  // the "session expired" alert (ruling P6).
  skipAuthRefresh?: boolean
}

type Envelope = {
  success: boolean
  errorCode?: string | null
  message?: string | null
  data?: unknown
}

const BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? ''

export function resolveUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path
  return `${BASE_URL}${path}`
}

function isEnvelope(value: unknown): value is Envelope {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { success?: unknown }).success === 'boolean'
  )
}

export async function rawFetch(
  method: string,
  path: string,
  body: unknown,
  headers: Record<string, string>,
): Promise<Response> {
  const finalHeaders: Record<string, string> = { ...headers }
  if (body !== undefined && !finalHeaders['Content-Type']) {
    finalHeaders['Content-Type'] = 'application/json'
  }
  try {
    return await fetch(resolveUrl(path), {
      method,
      headers: finalHeaders,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    })
  } catch {
    throw new ApiError(0, 'network', 'Không có kết nối mạng.')
  }
}

export async function toApiError(response: Response): Promise<ApiError> {
  let code = `http_${response.status}`
  let message = response.statusText
  try {
    const body = await response.json()
    if (body && typeof body.errorCode === 'string') code = body.errorCode
    if (body && typeof body.message === 'string') message = body.message
  } catch {
    // no JSON body — keep http_<status> / statusText
  }
  return new ApiError(response.status, code, message)
}

export async function parseBody<T>(response: Response, envelope: boolean): Promise<T> {
  if (response.status === 204) return undefined as T
  const text = await response.text()
  const body: unknown = text ? JSON.parse(text) : undefined
  if (envelope && isEnvelope(body)) {
    if (!body.success) {
      throw new ApiError(
        response.status,
        body.errorCode ?? 'operation_failed',
        body.message ?? 'Operation failed',
      )
    }
    return body.data as T
  }
  return body as T
}

const EXPIRY_SKEW_MS = 30_000

function sessionExpired(): ApiError {
  return new ApiError(401, 'session_expired', 'Phiên đăng nhập đã hết hạn.')
}

let refreshing: Promise<boolean> | null = null

// Single-flight: /auth/refresh-token rotates (revokes) the refresh token, so two
// concurrent refreshes would make the second one fail and sign the user out.
function refreshTokens(): Promise<boolean> {
  if (!refreshing) {
    refreshing = (async () => {
      const tokens = await getTokens()
      if (!tokens) return false
      const device = await getDeviceInfo()
      // rawFetch throws ApiError('network') when offline — tokens are kept in that case.
      const response = await rawFetch(
        'POST',
        '/auth/refresh-token',
        { refreshToken: tokens.refreshToken, ...device },
        {},
      )
      // This POST can settle long after a sign-out (it may belong to a sync signOut() gave up
      // waiting on), so both outcomes only touch the session it refreshed: never resurrect a
      // signed-out session, never overwrite or clear a newer one (Task 17 fix round 4).
      if (response.status === 400 || response.status === 401 || response.status === 422) {
        await clearTokensIfCurrent(tokens, 'expired')
        return false
      }
      if (!response.ok) throw await toApiError(response)
      const next = normalizeTokens(await parseBody<RawTokens>(response, false))
      return replaceTokensIfCurrent(tokens, next)
    })().finally(() => {
      refreshing = null
    })
  }
  return refreshing
}

async function currentAccessToken(skipAuthRefresh?: boolean): Promise<string> {
  const tokens = await getTokens()
  if (!tokens) throw new ApiError(401, 'not_signed_in', 'Bạn chưa đăng nhập.')
  // skipAuthRefresh: send whatever is stored, expired or not — an explicit sign-out
  // must not trigger a proactive refresh (ruling P6; a soon-to-expire access token
  // at logout time is the normal case, not a reason to rotate the refresh token).
  if (skipAuthRefresh) return tokens.accessToken
  if (Date.now() > tokens.expiresAt - EXPIRY_SKEW_MS) {
    if (!(await refreshTokens())) throw sessionExpired()
    const fresh = await getTokens()
    if (!fresh) throw sessionExpired()
    return fresh.accessToken
  }
  return tokens.accessToken
}

async function request<T>(
  method: string,
  path: string,
  body: unknown,
  options: RequestOptions = {},
): Promise<T> {
  const envelope = options.envelope ?? true
  const headers = options.headers ?? {}

  if (!options.auth) {
    const response = await rawFetch(method, path, body, headers)
    if (!response.ok) throw await toApiError(response)
    return parseBody<T>(response, envelope)
  }

  const send = (token: string) =>
    rawFetch(method, path, body, { ...headers, Authorization: `Bearer ${token}` })

  const sentToken = await currentAccessToken(options.skipAuthRefresh)
  let response = await send(sentToken)
  if (response.status === 401) {
    if (options.skipAuthRefresh) throw await toApiError(response)
    // A concurrent request may already have refreshed while this one was in flight —
    // then just retry with the new token instead of rotating the refresh token again.
    const stored = await getTokens()
    const alreadyRefreshed = stored !== null && stored.accessToken !== sentToken
    if (!alreadyRefreshed && !(await refreshTokens())) throw sessionExpired()
    const fresh = await getTokens()
    if (!fresh) throw sessionExpired()
    response = await send(fresh.accessToken)
    if (response.status === 401) {
      // Only the session this retry actually used — a newer one is not ours to clear.
      await clearTokensIfCurrent(fresh, 'expired')
      throw sessionExpired()
    }
  }
  if (!response.ok) throw await toApiError(response)
  return parseBody<T>(response, envelope)
}

export const apiClient = {
  get: <T>(path: string, options?: RequestOptions) => request<T>('GET', path, undefined, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('POST', path, body, options),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('PUT', path, body, options),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('PATCH', path, body, options),
  delete: <T>(path: string, options?: RequestOptions) =>
    request<T>('DELETE', path, undefined, options),
}
