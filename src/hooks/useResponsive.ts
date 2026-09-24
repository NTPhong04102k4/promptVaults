import { useWindowDimensions } from 'react-native'

// Material 3 window size classes (dp).
export type WindowClass = 'compact' | 'medium' | 'expanded'

export const breakpoints = { medium: 600, expanded: 840 } as const

// Design baseline the Figma screens are drawn at.
const BASE_WIDTH = 390
const BASE_HEIGHT = 844

export function getWindowClass(width: number): WindowClass {
  if (width >= breakpoints.expanded) return 'expanded'
  if (width >= breakpoints.medium) return 'medium'
  return 'compact'
}

export function useResponsive() {
  const { width, height, fontScale } = useWindowDimensions()
  const shortSide = Math.min(width, height)
  const windowClass = getWindowClass(width)

  // Percent of window width / height.
  const wp = (percent: number) => (width * percent) / 100
  const hp = (percent: number) => (height * percent) / 100
  // Scale a baseline size by screen width (portrait-equivalent, so rotation doesn't blow it up).
  const scale = (size: number) => (shortSide / BASE_WIDTH) * size
  const verticalScale = (size: number) => (Math.max(width, height) / BASE_HEIGHT) * size
  // Softer scaling for fonts/paddings; factor 0 = no scaling, 1 = full scale().
  const moderateScale = (size: number, factor = 0.5) => size + (scale(size) - size) * factor
  // Pick a value per window class, falling back to the next smaller class.
  const select = <T>(values: { compact: T; medium?: T; expanded?: T }): T =>
    (windowClass === 'expanded' ? (values.expanded ?? values.medium) : undefined) ??
    (windowClass !== 'compact' ? values.medium : undefined) ??
    values.compact

  return {
    width,
    height,
    fontScale,
    windowClass,
    isCompact: windowClass === 'compact',
    isTablet: shortSide >= breakpoints.medium,
    isLandscape: width > height,
    wp,
    hp,
    scale,
    verticalScale,
    moderateScale,
    select,
  }
}
