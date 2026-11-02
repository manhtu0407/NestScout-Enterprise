import { randomUUID } from 'expo-crypto';
import { useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Icon, PressScale } from '@/features/shared';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

import { helpContacts, helpTopics } from './content';
import { SupportCard, SupportEmpty, SupportRow, SupportSection, SupportShell, supportStyles } from './support-shell';

const metrics = horizonLayout.supportScreens;
const colors = horizonColors.supportScreens;
const webInputStyle = { outlineStyle: 'solid', outlineWidth: 0 } as const;

type SupportOutcome = 'idle' | 'sending' | 'sent' | 'failed';

type Props = { onBack: () => void; onAskKael?: () => void; onSubmitSupport?: (key: string, subject: string, body: string) => Promise<void> };

export function HelpScreen({ onBack, onAskKael, onSubmitSupport }: Props) {
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [outcome, setOutcome] = useState<SupportOutcome>('idle');
  const submissionKey = useRef<string | null>(null);
  const canSend = subject.trim().length > 0 && message.trim().length > 0 && outcome !== 'sending';
  const send = async () => {
    if (!onSubmitSupport || !canSend) return;
    submissionKey.current ??= randomUUID();
    setOutcome('sending');
    try {
      await onSubmitSupport(submissionKey.current, subject.trim(), message.trim());
      submissionKey.current = null;
      setSubject('');
      setMessage('');
      setOutcome('sent');
    } catch {
      setOutcome('failed');
    }
  };
  const edit = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    if (outcome !== 'sending') setOutcome('idle');
    if (value !== '') submissionKey.current = null;
  };
  const needle = query.trim().toLocaleLowerCase('vi');
  const topics = needle ? helpTopics.filter(topic => `${topic.question} ${topic.answer}`.toLocaleLowerCase('vi').includes(needle)) : helpTopics;
  return (
    <SupportShell title="Trợ giúp" onBack={onBack}>
      <View style={styles.search}>
        <Icon name="search" size={metrics.searchIconSize} color={colors.searchIcon} />
        <TextInput
          accessibilityLabel="Tìm trong trợ giúp"
          style={[styles.searchInput, webInputStyle]}
          value={query}
          onChangeText={setQuery}
          placeholder="Tìm câu hỏi..."
          placeholderTextColor={colors.searchPlaceholder}
          spellCheck={false}
          returnKeyType="search"
        />
      </View>
      <SupportSection title="Liên hệ">
        <View style={styles.contacts}>
          {helpContacts.map(contact => {
            const available = contact.id === 'kael';
            return (
              <PressScale
                key={contact.id}
                accessibilityRole="button"
                accessibilityLabel={`${contact.label}, ${contact.detail}`}
                accessibilityState={{ disabled: !available }}
                disabled={!available}
                onPress={onAskKael}
                style={[styles.contact, !available && styles.contactIdle]}
                wrapperStyle={styles.contactWrapper}
              >
                <Icon name={contact.icon} size={metrics.contactIconSize} />
                <View style={styles.contactCopy}>
                  <Text style={styles.contactLabel}>{contact.label}</Text>
                  <Text style={styles.contactDetail}>{contact.detail}</Text>
                </View>
              </PressScale>
            );
          })}
        </View>
      </SupportSection>
      {onSubmitSupport ? (
        <SupportSection title="Gửi yêu cầu hỗ trợ">
          <View style={styles.form}>
            <TextInput accessibilityLabel="Chủ đề hỗ trợ" style={[styles.formInput, webInputStyle]} value={subject} onChangeText={edit(setSubject)} placeholder="Chủ đề" placeholderTextColor={colors.searchPlaceholder} maxLength={120} />
            <TextInput accessibilityLabel="Nội dung hỗ trợ" style={[styles.formInput, styles.formBody, webInputStyle]} value={message} onChangeText={edit(setMessage)} placeholder="Mô tả vấn đề bạn gặp" placeholderTextColor={colors.searchPlaceholder} multiline maxLength={4000} textAlignVertical="top" />
            {outcome === 'sent' ? <Text accessibilityLiveRegion="polite" style={styles.formStatus}>Đã gửi yêu cầu hỗ trợ. Chúng tôi sẽ phản hồi sớm.</Text> : null}
            {outcome === 'failed' ? <Text accessibilityLiveRegion="polite" style={styles.formStatus}>Chưa gửi được. Nhấn Gửi để thử lại, nội dung vẫn được giữ.</Text> : null}
            <PressScale accessibilityRole="button" accessibilityLabel="Gửi yêu cầu hỗ trợ" accessibilityState={{ disabled: !canSend }} disabled={!canSend} onPress={() => void send()} style={[supportStyles.primary, !canSend && styles.contactIdle]}>
              <Text style={supportStyles.primaryLabel}>{outcome === 'sending' ? 'Đang gửi…' : 'Gửi'}</Text>
            </PressScale>
          </View>
        </SupportSection>
      ) : null}
      <SupportSection title="Câu hỏi thường gặp">
        {topics.length === 0 ? (
          <SupportEmpty icon="search" title="Không tìm thấy kết quả" body="Thử từ khoá khác hoặc hỏi Kael." />
        ) : (
          <SupportCard>
            {topics.map(topic => {
              const open = topic.id === openId;
              return (
                <View key={topic.id}>
                  <SupportRow
                    icon="help"
                    title={topic.question}
                    accessibilityState={{ expanded: open }}
                    onPress={() => setOpenId(open ? null : topic.id)}
                    trailing={<View style={open ? styles.chevronOpen : undefined}><Icon name="chevron" size={metrics.chevronSize} color={colors.chevron} /></View>}
                  />
                  {open ? <Text style={styles.answer}>{topic.answer}</Text> : null}
                </View>
              );
            })}
          </SupportCard>
        )}
      </SupportSection>
    </SupportShell>
  );
}

