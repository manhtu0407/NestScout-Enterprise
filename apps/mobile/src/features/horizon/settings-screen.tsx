import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import { Linking, Platform, StyleSheet, Text, View } from 'react-native';

import { Icon, PressScale, WorkflowError, type CustomerSettings } from '@/features/shared';
import { appearances, languages, type Appearance, type Language } from '@/lib/preferences';
import { usePreferences } from '@/lib/preferences-provider';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

import { ThemeSwitch } from './theme-switch';
import { ConfirmMorph } from './confirm-morph';
import { DataExportView, type DataExportApi } from './data-export-view';
import type { AiConsent } from './use-ai-consent';
import { AccountDeletionView, type AccountDeletionApi } from './account-deletion-view';
import type { UserProfile } from './content';
import { legalDocument, type LegalDocumentId } from './legal-content';
import { LiquidSwitch } from './liquid-switch';
import { ProfileAvatar } from './profile-avatar';
import { settingsStrings, type SettingsStrings } from './settings-strings';
import { SupportCard, SupportRow, SupportSection, SupportShell, supportStyles } from './support-shell';

const metrics = horizonLayout.supportScreens;
const colors = horizonColors.supportScreens;

type ToggleId = keyof CustomerSettings;
type ScreenView = 'main' | 'language' | 'appearance' | 'clear' | 'deleteAccount' | 'export' | LegalDocumentId;

function dateFormatter(language: Language) {
  const locale = language === 'en' ? 'en-GB' : 'vi-VN';
  return (iso: string) => new Date(iso).toLocaleDateString(locale);
}

export const defaultSettings: CustomerSettings = { push: true, quotes: true, messages: true, promotions: false, reduce_motion: false };

type Props = {
  onBack: () => void;
  profile?: UserProfile;
  onEditProfile?: () => void;
  settings?: CustomerSettings;
  onChangeSettings?: (next: CustomerSettings) => Promise<void>;
  onClearHistory?: () => Promise<void>;
  accountDeletion?: AccountDeletionApi;
  aiConsent?: AiConsent;
  dataExport?: DataExportApi;
};

function OptionList<T extends string>({ options, labels, value, onSelect, note, strings }: { options: readonly T[]; labels: Record<T, string>; value: T; onSelect: (next: T) => void; note: string; strings: SettingsStrings }) {
  return (
    <>
      <SupportSection>
        <SupportCard>
          {options.map(option => (
            <PressScale key={option} accessibilityRole="radio" accessibilityLabel={labels[option]} accessibilityState={{ selected: option === value }} onPress={() => onSelect(option)} style={styles.option}>
              <Text style={styles.optionLabel}>{labels[option]}</Text>
              {option === value ? <Icon name="check" size={metrics.chevronSize} /> : null}
            </PressScale>
          ))}
        </SupportCard>
      </SupportSection>
      <Text style={styles.note}>{note}</Text>
    </>
  );
}

function LegalView({ id, language, strings, onBack }: { id: LegalDocumentId; language: Language; strings: SettingsStrings; onBack: () => void }) {
  const document = legalDocument(language, id);
  return (
    <SupportShell backLabel={strings.back} title={document.title} subtitle={document.version} onBack={onBack}>
      <View style={styles.notice}><Text style={styles.noticeText}>{document.notice}</Text></View>
      {document.summary.length > 0 ? (
        <SupportSection title={strings.legalSummary}>
          <SupportCard>
            {document.summary.map(line => <Text key={line} style={styles.summaryLine}>{line}</Text>)}
          </SupportCard>
        </SupportSection>
      ) : null}
      {document.sections.map(section => (
        <SupportSection key={section.heading} title={section.heading}>
          {section.paragraphs.map(paragraph => <Text key={paragraph} style={styles.paragraph}>{paragraph}</Text>)}
        </SupportSection>
      ))}
    </SupportShell>
  );
}

type ClearState = { status: 'idle' | 'busy' | 'done'; error: string | null };

