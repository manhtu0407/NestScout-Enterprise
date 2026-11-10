import { horizonLayout } from '@/theme/layout';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect, useRouter } from 'expo-router';
import { EntryRedirect, useAccess } from '@/features/access';
import { Sidebar } from './sidebar';
import { Icon } from '@/features/shared';
import { KaelHomeScreen } from './kael-home-screen';
import { KaelMemorySettings } from './kael-memory-settings';
import { kaelIntroSession } from './kael-intro-session';
import type { ComposerImage } from './composer-media';
import { KaelHomeLoading } from './skeleton-layouts';
import { Presence, useRetained } from './motion-presence';
import { horizonColors, horizonColors as colors } from '@/theme/palette';
import { deriveKaelAttention } from './kael-attention';
import type { KaelAttention } from './kael-attention';
import { KaelAttentionCard } from './kael-attention-card';
import { countActionableQuotes, countUnreadNotifications } from './request-views';
import { useCustomerData } from './use-customer-data';
import { useWorkerData } from './use-worker-data';
import { workerBadgesFor } from './worker-jobs';
import { toWorkerJobs, toWorkerProfileView } from './worker-views';
import { useKaelConversation, type KaelChatMessage } from './use-kael-conversation';
import { useAiConsent } from './use-ai-consent';
import { settingsStrings } from './settings-strings';
import { usePreferences } from '@/lib/preferences-provider';
import { consumeSidebarReturn, markSidebarReturn } from './sidebar-return';
import { consumeKaelHandoff, isFreshKaelHandoff } from './kael-handoff';
import { useKaelSessions } from './use-kael-sessions';
import type { KaelSessionsPanel } from './kael-sessions-section';
import type { ServiceKey } from './service-catalog';

const renderPending = (label: string) => <KaelHomeLoading label={label}/>;

