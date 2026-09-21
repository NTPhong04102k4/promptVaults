import { View, Text, ViewProps, TextProps } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import type { TypographyTokens } from '@/theme';

type ThemedViewProps = ViewProps & { variant?: 'background' | 'surface' };

export function ThemedView({ variant = 'background', style, ...rest }: ThemedViewProps) {
  const { theme } = useTheme();
  const backgroundColor = variant === 'surface' ? theme.colors.surface : theme.colors.background;
  return <View style={[{ backgroundColor }, style]} {...rest} />;
}

type ThemedTextProps = TextProps & {
  variant?: keyof TypographyTokens;
  color?: 'primary' | 'secondary' | 'error';
};

export function ThemedText({ variant = 'body', color, style, ...rest }: ThemedTextProps) {
  const { theme } = useTheme();
  const role = theme.typography[variant];
  const textColor =
    color === 'primary'
      ? theme.colors.primary
      : color === 'secondary'
        ? theme.colors.textSecondary
        : color === 'error'
          ? theme.colors.error
          : theme.colors.text;

  return (
    <Text
      style={[
        { fontSize: role.fontSize, fontWeight: role.fontWeight, lineHeight: role.lineHeight, color: textColor },
        style,
      ]}
      {...rest}
    />
  );
}
