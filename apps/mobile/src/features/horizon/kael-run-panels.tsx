import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { KaelApproval, KaelTask, KaelTaskStatus } from '@/features/shared';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

import { ThinkingStars } from './agent-thinking';
import { KaelThinkingStatus } from './kael-thinking-status';
import { SlideToConfirm } from './slide-to-confirm';

const metrics = horizonLayout.kaelRuntime;
const motion = horizonLayout.kaelMotion;
const colors = horizonColors.kaelRuntime;

export const kaelTaskStatusLabels: Readonly<Record<KaelTaskStatus, string>> = {
  pending: 'Chờ bắt đầu',
  running: 'Đang thực hiện',
  waiting_for_input: 'Cần thêm thông tin',
  waiting_for_approval: 'Chờ bạn xác nhận',
  paused: 'Tạm dừng',
  completed: 'Đã xong',
  failed: 'Không thành công',
  cancelled: 'Đã hủy',
};

const dotColors: Readonly<Record<KaelTaskStatus, string>> = {
  pending: colors.dotStopped,
  running: colors.dotActive,
  waiting_for_input: colors.dotStopped,
  waiting_for_approval: colors.dotStopped,
  paused: colors.dotStopped,
  completed: colors.dotDone,
  failed: colors.dotStopped,
  cancelled: colors.dotStopped,
};

export function KaelRunActivity({ label }: { label: string }) {
  return <View style={styles.activity}>
    <View style={styles.activityOrb}><ThinkingStars/></View>
    <KaelThinkingStatus label={label}/>
  </View>;
}

type TaskListProps = { tasks: readonly KaelTask[]; processingTaskId?: string | null; processingLabel?: string | null };

export function KaelTaskList({ tasks, processingTaskId = null, processingLabel = null }: TaskListProps) {
  if (tasks.length === 0) return null;
  return <View accessibilityLabel="Việc Kael đang theo dõi" style={styles.tasks}>
    {tasks.map(task => {
      const transient = task.id === processingTaskId && processingLabel !== null;
      const label = transient ? processingLabel : kaelTaskStatusLabels[task.status];
      return <View key={task.id} accessible accessibilityLabel={`${task.title}: ${label}`} style={styles.taskRow}>
        <View style={[styles.taskDot, { backgroundColor: transient ? colors.dotActive : dotColors[task.status] }]}/>
        <Text style={styles.taskTitle} numberOfLines={1}>{task.title}</Text>
        <Text style={styles.taskStatus}>{label}</Text>
      </View>;
    })}
  </View>;
}

type ApprovalProps = { approval: KaelApproval; disabled: boolean; onDecide: (approval: KaelApproval, approve: boolean) => void };

function ApprovalDetails({ approval }: { approval: KaelApproval }) {
  return <>
    <Text style={styles.cardTitle}>{approval.summary}</Text>
    {Object.entries(approval.details).map(([label, value]) => <View key={label} style={styles.detail}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>)}
  </>;
}

export function KaelApprovalCard({ approval, disabled, onDecide }: ApprovalProps) {
  if (approval.kind === 'reconcile') {
    return <View accessibilityLabel={`Cần kiểm tra lại: ${approval.summary}`} style={styles.card}>
      <ApprovalDetails approval={approval}/>
      <Text style={styles.detailLabel}>Bạn đã xác nhận yêu cầu này nhưng chưa rõ hệ thống đã nhận hay chưa. Kiểm tra lại dùng đúng lần gửi bạn đã xác nhận, với cùng nội dung và mã gửi: nếu hệ thống đã nhận, Kael chỉ báo lại kết quả; nếu chưa, chính lần gửi đó được hoàn tất. Không tạo yêu cầu mới và không cần xác nhận lại.</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`Kiểm tra lại ${approval.summary}`} disabled={disabled} onPress={() => onDecide(approval, true)} style={styles.decline}>
        <Text style={styles.declineText}>Kiểm tra lại</Text>
      </Pressable>
    </View>;
  }
  return <View accessibilityLabel={`Cần xác nhận: ${approval.summary}`} style={styles.card}>
    <ApprovalDetails approval={approval}/>
    <Text style={styles.detailLabel}>Yêu cầu này chưa được gửi cho đến khi bạn xác nhận.</Text>
    <SlideToConfirm label="Trượt để xác nhận" accessibilityLabel={`Xác nhận ${approval.summary}`} disabled={disabled} onConfirm={() => onDecide(approval, true)}/>
    <Pressable accessibilityRole="button" accessibilityLabel="Không thực hiện" disabled={disabled} onPress={() => onDecide(approval, false)} style={styles.decline}>
      <Text style={styles.declineText}>Không thực hiện</Text>
    </Pressable>
  </View>;
}

export function KaelIncompleteNote() {
  return <Text style={styles.incomplete}>Phản hồi chưa hoàn tất</Text>;
}

const styles = StyleSheet.create({
  activity: { flexDirection: 'row', alignItems: 'center', gap: motion.thinkingGap, paddingVertical: motion.thinkingPaddingVertical },
  activityOrb: { height: motion.statusLineHeight, justifyContent: 'center' },
  tasks: { gap: metrics.taskGap },
  taskRow: { flexDirection: 'row', alignItems: 'center', gap: metrics.taskRowGap, paddingVertical: metrics.taskPaddingVertical, paddingHorizontal: metrics.taskPaddingHorizontal, borderRadius: metrics.taskRadius, backgroundColor: colors.taskSurface },
  taskDot: { width: metrics.taskDot, height: metrics.taskDot, borderRadius: metrics.taskDotRadius },
  taskTitle: { flex: 1, color: colors.taskTitle, fontSize: metrics.taskTitleSize, lineHeight: metrics.taskTitleLineHeight },
  taskStatus: { color: colors.taskStatus, fontSize: metrics.taskStatusSize, lineHeight: metrics.taskStatusLineHeight },
  card: { gap: metrics.cardGap, padding: metrics.cardPadding, borderRadius: metrics.cardRadius, backgroundColor: colors.cardSurface, borderColor: colors.cardBorder, borderWidth: StyleSheet.hairlineWidth },
  cardTitle: { color: colors.title, fontSize: metrics.titleSize, lineHeight: metrics.titleLineHeight, fontWeight: metrics.titleWeight },
  detail: { gap: metrics.detailGap },
  detailLabel: { color: colors.detailLabel, fontSize: metrics.detailLabelSize, lineHeight: metrics.detailLabelLineHeight },
  detailValue: { color: colors.detailValue, fontSize: metrics.detailValueSize, lineHeight: metrics.detailValueLineHeight },
  decline: { minHeight: metrics.declineHeight, alignItems: 'center', justifyContent: 'center' },
  declineText: { color: colors.decline, fontSize: metrics.declineSize, fontWeight: metrics.declineWeight },
  incomplete: { color: colors.incomplete, fontSize: metrics.incompleteSize, lineHeight: metrics.incompleteLineHeight },
});
