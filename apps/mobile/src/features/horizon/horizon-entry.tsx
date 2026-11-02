import { horizonLayout } from '@/theme/layout';
import React, { useCallback, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { EntryRedirect, useAccess } from '@/features/access';
import { Sidebar } from './sidebar';
import { Icon } from '@/features/shared';
import { KaelHomeScreen } from './kael-home-screen';
import { kaelIntroSession } from './kael-intro-session';
import type { ComposerImage } from './composer-media';
import { KaelHomeLoading } from './skeleton-layouts';
import { Presence, useRetained } from './motion-presence';
import { horizonColors, horizonColors as colors } from '@/theme/palette';

const renderPending = (label: string) => <KaelHomeLoading label={label}/>;

type ChatMessage = { id: string; role: 'user' | 'assistant'; text: string };

export function HorizonEntry() {
  const router = useRouter();
  const access = useAccess();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [input, setInput] = useState(access.horizonDraft?.text ?? '');
  const [draftImages, setDraftImages] = useState<readonly ComposerImage[]>(() => access.horizonDraft?.images ?? []);
  const inputRef = useRef(input);
  const imagesRef = useRef(draftImages);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationKey, setConversationKey] = useState(0);
  const [composerError, setComposerError] = useState<string | null>(null);

  const newConversation = useCallback(() => {
    setMessages([]);
    setInput('');
    inputRef.current = '';
    imagesRef.current = [];
    setDraftImages([]);
    access.clearHorizonDraft(access.userId);
    setConversationKey(key => key + 1);
    setComposerError(null);
    setDrawerOpen(false);
  }, [access]);

  const sendMessage = useCallback((images: readonly ComposerImage[]) => {
    setComposerError(images.length > 0
      ? 'Ảnh chưa được gửi vì chức năng phân tích ảnh chưa được kết nối.'
      : 'Kael chưa được kết nối. Tin nhắn của bạn chưa được gửi.');
  }, []);

  const navigate = useCallback((id: string) => {
    setDrawerOpen(false);
    if (id === 'profile') {
      router.push(access.phase === 'worker' ? '/worker-home' : access.phase === 'client' ? '/client-home' : '/explore');
      return;
    }
    if (id === 'home' || id === 'new') {
      newConversation();
      return;
    }
    if (id === 'requests') router.push('/requests');
    else router.push({ pathname: '/section', params: { id } });
  }, [access.phase, newConversation, router]);

  const noticeMessage = useRetained(access.notice === null ? null : access.notice === 'worker_unavailable'
    ? 'Không thể chuyển sang vai trò Thợ vì tài khoản chưa có quyền.'
    : 'Chưa thể xác minh quyền Thợ. Bạn có thể thử lại.');

  if (access.phase === 'bootstrapping' || access.phase === 'resolving') return <EntryRedirect pending={renderPending}/>;

  return <>
    <StatusBar style="dark"/>
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Presence visible={access.notice !== null} style={styles.noticeSlot}>
          <View accessibilityLiveRegion="polite" style={styles.notice}>
            <Text style={styles.noticeText}>{noticeMessage}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Đóng thông báo vai trò" onPress={access.dismissNotice} style={styles.noticeAction}><Icon name="close" size={18}/></Pressable>
          </View>
        </Presence>
        <KaelHomeScreen input={input} onInput={value => { inputRef.current = value; setInput(value); access.updateHorizonDraft(access.userId, { text: value, images: imagesRef.current }); setComposerError(null); }} onSubmit={sendMessage} onNew={newConversation} onMenu={() => setDrawerOpen(true)} messages={messages} composerError={composerError} onClearComposerError={() => setComposerError(null)} conversationKey={conversationKey} draftImages={draftImages} onDraftImagesChange={images => { imagesRef.current = images; setDraftImages(images); access.updateHorizonDraft(access.userId, { text: inputRef.current, images }); }}/>
      </KeyboardAvoidingView>
    </SafeAreaView>
    <Sidebar visible={drawerOpen} onClose={() => setDrawerOpen(false)} onNavigate={navigate} mode={access.phase === 'worker' ? 'worker' : access.phase === 'guest' ? 'guest' : 'client'} modePending={access.pendingMode === 'worker'} modeNotice={access.notice} onModeSelect={mode => {
      if (access.phase === 'guest') {
        kaelIntroSession.markPlayed();
        access.prepareHorizonDraftTransfer({ text: inputRef.current, images: imagesRef.current });
        access.setIntent(mode);
        setDrawerOpen(false);
        router.push({ pathname: '/phone', params: { role: mode } });
      } else access.switchMode(mode);
    }} onModeCancel={access.cancelModeRequest} onDismissModeNotice={access.dismissNotice}/>
  </>;
}


export function HorizonRoute() {
  const access = useAccess();
  if (access.phase === 'bootstrapping' || access.phase === 'resolving') return <EntryRedirect pending={renderPending}/>;
  if (access.horizonDraftLocked) return <SafeAreaView style={styles.locked}>
    <Text style={styles.lockedTitle}>Không thể mở bản nháp</Text>
    <Text style={styles.lockedBody}>Cần xác minh tài khoản trước khi khôi phục bản nháp.</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="Thử xác minh lại" disabled={access.identityPending} onPress={access.recheck} style={styles.lockedAction}><Text style={styles.lockedActionText}>{access.identityPending ? 'Đang xác minh…' : 'Thử lại'}</Text></Pressable>
  </SafeAreaView>;
  return <HorizonEntry key={access.userId ?? 'guest'} />;
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
