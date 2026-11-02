import { StyleSheet, Text, View } from 'react-native';

import { Icon, PressScale } from '@/features/shared';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

import { SupportCard, SupportRow, SupportSection, SupportShell, supportStyles } from './support-shell';
import { workerKaelBoundaries, workerKaelPrompts } from './worker-kael';

const support = horizonLayout.supportScreens;
const supportColors = horizonColors.supportScreens;

type Props = { onBack: () => void; onAsk: (prompt: string) => void };

export function WorkerKaelScreen({ onBack, onAsk }: Props) {
  return (
    <SupportShell title="Trợ lý Kael" onBack={onBack}>
      <View style={styles.hero}>
        <View style={styles.heroTile}>
          <Icon name="chat" size={support.avatarIconSize} color={supportColors.avatarInitial} />
        </View>
        <View style={styles.heroCopy}>
          <Text style={styles.heroTitle}>Hỏi Kael về công việc của bạn</Text>
          <Text style={styles.heroBody}>Chọn một gợi ý bên dưới, câu hỏi sẽ được điền sẵn trong khung trò chuyện để bạn chỉnh trước khi gửi.</Text>
        </View>
      </View>
      <SupportSection title="Gợi ý hỏi nhanh">
        <SupportCard>
          {workerKaelPrompts.map(item => (
            <SupportRow key={item.id} icon={item.icon} title={item.title} detail={item.detail} onPress={() => onAsk(item.prompt)} />
          ))}
        </SupportCard>
      </SupportSection>
      <SupportSection title="Cần biết khi dùng Kael">
        <SupportCard>
          {workerKaelBoundaries.map(item => (
            <SupportRow key={item.id} icon={item.icon} title={item.title} detail={item.detail} />
          ))}
        </SupportCard>
      </SupportSection>
      <PressScale accessibilityRole="button" accessibilityLabel="Trò chuyện với Kael" onPress={() => onAsk('')} style={supportStyles.primary}>
        <Text style={supportStyles.primaryLabel}>Trò chuyện với Kael</Text>
      </PressScale>
    </SupportShell>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: support.heroGap, padding: support.heroPadding, borderRadius: support.heroRadius, backgroundColor: supportColors.heroFill, marginBottom: support.sectionGap },
  heroTile: { width: support.avatarSize, height: support.avatarSize, borderRadius: support.avatarRadius, backgroundColor: supportColors.avatarFill, alignItems: 'center', justifyContent: 'center' },
  heroCopy: { flex: 1, minWidth: 0, gap: support.workerStatGap },
  heroTitle: { color: horizonColors.text, fontSize: support.heroNameSize, fontWeight: support.heroNameWeight },
  heroBody: { color: horizonColors.muted, fontSize: support.heroBodySize, lineHeight: support.heroBodyLineHeight },
});
