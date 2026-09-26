import type { ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'

import { Icon } from '@/components/Icon'
import { makeStyles, useTheme } from '@/theme'

function DataTableBase({ children }: { children: ReactNode }) {
  return <View>{children}</View>
}

function Header({ children }: { children: ReactNode }) {
  const styles = useStyles()
  return <View style={styles.header}>{children}</View>
}

type HeaderTitleProps = { children: string; numeric?: boolean }

function HeaderTitle({ children, numeric }: HeaderTitleProps) {
  const styles = useStyles()
  return (
    <Text style={[styles.headerTitle, numeric && styles.numericText]} numberOfLines={1}>
      {children}
    </Text>
  )
}

function Row({ children, onPress }: { children: ReactNode; onPress?: () => void }) {
  const styles = useStyles()
  if (onPress) {
    return (
      <Pressable accessibilityRole="button" onPress={onPress} style={styles.row}>
        {children}
      </Pressable>
    )
  }
  return <View style={styles.row}>{children}</View>
}

type CellProps = { children: ReactNode; numeric?: boolean }

function Cell({ children, numeric }: CellProps) {
  const styles = useStyles()
  return (
    <View style={[styles.cell, numeric && styles.numeric]}>
      {typeof children === 'string' || typeof children === 'number' ? (
        <Text style={styles.cellText} numberOfLines={1}>
          {children}
        </Text>
      ) : (
        children
      )}
    </View>
  )
}

type PaginationProps = {
  page: number
  numberOfPages: number
  onPageChange: (page: number) => void
  label?: ReactNode
}

function Pagination({ page, numberOfPages, onPageChange, label }: PaginationProps) {
  const styles = useStyles()
  const { colors } = useTheme()
  const atStart = page <= 0
  const atEnd = page >= numberOfPages - 1

  return (
    <View style={styles.pagination}>
      {label !== undefined && <Text style={styles.paginationLabel}>{label}</Text>}
      <Pressable accessibilityLabel="Trang trước" disabled={atStart} onPress={() => onPageChange(page - 1)} hitSlop={8}>
        <Icon name="back" size={20} color={atStart ? colors.outlineVariant : colors.onSurfaceVariant} />
      </Pressable>
      <Pressable accessibilityLabel="Trang sau" disabled={atEnd} onPress={() => onPageChange(page + 1)} hitSlop={8}>
        <Icon name="chevronRight" size={20} color={atEnd ? colors.outlineVariant : colors.onSurfaceVariant} />
      </Pressable>
    </View>
  )
}

export const DataTable = Object.assign(DataTableBase, { Header, Title: HeaderTitle, Row, Cell, Pagination })

const useStyles = makeStyles(({ colors, typography, spacing }) => ({
  header: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderColor: colors.outlineVariant, paddingVertical: spacing.sm },
  headerTitle: { flex: 1, ...typography.labelLarge, color: colors.onSurfaceVariant },
  numericText: { textAlign: 'right' },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 48, borderBottomWidth: 1, borderColor: colors.outlineVariant },
  cell: { flex: 1, paddingHorizontal: spacing.sm },
  numeric: { alignItems: 'flex-end' },
  cellText: { ...typography.bodyMedium, color: colors.onSurface },
  pagination: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: spacing.md, paddingVertical: spacing.sm },
  paginationLabel: { ...typography.bodySmall, color: colors.onSurfaceVariant },
}))