export function HorizonEntry({ onPreviewMenu }: { onPreviewMenu?: () => void } = {}) {
  const router = useRouter();
  const access = useAccess();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [memoryScope, setMemoryScope] = useState<string | null>(null);
  const [input, setInput] = useState(access.horizonDraft?.text ?? '');
  const [draftImages, setDraftImages] = useState<readonly ComposerImage[]>(() => access.horizonDraft?.images ?? []);
  const inputRef = useRef(input);
  const imagesRef = useRef(draftImages);
  const [conversationKey, setConversationKey] = useState(0);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [dataNotice, setDataNotice] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const customerUserId = !onPreviewMenu && access.phase === 'client' && access.identity === 'verified' ? access.userId : null;
  const customer = useCustomerData(customerUserId);
  const { data } = customer;
  const workerUserId = !onPreviewMenu && access.phase === 'worker' && access.identity === 'verified' ? access.userId : null;
  const worker = useWorkerData(workerUserId);
  const kaelUserId = (access.phase === 'client' || access.phase === 'worker') && access.identity === 'verified' ? access.userId : null;
  const kaelMode = access.phase === 'worker' ? 'worker' : 'client';
  const kael = useKaelConversation(kaelUserId, kaelMode);
  const sessions = useKaelSessions(kaelUserId, kaelMode, drawerOpen, `${kael.conversationId ?? 'new'}:${kael.running}`);
  const draftsRef = useRef(new Map<string, string>());
  const aiConsent = useAiConsent(kaelUserId);
  const consentStrings = settingsStrings(usePreferences().language);
  const scope = kaelUserId === null ? null : `${kaelUserId}:${kaelMode}`;
  const [previousScope, setPreviousScope] = useState(scope);
  if (previousScope !== scope) {
    setPreviousScope(scope);
    setMemoryScope(null);
  }
  const [clock, setClock] = useState(() => Date.now());
  const [dismissedReceipt, setDismissedReceipt] = useState<string | null>(null);
  const [attentionHeight, setAttentionHeight] = useState(0);
  const approvals = onPreviewMenu ? [] : kael.approvals;
  const counting = approvals.some(approval => approval.kind === 'confirm' && approval.expires_at !== null);
  useEffect(() => {
    if (!counting) return;
    const timer = setInterval(() => setClock(Date.now()), horizonLayout.kaelAttention.countdownTick);
    return () => clearInterval(timer);
  }, [counting]);
  const badges = useMemo(() => ({
    quotes: countActionableQuotes(data.requests, data.quotes, now),
    notifications: countUnreadNotifications(data.notifications),
    ...(workerUserId === null ? {} : { ...workerBadgesFor(toWorkerJobs(worker.data.snapshot, worker.data.cards, now)), 'worker-notifications': countUnreadNotifications(worker.data.notifications) }),
  }), [data, now, workerUserId, worker.data]);

  const workerProfile = useMemo(() => {
    if (access.phase !== 'worker') return undefined;
    if (workerUserId === null || !worker.loaded) return 'loading' as const;
    const view = toWorkerProfileView(worker.data.profile, now);
    return view === null ? null : { area: view.area, radiusKm: view.radiusKm, accepting: view.accepting, missing: view.missing };
  }, [access.phase, now, worker.data.profile, worker.loaded, workerUserId]);

  const setAccepting = useCallback(async (accepting: boolean) => {
    try {
      await worker.performProfile({ type: 'accepting', accepting });
    } catch {
      setDataNotice('Chưa lưu được trạng thái nhận việc. Vui lòng thử lại.');
      throw new Error('accepting not saved');
    }
  }, [worker]);

  const openMenu = useCallback(() => {
    setNow(new Date());
    customer.refresh();
    worker.refresh();
    setDrawerOpen(true);
  }, [customer, worker]);

  const openMenuRef = useRef(openMenu);
  useEffect(() => { openMenuRef.current = openMenu; });
  const startFreshRef = useRef(() => undefined as void);
  const adoptPromptRef = useRef((prompt: string) => { inputRef.current = prompt; setInput(prompt); });
  useEffect(() => {
    adoptPromptRef.current = prompt => {
      inputRef.current = prompt;
      setInput(prompt);
      access.updateHorizonDraft(access.userId, { text: prompt, images: imagesRef.current });
    };
  });
  useFocusEffect(useCallback(() => {
    const startsFresh = isFreshKaelHandoff();
    const prompt = consumeKaelHandoff();
    if (prompt !== null) {
      consumeSidebarReturn();
      if (startsFresh) startFreshRef.current();
      adoptPromptRef.current(prompt);
      return undefined;
    }
    if (!consumeSidebarReturn()) return undefined;
    const timer = setTimeout(() => openMenuRef.current(), horizonLayout.sidebar.returnDelay);
    return () => clearTimeout(timer);
  }, []));

  const resetKael = kael.reset;
  const conversationId = kael.conversationId;
  const stashDraft = useCallback(() => {
    const key = conversationId ?? 'new';
    if (inputRef.current.trim() === '') draftsRef.current.delete(key);
    else draftsRef.current.set(key, inputRef.current);
  }, [conversationId]);
  const loadDraft = useCallback((key: string) => {
    const text = draftsRef.current.get(key) ?? '';
    inputRef.current = text;
    setInput(text);
  }, []);
  const newConversation = useCallback(() => {
    stashDraft();
    resetKael();
    loadDraft('new');
    imagesRef.current = [];
    setDraftImages([]);
    access.clearHorizonDraft(access.userId);
    setConversationKey(key => key + 1);
    setComposerError(null);
    setDrawerOpen(false);
  }, [access, loadDraft, resetKael, stashDraft]);
  useEffect(() => {
    startFreshRef.current = () => {
      stashDraft();
      resetKael();
      imagesRef.current = [];
      setDraftImages([]);
      setConversationKey(key => key + 1);
      setComposerError(null);
    };
  });

  const openKaelSession = kael.openSession;
  const refreshSessions = sessions.refresh;
  const openSession = useCallback(async (id: string) => {
    if (id === conversationId) {
      setDrawerOpen(false);
      return;
    }
    stashDraft();
    const result = await openKaelSession(id);
    if (result === 'superseded') return;
    if (result === 'opened') {
      loadDraft(id);
      imagesRef.current = [];
      setDraftImages([]);
      setConversationKey(key => key + 1);
      setComposerError(null);
      setDrawerOpen(false);
      return;
    }
    setDataNotice(result === 'not_found' ? 'Cuộc trò chuyện này không còn nữa.' : 'Chưa mở được cuộc trò chuyện. Vui lòng thử lại.');
    void refreshSessions();
  }, [conversationId, loadDraft, openKaelSession, refreshSessions, stashDraft]);

  const removeSession = sessions.remove;
  const deleteSession = useCallback(async (id: string) => {
    const result = await removeSession(id);
    if (result === 'deleted' || result === 'not_found') {
      draftsRef.current.delete(id);
      if (id === conversationId) {
        resetKael();
        loadDraft('new');
        setConversationKey(key => key + 1);
      }
    }
    return result;
  }, [conversationId, loadDraft, removeSession, resetKael]);

  const openService = useCallback((key: ServiceKey) => {
    setDrawerOpen(false);
    markSidebarReturn();
    router.push({ pathname: '/service', params: { key } });
  }, [router]);

  const sessionsPanel: KaelSessionsPanel | undefined = kaelUserId === null ? undefined : {
    pinned: sessions.pinned,
    items: sessions.items,
    hasMore: sessions.hasMore,
    status: sessions.status,
    loadingMore: sessions.loadingMore,
    search: sessions.search,
    archivedView: sessions.archivedView,
    activeId: conversationId,
    now,
    onSearch: sessions.setSearch,
    onArchivedView: sessions.setArchivedView,
    onOpen: id => { void openSession(id); },
    onRetry: () => { void sessions.refresh(); },
    onLoadMore: () => { void sessions.loadMore(); },
    onRename: sessions.rename,
    onPin: sessions.pin,
    onArchive: sessions.archive,
    onDelete: deleteSession,
  };

  const sendToKael = kael.send;
  const kaelAvailable = kael.available;
  const kaelRunning = kael.running;
  const aiConsentGranted = aiConsent.granted;
  const aiConsentStatus = aiConsent.status;
  const consentCheckingMessage = consentStrings.consentChecking;
  const consentFailedMessage = consentStrings.consentFailed;
  const consentNeededMessage = consentStrings.consentNeeded;
  const deliver = useCallback(() => {
    const text = inputRef.current.trim();
    if (!text) return;
    setComposerError(null);
    sendToKael(text);
    setInput('');
    inputRef.current = '';
    access.clearHorizonDraft(access.userId);
  }, [access, sendToKael]);
  const [consentBusy, setConsentBusy] = useState(false);
  const setAiConsent = aiConsent.set;
  const allowAi = useCallback(() => {
    setConsentBusy(true);
    setAiConsent(true).then(() => setComposerError(null), () => setComposerError(consentFailedMessage)).finally(() => setConsentBusy(false));
  }, [consentFailedMessage, setAiConsent]);
  const consentCard = kaelAvailable && aiConsentStatus === 'ready' && !aiConsentGranted
    ? { lead: consentStrings.consentCardLead, action: consentStrings.consentCardAction, busy: consentBusy, onAllow: allowAi }
    : null;
  const refuseWithoutConsent = useCallback(() => {
    if (aiConsentStatus === 'ready') setComposerError(consentNeededMessage);
    else setComposerError(aiConsentStatus === 'error' ? consentFailedMessage : consentCheckingMessage);
  }, [aiConsentStatus, consentCheckingMessage, consentFailedMessage, consentNeededMessage]);
  const sendText = useCallback((text: string) => {
    if (!kaelAvailable || kaelRunning) return;
    if (!aiConsentGranted) {
      refuseWithoutConsent();
      return;
    }
    sendToKael(text);
  }, [aiConsentGranted, kaelAvailable, kaelRunning, refuseWithoutConsent, sendToKael]);
  const regenerate = useCallback((message: KaelChatMessage) => {
    const index = kael.messages.findIndex(item => item.id === message.id);
    const prompt = kael.messages.slice(0, index).reverse().find(item => item.role === 'user');
    if (prompt && !/^(Xác nhận|Không thực hiện|Kiểm tra lại): /.test(prompt.text)) sendText(prompt.text);
  }, [kael.messages, sendText]);
  const sendMessage = useCallback((images: readonly ComposerImage[]) => {
    if (images.length > 0) {
      setComposerError('Ảnh chưa được gửi vì chức năng phân tích ảnh chưa được kết nối.');
      return;
    }
    if (!kaelAvailable) {
      setComposerError('Đăng nhập để trò chuyện với Kael. Tin nhắn của bạn chưa được gửi.');
      return;
    }
    if (kaelRunning) {
      setComposerError('Kael đang trả lời tin nhắn trước. Vui lòng đợi trong giây lát.');
      return;
    }
    if (!aiConsentGranted) {
      refuseWithoutConsent();
      return;
    }
    deliver();
  }, [aiConsentGranted, deliver, kaelAvailable, kaelRunning, refuseWithoutConsent]);

  const navigate = useCallback((id: string) => {
    setDrawerOpen(false);
    if (id === 'home' || id === 'new') {
      newConversation();
      return;
    }
    markSidebarReturn();
    if (id === 'requests') router.push('/requests');
    else router.push({ pathname: '/section', params: { id } });
  }, [newConversation, router]);

  const accessMessage = access.notice === null ? null : access.notice === 'worker_unavailable'
    ? 'Không thể chuyển sang vai trò Thợ vì tài khoản chưa có quyền.'
    : 'Chưa thể xác minh quyền Thợ. Bạn có thể thử lại.';
  const noticeMessage = useRetained(accessMessage ?? dataNotice);
  const dismissNotice = () => { access.dismissNotice(); setDataNotice(null); };
  const accountNoticeVisible = access.notice !== null || dataNotice !== null;
  const attention = accountNoticeVisible ? null : deriveKaelAttention({ approvals, tasks: kael.tasks, running: kael.running, notice: kael.notice, receipt: kael.receipt, dismissedReceipt, now: clock });
  const onAttentionAction = (item: KaelAttention) => { if (item.kind === 'receipt') setDismissedReceipt(item.receiptId); };

  if (access.phase === 'bootstrapping' || access.phase === 'resolving') return <EntryRedirect pending={renderPending}/>;

  return <>
    <StatusBar style="dark"/>
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Presence visible={access.notice !== null || dataNotice !== null} style={styles.noticeSlot}>
          <View accessibilityLiveRegion="polite" style={styles.notice}>
            <Text style={styles.noticeText}>{noticeMessage}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Đóng thông báo" onPress={dismissNotice} style={styles.noticeAction}><Icon name="close" size={18}/></Pressable>
          </View>
        </Presence>
        <KaelAttentionCard attention={attention} onAction={onAttentionAction} onHeight={setAttentionHeight}/>
        <KaelHomeScreen input={input} onInput={value => { inputRef.current = value; setInput(value); access.updateHorizonDraft(access.userId, { text: value, images: imagesRef.current }); setComposerError(null); }} onSubmit={sendMessage} question={onPreviewMenu ? null : kael.question} onAnswer={sendText} onRate={onPreviewMenu ? undefined : kael.rate} onRegenerate={regenerate} onNew={newConversation} onMenu={onPreviewMenu ?? openMenu} onMemory={scope === null ? undefined : () => setMemoryScope(scope)} messages={kael.messages} activity={kael.activity} tasks={kael.tasks} approvals={kael.approvals} busy={kael.running} processingTaskId={kael.processingTaskId} topInset={attention === null ? 0 : attentionHeight} consent={consentCard} onDecide={onPreviewMenu ? undefined : kael.decide} composerError={composerError ?? kael.notice} onClearComposerError={() => { setComposerError(null); kael.dismissNotice(); }} conversationKey={conversationKey} draftImages={draftImages} onDraftImagesChange={images => { imagesRef.current = images; setDraftImages(images); access.updateHorizonDraft(access.userId, { text: inputRef.current, images }); }}/>
      </KeyboardAvoidingView>
    </SafeAreaView>
    {kaelUserId !== null && scope === memoryScope && <KaelMemorySettings key={scope} userId={kaelUserId} mode={kaelMode} onClose={() => setMemoryScope(null)}/>}
    {!onPreviewMenu && <Sidebar visible={drawerOpen} onClose={() => setDrawerOpen(false)} onNavigate={navigate} sessions={sessionsPanel} onOpenService={openService} profileName={data.profile?.display_name || undefined} profileAvatarUri={data.avatar?.uri} profileAvatarHeaders={data.avatar?.headers} badges={badges} workerProfile={workerProfile} onSetAccepting={setAccepting} mode={access.phase === 'worker' ? 'worker' : access.phase === 'guest' ? 'guest' : 'client'} modePending={access.pendingMode === 'worker'} modeNotice={access.notice} onModeSelect={mode => {
      if (access.phase === 'guest') {
        kaelIntroSession.markPlayed();
        access.prepareHorizonDraftTransfer({ text: inputRef.current, images: imagesRef.current });
        access.setIntent(mode);
        setDrawerOpen(false);
        router.push({ pathname: '/phone', params: { role: mode } });
      } else access.switchMode(mode);
    }} onModeCancel={access.cancelModeRequest} onDismissModeNotice={access.dismissNotice}/>}
  </>;
}


