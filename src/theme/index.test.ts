import { lightTheme, darkTheme } from './index';

describe('theme tokens', () => {
  it('light and dark palettes expose the same color keys', () => {
    expect(Object.keys(lightTheme.colors).sort()).toEqual(Object.keys(darkTheme.colors).sort());
  });

  it('defines the expected color keys', () => {
    const expected = [
      'background',
      'surface',
      'primary',
      'primaryMuted',
      'text',
      'textSecondary',
      'border',
      'success',
      'error',
      'warning',
    ].sort();
    expect(Object.keys(lightTheme.colors).sort()).toEqual(expected);
  });

  it('defines the expected typography roles', () => {
    const expected = ['h1', 'h2', 'h3', 'body', 'bodyMedium', 'caption', 'label'].sort();
    expect(Object.keys(lightTheme.typography).sort()).toEqual(expected);
  });

  it('keeps the brand primary color consistent with app.json', () => {
    expect(lightTheme.colors.primary).toBe('#208AEF');
    expect(lightTheme.colors.primaryMuted).toBe('#E6F4FE');
  });

  it('shares one typography and spacing scale between light and dark', () => {
    expect(lightTheme.typography).toBe(darkTheme.typography);
    expect(lightTheme.spacing).toBe(darkTheme.spacing);
  });
});
