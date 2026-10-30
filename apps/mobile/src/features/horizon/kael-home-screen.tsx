import { useState } from 'react';
import { horizonLayout } from '@/theme/layout';
import { ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { ChatComposer } from './chat-composer';
import type { ComposerImage } from './composer-media';
import { ConversationMenu } from './conversation-menu';
import type { ConversationMenuItem } from './conversation-menu';
import { GlassIconButton, GlassPill, GlassSegment } from './glass-controls';
import { Icon } from './icon';
import { KaelOrb } from './kael-orb';
import type { KaelPhase } from './kael-phase';
import { KaelStatusAvatar } from './kael-status-avatar';
import { horizonColors, horizonColors as colors } from '@/theme/palette';

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
  onMenu: () => void;
  onNew: () => void;
  messages: { id: string; role: 'user' | 'assistant'; text: string }[];
};

export function KaelHomeScreen({ input, onInput, onSubmit, onMenu, onNew, messages, composerError, onClearComposerError, conversationKey, kaelPhase = null, draftImages, onDraftImagesChange, draftLocked }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuNotice, setMenuNotice] = useState<string | null>(null);
  const hasConversation = messages.length > 0;
  const notify = (message: string) => setMenuNotice(message);
  const startNew = () => { setMenuOpen(false); setMenuNotice(null); onNew(); };
  const share = async () => {
    if (!hasConversation) { notify('Chưa có nội dung để chia sẻ.'); return; }
    const transcript = messages.map(m => `${m.role === 'user' ? 'Bạn' : 'Kael'}: ${m.text}`).join('\n\n');
    try { await Share.share({ message: transcript }); } catch { setMenuNotice('Thiết bị này chưa mở được chia sẻ.'); }
  };
  const menuItems: readonly ConversationMenuItem[] = [
    { id: 'share', label: 'Chia sẻ', icon: 'share', onPress: share },
    { id: 'pin', label: 'Ghim', icon: 'pin', onPress: () => notify('Ghim cuộc trò chuyện chưa được kết nối.') },
    { id: 'find', label: 'Tìm trong cuộc trò chuyện', icon: 'search', onPress: () => notify('Tìm trong cuộc trò chuyện chưa được kết nối.') },
    { id: 'archive', label: 'Lưu trữ', icon: 'archive', onPress: () => notify('Lưu trữ cuộc trò chuyện chưa được kết nối.') },
    { id: 'delete', label: 'Xóa', icon: 'trash', destructive: true, onPress: () => { if (hasConversation) startNew(); else notify('Chưa có cuộc trò chuyện để xóa.'); } },
  ];
  const firstUserMessage = messages.find(m => m.role === 'user');
  return <View style={styles.root}>
    <View style={styles.nav}>
      <View style={styles.slotStart}>
        <GlassIconButton label="Mở thanh bên" onPress={onMenu} style={styles.lifted}><Icon name="menu" size={horizonLayout.glass.iconSize}/></GlassIconButton>
      </View>
      <KaelStatusAvatar phase={kaelPhase}/>
      <View style={styles.slotEnd}>
        <GlassPill style={styles.lifted}>
          <GlassSegment label="Trò chuyện mới" onPress={startNew}><Icon name="compose" size={horizonLayout.glass.iconSize}/></GlassSegment>
          <GlassSegment label="Tùy chọn cuộc trò chuyện" expanded={menuOpen} onPress={() => setMenuOpen(open => !open)}><Icon name="more" size={horizonLayout.glass.iconSize}/></GlassSegment>
        </GlassPill>
      </View>
    </View>
    <ScrollView style={styles.chat} contentContainerStyle={styles.chatContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      {messages.map(m => <View key={m.id} style={[styles.bubble, m.role === 'user' ? styles.userBubble : styles.assistantBubble]}>
        {m.role === 'assistant' && <KaelOrb compact size={36}/>}
        <Text style={styles.bubbleText}>{m.text}</Text>
      </View>)}
    </ScrollView>
    <View style={styles.footer}><ChatComposer key={conversationKey} value={input} onChange={value => { setMenuNotice(null); onInput(value); }} onSubmit={onSubmit} error={composerError ?? menuNotice} onMediaChange={() => { setMenuNotice(null); onClearComposerError(); }} initialImages={draftImages} onImagesChange={onDraftImagesChange} mediaExternallyManaged={Boolean(onDraftImagesChange)} locked={draftLocked}/>
      <Text style={styles.disclaimer}>Kael có thể mắc sai sót. Hãy kiểm tra thông tin quan trọng.</Text>
    </View>
    {menuOpen && <ConversationMenu title={firstUserMessage?.text ?? 'Cuộc trò chuyện mới'} items={menuItems} onClose={() => setMenuOpen(false)}/>}
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: horizonLayout.kaelHomeScreen.rootPaddingHorizontal },
  nav: { height: horizonLayout.kaelHomeScreen.navHeight, flexDirection: 'row', alignItems: 'center' },
  slotStart: { flex: 1, flexDirection: 'row', justifyContent: 'flex-start' },
  slotEnd: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end' },
  lifted: { position: 'relative', top: -horizonLayout.kaelHomeScreen.controlLift },
  footer: { paddingBottom: horizonLayout.kaelHomeScreen.footerPaddingBottom },
  disclaimer: { color: horizonColors.kaelHomeScreen.disclaimerColor, fontSize: horizonLayout.kaelHomeScreen.disclaimerFontSize, lineHeight: horizonLayout.kaelHomeScreen.disclaimerLineHeight, textAlign: 'center', marginTop: horizonLayout.kaelHomeScreen.disclaimerMarginTop },
  chat: { flex: 1 },
  chatContent: { paddingTop: horizonLayout.kaelHomeScreen.chatContentPaddingTop, gap: horizonLayout.kaelHomeScreen.chatContentGap, paddingBottom: horizonLayout.kaelHomeScreen.chatContentPaddingBottom },
  bubble: { maxWidth: horizonLayout.kaelHomeScreen.bubbleMaxWidth, borderRadius: horizonLayout.kaelHomeScreen.bubbleBorderRadius, padding: horizonLayout.kaelHomeScreen.bubblePadding, flexDirection: 'row', gap: horizonLayout.kaelHomeScreen.bubbleGap, alignItems: 'flex-start' },
  userBubble: { alignSelf: 'flex-end', backgroundColor: horizonColors.kaelHomeScreen.userBubbleBackgroundColor },
  assistantBubble: { alignSelf: 'flex-start', backgroundColor: horizonColors.kaelHomeScreen.assistantBubbleBackgroundColor },
  bubbleText: { color: colors.text, fontSize: horizonLayout.kaelHomeScreen.bubbleTextFontSize, lineHeight: horizonLayout.kaelHomeScreen.bubbleTextLineHeight, flexShrink: 1 }
});
