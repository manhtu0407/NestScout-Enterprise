import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Share, StyleSheet, Text, View } from 'react-native';
import type { NativeScrollEvent, NativeSyntheticEvent, ScrollViewInstance } from 'react-native';
import { horizonLayout } from '@/theme/layout';
import { horizonColors, horizonColors as colors } from '@/theme/palette';
import type { KaelApproval, KaelTask } from '@/features/shared';
import { ChatComposer } from './chat-composer';
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
import { KaelApprovalCard, KaelIncompleteNote, KaelRunActivity, KaelTaskList } from './kael-run-panels';
import { KaelStreamingText } from './kael-streaming-text';
import { isKaelThinking, KaelThinkingRow } from './kael-thinking-row';
import { KaelStage } from './kael-stage';

const metrics = horizonLayout.kaelCompanion;
const bubbles = horizonLayout.kaelHomeScreen;
const bubbleColors = horizonColors.kaelHomeScreen;

type Props = {
  input: string;
  onInput: (value: string) => void;
  onSubmit: (images: readonly ComposerImage[]) => void;
  composerError: string | null;
  onClearComposerError: () => void;
  draftImages?: readonly ComposerImage[];
  onDraftImagesChange?: (images: readonly ComposerImage[]) => void;
  draftLocked?: boolean;
  conversationKey: number;
  kaelPhase?: KaelPhase | null;
  kaelPhaseIssue?: KaelPhaseIssue | null;
  onMenu: () => void;
  onMemory?: () => void;
  onNew: () => void;
  messages: { id: string; role: 'user' | 'assistant'; text: string; incomplete?: boolean }[];
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

type Footer = { top: number; height: number };

export function KaelHomeScreen({ input, onInput, onSubmit, onMenu, onMemory, onNew, messages, composerError, onClearComposerError, conversationKey, kaelPhase = null, kaelPhaseIssue = null, draftImages, onDraftImagesChange, draftLocked, activity = null, tasks = noTasks, approvals = noApprovals, busy = false, onDecide, topInset = 0, processingTaskId = null }: Props) {
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
  const [footer, setFooter] = useState<Footer | null>(null);
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
    if (previousExpression.current === expression) return;
    previousExpression.current = expression;
    if (chatActive && expression !== null) react();
  }, [chatActive, expression, react]);

  const footerHeight = footer?.height ?? 0;
  const seatTop = footer?.top ?? null;
  const enterChat = () => setChatActive(true);

  const notify = (message: string) => setMenuNotice(message);
  const startNew = () => { setMenuOpen(false); setMenuNotice(null); onNew(); };
  const share = async () => {
    if (!hasConversation) { notify('Chưa có nội dung để chia sẻ.'); return; }
    const transcript = messages.map(m => `${m.role === 'user' ? 'Bạn' : 'Kael'}: ${m.text}`).join('\n\n');
    try { await Share.share({ message: transcript }); } catch { notify('Thiết bị này chưa mở được chia sẻ.'); }
  };
  const menuItems: readonly ConversationMenuItem[] = [
    { id: 'new', label: 'Trò chuyện mới', icon: 'compose', onPress: startNew },
    { id: 'share', label: 'Chia sẻ', icon: 'share', onPress: share },
    { id: 'pin', label: 'Ghim', icon: 'pin', onPress: () => notify('Ghim cuộc trò chuyện chưa được kết nối.') },
    { id: 'find', label: 'Tìm trong cuộc trò chuyện', icon: 'search', onPress: () => notify('Tìm trong cuộc trò chuyện chưa được kết nối.') },
    { id: 'archive', label: 'Lưu trữ', icon: 'archive', onPress: () => notify('Lưu trữ cuộc trò chuyện chưa được kết nối.') },
    { id: 'timeline', label: 'Tiến độ', icon: 'clock', onPress: () => setTimelineOpen(true) },
    ...(onMemory ? [{ id: 'memory', label: 'Bộ nhớ Kael', icon: 'clock' as const, onPress: () => { setMenuOpen(false); onMemory(); } }] : []),
  ];
  const firstUserMessage = messages.find(m => m.role === 'user');
  const chatOpacity = progress.interpolate({ inputRange: [0, metrics.chatFadeStart, 1], outputRange: [0, 0, 1] });
  const chatShift = progress.interpolate({ inputRange: [0, 1], outputRange: [metrics.chatEnterOffset, 0] });

  return <View style={styles.root}>
    <Animated.View pointerEvents={chatActive ? 'box-none' : 'none'} style={[styles.layer, { bottom: footerHeight, opacity: chatOpacity, transform: [{ translateY: chatShift }] }]}>
      <Animated.ScrollView ref={conversationRef} onContentSizeChange={followContent} onScroll={trackScroll} onScrollBeginDrag={() => { following.current = false; }} scrollEventThrottle={metrics.scrollThrottle} style={[styles.conversation, { top: Animated.add(inset, metrics.conversationTop) }]} contentContainerStyle={styles.conversationContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {messages.map(m => m.role === 'user'
          ? <View key={m.id} style={styles.userBubble}>
            <Text style={styles.userText}>{m.text}</Text>
          </View>
          : <View key={m.id} style={styles.reply}>
            <KaelStreamingText text={m.text} style={styles.replyText} streaming={busy && m.id === lastMessage?.id && !m.incomplete} incomplete={m.incomplete}/>
            {m.incomplete && <KaelIncompleteNote/>}
          </View>)}
        <KaelTaskList tasks={tasks} processingTaskId={processingTaskId} processingLabel={busy ? activity : null}/>
        {onDecide && approvals.map(approval => <KaelApprovalCard key={approval.id} approval={approval} disabled={busy} onDecide={onDecide}/>)}
        {isKaelThinking(kaelPhase) ? <KaelThinkingRow phase={kaelPhase} issue={kaelPhaseIssue}/> : activity !== null && <KaelRunActivity label={activity}/>}
      </Animated.ScrollView>
    </Animated.View>
    <KaelIntro progress={progress} footerHeight={footerHeight} interactive={!chatActive}/>
    <KaelStage progress={progress} landing={landing} reaction={reaction} expression={expression} nod={kaelPhase === 'completed'} seatTop={seatTop} navHeight={metrics.navHeight}/>
    <View style={styles.footer} onLayout={event => setFooter({ top: event.nativeEvent.layout.y, height: event.nativeEvent.layout.height })}>
      <ChatComposer key={conversationKey} value={input} onChange={value => { setMenuNotice(null); onInput(value); }} onSubmit={images => { enterChat(); onSubmit(images); }} error={composerError ?? menuNotice} onMediaChange={() => { setMenuNotice(null); onClearComposerError(); }} initialImages={draftImages} onImagesChange={onDraftImagesChange} mediaExternallyManaged={Boolean(onDraftImagesChange)} locked={draftLocked} onFocus={enterChat}/>
      <Text style={styles.disclaimer}>Kael có thể mắc sai sót. Hãy kiểm tra thông tin quan trọng.</Text>
    </View>
    {chatActive && <KaelChatNav onMenu={onMenu} onOptions={() => setMenuOpen(open => !open)}/>}
    <KaelProgressSheet open={timelineOpen} phase={kaelPhase} bottomOffset={footerHeight + metrics.progressBottomInset} onClose={() => setTimelineOpen(false)}/>
    {menuOpen && <ConversationMenu title={firstUserMessage?.text ?? 'Cuộc trò chuyện mới'} items={menuItems} onClose={() => setMenuOpen(false)}/>}
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, justifyContent: 'flex-end', overflow: 'hidden' },
  layer: { position: 'absolute', top: metrics.navHeight, left: 0, right: 0 },
  conversation: { position: 'absolute', top: metrics.conversationTop, left: metrics.conversationSideInset, right: metrics.conversationSideInset, bottom: metrics.conversationBottomInset + metrics.plushClearance },
  conversationContent: { gap: metrics.chatGap, paddingBottom: bubbles.chatContentPaddingBottom },
  userBubble: { alignSelf: 'flex-end', maxWidth: bubbles.userBubbleMaxWidth, borderRadius: bubbles.bubbleBorderRadius, borderBottomRightRadius: bubbles.userBubbleTailRadius, paddingVertical: bubbles.userBubblePaddingVertical, paddingHorizontal: bubbles.userBubblePaddingHorizontal, backgroundColor: bubbleColors.userBubbleBackgroundColor },
  userText: { color: bubbleColors.userBubbleText, fontSize: bubbles.userTextSize, lineHeight: bubbles.userTextLineHeight },
  reply: { alignSelf: 'stretch', paddingHorizontal: bubbles.replyInset, gap: bubbles.replyGap },
  replyText: { color: colors.text, fontSize: bubbles.replyTextSize, lineHeight: bubbles.replyLineHeight },
  footer: { paddingHorizontal: metrics.composerSideInset, paddingBottom: metrics.footerBottomInset },
  disclaimer: { color: bubbleColors.disclaimerColor, fontSize: bubbles.disclaimerFontSize, lineHeight: bubbles.disclaimerLineHeight, textAlign: 'center', marginTop: metrics.disclaimerTop },
});
