import { StyleSheet, Text } from 'react-native';

import { PressScale } from '@/features/shared';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

const metrics = horizonLayout.workerJobs;
const card = horizonLayout.requestsScreen;
const cardColors = horizonColors.requestsScreen;

type Props = { label: string; accessibilityLabel: string; onPress: () => void; secondary?: boolean; disabled?: boolean };

export function ActionButton({ label, accessibilityLabel, onPress, secondary = false, disabled = false }: Props) {
  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.action, secondary && styles.actionSecondary, disabled && styles.disabled]}
      wrapperStyle={styles.actionWrap}
    >
      <Text style={[styles.actionLabel, secondary && styles.actionSecondaryLabel]}>{label}</Text>
    </PressScale>
  );
}

export const actionRowStyles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: card.actionGap },
  stack: { gap: card.actionGap },
});

const styles = StyleSheet.create({
  actionWrap: { flex: 1 },
  action: { height: card.actionHeight, borderRadius: card.actionRadius, alignItems: 'center', justifyContent: 'center', backgroundColor: cardColors.actionFill },
  actionSecondary: { backgroundColor: cardColors.actionSecondaryFill },
  actionLabel: { color: cardColors.actionLabel, fontSize: card.actionSize, fontWeight: card.actionWeight },
  actionSecondaryLabel: { color: cardColors.actionSecondaryLabel },
  disabled: { opacity: metrics.disabledOpacity },
});
