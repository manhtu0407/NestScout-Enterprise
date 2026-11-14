import { useCallback, useEffect, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import { Animated, AppState, Easing, Keyboard, Platform, Share, StyleSheet, Text, View } from 'react-native';
import type { NativeScrollEvent, NativeSyntheticEvent, ScrollViewInstance } from 'react-native';
import { horizonLayout } from '@/theme/layout';
import { horizonColors, horizonColors as colors } from '@/theme/palette';
import type { KaelApproval, KaelQuestion, KaelTask } from '@/features/shared';
import { ChatComposer, type ComposerAutonomy } from './chat-composer';
import { recentQuestions } from './chat-history';
import { ChatMessage } from './chat-message';
import { MessageActions, type FeedbackKind, type FeedbackReason } from './message-actions';
import { QuestionCard } from './question-card';
import { useKaelSpeech } from './kael-speech';
import type { KaelChatMessage } from './use-kael-conversation';
import type { ComposerImage } from './composer-media';
import { ConversationMenu } from './conversation-menu';
import type { ConversationMenuItem } from './conversation-menu';
import { KaelIntro } from './kael-intro';
import { kaelIntroSession } from './kael-intro-session';
import { KaelChatNav } from './kael-nav';
import { expressionForPhase } from './kael-phase';
import type { KaelPhase, KaelPhaseIssue } from './kael-phase';
import { useKaelMotion, useReduceMotion } from './kael-motion';
import { KaelProgressSheet } from './kael-progress-sheet';
import type { KaelProgress } from './kael-progress';
import { shareConversation, shareNotices } from './conversation-share';
import { KaelApprovalCard, KaelIncompleteNote, KaelRunActivity, KaelTaskList } from './kael-run-panels';
import { KaelStreamingText } from './kael-streaming-text';
import { isKaelThinking, KaelThinkingRow } from './kael-thinking-row';
import { KaelStage } from './kael-stage';

const metrics = horizonLayout.kaelCompanion;
const bubbles = horizonLayout.kaelHomeScreen;
const bubbleColors = horizonColors.kaelHomeScreen;

type Props = {
  sessionTitle?: string | null;
  input: string;
  onInput: (value: string) => void;
  onSubmit: (images: readonly ComposerImage[]) => void;
  composerError: string | null;
  onClearComposerError: () => void;
  draftImages?: readonly ComposerImage[];
  onDraftImagesChange?: (images: readonly ComposerImage[]) => void;
  autonomy?: ComposerAutonomy;
  draftLocked?: boolean;
  conversationKey: number;
  kaelPhase?: KaelPhase | null;
  kaelPhaseIssue?: KaelPhaseIssue | null;
  requestProgress?: KaelProgress | null;
  onMenu: () => void;
  onMemory?: () => void;
  onNew: () => void;
  messages: KaelChatMessage[];
  question?: KaelQuestion | null;
  onAnswer?: (answer: string) => void;
  onRate?: (message: KaelChatMessage, rating: FeedbackKind | null, reason: FeedbackReason | null) => Promise<boolean>;
  onRegenerate?: (message: KaelChatMessage) => void;
  activity?: string | null;
  tasks?: readonly KaelTask[];
  approvals?: readonly KaelApproval[];
  busy?: boolean;
  onDecide?: (approval: KaelApproval, approve: boolean) => void;
  topInset?: number;
  processingTaskId?: string | null;
};

const noTasks: readonly KaelTask[] = [];
const noApprovals: readonly KaelApproval[] = [];

export function KaelHomeScreen({ input, onInput, onSubmit, onMenu, onMemory, onNew, messages, question = null, onAnswer, onRate, onRegenerate, composerError, onClearComposerError, conversationKey, kaelPhase = null, kaelPhaseIssue = null, requestProgress, draftImages, onDraftImagesChange, autonomy, draftLocked, activity = null, tasks = noTasks, approvals = noApprovals, busy = false, onDecide, topInset = 0, processingTaskId = null, sessionTitle = null }: Props) {
  const speech = useKaelSpeech();
  const pendingConfirmation = approvals.some(approval => approval.kind === 'confirm');
  const reduceMotion = useReduceMotion();
  const [inset] = useState(() => new Animated.Value(topInset));
  const conversationRef = useRef<ScrollViewInstance>(null);
  const nearBottom = useRef(true);
  const following = useRef(false);
  const lastMessage = messages[messages.length - 1];
  const sentCount = messages.length;
  useEffect(() => {
    if (lastMessage?.role === 'user') following.current = true;
  }, [lastMessage?.role, sentCount]);
  const trackScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    nearBottom.current = contentSize.height - (contentOffset.y + layoutMeasurement.height) <= metrics.followThreshold;
  };
  const followContent = () => {
    if (nearBottom.current || following.current) conversationRef.current?.scrollToEnd({ animated: !reduceMotion });
  };
  useEffect(() => {
    const slide = Animated.timing(inset, { toValue: topInset, duration: reduceMotion ? 0 : metrics.insetDuration, easing: Easing.bezier(0.23, 1, 0.32, 1), useNativeDriver: false });
    slide.start();
    return () => slide.stop();
  }, [inset, reduceMotion, topInset]);
  const hasConversation = messages.length > 0;
  const [chatActive, setChatActive] = useState(() => hasConversation || kaelIntroSession.hasPlayed());
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuNotice, setMenuNotice] = useState<string | null>(null);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [rootHeight, setRootHeight] = useState(0);
  const [footerHeight, setFooterHeight] = useState(0);
  const rootRef = useRef<ComponentRef<typeof View>>(null);
  const footerRef = useRef<ComponentRef<typeof View>>(null);
  const remeasure = useCallback(() => {
    rootRef.current?.measure((_x, _y, _width, height) => { if (height > 0) setRootHeight(height); });
    footerRef.current?.measure((_x, _y, _width, height) => { if (height > 0) setFooterHeight(height); });
  }, []);
  useEffect(() => {
    const subscriptions = [
      Keyboard.addListener('keyboardDidShow', remeasure),
      Keyboard.addListener('keyboardDidHide', remeasure),
      AppState.addEventListener('change', state => { if (state === 'active') remeasure(); }),
    ];
    return () => subscriptions.forEach(subscription => subscription.remove());
  }, [remeasure]);
  const { progress, landing, reaction, react } = useKaelMotion(chatActive, reduceMotion);
  const expression = expressionForPhase(kaelPhase);
  const previousExpression = useRef(expression);

  const [seenConversation, setSeenConversation] = useState(hasConversation);
  if (seenConversation !== hasConversation) {
    setSeenConversation(hasConversation);
    if (hasConversation) setChatActive(true);
  }

  const [seenKey, setSeenKey] = useState(conversationKey);
  if (seenKey !== conversationKey) {
    setSeenKey(conversationKey);
    setChatActive(true);
    setTimelineOpen(false);
  }

  useEffect(() => {
    if (chatActive) kaelIntroSession.markPlayed();
  }, [chatActive]);

  useEffect(() => {
    if (chatActive) return undefined;
    const timer = setTimeout(() => setChatActive(true), metrics.introAutoEnterDelay);
    return () => clearTimeout(timer);
  }, [chatActive]);

  useEffect(() => {
    if (previousExpression.current === expression) return;
    previousExpression.current = expression;
    if (chatActive && expression !== null) react();
  }, [chatActive, expression, react]);

  const seatTop = rootHeight > 0 && footerHeight > 0 ? Math.max(0, rootHeight - footerHeight) : null;
  const enterChat = () => setChatActive(true);

  const notify = (message: string) => setMenuNotice(message);
  const startNew = () => { setMenuOpen(false); setMenuNotice(null); onNew(); };
  const share = async () => {
    const outcome = await shareConversation(messages);
    if (outcome !== 'shared' && outcome !== 'cancelled') notify(shareNotices[outcome]);
  };
  const copyText = async (text: string): Promise<boolean> => {
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        return true;
      }
      await Share.share({ message: text });
      return false;
    } catch {
      notify('Thiết bị này chưa sao chép được.');
      return false;
    }
  };
  const menuItems: readonly ConversationMenuItem[] = [
    { id: 'new', label: 'Trò chuyện mới', icon: 'compose', onPress: startNew },
    { id: 'share', label: 'Chia sẻ', icon: 'share', onPress: share },
    ...(requestProgress === undefined ? [] : [{ id: 'timeline', label: 'Tiến độ', icon: 'clock' as const, onPress: () => setTimelineOpen(true) }]),
    ...(onMemory ? [{ id: 'memory', label: 'Bộ nhớ Kael', icon: 'clock' as const, onPress: () => { setMenuOpen(false); onMemory(); } }] : []),
  ];
  const firstUserMessage = messages.find(m => m.role === 'user');
  const title = sessionTitle?.trim() || firstUserMessage?.text.trim() || 'Cuộc trò chuyện mới';
  const chatOpacity = progress.interpolate({ inputRange: [0, metrics.chatFadeStart, 1], outputRange: [0, 0, 1] });
  const chatShift = progress.interpolate({ inputRange: [0, 1], outputRange: [metrics.chatEnterOffset, 0] });

  return <View ref={rootRef} testID="kael-home-layout" style={styles.root} onLayout={event => setRootHeight(event.nativeEvent.layout.height)}>
    <Animated.View pointerEvents={chatActive ? 'box-none' : 'none'} style={[styles.layer, { bottom: footerHeight, opacity: chatOpacity, transform: [{ translateY: chatShift }] }]}>
      <Animated.ScrollView ref={conversationRef} onContentSizeChange={followContent} onScroll={trackScroll} onScrollBeginDrag={() => { following.current = false; }} scrollEventThrottle={metrics.scrollThrottle} style={styles.conversation} contentContainerStyle={styles.conversationContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Animated.View style={{ height: Animated.add(inset, metrics.navHeight + metrics.conversationTop) }}/>
        {messages.map(m => m.role === 'user'
          ? <ChatMessage key={m.id} role="user" text={m.text} sentAt={m.sentAt}/>
          : <View key={m.id} style={styles.reply}>
            <KaelStreamingText text={m.text} style={styles.replyText} streaming={busy && m.id === lastMessage?.id && !m.incomplete} incomplete={m.incomplete}/>
            {m.incomplete && <KaelIncompleteNote/>}
            {!m.incomplete && !(busy && m.id === lastMessage?.id) && <MessageActions
              text={m.text}
              onCopy={copyText}
              onFeedback={onRate && (m.runId !== undefined || m.storedId !== undefined) ? (rating, reason) => onRate(m, rating, reason) : undefined}
              onRegenerate={onRegenerate && m.id === lastMessage?.id && !busy && !pendingConfirmation ? () => onRegenerate(m) : undefined}
              speaking={speech.speakingId === m.id}
              speechFailed={speech.failed && speech.speakingId === null}
              onSpeak={speech.available ? () => speech.toggle(m.id, m.text) : undefined}/>}
            {m.id === lastMessage?.id && !busy && question !== null && onAnswer && <QuestionCard
              key={question.id}
              question={question.prompt}
              options={question.options.map((label, index) => ({ id: String(index), label }))}
              date={question.date ? {} : undefined}
              onAnswer={onAnswer}/>}
          </View>)}
        <KaelTaskList tasks={tasks} processingTaskId={processingTaskId} processingLabel={busy ? activity : null}/>
        {onDecide && approvals.map(approval => <KaelApprovalCard key={approval.id} approval={approval} disabled={busy} onDecide={onDecide}/>)}
        {isKaelThinking(kaelPhase) ? <KaelThinkingRow phase={kaelPhase} issue={kaelPhaseIssue}/> : activity !== null && <KaelRunActivity label={activity}/>}
      </Animated.ScrollView>
    </Animated.View>
    <KaelIntro progress={progress} footerHeight={footerHeight} interactive={!chatActive}/>
    <KaelStage progress={progress} landing={landing} reaction={reaction} expression={expression} nod={kaelPhase === 'completed'} seatTop={seatTop} navHeight={metrics.navHeight}/>
    <View ref={footerRef} testID="kael-footer-layout" style={styles.footer} onLayout={event => setFooterHeight(event.nativeEvent.layout.height)}>
      <ChatComposer key={conversationKey} value={input} onChange={value => { setMenuNotice(null); onInput(value); }} onSubmit={images => { enterChat(); onSubmit(images); }} error={composerError ?? menuNotice} onMediaChange={() => { setMenuNotice(null); onClearComposerError(); }} initialImages={draftImages} autonomy={autonomy} history={recentQuestions(messages)} onImagesChange={onDraftImagesChange} mediaExternallyManaged={Boolean(onDraftImagesChange)} locked={draftLocked}/>
      <Text style={styles.disclaimer}>Kael có thể mắc sai sót. Hãy kiểm tra thông tin quan trọng.</Text>
    </View>
    {chatActive && <KaelChatNav title={title} onMenu={onMenu} onOptions={() => setMenuOpen(open => !open)}/>}
    <KaelProgressSheet open={timelineOpen} progress={requestProgress ?? null} bottomOffset={footerHeight + metrics.progressBottomInset} onClose={() => setTimelineOpen(false)}/>
    {menuOpen && <ConversationMenu title={title} items={menuItems} onClose={() => setMenuOpen(false)}/>}
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, justifyContent: 'flex-end', overflow: 'hidden' },
  layer: { position: 'absolute', top: 0, left: 0, right: 0 },
  conversation: { position: 'absolute', top: 0, left: metrics.conversationSideInset, right: metrics.conversationSideInset, bottom: 0 },
  conversationContent: { gap: metrics.chatGap, paddingBottom: bubbles.chatContentPaddingBottom + metrics.conversationBottomInset + metrics.plushClearance },
  reply: { alignSelf: 'stretch', paddingHorizontal: bubbles.replyInset, gap: bubbles.replyGap },
  replyText: { color: colors.text, fontSize: bubbles.replyTextSize, lineHeight: bubbles.replyLineHeight },
  footer: { paddingHorizontal: metrics.composerSideInset, paddingBottom: metrics.footerBottomInset },
  disclaimer: { color: bubbleColors.disclaimerColor, fontSize: bubbles.disclaimerFontSize, lineHeight: bubbles.disclaimerLineHeight, textAlign: 'center', marginTop: metrics.disclaimerTop },
});
