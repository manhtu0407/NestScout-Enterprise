import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Icon, PressScale } from '@/features/shared';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

import { helpContacts, helpTopics } from './content';
import { SupportCard, SupportEmpty, SupportRow, SupportSection, SupportShell } from './support-shell';

const metrics = horizonLayout.supportScreens;
const colors = horizonColors.supportScreens;
const webInputStyle = { outlineStyle: 'solid', outlineWidth: 0 } as const;

type Props = { onBack: () => void; onAskKael?: () => void };

export function HelpScreen({ onBack, onAskKael }: Props) {
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
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
  contactWrapper: { flex: 1 },
  contact: { minHeight: metrics.contactMinHeight, borderRadius: metrics.contactRadius, padding: metrics.contactPadding, backgroundColor: colors.cardFill, alignItems: 'center', justifyContent: 'center', gap: metrics.contactInnerGap },
  contactCopy: { alignItems: 'center' },
  contactIdle: { opacity: metrics.contactIdleOpacity },
  contactLabel: { textAlign: 'center', color: horizonColors.text, fontSize: metrics.contactLabelSize, fontWeight: metrics.contactLabelWeight },
  contactDetail: { textAlign: 'center', color: horizonColors.muted, fontSize: metrics.contactDetailSize },
  chevronOpen: { transform: [{ rotate: metrics.faqChevronRotation }] },
  answer: { color: horizonColors.muted, fontSize: metrics.faqAnswerSize, lineHeight: metrics.faqAnswerLineHeight, paddingLeft: metrics.faqAnswerInset, paddingRight: metrics.rowPaddingHorizontal, paddingBottom: metrics.faqAnswerPaddingBottom },
});
