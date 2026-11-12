import { useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import { Dimensions, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon, PressScale } from '@/features/shared';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';
import type { IconName } from '@/features/shared';
import type { KaelAutonomy, KaelAutonomyMode } from './kael-autonomy';

const metrics = horizonLayout.autonomyPicker;
const colors = horizonColors.autonomyPicker;

type Option = { id: KaelAutonomy; title: string; detail: string; icon: IconName };

const customerOptions: readonly Option[] = [
  { id: 'ask', title: 'Ask', detail: 'Kael dừng lại và hỏi bạn từng bước nhỏ, từng thông tin một.', icon: 'help' },
  { id: 'auto', title: 'Auto', detail: 'Kael chạy liên tục, chỉ dừng khi cần bạn xác nhận thông tin, thợ và giá.', icon: 'bolt' },
];

const workerOptions: readonly Option[] = [
  { id: 'ask', title: 'Ask', detail: 'Kael hỏi bạn từng bước và để bạn tự quyết định nhận từng việc.', icon: 'help' },
  { id: 'auto', title: 'Auto', detail: 'Kael tự nhận việc khớp hồ sơ của bạn rồi báo cho bạn qua thông báo.', icon: 'bolt' },
];

type Props = { mode: KaelAutonomyMode; value: KaelAutonomy; onChange: (value: KaelAutonomy) => void; disabled?: boolean; failed?: boolean };

type Anchor = { left: number; bottom: number };

export function AutonomyPicker({ mode, value, onChange, disabled = false, failed = false }: Props) {
  const trigger = useRef<ComponentRef<typeof View>>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const options = mode === 'worker' ? workerOptions : customerOptions;
  const label = options.find(option => option.id === value)?.title ?? 'Ask';
  const open = () => {
    setAnchor({ left: metrics.edgeGap, bottom: metrics.fallbackBottom });
    trigger.current?.measureInWindow((x, y) => {
      const window = Dimensions.get('window');
      const widest = window.width - metrics.menuWidth - metrics.edgeGap;
      setAnchor({ left: Math.max(metrics.edgeGap, Math.min(x, widest)), bottom: window.height - y + metrics.anchorGap });
    });
  };
  const close = () => setAnchor(null);
  return <>
    <View ref={trigger} collapsable={false}>
      <PressScale
        accessibilityRole="button"
        accessibilityLabel={`Chế độ Kael: ${label}`}
        accessibilityHint="Chọn Ask hoặc Auto"
        accessibilityState={{ expanded: anchor !== null, disabled }}
        disabled={disabled}
        onPress={open}
        hitSlop={metrics.triggerHitSlop}
        style={[styles.trigger, styles[value]]}
      >
        <Text style={[styles.triggerLabel, styles[`${value}Label`]]}>{label}</Text>
      </PressScale>
    </View>
    {anchor && <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={close}>
      <Pressable accessibilityRole="button" accessibilityLabel="Đóng chọn chế độ" onPress={close} style={styles.scrim}/>
      <View accessibilityRole="radiogroup" accessibilityLabel="Chế độ Kael" pointerEvents="box-none" style={[styles.menu, anchor]}>
        {options.map(option => {
          const selected = option.id === value;
          return <Pressable
            key={option.id}
            accessibilityRole="radio"
            accessibilityLabel={`${option.title}. ${option.detail}`}
            accessibilityState={{ checked: selected }}
            onPress={() => { close(); if (!selected) onChange(option.id); }}
            style={({ hovered }: { hovered?: boolean }) => [styles.row, (hovered || selected) && styles.rowActive]}
          >
            <View style={styles.iconSlot}>
              <Icon name={option.icon} size={metrics.iconSize} strokeWidth={metrics.iconStroke} color={colors.icon}/>
            </View>
            <View style={styles.copy}>
              <Text style={styles.title}>{option.title}</Text>
              <Text style={styles.detail}>{option.detail}</Text>
            </View>
            <View style={styles.checkSlot}>
              {selected && <Icon name="check" size={metrics.checkSize} strokeWidth={metrics.checkStroke} color={colors.check}/>}
            </View>
          </Pressable>;
        })}
        {failed && <Text accessibilityLiveRegion="polite" style={styles.failure}>Chưa lưu được lựa chọn. Bạn thử lại nhé.</Text>}
      </View>
    </Modal>}
  </>;
}

const styles = StyleSheet.create({
  trigger: { height: metrics.triggerHeight, paddingHorizontal: metrics.triggerPaddingHorizontal, borderRadius: metrics.triggerRadius, alignItems: 'center', justifyContent: 'center' },
  triggerLabel: { fontSize: metrics.triggerFontSize, fontWeight: metrics.triggerFontWeight, letterSpacing: metrics.triggerTracking },
  ask: { backgroundColor: colors.askSurface },
  auto: { backgroundColor: colors.autoSurface },
  askLabel: { color: colors.triggerText },
  autoLabel: { color: colors.accentText },
  scrim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.scrim },
  menu: { position: 'absolute', width: metrics.menuWidth, padding: metrics.menuPadding, gap: metrics.menuGap, borderRadius: metrics.menuRadius, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.menuBorder, backgroundColor: colors.menuSurface, boxShadow: colors.menuShadow },
  row: { flexDirection: 'row', alignItems: 'center', gap: metrics.rowGap, padding: metrics.rowPadding, borderRadius: metrics.rowRadius },
  rowActive: { backgroundColor: colors.rowActive },
  iconSlot: { width: metrics.iconSlot, height: metrics.iconSlot, borderRadius: metrics.iconSlotRadius, backgroundColor: colors.iconSurface, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, minWidth: 0, gap: metrics.copyGap },
  title: { color: colors.title, fontSize: metrics.titleFontSize, fontWeight: metrics.titleFontWeight },
  detail: { color: colors.detail, fontSize: metrics.detailFontSize, lineHeight: metrics.detailLineHeight },
  checkSlot: { width: metrics.checkSlot, alignItems: 'center', justifyContent: 'center' },
  failure: { color: colors.failure, fontSize: metrics.detailFontSize, lineHeight: metrics.detailLineHeight, paddingHorizontal: metrics.rowPadding, paddingBottom: metrics.copyGap },
});