function ClearHistoryView({ strings, onClear, onBack }: { strings: SettingsStrings; onClear?: () => Promise<void>; onBack: () => void }) {
  const [state, setState] = useState<ClearState>({ status: 'idle', error: null });
  const confirm = async () => {
    if (!onClear || state.status === 'busy') return;
    setState({ status: 'busy', error: null });
    try {
      await onClear();
      setState({ status: 'done', error: null });
    } catch (error) {
      setState({ status: 'idle', error: error instanceof WorkflowError && error.failure === 'unavailable' ? strings.clearActive : strings.clearFailed });
      throw error;
    }
  };
  return (
    <SupportShell backLabel={strings.back} title={strings.clearTitle} onBack={onBack}>
      {state.status === 'done' ? (
        <Text accessibilityLiveRegion="polite" style={styles.paragraph}>{strings.clearDone}</Text>
      ) : (
        <>
          <Text style={styles.paragraph}>{strings.clearBody}</Text>
          {!onClear ? <Text accessibilityLiveRegion="polite" style={styles.error}>{strings.clearSignedOut}</Text> : null}
          {state.error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{state.error}</Text> : null}
          <View style={styles.actions}>
            <ConfirmMorph
              mode="hold"
              label={strings.clearConfirm}
              accessibilityLabel={strings.clearConfirm}
              prompt={strings.holdPrompt}
              confirmLabel={strings.holdConfirm}
              cancelLabel={strings.holdCancel}
              pendingLabel={strings.clearBusy}
              errorLabel={strings.clearFailed}
              retryLabel={strings.holdRetry}
              disabled={!onClear || state.status === 'busy'}
              onConfirm={confirm}
            />
            <PressScale accessibilityRole="button" accessibilityLabel={strings.clearCancel} onPress={onBack} style={supportStyles.secondary}>
              <Text style={supportStyles.secondaryLabel}>{strings.clearCancel}</Text>
            </PressScale>
          </View>
        </>
      )}
    </SupportShell>
  );
}

