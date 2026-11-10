import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { Icon, PressScale, useGlassAccessibility, type WorkerMissingItem } from '@/features/shared';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

import { readinessSteps, workerReadiness, type ReadinessStep } from './worker-profile';

const metrics = horizonLayout.profileKit;
const colors = horizonColors.profileKit;

type Props = {
  missing: readonly WorkerMissingItem[];
  onStep: (step: ReadinessStep) => void;
};

function ProgressBar({ fraction, ready }: { fraction: number; ready: boolean }) {
  const { reduceMotion } = useGlassAccessibility();
  const [value] = useState(() => new Animated.Value(fraction));
  useEffect(() => {
    if (reduceMotion) { value.setValue(fraction); return; }
    const motion = Animated.timing(value, { toValue: fraction, duration: metrics.progressDuration, easing: Easing.bezier(0.23, 1, 0.32, 1), useNativeDriver: true });
    motion.start();
    return () => motion.stop();
  }, [fraction, reduceMotion, value]);
  return (
    <View style={[styles.track, ready ? styles.trackOk : styles.trackWarn]}>
      <Animated.View style={[styles.bar, ready ? styles.barOk : styles.barWarn, { transform: [{ scaleX: value }], transformOrigin: 'left center' }]} />
    </View>
  );
}

export function WorkerReadinessCard({ missing, onStep }: Props) {
  const { total, done, ready } = workerReadiness(missing);
  if (ready) {
    return (
      <View accessibilityRole="summary" style={[styles.card, styles.cardOk]}>
        <View style={styles.head}>
          <Icon name="check" size={metrics.stepIcon} color={colors.okText} strokeWidth={2.2} />
          <View style={styles.headCopy}>
            <Text style={[styles.title, styles.titleOk]}>Hồ sơ đã đủ để nhận việc</Text>
            <Text style={[styles.caption, styles.titleOk]}>Bạn có thể bật nhận việc ở menu bên trái.</Text>
          </View>
        </View>
      </View>
    );
  }
  return (
    <View accessibilityRole="summary" style={[styles.card, styles.cardWarn]}>
      <View style={styles.head}>
        <View style={styles.headCopy}>
          <Text style={[styles.title, styles.titleWarn]}>Hoàn thiện hồ sơ để nhận việc</Text>
          <Text style={[styles.caption, styles.titleWarn]}>Cần đủ {total} mục trước khi bật nhận việc. Đã xong {done}/{total}.</Text>
        </View>
      </View>
      <ProgressBar fraction={done / total} ready={false} />
      <View style={styles.steps}>
        {readinessSteps.map(step => {
          const pending = missing.includes(step.key);
          if (!pending) {
            return (
              <View key={step.key} accessibilityLabel={`${step.label}, đã xong`} style={styles.step}>
                <View style={[styles.mark, styles.markDone]}><Icon name="check" size={14} color="#FFFFFF" strokeWidth={2.6} /></View>
                <Text style={[styles.stepTitle, styles.stepDone]}>{step.label}</Text>
              </View>
            );
          }
          return (
            <PressScale key={step.key} accessibilityRole="button" accessibilityLabel={`${step.label}. ${step.hint}`} onPress={() => onStep(step)} style={styles.step}>
              <View style={[styles.mark, styles.markTodo]} />
              <View style={styles.stepCopy}>
                <Text style={styles.stepTitle}>{step.label}</Text>
                <Text style={styles.stepHint}>{step.hint}</Text>
              </View>
              <Icon name="chevron" size={16} color={colors.warnText} />
            </PressScale>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: metrics.cardRadius, padding: metrics.cardPadding, gap: metrics.innerGap, marginBottom: metrics.cardGap },
  cardWarn: { backgroundColor: colors.warnFill },
  cardOk: { backgroundColor: colors.okFill },
  head: { flexDirection: 'row', alignItems: 'center', gap: metrics.stepGap },
  headCopy: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontSize: 16, fontWeight: '600' },
  caption: { fontSize: 13, lineHeight: 18 },
  titleWarn: { color: colors.warnText },
  titleOk: { color: colors.okText },
  track: { height: metrics.progressHeight, borderRadius: metrics.progressRadius, overflow: 'hidden' },
  trackWarn: { backgroundColor: colors.warnTrack },
  trackOk: { backgroundColor: colors.okFill },
  bar: { flex: 1, borderRadius: metrics.progressRadius },
  barWarn: { backgroundColor: colors.warnBar },
  barOk: { backgroundColor: colors.okBar },
  steps: { marginTop: 4 },
  step: { minHeight: metrics.stepHeight, flexDirection: 'row', alignItems: 'center', gap: metrics.stepGap },
  stepCopy: { flex: 1, minWidth: 0, gap: 1 },
  stepTitle: { color: colors.warnText, fontSize: metrics.stepTitleSize, fontWeight: '600' },
  stepHint: { color: colors.warnText, fontSize: metrics.stepHintSize, opacity: 0.8 },
  stepDone: { opacity: 0.6, fontWeight: '500' },
  mark: { width: metrics.stepIcon, height: metrics.stepIcon, borderRadius: metrics.stepIcon / 2, alignItems: 'center', justifyContent: 'center' },
  markTodo: { borderWidth: 2, borderColor: colors.warnBar },
  markDone: { backgroundColor: colors.okBar },
});
