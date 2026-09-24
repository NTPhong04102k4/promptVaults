import { darkColors, darkTheme, lightColors, lightTheme, seedColor } from './index'

describe('theme tokens', () => {
  it('light and dark palettes expose the same color keys', () => {
    expect(Object.keys(lightTheme.colors).sort()).toEqual(Object.keys(darkTheme.colors).sort())
  })

  it('shares one typography, spacing, and shape scale between light and dark', () => {
    expect(lightTheme.typography).toBe(darkTheme.typography)
    expect(lightTheme.spacing).toBe(darkTheme.spacing)
    expect(lightTheme.shape).toBe(darkTheme.shape)
  })

  it('keeps the M3 seed color consistent with the palette source', () => {
    expect(lightTheme.colors.primary).toBe(seedColor)
    expect(lightTheme.colors).toBe(lightColors)
    expect(darkTheme.colors).toBe(darkColors)
  })

  it('flags light as not dark and dark as dark', () => {
    expect(lightTheme.dark).toBe(false)
    expect(darkTheme.dark).toBe(true)
  })
})