export function SettingsScreen({ onBack, profile, onEditProfile, settings, onChangeSettings, onClearHistory, accountDeletion, aiConsent, dataExport }: Props) {
  const preferences = usePreferences();
  const strings = settingsStrings(preferences.language);
  const [toggles, setToggles] = useState<CustomerSettings>(settings ?? defaultSettings);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [view, setView] = useState<ScreenView>('main');
  const [locationError, setLocationError] = useState(false);
  const syncedMotion = settings?.reduce_motion;
  const { update, resolvedAppearance } = preferences;

  useEffect(() => {
    if (syncedMotion !== undefined) update({ reduceMotion: syncedMotion });
  }, [syncedMotion, update]);

  const toggle = (id: ToggleId) => {
    if (saving) return;
    const previous = toggles;
    const next = { ...toggles, [id]: !toggles[id] };
    setToggles(next);
    if (id === 'reduce_motion') update({ reduceMotion: next.reduce_motion });
    if (!onChangeSettings) return;
    setSaving(true);
    setSaveError(null);
    onChangeSettings(next).then(
      () => setSaving(false),
      () => {
        setToggles(previous);
        if (id === 'reduce_motion') update({ reduceMotion: previous.reduce_motion });
        setSaving(false);
        setSaveError(strings.saveError);
      },
    );
  };
  const switchFor = (id: ToggleId, label: string) => (
    <LiquidSwitch accessibilityLabel={label} value={toggles[id]} onValueChange={() => toggle(id)} />
  );
  const openLocationSettings = () => {
    setLocationError(false);
    Linking.openSettings().catch(() => setLocationError(true));
  };
  const [aiError, setAiError] = useState(false);
  const toggleAiSharing = () => {
    if (!aiConsent || aiConsent.status !== 'ready') return;
    setAiError(false);
    aiConsent.set(!aiConsent.granted).catch(() => setAiError(true));
  };
  const toMain = () => setView('main');

  if (view === 'terms' || view === 'privacy') return <LegalView id={view} language={preferences.language} strings={strings} onBack={toMain} />;
  if (view === 'deleteAccount') return <AccountDeletionView api={accountDeletion} strings={strings} formatDate={dateFormatter(preferences.language)} onBack={toMain} />;
  if (view === 'export') return <DataExportView api={dataExport} strings={strings} onBack={toMain} />;
  if (view === 'clear') return <ClearHistoryView strings={strings} onClear={onClearHistory} onBack={toMain} />;
  if (view === 'language') {
    return (
      <SupportShell backLabel={strings.back} title={strings.language} onBack={toMain}>
        <OptionList<Language> options={languages} labels={strings.languageNames} value={preferences.language} onSelect={language => update({ language })} note={strings.languageNote} strings={strings} />
      </SupportShell>
    );
  }
  if (view === 'appearance') {
    return (
      <SupportShell backLabel={strings.back} title={strings.appearance} onBack={toMain}>
        <ThemeSwitch theme={resolvedAppearance} onThemeChange={appearance => update({ appearance })} label={resolvedAppearance === 'dark' ? strings.themeToLight : strings.themeToDark} accessibilityLabel={resolvedAppearance === 'dark' ? strings.themeToLight : strings.themeToDark} />
        <OptionList<Appearance> options={appearances} labels={strings.appearanceNames} value={preferences.appearance} onSelect={appearance => update({ appearance })} note={strings.appearanceNote} strings={strings} />
      </SupportShell>
    );
  }

  return (
    <SupportShell backLabel={strings.back} title={strings.title} onBack={onBack}>
      {profile && onEditProfile ? (
        <SupportSection>
          <SupportCard>
            <PressScale accessibilityRole="button" accessibilityLabel={strings.profileLabel(profile.name)} onPress={onEditProfile} style={styles.profile}>
              <ProfileAvatar name={profile.name} uri={profile.avatarUri} headers={profile.avatarHeaders} size={metrics.profileAvatarSize} initialSize={metrics.profileAvatarInitialSize} />
              <View style={styles.profileCopy}>
                <Text numberOfLines={1} style={styles.profileName}>{profile.name}</Text>
                <Text numberOfLines={1} style={styles.profileDetail}>{profile.email || profile.phone}</Text>
              </View>
              <Text style={styles.profileAction}>{strings.editProfile}</Text>
            </PressScale>
          </SupportCard>
        </SupportSection>
      ) : null}
      <SupportSection title={strings.notifications}>
        {saveError ? <Text accessibilityLiveRegion="polite" style={styles.error}>{saveError}</Text> : null}
        <SupportCard>
          <SupportRow icon="bell" title={strings.push} detail={strings.pushDetail} trailing={switchFor('push', strings.push)} />
          <SupportRow icon="receipt" title={strings.quotes} trailing={switchFor('quotes', strings.quotes)} />
          <SupportRow icon="chat" title={strings.messages} trailing={switchFor('messages', strings.messages)} />
          <SupportRow icon="star" title={strings.promotions} trailing={switchFor('promotions', strings.promotions)} />
        </SupportCard>
      </SupportSection>
      <SupportSection title={strings.general}>
        <SupportCard>
          <SupportRow icon="globe" title={strings.language} detail={strings.languageNames[preferences.language]} onPress={() => setView('language')} />
          <SupportRow icon="eye" title={strings.appearance} detail={strings.appearanceNames[preferences.appearance]} onPress={() => setView('appearance')} />
          <SupportRow icon="bolt" title={strings.reduceMotion} trailing={switchFor('reduce_motion', strings.reduceMotion)} />
        </SupportCard>
      </SupportSection>
      <SupportSection title={strings.privacy}>
        {locationError ? <Text accessibilityLiveRegion="polite" style={styles.error}>{strings.locationOpenFailed}</Text> : null}
        {aiError ? <Text accessibilityLiveRegion="polite" style={styles.error}>{strings.aiShareFailed}</Text> : null}
        {aiConsent ? <View style={styles.notice}>
          <Text style={styles.noticeText}>{strings.consentTitle}</Text>
          {strings.consentBody.map(paragraph => <Text key={paragraph} style={styles.noticeText}>{paragraph}</Text>)}
        </View> : null}
        <SupportCard>
          {Platform.OS === 'web' ? null : <SupportRow icon="home" title={strings.location} detail={strings.locationDetail} onPress={openLocationSettings} />}
          {aiConsent ? <SupportRow icon="chat" title={strings.aiShare} detail={aiConsent.status === 'loading' ? strings.aiShareLoading : strings.aiShareDetail} trailing={<LiquidSwitch accessibilityLabel={strings.aiShare} value={aiConsent.granted} onValueChange={toggleAiSharing} />} /> : null}
          <SupportRow icon="requests" title={strings.exportData} onPress={() => setView('export')} />
          <SupportRow icon="trash" title={strings.clearHistory} danger onPress={() => setView('clear')} />
          <SupportRow icon="user" title={strings.deleteAccount} danger onPress={() => setView('deleteAccount')} />
        </SupportCard>
      </SupportSection>
      <SupportSection title={strings.about}>
        <SupportCard>
          <SupportRow icon="requests" title={strings.terms} onPress={() => setView('terms')} />
          <SupportRow icon="eye" title={strings.privacyPolicy} onPress={() => setView('privacy')} />
          <SupportRow icon="help" title={strings.version} detail={Constants.expoConfig?.version ?? ''} />
        </SupportCard>
      </SupportSection>
    </SupportShell>
  );
}

