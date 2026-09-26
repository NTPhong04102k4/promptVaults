import type { ColorValue } from 'react-native'
import { SymbolView } from 'expo-symbols'

// One name per icon, resolved to SF Symbols on iOS and Material Symbols on Android/web.
const ICONS = {
  home: { ios: 'house', android: 'home' },
  homeFilled: { ios: 'house.fill', android: 'home' },
  search: { ios: 'magnifyingglass', android: 'search' },
  favorite: { ios: 'heart', android: 'favorite' },
  favoriteFilled: { ios: 'heart.fill', android: 'favorite' },
  person: { ios: 'person', android: 'person' },
  personFilled: { ios: 'person.fill', android: 'person' },
  settings: { ios: 'gearshape', android: 'settings' },
  back: { ios: 'chevron.left', android: 'arrow_back_ios_new' },
  visibility: { ios: 'eye', android: 'visibility' },
  visibilityOff: { ios: 'eye.slash', android: 'visibility_off' },
  warning: { ios: 'exclamationmark.triangle.fill', android: 'warning' },
  check: { ios: 'checkmark', android: 'check' },
  close: { ios: 'xmark', android: 'close' },
  edit: { ios: 'pencil', android: 'edit' },
  delete: { ios: 'trash', android: 'delete' },
  copy: { ios: 'doc.on.doc', android: 'content_copy' },
  add: { ios: 'plus', android: 'add' },
  chevronRight: { ios: 'chevron.right', android: 'chevron_right' },
  lock: { ios: 'lock', android: 'lock' },
} as const

export type IconName = keyof typeof ICONS

type Props = {
  name: IconName
  size?: number
  color: ColorValue
}

export function Icon({ name, size = 24, color }: Props) {
  const { ios, android } = ICONS[name]
  return <SymbolView name={{ ios, android, web: android }} size={size} tintColor={color} />
}