const styles = StyleSheet.create({
  search: { height: metrics.searchHeight, borderRadius: metrics.searchRadius, paddingHorizontal: metrics.searchPaddingHorizontal, backgroundColor: colors.searchFill, flexDirection: 'row', alignItems: 'center', gap: metrics.searchGap, marginBottom: metrics.searchMarginBottom },
  searchInput: { flex: 1, minWidth: 0, color: horizonColors.text, fontSize: metrics.searchFontSize, height: metrics.searchHeight },
  contacts: { flexDirection: 'row', gap: metrics.contactGap },
  form: { gap: metrics.supportFormGap },
  formInput: { borderRadius: metrics.searchRadius, paddingHorizontal: metrics.searchPaddingHorizontal, backgroundColor: colors.searchFill, color: horizonColors.text, fontSize: metrics.searchFontSize, minHeight: metrics.searchHeight },
  formBody: { minHeight: metrics.supportBodyMinHeight, paddingTop: metrics.supportFormGap },
  formStatus: { color: horizonColors.muted, fontSize: metrics.contactDetailSize },
  contactWrapper: { flex: 1 },
  contact: { minHeight: metrics.contactMinHeight, borderRadius: metrics.contactRadius, padding: metrics.contactPadding, backgroundColor: colors.cardFill, alignItems: 'center', justifyContent: 'center', gap: metrics.contactInnerGap },
  contactCopy: { alignItems: 'center' },
  contactIdle: { opacity: metrics.contactIdleOpacity },
  contactLabel: { textAlign: 'center', color: horizonColors.text, fontSize: metrics.contactLabelSize, fontWeight: metrics.contactLabelWeight },
  contactDetail: { textAlign: 'center', color: horizonColors.muted, fontSize: metrics.contactDetailSize },
  chevronOpen: { transform: [{ rotate: metrics.faqChevronRotation }] },
  answer: { color: horizonColors.muted, fontSize: metrics.faqAnswerSize, lineHeight: metrics.faqAnswerLineHeight, paddingLeft: metrics.faqAnswerInset, paddingRight: metrics.rowPaddingHorizontal, paddingBottom: metrics.faqAnswerPaddingBottom },
});
