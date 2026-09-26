export type TypographyRole = {
  fontSize: number;
  fontWeight: '400' | '600' | '700';
  lineHeight: number;
};

export type TypographyTokens = {
  h1: TypographyRole;
  h2: TypographyRole;
  h3: TypographyRole;
  body: TypographyRole;
  bodyMedium: TypographyRole;
  caption: TypographyRole;
  label: TypographyRole;
};

export const typography: TypographyTokens = {
  h1: { fontSize: 28, fontWeight: '700', lineHeight: 34 },
  h2: { fontSize: 22, fontWeight: '600', lineHeight: 28 },
  h3: { fontSize: 18, fontWeight: '600', lineHeight: 24 },
  body: { fontSize: 16, fontWeight: '400', lineHeight: 22 },
  bodyMedium: { fontSize: 16, fontWeight: '600', lineHeight: 22 },
  caption: { fontSize: 13, fontWeight: '400', lineHeight: 18 },
  label: { fontSize: 13, fontWeight: '600', lineHeight: 18 },
};
