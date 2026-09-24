export type ThemePreference = 'light' | 'dark' | 'system'

export function resolveScheme(
  preference: ThemePreference,
  systemScheme: 'light' | 'dark' | null | undefined,
): 'light' | 'dark' {
  if (preference === 'system') {
    return systemScheme === 'dark' ? 'dark' : 'light'
  }
  return preference
}
