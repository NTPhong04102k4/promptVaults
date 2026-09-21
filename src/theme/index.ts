import { lightColors, darkColors, ColorTokens } from './colors';
import { typography, TypographyTokens } from './typography';
import { spacing, SpacingTokens } from './spacing';

export type Theme = {
  colors: ColorTokens;
  typography: TypographyTokens;
  spacing: SpacingTokens;
};

export const lightTheme: Theme = { colors: lightColors, typography, spacing };
export const darkTheme: Theme = { colors: darkColors, typography, spacing };

export type { ColorTokens } from './colors';
export type { TypographyRole, TypographyTokens } from './typography';
export type { SpacingTokens } from './spacing';
