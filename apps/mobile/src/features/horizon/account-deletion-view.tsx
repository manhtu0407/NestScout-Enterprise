import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PressScale } from '@/features/shared';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

import type { SettingsStrings } from './settings-strings';
import { SupportShell, supportStyles } from './support-shell';

const metrics = horizonLayout.supportScreens;
const colors = horizonColors.supportScreens;

export type AccountDeletionApi = {
  read: () => Promise<string | null>;
  request: () => Promise<string>;
  cancel: () => Promise<void>;
};

type State = { status: 'loading' | 'ready' | 'busy'; requestedAt: string | null; error: 'load' | 'action' | null };

type Props = { api?: AccountDeletionApi; strings: SettingsStrings; formatDate: (iso: string) => string; onBack: () => void };

export function AccountDeletionView({ api, strings, formatDate, onBack }: Props) {
  const [state, setState] = useState<State>({ status: api ? 'loading' : 'ready', requestedAt: null, error: null });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!api) return undefined;
    let active = true;
    api.read().then(
      requestedAt => { if (active) setState({ status: 'ready', requestedAt, error: null }); },
      () => { if (active) setState({ status: 'ready', requestedAt: null, error: 'load' }); },
    );
    return () => { active = false; };
  }, [api, reloadKey]);

  const run = (action: () => Promise<string | null>) => {
    if (state.status !== 'ready') return;
    const previous = state.requestedAt;
    setState({ status: 'busy', requestedAt: previous, error: null });
    action().then(
      requestedAt => setState({ status: 'ready', requestedAt, error: null }),
      () => setState({ status: 'ready', requestedAt: previous, error: 'action' }),
    );
  };

  const busy = state.status === 'busy';
  const message = state.error === 'load' ? strings.deleteLoadFailed : state.error === 'action' ? strings.deleteFailed : null;
  return (
    <SupportShell backLabel={strings.back} title={strings.deleteTitle} onBack={onBack}>
      {!api ? <Text accessibilityLiveRegion="polite" style={styles.error}>{strings.deleteSignedOut}</Text> : null}
      {state.status === 'loading' ? <Text style={styles.text}>{strings.deleteLoading}</Text> : null}
      {state.requestedAt
        ? <Text accessibilityLiveRegion="polite" style={styles.text}>{strings.deleteRequestedOn(formatDate(state.requestedAt))}</Text>
        : <Text style={styles.text}>{strings.deleteBody}</Text>}
      {message ? <Text accessibilityLiveRegion="polite" style={styles.error}>{message}</Text> : null}
      {api && state.status !== 'loading' ? (
        <View style={styles.actions}>
          {state.error === 'load' ? (
            <PressScale accessibilityRole="button" accessibilityLabel={strings.deleteLoading} onPress={() => { setState({ status: 'loading', requestedAt: null, error: null }); setReloadKey(key => key + 1); }} style={supportStyles.secondary}>
              <Text style={supportStyles.secondaryLabel}>{strings.deleteLoading}</Text>
            </PressScale>
          ) : state.requestedAt ? (
            <PressScale accessibilityRole="button" accessibilityLabel={strings.deleteCancel} accessibilityState={{ disabled: busy, busy }} onPress={() => run(() => api.cancel().then(() => null))} style={supportStyles.primary}>
              <Text style={supportStyles.primaryLabel}>{busy ? strings.deleteBusy : strings.deleteCancel}</Text>
            </PressScale>
          ) : (
            <>
              <PressScale accessibilityRole="button" accessibilityLabel={strings.deleteConfirm} accessibilityState={{ disabled: busy, busy }} onPress={() => run(() => api.request())} style={[supportStyles.primary, styles.danger]}>
                <Text style={supportStyles.primaryLabel}>{busy ? strings.deleteBusy : strings.deleteConfirm}</Text>
              </PressScale>
              <PressScale accessibilityRole="button" accessibilityLabel={strings.deleteKeep} onPress={onBack} style={supportStyles.secondary}>
                <Text style={supportStyles.secondaryLabel}>{strings.deleteKeep}</Text>
              </PressScale>
            </>
          )}
        </View>
      ) : null}
    </SupportShell>
  );
}

const styles = StyleSheet.create({
  text: { color: horizonColors.text, fontSize: metrics.rowDetailSize, lineHeight: metrics.rowDetailLineHeight, marginBottom: metrics.sectionTitleGap, marginLeft: metrics.sectionTitleInset },
  error: { color: colors.danger, fontSize: metrics.rowDetailSize, lineHeight: metrics.rowDetailLineHeight, marginBottom: metrics.sectionTitleGap, marginLeft: metrics.sectionTitleInset },
  actions: { gap: metrics.rowGap, marginTop: metrics.sectionGap },
  danger: { backgroundColor: colors.danger },
});
