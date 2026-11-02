import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PressScale } from '@/features/shared';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

import type { NotificationItem } from './content';
import { SupportCard, SupportEmpty, SupportRow, SupportSection, SupportShell } from './support-shell';

const metrics = horizonLayout.supportScreens;
const colors = horizonColors.supportScreens;

type Props = { items?: readonly NotificationItem[]; onBack: () => void };

export function NotificationsScreen({ items = [], onBack }: Props) {
  const [readIds, setReadIds] = useState<readonly string[]>([]);
  const isUnread = (item: NotificationItem) => item.unread && !readIds.includes(item.id);
  const unreadCount = items.filter(isUnread).length;
  const today = items.filter(item => item.today);
  const earlier = items.filter(item => !item.today);
  const renderRow = (item: NotificationItem) => (
    <SupportRow
      key={item.id}
      icon={item.icon}
      title={item.title}
      detail={`${item.body}\n${item.time}`}
      highlighted={isUnread(item)}
      onPress={() => setReadIds(current => (current.includes(item.id) ? current : [...current, item.id]))}
      trailing={isUnread(item) ? <View accessibilityLabel="Chưa đọc" style={styles.dot} /> : <View style={styles.dotSpace} />}
    />
  );
  return (
    <SupportShell
      title="Thông báo"
      onBack={onBack}
      headerAction={
        unreadCount > 0 ? (
          <PressScale accessibilityRole="button" accessibilityLabel="Đánh dấu tất cả là đã đọc" onPress={() => setReadIds(items.map(item => item.id))} style={styles.action}>
            <Text style={styles.actionLabel}>Đọc tất cả</Text>
          </PressScale>
        ) : undefined
      }
    >
      {items.length === 0 ? (
        <SupportEmpty icon="bell" title="Chưa có thông báo" body="Báo giá, lịch hẹn và cập nhật từ Kael sẽ hiện ở đây." />
      ) : (
        <>
          {today.length > 0 ? <SupportSection title="Hôm nay"><SupportCard>{today.map(renderRow)}</SupportCard></SupportSection> : null}
          {earlier.length > 0 ? <SupportSection title="Trước đó"><SupportCard>{earlier.map(renderRow)}</SupportCard></SupportSection> : null}
        </>
      )}
    </SupportShell>
  );
}

const styles = StyleSheet.create({
  action: { height: metrics.notificationActionHeight, paddingHorizontal: metrics.notificationActionPadding, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { color: colors.actionLabel, fontSize: metrics.notificationActionSize, fontWeight: metrics.notificationActionWeight },
  dot: { width: metrics.notificationDot, height: metrics.notificationDot, borderRadius: metrics.notificationDotRadius, backgroundColor: colors.unreadDot },
  dotSpace: { width: metrics.notificationDot, height: metrics.notificationDot },
});
