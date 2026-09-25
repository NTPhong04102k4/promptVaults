import { apiClient } from '@/services/apiClient'

import { formatRelativeTime } from './format'

// token-session-management plan Task 3: SessionResponse ({ id, deviceName, platform, issuedAt, isCurrent }).
export type DeviceSession = {
  id: string
  deviceName: string | null
  platform: string | null
  issuedAt: number // unix seconds
  isCurrent: boolean
}

const PLATFORM_LABELS: Record<string, string> = { android: 'Android', ios: 'iOS', web: 'Web' }

// Known gap (B-SES): only sessions with a currently-live access token (<=60 min) show up
// here — an idle device won't appear in the list until it's used again.
export async function listSessions(): Promise<DeviceSession[]> {
  const sessions = await apiClient.get<DeviceSession[]>('/account/sessions', { auth: true })
  return [...sessions].sort(
    (a, b) => Number(b.isCurrent) - Number(a.isCurrent) || b.issuedAt - a.issuedAt,
  )
}

export async function revokeSession(id: string): Promise<void> {
  await apiClient.delete(`/account/sessions/${encodeURIComponent(id)}`, { auth: true })
}

export function describeSession(
  session: DeviceSession,
  now: number = Date.now(),
): { title: string; subtitle: string } {
  const platform = (session.platform && PLATFORM_LABELS[session.platform.toLowerCase()]) || 'Không rõ'
  const elapsedMs = now - session.issuedAt * 1000
  return {
    title: session.deviceName || 'Thiết bị không rõ',
    subtitle: `${platform} · Đăng nhập ${formatRelativeTime(Date.now() - elapsedMs)}`,
  }
}
