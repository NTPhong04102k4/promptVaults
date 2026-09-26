import { resolveScheme } from './resolveScheme';

describe('resolveScheme', () => {
  it('returns the explicit preference when set to light', () => {
    expect(resolveScheme('light', 'dark')).toBe('light');
  });

  it('returns the explicit preference when set to dark', () => {
    expect(resolveScheme('dark', 'light')).toBe('dark');
  });

  it('follows the system scheme when preference is system', () => {
    expect(resolveScheme('system', 'dark')).toBe('dark');
    expect(resolveScheme('system', 'light')).toBe('light');
  });

  it('defaults to light when preference is system and system scheme is unknown', () => {
    expect(resolveScheme('system', null)).toBe('light');
    expect(resolveScheme('system', undefined)).toBe('light');
  });
});
