import { getWindowClass } from './useResponsive'

describe('getWindowClass', () => {
  it('follows the M3 window size class breakpoints', () => {
    expect(getWindowClass(390)).toBe('compact')
    expect(getWindowClass(599)).toBe('compact')
    expect(getWindowClass(600)).toBe('medium')
    expect(getWindowClass(839)).toBe('medium')
    expect(getWindowClass(840)).toBe('expanded')
  })
})
