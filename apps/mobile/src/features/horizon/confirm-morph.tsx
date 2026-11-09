import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

import { PressScale, useGlassAccessibility } from '@/features/shared';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

import { FadeIn } from './earnings-motion';

const metrics = horizonLayout.confirmMorph;
const colors = horizonColors.confirmMorph;
const easeOut = Easing.bezier(0.23, 1, 0.32, 1);

export type ConfirmMorphMode = 'press' | 'hold';

type Face = 'rest' | 'confirm' | 'pending' | 'done' | 'error';

type Props = {
  label: string;
  accessibilityLabel: string;
  prompt: string;
  onConfirm: () => Promise<void> | void;
  icon?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  pendingLabel?: string;
  doneLabel?: string;
  errorLabel?: string;
  retryLabel?: string;
  undoLabel?: string;
  undoingLabel?: string;
  tone?: 'danger' | 'neutral';
  mode?: ConfirmMorphMode;
  disabled?: boolean;
  onUndo?: () => Promise<void> | void;
  defaultOpen?: boolean;
  onDismiss?: () => void;
};

export function ConfirmMorph({
  label,
  accessibilityLabel,
  prompt,
  onConfirm,
  icon,
  confirmLabel = 'Xóa',
  cancelLabel = 'Hủy',
  pendingLabel = 'Đang xóa…',
  doneLabel = 'Đã xóa',
  errorLabel = 'Chưa hoàn tất',
  retryLabel = 'Thử lại',
  undoLabel = 'Hoàn tác',
  undoingLabel = 'Đang khôi phục…',
  tone = 'danger',
  mode = 'press',
  disabled = false,
  onUndo,
  defaultOpen = false,
  onDismiss,
}: Props) {
  const [face, setFace] = useState<Face>(defaultOpen ? 'confirm' : 'rest');
  const [undoing, setUndoing] = useState(false);
  const alive = useRef(true);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (settle.current !== null) clearTimeout(settle.current);
    };
  }, []);

  const run = useCallback(async () => {
    setFace('pending');
    try {
      await onConfirm();
      if (!alive.current) return;
      setFace('done');
      if (onUndo === undefined) {
        settle.current = setTimeout(() => alive.current && setFace('rest'), metrics.doneHold);
      }
    } catch {
      if (alive.current) setFace('error');
    }
  }, [onConfirm, onUndo]);

  const undo = useCallback(async () => {
    if (onUndo === undefined) return;
    setUndoing(true);
    try {
      await onUndo();
      if (alive.current) setFace('rest');
    } catch {
      if (alive.current) setFace('error');
    } finally {
      if (alive.current) setUndoing(false);
    }
  }, [onUndo]);

  const dismiss = () => {
    setFace('rest');
    onDismiss?.();
  };

  const askConfirm = () => {
    void Haptics.selectionAsync();
    setFace('confirm');
  };

  const fill = tone === 'danger' ? colors.dangerFill : colors.neutralFill;
  const ink = tone === 'danger' ? colors.dangerLabel : colors.neutralLabel;

  return (
    <View style={styles.frame}>
      <FadeIn key={face} style={styles.face}>
        {face === 'rest' ? (
          <PressScale accessibilityRole="button" accessibilityLabel={accessibilityLabel} disabled={disabled} onPress={askConfirm} style={[styles.rest, disabled && styles.disabled]} wrapperStyle={styles.fill}>
            {icon}
            <Text style={styles.restLabel}>{label}</Text>
          </PressScale>
        ) : null}
        {face === 'confirm' ? (
          <View style={styles.row}>
            <Text numberOfLines={2} style={styles.prompt}>{prompt}</Text>
            <PressScale accessibilityRole="button" accessibilityLabel={cancelLabel} onPress={dismiss} style={styles.cancel}>
              <Text style={styles.cancelLabel}>{cancelLabel}</Text>
            </PressScale>
            {mode === 'hold' ? (
              <HoldButton label={confirmLabel} fill={fill} ink={ink} onComplete={() => void run()} />
            ) : (
              <PressScale accessibilityRole="button" accessibilityLabel={confirmLabel} onPress={() => void run()} style={[styles.confirm, { backgroundColor: fill }]}>
                <Text style={[styles.confirmLabel, { color: ink }]}>{confirmLabel}</Text>
              </PressScale>
            )}
          </View>
        ) : null}
        {face === 'pending' ? (
          <View accessibilityLiveRegion="polite" style={styles.status}>
            <ActivityIndicator size="small" color={colors.pendingText} />
            <Text style={styles.pending}>{pendingLabel}</Text>
          </View>
        ) : null}
        {face === 'done' ? (
          <View accessibilityLiveRegion="polite" style={[styles.status, styles.done]}>
            <Text style={styles.doneText}>{doneLabel}</Text>
            {onUndo !== undefined ? (
              <Pressable accessibilityRole="button" accessibilityLabel={undoLabel} disabled={undoing} onPress={() => void undo()} hitSlop={8}>
                <Text style={styles.undo}>{undoing ? undoingLabel : undoLabel}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        {face === 'error' ? (
          <View accessibilityRole="alert" style={[styles.status, styles.failed]}>
            <Text style={styles.errorText}>{errorLabel}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={retryLabel} onPress={() => void run()} hitSlop={8}>
              <Text style={styles.retry}>{retryLabel}</Text>
            </Pressable>
          </View>
        ) : null}
      </FadeIn>
    </View>
  );
}

type HoldProps = { label: string; fill: string; ink: string; onComplete: () => void };

function HoldButton({ label, fill, ink, onComplete }: HoldProps) {
  const { reduceMotion } = useGlassAccessibility();
  const [progress] = useState(() => new Animated.Value(0));
  const finished = useRef(false);

  const begin = () => {
    finished.current = false;
    if (reduceMotion) {
      finished.current = true;
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      onComplete();
      return;
    }
    Animated.timing(progress, { toValue: 1, duration: metrics.holdDuration, easing: Easing.linear, useNativeDriver: false }).start(({ finished: done }) => {
      if (!done || finished.current) return;
      finished.current = true;
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      onComplete();
    });
  };

  const release = () => {
    if (finished.current) return;
    progress.stopAnimation();
    Animated.timing(progress, { toValue: 0, duration: metrics.faceDuration, easing: easeOut, useNativeDriver: false }).start();
  };

  const width = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}. Nhấn giữ để xác nhận`}
      accessibilityHint="Nhấn giữ nút này để xác nhận"
      onPressIn={begin}
      onPressOut={release}
      style={[styles.confirm, styles.hold, { backgroundColor: fill }]}
    >
      <Animated.View pointerEvents="none" style={[styles.holdFill, { width }]} />
      <Text style={[styles.confirmLabel, { color: ink }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  frame: { minHeight: metrics.height },
  face: { minHeight: metrics.height, justifyContent: 'center' },
  fill: { flex: 1 },
  disabled: { opacity: 0.5 },
  rest: { minHeight: metrics.height, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: metrics.gap, borderRadius: metrics.radius, backgroundColor: colors.restFill },
  restLabel: { color: colors.restLabel, fontSize: metrics.labelSize, fontWeight: metrics.labelWeight },
  row: { minHeight: metrics.height, flexDirection: 'row', alignItems: 'center', gap: metrics.gap },
  prompt: { flex: 1, minWidth: 0, color: colors.promptText, fontSize: metrics.promptSize, fontWeight: '500' },
  cancel: { height: metrics.buttonHeight, paddingHorizontal: metrics.buttonPaddingHorizontal, borderRadius: metrics.buttonRadius, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.restFill },
  cancelLabel: { color: colors.cancelLabel, fontSize: metrics.promptSize, fontWeight: '600' },
  confirm: { height: metrics.buttonHeight, paddingHorizontal: metrics.buttonPaddingHorizontal, borderRadius: metrics.buttonRadius, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  confirmLabel: { fontSize: metrics.promptSize, fontWeight: '600' },
  hold: { minWidth: 76 },
  holdFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: colors.holdTrack },
  status: { minHeight: metrics.height, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: metrics.gap, borderRadius: metrics.radius, backgroundColor: colors.restFill },
  done: { backgroundColor: colors.doneFill },
  failed: { backgroundColor: colors.errorFill },
  pending: { color: colors.pendingText, fontSize: metrics.promptSize, fontWeight: '600' },
  doneText: { color: colors.doneText, fontSize: metrics.promptSize, fontWeight: '600' },
  undo: { color: colors.undoLabel, fontSize: metrics.promptSize, fontWeight: '700' },
  errorText: { color: colors.errorText, fontSize: metrics.promptSize, fontWeight: '600' },
  retry: { color: colors.errorText, fontSize: metrics.promptSize, fontWeight: '700', textDecorationLine: 'underline' },
});
