import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { isBiometricAvailable, authenticateWithBiometric } from '@/lib/biometric';
import { isAppLockEnabled, setAppLockEnabled } from '@/lib/appLock';
import { useTheme } from '@/theme/ThemeProvider';
import { ThemedView, ThemedText } from '@/components/Themed';
import type { ThemePreference } from '@/theme/resolveScheme';

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'light', label: 'Sáng' },
  { value: 'dark', label: 'Tối' },
  { value: 'system', label: 'Hệ thống' },
];

export default function SettingsScreen() {
  const [available, setAvailable] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const { theme, preference, setPreference } = useTheme();

  useEffect(() => {
    isBiometricAvailable().then(setAvailable);
    isAppLockEnabled().then(setEnabled);
  }, []);

  async function handleToggle(next: boolean) {
    if (next) {
      const confirmed = await authenticateWithBiometric();
      if (!confirmed) return;
    }
    await setAppLockEnabled(next);
    setEnabled(next);
  }

  return (
    <ThemedView style={styles.container}>
      <ThemedText variant="h3" style={styles.sectionTitle}>
        Giao diện
      </ThemedText>
      <View style={styles.themeRow}>
        {THEME_OPTIONS.map((option) => {
          const selected = option.value === preference;
          return (
            <Pressable
              key={option.value}
              onPress={() => setPreference(option.value)}
              style={[
                styles.themeOption,
                {
                  borderColor: selected ? theme.colors.primary : theme.colors.border,
                  backgroundColor: selected ? theme.colors.primaryMuted : 'transparent',
                  borderRadius: theme.spacing.radius.md,
                },
              ]}
            >
              <ThemedText color={selected ? 'primary' : undefined}>{option.label}</ThemedText>
            </Pressable>
          );
        })}
      </View>

      {(available || enabled) && (
        <View style={styles.row}>
          <ThemedText>Khoá bằng vân tay/Face ID</ThemedText>
          <Switch value={enabled} onValueChange={handleToggle} />
        </View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 24 },
  sectionTitle: { marginBottom: 4 },
  themeRow: { flexDirection: 'row', gap: 8 },
  themeOption: { borderWidth: 1, paddingVertical: 8, paddingHorizontal: 14 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
