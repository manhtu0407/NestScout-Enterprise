import { StyleSheet, Text, View } from 'react-native';
import { QrCode } from 'lucide-react-native';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';
import { Badge } from './badge';

const metrics = horizonLayout.designKit;
const colors = horizonColors.designKit;

type Props = { title: string; hint: string };

export function QrFrame({ title, hint }: Props) {
  return <View accessibilityLabel={`${title}. Coming Soon`} style={styles.root}>
    <View style={styles.frame}>
      <QrCode size={metrics.qrGlyph} color={colors.faint}/>
    </View>
    <View style={styles.copy}>
      <Badge label="Coming Soon" tone="warning" size="sm"/>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.hint}>{hint}</Text>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  root: { flexDirection: 'row', alignItems: 'center', gap: metrics.gap, padding: metrics.taskPadding, borderRadius: metrics.radius, backgroundColor: colors.surface, borderWidth: metrics.hair, borderColor: colors.border },
  frame: { width: metrics.qrFrameSize, height: metrics.qrFrameSize, alignItems: 'center', justifyContent: 'center', borderRadius: metrics.qrRadius, borderWidth: metrics.hair, borderStyle: 'dashed', borderColor: colors.border, backgroundColor: colors.page },
  copy: { flex: 1, gap: metrics.tiny, alignItems: 'flex-start' },
  title: { color: colors.text, fontSize: metrics.bodySize, fontWeight: metrics.titleWeight },
  hint: { color: colors.muted, fontSize: metrics.captionSize, lineHeight: metrics.captionLine },
});
