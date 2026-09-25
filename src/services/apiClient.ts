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
}

type Envelope = {
  success: boolean
  errorCode?: string | null
  message?: string | null
  data?: unknown
}

const BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? ''

function resolveUrl(path: string): string {
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

async function request<T>(
  method: string,
  path: string,
  body: unknown,
  options: RequestOptions = {},
): Promise<T> {
  const response = await rawFetch(method, path, body, options.headers ?? {})
  if (!response.ok) throw await toApiError(response)
  return parseBody<T>(response, options.envelope ?? true)
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
