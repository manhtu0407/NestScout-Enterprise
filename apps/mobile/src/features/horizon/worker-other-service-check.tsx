import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

import { SlidingChips } from './sliding-chips';
import { ActionButton, actionRowStyles } from './worker-action-button';
import { otherServiceChecks } from './worker-profile';

const kit = horizonLayout.profileKit;
const kitColors = horizonColors.profileKit;
const support = horizonLayout.supportScreens;
const jobs = horizonLayout.workerJobs;
const screenStyle = horizonLayout.workerProfileScreenStyle;

type Answer = 'yes' | 'unsure';

type Props = { busy: boolean; onConfirm: () => void; onCancel: () => void };

export function WorkerOtherServiceCheck({ busy, onConfirm, onCancel }: Props) {
  const [answers, setAnswers] = useState<Partial<Record<(typeof otherServiceChecks)[number]['id'], Answer>>>({});
  const ready = otherServiceChecks.every(check => answers[check.id] === 'yes');
  return (
    <View accessibilityRole="alert" style={styles.panel}>
      <Text style={styles.title}>Kael cần hỏi bạn trước khi nhận Dịch vụ khác</Text>
      <Text style={styles.body}>Nhóm này gồm những việc không nằm trong năm dịch vụ chính. Khách mô tả việc theo cách của họ, nên Kael chỉ gửi việc cho thợ tự tin về tay nghề và linh hoạt.</Text>
      {otherServiceChecks.map(check => (
        <View key={check.id} style={styles.question}>
          <Text style={styles.questionText}>{check.question}</Text>
          <SlidingChips
            inset={false}
            role="radio"
            items={[
              { key: 'yes', label: 'Có, tôi đảm bảo', accessibilityLabel: `Có, tôi đảm bảo. ${check.question}` },
              { key: 'unsure', label: 'Chưa chắc', accessibilityLabel: `Chưa chắc. ${check.question}` },
            ]}
            selectedKey={answers[check.id] ?? ''}
            onSelect={key => setAnswers(current => ({ ...current, [check.id]: key as Answer }))}
          />
        </View>
      ))}
      {Object.values(answers).includes('unsure') ? <Text style={styles.body}>Nếu chưa chắc, bạn nên chưa nhận nhóm này. Bạn vẫn có thể bật lại bất cứ lúc nào.</Text> : null}
      <View style={actionRowStyles.actions}>
        <ActionButton secondary label="Để sau" accessibilityLabel="Không nhận Dịch vụ khác" onPress={onCancel} />
        <ActionButton label="Xác nhận và nhận" accessibilityLabel="Xác nhận và nhận Dịch vụ khác" disabled={!ready || busy} onPress={onConfirm} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { padding: kit.cardPadding, borderRadius: kit.cardRadius, backgroundColor: kitColors.cardFill, gap: kit.innerGap, marginTop: support.sectionGap },
  title: { color: horizonColors.text, fontSize: screenStyle.blockTitleFontSize, fontWeight: screenStyle.blockTitleFontWeight },
  body: { color: horizonColors.muted, fontSize: jobs.footnoteSize, lineHeight: jobs.footnoteLineHeight },
  question: { gap: jobs.noticeGap },
  questionText: { color: horizonColors.text, fontSize: support.quoteScopeSize, lineHeight: support.quoteScopeLineHeight },
});
