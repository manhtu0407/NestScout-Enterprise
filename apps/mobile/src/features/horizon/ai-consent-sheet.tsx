import { useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';

import { PressScale } from '@/features/shared';
import { usePreferences } from '@/lib/preferences-provider';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

import { settingsStrings } from './settings-strings';
import { supportStyles } from './support-shell';

const metrics = horizonLayout.supportScreens;
const colors = horizonColors.supportScreens;

type Props = { visible: boolean; onAllow: () => Promise<void>; onDeny: () => void };

export function AiConsentSheet({ visible, onAllow, onDeny }: Props) {
  const strings = settingsStrings(usePreferences().language);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const allow = () => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    onAllow().then(
      () => setBusy(false),
      () => { setBusy(false); setFailed(true); },
    );
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDeny}>
      <View style={styles.backdrop}>
        <View accessibilityViewIsModal style={styles.card}>
          <Text accessibilityRole="header" style={styles.title}>{strings.consentTitle}</Text>
          {strings.consentBody.map(paragraph => <Text key={paragraph} style={styles.paragraph}>{paragraph}</Text>)}
          {failed ? <Text accessibilityLiveRegion="polite" style={styles.error}>{strings.consentFailed}</Text> : null}
          <View style={styles.actions}>
            <PressScale accessibilityRole="button" accessibilityLabel={strings.consentAllow} accessibilityState={{ disabled: busy, busy }} onPress={allow} style={supportStyles.primary}>
              <Text style={supportStyles.primaryLabel}>{busy ? strings.clearBusy : strings.consentAllow}</Text>
            </PressScale>
            <PressScale accessibilityRole="button" accessibilityLabel={strings.consentDeny} onPress={onDeny} style={supportStyles.secondary}>
              <Text style={supportStyles.secondaryLabel}>{strings.consentDeny}</Text>
            </PressScale>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: metrics.rowPaddingHorizontal },
  card: { backgroundColor: horizonColors.bg, borderRadius: metrics.cardRadius, padding: metrics.rowPaddingHorizontal, gap: metrics.sectionTitleGap },
  title: { color: horizonColors.text, fontSize: metrics.profileNameSize, fontWeight: metrics.rowTitleWeight },
  paragraph: { color: horizonColors.text, fontSize: metrics.rowDetailSize, lineHeight: metrics.rowDetailLineHeight },
  error: { color: colors.danger, fontSize: metrics.rowDetailSize, lineHeight: metrics.rowDetailLineHeight },
  actions: { gap: metrics.rowGap, marginTop: metrics.sectionGap },
});
