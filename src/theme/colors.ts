export type ColorTokens = {
  background: string;
  surface: string;
  primary: string;
  primaryMuted: string;
  text: string;
  textSecondary: string;
  border: string;
  success: string;
  error: string;
  warning: string;
};

export const lightColors: ColorTokens = {
  background: '#FFFFFF',
  surface: '#F7FAFC',
  primary: '#208AEF',
  primaryMuted: '#E6F4FE',
  text: '#0B1220',
  textSecondary: '#5B6B7A',
  border: '#E2E8F0',
  success: '#16A34A',
  error: '#DC2626',
  warning: '#F59E0B',
};

export const darkColors: ColorTokens = {
  background: '#0B0F14',
  surface: '#151B23',
  primary: '#4FA6F3',
  primaryMuted: '#16324A',
  text: '#F1F5F9',
  textSecondary: '#94A3B8',
  border: '#263140',
  success: '#22C55E',
  error: '#F87171',
  warning: '#FBBF24',
};
