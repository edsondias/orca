import { useEffect, useState } from 'react'
import { StyleSheet, Switch, Text, View } from 'react-native'
import { colors, radii, spacing, typography } from '../theme/mobile-theme'
import { carSessionStore } from '../car/car-session-store'
import { loadCarModeEnabled, saveCarModeEnabled } from '../storage/preferences'
import { MobileSettingsFrame } from './mobile-settings-menu'

export default function CarSettingsScreen({ onBack }: { onBack?: () => void }) {
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    let cancelled = false
    void loadCarModeEnabled().then((value) => {
      if (!cancelled) {
        setEnabled(value)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  const onChange = (value: boolean) => {
    setEnabled(value)
    // The store flips only after the preference is stored, so a failed write never leaves the session active.
    void saveCarModeEnabled(value)
      .then(() => carSessionStore.setCarModeEnabled(value))
      .catch(() => setEnabled(!value))
  }

  return (
    <MobileSettingsFrame onBack={onBack}>
      <View style={styles.section}>
        <View style={styles.row}>
          <View style={styles.rowContent}>
            <Text style={styles.rowLabel}>Car mode</Text>
            <Text style={styles.rowSublabel}>
              Keep Orca connected for Android Auto while the app is closed
            </Text>
          </View>
          <Switch
            accessibilityLabel="Car mode"
            value={enabled}
            onValueChange={onChange}
            trackColor={{ false: colors.bgRaised, true: colors.textSecondary }}
            thumbColor={colors.textPrimary}
          />
        </View>
      </View>
    </MobileSettingsFrame>
  )
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: colors.bgPanel,
    borderRadius: radii.card,
    overflow: 'hidden'
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md + 2
  },
  rowContent: {
    flex: 1
  },
  rowLabel: {
    fontSize: typography.bodySize,
    fontWeight: '500',
    color: colors.textPrimary
  },
  rowSublabel: {
    fontSize: typography.bodySize - 2,
    color: colors.textSecondary,
    marginTop: 2
  }
})