export function HorizonRoute({ onPreviewMenu }: { onPreviewMenu?: () => void } = {}) {
  const access = useAccess();
  if (access.phase === 'bootstrapping' || access.phase === 'resolving') return <EntryRedirect pending={renderPending}/>;
  if (access.horizonDraftLocked) return <SafeAreaView style={styles.locked}>
    <Text style={styles.lockedTitle}>Không thể mở bản nháp</Text>
    <Text style={styles.lockedBody}>Cần xác minh tài khoản trước khi khôi phục bản nháp.</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="Thử xác minh lại" disabled={access.identityPending} onPress={access.recheck} style={styles.lockedAction}><Text style={styles.lockedActionText}>{access.identityPending ? 'Đang xác minh…' : 'Thử lại'}</Text></Pressable>
  </SafeAreaView>;
  return <HorizonEntry key={access.userId ?? 'guest'} onPreviewMenu={onPreviewMenu} />;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  fill: { flex: 1 },
  locked: { flex: 1, backgroundColor: colors.bg, padding: horizonLayout.horizonEntry.placeholderPadding, justifyContent: 'center' },
  lockedTitle: { fontSize: horizonLayout.horizonEntry.placeholderTitleFontSize, color: colors.label, fontWeight: horizonLayout.horizonEntry.placeholderTitleFontWeight },
  lockedBody: { color: colors.muted, marginTop: horizonLayout.horizonEntry.placeholderBodyMarginTop, fontSize: horizonLayout.horizonEntry.placeholderBodyFontSize, lineHeight: horizonLayout.horizonEntry.placeholderBodyLineHeight },
  lockedAction: { marginTop: horizonLayout.horizonEntry.placeholderBodyMarginTop, minHeight: horizonLayout.modePicker.closeSize, justifyContent: 'center' },
  lockedActionText: { color: colors.mint, fontSize: horizonLayout.horizonEntry.placeholderBodyFontSize },
  noticeSlot: { position: 'absolute', top: horizonLayout.kaelHomeScreen.navHeight, left: 0, right: 0, zIndex: 1 },
  notice: { backgroundColor: horizonColors.horizonEntry.noticeSurface, paddingHorizontal: horizonLayout.horizonEntry.noticePadding, gap: horizonLayout.horizonEntry.noticeGap, flexDirection: 'row', alignItems: 'center' },
  noticeText: { color: horizonColors.horizonEntry.noticeText, fontSize: horizonLayout.horizonEntry.noticeTextSize, lineHeight: horizonLayout.horizonEntry.noticeLineHeight, flex: 1 },
  noticeAction: { width: horizonLayout.horizonEntry.noticeActionSize, height: horizonLayout.horizonEntry.noticeActionSize, alignItems: 'center', justifyContent: 'center' },
});
