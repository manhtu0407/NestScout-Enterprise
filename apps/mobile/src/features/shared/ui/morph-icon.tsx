import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { ArchiveX, CalendarCheck, CameraOff, Check, ClipboardCheck, EyeOff, ImageOff, List, LogOut, MicOff, PinOff, Square, UserCheck, X } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Icon } from './icon';
import { useGlassAccessibility } from './glass-interaction';
import type { IconName } from './icon';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

const metrics = horizonLayout.designKit;
const colors = horizonColors.designKit;

export type MorphMotion = 'swap' | 'rotate' | 'spin' | 'fill' | 'shake' | 'pop';

export type MorphSpec = Readonly<{ motion: MorphMotion; label: string; alt?: LucideIcon; angle?: number }>;

export const iconMorphs: Readonly<Record<IconName, MorphSpec>> = {
  login: { motion: 'swap', alt: LogOut, label: 'Đăng nhập ↔ Đăng xuất' },
  eye: { motion: 'swap', alt: EyeOff, label: 'Hiện ↔ Ẩn' },
  attach: { motion: 'swap', alt: Check, label: 'Đính kèm ↔ Đã đính kèm' },
  image: { motion: 'swap', alt: ImageOff, label: 'Có ảnh ↔ Gỡ ảnh' },
  globe: { motion: 'spin', label: 'Xoay khi bật tìm web' },
  camera: { motion: 'swap', alt: CameraOff, label: 'Bật ↔ Tắt camera' },
  menu: { motion: 'swap', alt: X, label: 'Menu ↔ Đóng' },
  plus: { motion: 'rotate', angle: 45, label: 'Cộng → Đóng' },
  arrowUp: { motion: 'swap', alt: Square, label: 'Gửi ↔ Dừng' },
  arrowRight: { motion: 'swap', alt: Check, label: 'Tiếp tục ↔ Xong' },
  chevron: { motion: 'rotate', angle: 90, label: 'Mở rộng ↔ Thu gọn' },
  close: { motion: 'rotate', angle: 90, label: 'Xoay khi đóng' },
  mic: { motion: 'swap', alt: MicOff, label: 'Nói ↔ Tắt mic' },
  search: { motion: 'swap', alt: X, label: 'Tìm ↔ Xóa' },
  chat: { motion: 'pop', label: 'Nảy khi có tin mới' },
  home: { motion: 'pop', label: 'Nảy khi chọn tab' },
  briefcase: { motion: 'pop', label: 'Nảy khi có việc mới' },
  clock: { motion: 'spin', label: 'Quay khi chờ' },
  heart: { motion: 'fill', label: 'Thích: rỗng → đầy' },
  wrench: { motion: 'shake', label: 'Lắc khi đang sửa' },
  drop: { motion: 'fill', label: 'Chọn: rỗng → đầy' },
  sofa: { motion: 'pop', label: 'Nảy khi chọn' },
  paint: { motion: 'pop', label: 'Nảy khi chọn' },
  grid: { motion: 'swap', alt: List, label: 'Lưới ↔ Danh sách' },
  gear: { motion: 'spin', label: 'Xoay khi mở cài đặt' },
  bolt: { motion: 'fill', label: 'Bật: rỗng → đầy' },
  user: { motion: 'swap', alt: UserCheck, label: 'Tài khoản ↔ Đã xác minh' },
  help: { motion: 'pop', label: 'Nảy khi cần trợ giúp' },
  bell: { motion: 'shake', label: 'Rung khi có thông báo' },
  requests: { motion: 'swap', alt: ClipboardCheck, label: 'Yêu cầu ↔ Đã duyệt' },
  receipt: { motion: 'pop', label: 'Nảy khi có hóa đơn' },
  compose: { motion: 'swap', alt: Check, label: 'Soạn ↔ Xong' },
  history: { motion: 'spin', angle: -360, label: 'Quay ngược khi tải lịch sử' },
  back: { motion: 'pop', label: 'Nảy khi quay lại' },
  check: { motion: 'pop', label: 'Nảy khi hoàn tất' },
  send: { motion: 'swap', alt: Check, label: 'Gửi ↔ Đã gửi' },
  more: { motion: 'rotate', angle: 90, label: 'Ngang → Dọc' },
  share: { motion: 'swap', alt: Check, label: 'Chia sẻ ↔ Đã chia sẻ' },
  pin: { motion: 'swap', alt: PinOff, label: 'Ghim ↔ Bỏ ghim' },
  archive: { motion: 'swap', alt: ArchiveX, label: 'Lưu trữ ↔ Bỏ lưu trữ' },
  trash: { motion: 'swap', alt: Check, label: 'Xóa → Xác nhận' },
  wallet: { motion: 'pop', label: 'Nảy khi nhận tiền' },
  star: { motion: 'fill', label: 'Đánh giá: rỗng → đầy' },
  calendar: { motion: 'swap', alt: CalendarCheck, label: 'Lịch ↔ Đã đặt' },
  phone: { motion: 'shake', label: 'Rung khi gọi đến' },
};

