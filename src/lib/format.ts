import type { AuthUser } from '@/store'

// "An Nguyễn" -> "AN"; falls back to the email's first letter, then "?".
export function getInitials(user: AuthUser | null): string {
  if (!user) return '?'
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim()
  if (name) {
    return name
      .split(/\s+/)
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase()
  }
  return user.email ? user.email[0]!.toUpperCase() : '?'
}

// "An Nguyễn" stays as-is; a signed-out user reads as a generic display name.
export function getDisplayName(user: AuthUser | null): string {
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim()
  return name || user?.email || 'Khách'
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

// Coarse Vietnamese "time ago" for prompt metadata — matches the Figma copy style.
export function formatRelativeTime(timestampMs: number): string {
  const diff = Date.now() - timestampMs
  if (diff < MINUTE) return 'Vừa xong'
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} phút trước`
  if (diff < DAY) return `${Math.floor(diff / HOUR)} giờ trước`
  return `${Math.floor(diff / DAY)} ngày trước`
}
