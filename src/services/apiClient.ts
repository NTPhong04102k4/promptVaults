export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

const BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? '';

function resolveUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${BASE_URL}${path}`;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
  if (init.body !== undefined && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(resolveUrl(path), { ...init, headers });

  if (!response.ok) {
    let message = response.statusText;
    try {
      const body = await response.json();
      if (body && typeof body.message === 'string') message = body.message;
    } catch {
      // response had no JSON body — keep statusText
    }
    throw new ApiError(response.status, message);
  }

  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

function withBody(body: unknown): { body: string } | Record<string, never> {
  return body !== undefined ? { body: JSON.stringify(body) } : {}
}

export const apiClient = {
  get: <T>(path: string, init?: RequestInit) => request<T>(path, { ...init, method: 'GET' }),
  post: <T>(path: string, body?: unknown, init?: RequestInit) =>
    request<T>(path, { ...init, ...withBody(body), method: 'POST' }),
  put: <T>(path: string, body?: unknown, init?: RequestInit) =>
    request<T>(path, { ...init, ...withBody(body), method: 'PUT' }),
  delete: <T>(path: string, init?: RequestInit) => request<T>(path, { ...init, method: 'DELETE' }),
}
