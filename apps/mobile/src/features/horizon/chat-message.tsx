import { useState } from 'react';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AlertCircle, Check, CheckCheck, Clock } from 'lucide-react-native';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';
import { CitedText } from './citations';
import { formatSentAt } from './message-time';
import type { CitedSegment } from './citations';

const metrics = horizonLayout.designKit;
const colors = horizonColors.designKit;

export type DeliveryStatus = 'sending' | 'sent' | 'read' | 'failed';

type Props = {
  role: 'kael' | 'user';
  time?: string;
  sentAt?: number;
  text?: string;
  segments?: readonly CitedSegment[];
  status?: DeliveryStatus;
  footer?: ReactNode;
};

const textColors: Readonly<Record<'kael' | 'user', string>> = { kael: colors.text, user: colors.userText };

const statusLabel: Readonly<Record<DeliveryStatus, string>> = { sending: 'Đang gửi', sent: 'Đã gửi', read: 'Đã xem', failed: 'Gửi lỗi' };

function StatusMark({ status }: { status: DeliveryStatus }) {
  const size = metrics.timeSize + 2;
  if (status === 'sending') return <Clock size={size} color={colors.faint}/>;
  if (status === 'sent') return <Check size={size} color={colors.faint}/>;
  if (status === 'read') return <CheckCheck size={size} color={colors.accent}/>;
  return <AlertCircle size={size} color={colors.dangerFg}/>;
}

export function ChatMessage({ role, time, sentAt, text, segments, status, footer }: Props) {
  const isKael = role === 'kael';
  const content = segments ?? (text === undefined ? [] : [{ text }]);
  const [revealed, setRevealed] = useState(false);
  const shownTime = time ?? (revealed && sentAt !== undefined ? formatSentAt(sentAt) : undefined);
  const bubble = <View style={[styles.bubble, isKael ? styles.bubbleKael : styles.bubbleUser]}>
    <CitedText segments={content} color={textColors[role]}/>
  </View>;
  return <View style={[styles.row, !isKael && styles.rowUser]}>
    <View style={[styles.column, !isKael && styles.columnUser]}>
      {sentAt === undefined ? bubble : <Pressable accessibilityRole="button" accessibilityLabel={revealed ? 'Ẩn giờ gửi' : 'Xem giờ gửi'} accessibilityState={{ expanded: revealed }} onPress={() => setRevealed(value => !value)}>{bubble}</Pressable>}
      {footer}
      {(shownTime !== undefined || status !== undefined) && <View style={styles.meta}>
        {shownTime !== undefined && <Text style={styles.time}>{shownTime}</Text>}
        {!isKael && status !== undefined && <View accessibilityLabel={statusLabel[status]} style={styles.status}>
          <StatusMark status={status}/>
          <Text style={[styles.time, status === 'failed' && styles.timeFailed]}>{statusLabel[status]}</Text>
        </View>}
      </View>}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: metrics.rowGap },
  rowUser: { justifyContent: 'flex-end' },
  column: { maxWidth: metrics.bubbleMaxWidth, gap: metrics.bubbleGap, alignItems: 'flex-start', flexShrink: 1 },
  columnUser: { alignItems: 'flex-end' },
  bubble: { padding: metrics.bubblePadding, borderRadius: metrics.radius },
  bubbleKael: { backgroundColor: colors.kaelBubble, borderBottomLeftRadius: metrics.bubbleGap },
  bubbleUser: { backgroundColor: colors.userBubble, borderBottomRightRadius: metrics.bubbleGap },
  meta: { flexDirection: 'row', alignItems: 'center', gap: metrics.rowGap },
  status: { flexDirection: 'row', alignItems: 'center', gap: metrics.stackGap },
  time: { color: colors.faint, fontSize: metrics.timeSize },
  timeFailed: { color: colors.dangerFg },
});