export const morphNames = Object.keys(iconMorphs) as readonly IconName[];

type Props = { name: IconName; active: boolean; size?: number; color?: string; activeColor?: string };

export function MorphIcon({ name, active, size = metrics.morphIcon, color = colors.muted, activeColor = colors.text }: Props) {
  const spec = iconMorphs[name];
  const { reduceMotion } = useGlassAccessibility();
  const [progress] = useState(() => new Animated.Value(active ? 1 : 0));
  const [pulse] = useState(() => new Animated.Value(0));
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (reduceMotion) { progress.setValue(active ? 1 : 0); return; }
    const move = Animated.timing(progress, { toValue: active ? 1 : 0, duration: metrics.morphDuration, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    move.start();
    pulse.setValue(0);
    const kick = Animated.timing(pulse, { toValue: 1, duration: metrics.morphDuration * 2, easing: Easing.out(Easing.quad), useNativeDriver: true });
    kick.start();
    return () => { move.stop(); kick.stop(); };
  }, [active, progress, pulse, reduceMotion]);
  const tint = active ? activeColor : color;
  const box = { width: size, height: size };
  const Alt = spec.alt;
  if (spec.motion === 'swap' && Alt !== undefined) {
    return <View style={[styles.stack, box]}>
      <Animated.View style={[styles.layer, { opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }), transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1, metrics.morphScale] }) }, { rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-90deg'] }) }] }]}>
        <Icon name={name} size={size} color={color}/>
      </Animated.View>
      <Animated.View style={[styles.layer, { opacity: progress, transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [metrics.morphScale, 1] }) }, { rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ['90deg', '0deg'] }) }] }]}>
        <Alt size={size} color={activeColor} strokeWidth={2}/>
      </Animated.View>
    </View>;
  }
  const turn = spec.angle ?? 360;
  const transform = spec.motion === 'rotate' ? [{ rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${turn}deg`] }) }]
    : spec.motion === 'spin' ? [{ rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${turn}deg`] }) }]
    : spec.motion === 'shake' ? [{ rotate: pulse.interpolate({ inputRange: [0, 0.2, 0.4, 0.6, 0.8, 1], outputRange: ['0deg', `${metrics.morphShake}deg`, `-${metrics.morphShake}deg`, `${metrics.morphShake / 2}deg`, `-${metrics.morphShake / 2}deg`, '0deg'] }) }]
    : [{ scale: pulse.interpolate({ inputRange: [0, 0.4, 1], outputRange: [1, metrics.morphPop, 1] }) }];
  return <View style={[styles.stack, box]}>
    <Animated.View style={[styles.layer, { transform }]}>
      <Icon name={name} size={size} color={tint} fill={spec.motion === 'fill' && active ? tint : 'none'}/>
    </Animated.View>
  </View>;
}

const styles = StyleSheet.create({
  stack: { alignItems: 'center', justifyContent: 'center' },
  layer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
});