const styles = StyleSheet.create({
  profile: { minHeight: metrics.rowMinHeight, flexDirection: 'row', alignItems: 'center', gap: metrics.rowGap, paddingHorizontal: metrics.rowPaddingHorizontal, paddingVertical: metrics.rowPaddingVertical },
  profileCopy: { flex: 1, minWidth: 0 },
  profileName: { color: horizonColors.text, fontSize: metrics.profileNameSize, fontWeight: metrics.rowTitleWeight },
  profileDetail: { color: horizonColors.muted, fontSize: metrics.rowDetailSize, lineHeight: metrics.rowDetailLineHeight, marginTop: metrics.rowDetailGap },
  error: { color: colors.danger, fontSize: metrics.rowDetailSize, lineHeight: metrics.rowDetailLineHeight, marginBottom: metrics.sectionTitleGap, marginLeft: metrics.sectionTitleInset },
  profileAction: { color: colors.actionLabel, fontSize: metrics.rowDetailSize, fontWeight: metrics.heroChipWeight },
  option: { minHeight: metrics.rowMinHeight, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: metrics.rowPaddingHorizontal, paddingVertical: metrics.rowPaddingVertical },
  optionLabel: { color: horizonColors.text, fontSize: metrics.rowTitleSize, fontWeight: metrics.rowTitleWeight },
  note: { color: horizonColors.muted, fontSize: metrics.rowDetailSize, lineHeight: metrics.rowDetailLineHeight, marginLeft: metrics.sectionTitleInset },
  notice: { borderRadius: metrics.cardRadius, backgroundColor: colors.cardFill, padding: metrics.rowPaddingHorizontal, marginBottom: metrics.sectionGap },
  noticeText: { color: horizonColors.muted, fontSize: metrics.rowDetailSize, lineHeight: metrics.rowDetailLineHeight },
  summaryLine: { color: horizonColors.text, fontSize: metrics.rowDetailSize, lineHeight: metrics.rowDetailLineHeight, paddingHorizontal: metrics.rowPaddingHorizontal, paddingVertical: metrics.rowPaddingVertical },
  paragraph: { color: horizonColors.text, fontSize: metrics.rowDetailSize, lineHeight: metrics.rowDetailLineHeight, marginBottom: metrics.sectionTitleGap, marginLeft: metrics.sectionTitleInset },
  actions: { gap: metrics.rowGap, marginTop: metrics.sectionGap },
  danger: { backgroundColor: colors.danger },
});
