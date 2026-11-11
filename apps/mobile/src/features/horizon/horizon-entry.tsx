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
import { createComposerDrafts, emptyComposerDraft, isEmptyDraft } from './composer-drafts';
import { KaelHomeLoading } from './skeleton-layouts';
import { Presence, useRetained } from './motion-presence';
import { horizonColors, horizonColors as colors } from '@/theme/palette';
import { deriveKaelAttention } from './kael-attention';
import type { KaelAttention } from './kael-attention';
import { KaelAttentionCard } from './kael-attention-card';
import { countActionableQuotes, countUnreadNotifications, toNotificationItems, toRequestViews } from './request-views';
import { pickProgressJob, pickProgressRequest, progressForRequest, progressForWorkerJob } from './kael-progress';
import type { KaelProgress } from './kael-progress';
import { NotificationBanner } from './notification-banner';
import type { BannerNotice } from './notification-banner-model';
import { useNotificationBanner } from './use-notification-banner';
import { toSessionRows } from './session-views';
import { useKaelSessions } from './use-kael-sessions';
import type { SessionHandlers } from './sidebar';
import { useCustomerData } from './use-customer-data';
import { useWorkerData } from './use-worker-data';
import { workerBadgesFor } from './worker-jobs';
import { toWorkerJobs, toWorkerProfileView } from './worker-views';
import { useKaelConversation, type KaelChatMessage } from './use-kael-conversation';
import { useAiConsent } from './use-ai-consent';
import { settingsStrings } from './settings-strings';
import { usePreferences } from '@/lib/preferences-provider';
import { consumeSidebarReturn, markSidebarReturn } from './sidebar-return';
import { takeKaelHandoff } from './kael-handoff';
import { guestSendNotice, planServiceEntry } from './service-entry';

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
  const sessions = useKaelSessions(kaelUserId, kaelMode, drawerOpen && access.phase === 'client');
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
  const recentSessions = useMemo(() => toSessionRows(sessions.sessions, now), [sessions.sessions, now]);
  const badges = useMemo(() => ({
    quotes: countActionableQuotes(data.requests, data.quotes, now),
    notifications: countUnreadNotifications(data.notifications),
    ...(workerUserId === null ? {} : { ...workerBadgesFor(toWorkerJobs(worker.data.snapshot, worker.data.cards, now)), 'worker-notifications': countUnreadNotifications(worker.data.notifications) }),
  }), [data, now, workerUserId, worker.data]);

  const requestProgress = useMemo<KaelProgress | null>(() => {
    if (access.phase === 'worker') {
      const job = pickProgressJob(toWorkerJobs(worker.data.snapshot, worker.data.cards, now));
      return job === null ? null : progressForWorkerJob(job);
    }
    const request = pickProgressRequest(toRequestViews({ requests: data.requests, quotes: data.quotes, activity: data.activity, workers: data.jobWorkers, photos: data.photos }, now));
    return request === null ? null : progressForRequest(request);
  }, [access.phase, data, now, worker.data.cards, worker.data.snapshot]);
  const bannerSource = access.phase === 'worker' ? worker.data.notifications : data.notifications;
  const bannerItems = useMemo(() => toNotificationItems(bannerSource, new Date()), [bannerSource]);
  const bannerReady = access.phase === 'worker' ? workerUserId !== null && worker.loaded : customerUserId !== null && customer.loaded;
  const { notice: bannerNotice, dismiss: dismissBanner, hold: holdBanner } = useNotificationBanner(bannerItems, bannerReady, scope);
  const bannerSection = access.phase === 'worker' ? 'worker-notifications' : 'notifications';
  const openBanner = useCallback((notice: BannerNotice) => {
    dismissBanner(notice.id);
    router.push({ pathname: '/section', params: { id: bannerSection } });
  }, [bannerSection, dismissBanner, router]);

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
  const newConversationRef = useRef<() => void>(() => undefined);
  const adoptPromptRef = useRef<(prompt: string, fresh: boolean) => void>(() => undefined);
  useEffect(() => {
    adoptPromptRef.current = (prompt, fresh) => {
      const carried = !fresh || kael.conversationId === null ? inputRef.current : '';
      if (fresh) newConversationRef.current();
      const text = carried.trim() === '' ? prompt : `${carried.trimEnd()}\n\n${prompt}`;
      inputRef.current = text;
      setInput(text);
      access.updateHorizonDraft(access.userId, { text, images: imagesRef.current });
    };
  });

  const [parkedDrafts] = useState(createComposerDrafts);
  useEffect(() => () => parkedDrafts.clear(), [parkedDrafts, scope]);
  const activeConversationId = kael.conversationId;
  const switchDraft = useCallback((targetId: string | null) => {
    const owner = scope ?? 'guest';
    if (activeConversationId !== null) parkedDrafts.park(owner, activeConversationId, { text: inputRef.current, images: imagesRef.current });
    const next = targetId === null ? emptyComposerDraft : parkedDrafts.recall(owner, targetId);
    inputRef.current = next.text;
    imagesRef.current = next.images;
    setInput(next.text);
    setDraftImages(next.images);
    if (isEmptyDraft(next)) access.clearHorizonDraft(access.userId);
    else access.updateHorizonDraft(access.userId, next);
  }, [access, activeConversationId, parkedDrafts, scope]);

  const resetKael = kael.reset;
  const newConversation = useCallback(() => {
    switchDraft(null);
    resetKael();
    setConversationKey(key => key + 1);
    setComposerError(null);
    setDrawerOpen(false);
  }, [resetKael, switchDraft]);

  useEffect(() => { newConversationRef.current = newConversation; });
  const applyServiceEntryRef = useRef<(categoryId: string) => void>(() => undefined);
  useEffect(() => {
    applyServiceEntryRef.current = categoryId => {
      if (access.phase === 'worker') return;
      const plan = planServiceEntry(categoryId, { text: inputRef.current, hasConversation: kael.conversationId !== null || kael.messages.length > 0, canParkDraft: kael.conversationId !== null });
      if (plan === null) return;
      if (plan.kind === 'keep') {
        setComposerError(plan.notice);
        return;
      }
      if (plan.fresh) newConversationRef.current();
      inputRef.current = plan.text;
      setInput(plan.text);
      access.updateHorizonDraft(access.userId, { text: plan.text, images: imagesRef.current });
      setComposerError(null);
    };
  });
  useFocusEffect(useCallback(() => {
    const handoff = takeKaelHandoff();
    if (handoff !== null) {
      consumeSidebarReturn();
      if ('service' in handoff) applyServiceEntryRef.current(handoff.service);
      else adoptPromptRef.current(handoff.prompt, handoff.fresh);
      return undefined;
    }
    if (!consumeSidebarReturn()) return undefined;
    const timer = setTimeout(() => openMenuRef.current(), horizonLayout.sidebar.returnDelay);
    return () => clearTimeout(timer);
  }, []));

  const openKaelSession = kael.open;
  const openSession = useCallback((id: string) => {
    switchDraft(id);
    setDrawerOpen(false);
    setComposerError(null);
    setConversationKey(key => key + 1);
    void openKaelSession(id);
  }, [openKaelSession, switchDraft]);

  const leaveIfActive = useCallback((id: string, discardDraft: boolean) => {
    if (id !== activeConversationId) {
      if (discardDraft) parkedDrafts.discard(scope ?? 'guest', id);
      return;
    }
    if (discardDraft) {
      inputRef.current = '';
      imagesRef.current = [];
    }
    newConversation();
  }, [activeConversationId, newConversation, parkedDrafts, scope]);
  const { rename: renameSession, setPinned: pinSession, setSessionArchived: archiveSession, remove: removeSession, sessions: sessionList } = sessions;
  const sessionHandlers = useMemo<SessionHandlers>(() => ({
    rename: renameSession,
    setPinned: pinSession,
    setArchived: async (id, archived) => {
      const result = await archiveSession(id, archived);
      if (result.ok && archived) leaveIfActive(id, false);
      return result;
    },
    remove: async id => {
      const result = await removeSession(id);
      if (result.ok) leaveIfActive(id, true);
      return result;
    },
  }), [archiveSession, leaveIfActive, pinSession, removeSession, renameSession]);
  const toggleSessionPin = useCallback((id: string) => {
    const pinned = sessionList.find(session => session.id === id)?.pinned ?? false;
    void pinSession(id, !pinned).then(result => { if (!result.ok) setDataNotice('Chưa ghim được cuộc trò chuyện. Vui lòng thử lại.'); });
  }, [pinSession, sessionList]);

  const sendToKael = kael.send;
  const kaelAvailable = kael.available;
  const kaelRunning = kael.running;
  const kaelOpening = kael.opening;
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
  const markConsentRequired = aiConsent.markRequired;
  const serverRequiresConsent = kael.consentRequired;
  useEffect(() => { if (serverRequiresConsent) markConsentRequired(); }, [serverRequiresConsent, markConsentRequired]);
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
    if (!kaelAvailable || kaelRunning || kaelOpening !== null) return;
    if (!aiConsentGranted) {
      refuseWithoutConsent();
      return;
    }
    sendToKael(text);
  }, [aiConsentGranted, kaelAvailable, kaelOpening, kaelRunning, refuseWithoutConsent, sendToKael]);
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
      setComposerError(guestSendNotice);
      return;
    }
    if (kaelOpening !== null) {
      setComposerError(kaelOpening.failed ? 'Chưa mở được cuộc trò chuyện này. Hãy thử lại hoặc bắt đầu cuộc trò chuyện mới.' : 'Đang mở cuộc trò chuyện. Vui lòng đợi trong giây lát.');
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
  }, [aiConsentGranted, deliver, kaelAvailable, kaelOpening, kaelRunning, refuseWithoutConsent]);

  const openService = useCallback((categoryId: string) => {
    setDrawerOpen(false);
    applyServiceEntryRef.current(categoryId);
  }, []);

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
  const openFailed = kael.opening?.failed === true;
  const openingMessage = openFailed ? 'Chưa mở được cuộc trò chuyện này. Bạn có thể thử lại hoặc bắt đầu cuộc trò chuyện mới.' : null;
  const noticeMessage = useRetained(accessMessage ?? dataNotice ?? openingMessage);
  const dismissNotice = () => { access.dismissNotice(); setDataNotice(null); if (openFailed) newConversation(); };
  const accountNoticeVisible = access.notice !== null || dataNotice !== null || openFailed;
  const attention = accountNoticeVisible ? null : deriveKaelAttention({ approvals, tasks: kael.tasks, running: kael.running, notice: kael.notice, receipt: kael.receipt, dismissedReceipt, now: clock });
  const onAttentionAction = (item: KaelAttention) => { if (item.kind === 'receipt') setDismissedReceipt(item.receiptId); };

  if (access.phase === 'bootstrapping' || access.phase === 'resolving') return <EntryRedirect pending={renderPending}/>;

  return <>
    <StatusBar style="dark"/>
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Presence visible={accountNoticeVisible} style={styles.noticeSlot}>
          <View accessibilityLiveRegion="polite" style={styles.notice}>
            <Text style={styles.noticeText}>{noticeMessage}</Text>
            {openFailed && access.notice === null && dataNotice === null && <Pressable accessibilityRole="button" accessibilityLabel="Thử mở lại cuộc trò chuyện" onPress={kael.retryOpen} style={styles.noticeAction}><Text style={styles.noticeText}>Thử lại</Text></Pressable>}
            <Pressable accessibilityRole="button" accessibilityLabel="Đóng thông báo" onPress={dismissNotice} style={styles.noticeAction}><Icon name="close" size={18}/></Pressable>
          </View>
        </Presence>
        <KaelAttentionCard attention={attention} onAction={onAttentionAction} onHeight={setAttentionHeight}/>
        <KaelHomeScreen requestProgress={requestProgress} input={input} onInput={value => { inputRef.current = value; setInput(value); access.updateHorizonDraft(access.userId, { text: value, images: imagesRef.current }); setComposerError(null); }} onSubmit={sendMessage} question={onPreviewMenu ? null : kael.question} onAnswer={sendText} onRate={onPreviewMenu ? undefined : kael.rate} onRegenerate={regenerate} onNew={newConversation} onMenu={onPreviewMenu ?? openMenu} onMemory={scope === null ? undefined : () => setMemoryScope(scope)} messages={kael.messages} activity={kael.activity} tasks={kael.tasks} approvals={kael.approvals} busy={kael.running} processingTaskId={kael.processingTaskId} topInset={attention === null ? 0 : attentionHeight} consent={consentCard} onDecide={onPreviewMenu ? undefined : kael.decide} composerError={composerError ?? (kaelOpening !== null && !kaelOpening.failed ? 'Đang mở cuộc trò chuyện…' : kael.notice)} onClearComposerError={() => { setComposerError(null); kael.dismissNotice(); }} conversationKey={conversationKey} draftImages={draftImages} onDraftImagesChange={images => { imagesRef.current = images; setDraftImages(images); access.updateHorizonDraft(access.userId, { text: inputRef.current, images }); }}/>
      </KeyboardAvoidingView>
    </SafeAreaView>
    {kaelUserId !== null && scope === memoryScope && <KaelMemorySettings key={scope} userId={kaelUserId} mode={kaelMode} onClose={() => setMemoryScope(null)}/>}
    {!onPreviewMenu && <Sidebar visible={drawerOpen} onClose={() => setDrawerOpen(false)} onNavigate={navigate} onSelectService={openService} recentSessions={recentSessions} profileName={data.profile?.display_name || undefined} profileAvatarUri={data.avatar?.uri} profileAvatarHeaders={data.avatar?.headers} badges={badges} workerProfile={workerProfile} onSetAccepting={setAccepting} activeSessionId={kael.conversationId ?? undefined} onOpenSession={openSession} onTogglePin={toggleSessionPin} sessionHandlers={sessionHandlers} sessionsStatus={sessions.status} sessionQuery={sessions.query} onSessionQuery={sessions.setQuery} archivedView={sessions.archived} onToggleArchivedView={() => sessions.setArchived(!sessions.archived)} onRetrySessions={sessions.reload} mode={access.phase === 'worker' ? 'worker' : access.phase === 'guest' ? 'guest' : 'client'} modePending={access.pendingMode === 'worker'} modeNotice={access.notice} onModeSelect={mode => {
      if (access.phase === 'guest') {
        kaelIntroSession.markPlayed();
        access.prepareHorizonDraftTransfer({ text: inputRef.current, images: imagesRef.current });
        access.setIntent(mode);
        setDrawerOpen(false);
        router.push({ pathname: '/phone', params: { role: mode } });
      } else access.switchMode(mode);
    }} onModeCancel={access.cancelModeRequest} onDismissModeNotice={access.dismissNotice}/>}
    {!onPreviewMenu && <NotificationBanner notice={bannerNotice} onOpen={openBanner} onDismiss={dismissBanner} onHold={holdBanner}/>}
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
