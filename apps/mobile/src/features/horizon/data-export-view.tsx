import { useState } from 'react';
import { Platform, Share, StyleSheet, Text, View } from 'react-native';

import { PressScale } from '@/features/shared';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

import type { SettingsStrings } from './settings-strings';
import { SupportShell, supportStyles } from './support-shell';

const metrics = horizonLayout.supportScreens;
const colors = horizonColors.supportScreens;

export type DataExportApi = () => Promise<string>;

type State = { status: 'idle' | 'busy' | 'ready'; json: string | null; failed: boolean };

type Props = { api?: DataExportApi; strings: SettingsStrings; onBack: () => void };

const fileName = 'nestscout-du-lieu.json';

async function saveOrShare(json: string, title: string): Promise<void> {
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
    return;
  }
  await Share.share({ message: json, title });
}

export function DataExportView({ api, strings, onBack }: Props) {
  const [state, setState] = useState<State>({ status: 'idle', json: null, failed: false });
  const [shareFailed, setShareFailed] = useState(false);

  const run = () => {
    if (!api || state.status === 'busy') return;
    setState({ status: 'busy', json: null, failed: false });
    setShareFailed(false);
    api().then(
      json => setState({ status: 'ready', json, failed: false }),
      () => setState({ status: 'idle', json: null, failed: true }),
    );
  };

  const share = () => {
    if (state.json === null) return;
    setShareFailed(false);
    saveOrShare(state.json, strings.exportTitle).catch(() => setShareFailed(true));
  };

  const busy = state.status === 'busy';
  return (
    <SupportShell backLabel={strings.back} title={strings.exportTitle} onBack={onBack}>
      <Text style={styles.text}>{strings.exportBody}</Text>
      {!api ? <Text accessibilityLiveRegion="polite" style={styles.error}>{strings.exportSignedOut}</Text> : null}
      {state.failed || shareFailed ? <Text accessibilityLiveRegion="polite" style={styles.error}>{strings.exportFailed}</Text> : null}
      {state.status === 'ready' ? <Text accessibilityLiveRegion="polite" style={styles.text}>{strings.exportDone}</Text> : null}
      <View style={styles.actions}>
        {api && state.status !== 'ready' ? (
          <PressScale accessibilityRole="button" accessibilityLabel={strings.exportRun} accessibilityState={{ disabled: busy, busy }} onPress={run} style={supportStyles.primary}>
            <Text style={supportStyles.primaryLabel}>{busy ? strings.exportBusy : strings.exportRun}</Text>
          </PressScale>
        ) : null}
        {state.status === 'ready' ? (
          <PressScale accessibilityRole="button" accessibilityLabel={strings.exportShare} onPress={share} style={supportStyles.primary}>
            <Text style={supportStyles.primaryLabel}>{strings.exportShare}</Text>
          </PressScale>
        ) : null}
      </View>
    </SupportShell>
  );
}

const styles = StyleSheet.create({
  text: { color: horizonColors.text, fontSize: metrics.rowDetailSize, lineHeight: metrics.rowDetailLineHeight, marginBottom: metrics.sectionTitleGap, marginLeft: metrics.sectionTitleInset },
  error: { color: colors.danger, fontSize: metrics.rowDetailSize, lineHeight: metrics.rowDetailLineHeight, marginBottom: metrics.sectionTitleGap, marginLeft: metrics.sectionTitleInset },
  actions: { gap: metrics.rowGap, marginTop: metrics.sectionGap },
});
