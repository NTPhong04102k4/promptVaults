// Metro bundles these as static assets (see metro assetExts); expo-image renders them.
declare module '*.svg' {
  const source: number
  export default source
}

declare module '*.png' {
  const source: number
  export default source
}
