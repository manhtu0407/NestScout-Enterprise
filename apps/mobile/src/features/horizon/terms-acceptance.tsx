import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PressScale } from '@/features/shared';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

import { isAcceptable, type LegalDocument } from './legal-content';
import type { SettingsStrings } from './settings-strings';
import { supportStyles } from './support-shell';

const metrics = horizonLayout.supportScreens;

export type TermsAcceptanceApi = {
  read: (versionId: string) => Promise<string | null>;
  accept: (versionId: string) => Promise<string>;
};

type State = { status: 'loading' | 'ready' | 'busy'; acceptedAt: string | null; error: string | null };

type Props = { document: LegalDocument; api: TermsAcceptanceApi; strings: SettingsStrings; formatDate: (iso: string) => string };

export function TermsAcceptance({ document, api, strings, formatDate }: Props) {
  const [state, setState] = useState<State>({ status: 'loading', acceptedAt: null, error: null });
  const { versionId } = document;

  useEffect(() => {
    let active = true;
    api.read(versionId).then(
      acceptedAt => { if (active) setState({ status: 'ready', acceptedAt, error: null }); },
      () => { if (active) setState({ status: 'ready', acceptedAt: null, error: strings.termsLoadFailed }); },
    );
    return () => { active = false; };
  }, [api, versionId, strings.termsLoadFailed]);

  const accept = () => {
    if (state.status !== 'ready') return;
    setState({ status: 'busy', acceptedAt: null, error: null });
    api.accept(versionId).then(
      acceptedAt => setState({ status: 'ready', acceptedAt, error: null }),
      () => setState({ status: 'ready', acceptedAt: null, error: strings.termsAcceptFailed }),
    );
  };

  if (state.status === 'loading') return <Text style={styles.text}>{strings.termsChecking}</Text>;
  if (state.acceptedAt) return <Text accessibilityLiveRegion="polite" style={styles.text}>{strings.termsAcceptedOn(formatDate(state.acceptedAt))}</Text>;
  const open = isAcceptable(document);
  return (
    <View style={styles.box}>
      {state.error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{state.error}</Text> : null}
      {open ? null : <Text style={styles.text}>{strings.termsNotOpen}</Text>}
      <PressScale accessibilityRole="button" accessibilityLabel={strings.termsAccept} accessibilityState={{ disabled: !open || state.status === 'busy' }} onPress={open ? accept : () => undefined} style={[supportStyles.primary, !open && styles.disabled]}>
        <Text style={supportStyles.primaryLabel}>{strings.termsAccept}</Text>
      </PressScale>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: metrics.rowGap },
  text: { color: horizonColors.muted, fontSize: metrics.rowDetailSize, lineHeight: metrics.rowDetailLineHeight, marginLeft: metrics.sectionTitleInset },
  error: { color: horizonColors.supportScreens.danger, fontSize: metrics.rowDetailSize, lineHeight: metrics.rowDetailLineHeight, marginLeft: metrics.sectionTitleInset },
  disabled: { opacity: horizonLayout.termsAcceptanceStyle.disabledOpacity },
});
