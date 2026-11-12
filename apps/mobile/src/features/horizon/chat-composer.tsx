import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import { Animated, Dimensions, Keyboard, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { composerImageLimit, useComposerMedia, type ComposerImage } from './composer-media';
import { Icon, PressScale, useGlassAccessibility, usePressFeedback } from '@/features/shared';
import { AttachmentStrip } from './attachment-strip';
import { AutonomyPicker } from './autonomy-picker';
import { ChatHistory } from './chat-history';
import type { ChatHistoryEntry } from './chat-history';
import { ComposerMenu } from './composer-menu';
import type { KaelAutonomy, KaelAutonomyMode } from './kael-autonomy';
import { Presence, useRetained } from './motion-presence';
import { LiquidVoiceCapsule, useLiquidVoice } from './liquid-voice';
import { appendTranscript } from './voice-input';
import type { ComposerMenuAnchor, ComposerMenuItem } from './composer-menu';

export type ComposerAutonomy = { mode: KaelAutonomyMode; value: KaelAutonomy; onChange: (value: KaelAutonomy) => void; failed?: boolean };

type Props = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (images: readonly ComposerImage[]) => void;
  error?: string | null;
  onMediaChange?: () => void;
  initialImages?: readonly ComposerImage[];
  onImagesChange?: (images: readonly ComposerImage[]) => void;
  mediaExternallyManaged?: boolean;
  locked?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
  autonomy?: ComposerAutonomy;
  history?: readonly ChatHistoryEntry[];
};

const metrics = horizonLayout.chatComposer;
const menu = horizonLayout.composerMenu;
const colors = horizonColors.chatComposer;
const webScrollbarStyle = { outlineStyle: 'solid', outlineWidth: 0, scrollbarWidth: 'none' } as const;

export function ChatComposer({ value, onChange, onSubmit, error, onMediaChange, initialImages, onImagesChange, mediaExternallyManaged, locked = false, onFocus, onBlur, autonomy, history }: Props) {
  const media = useComposerMedia(initialImages, onImagesChange, mediaExternallyManaged);
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);
  const errorText = error || media.error || voiceNotice;
  const retainedError = useRetained(errorText);
  const canSend = !locked && (value.trim().length > 0 || media.images.length > 0);
  const [inputHeight, setInputHeight] = useState<number>(metrics.inputMinHeight);
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);
  const [inputWidth, setInputWidth] = useState(0);
  useLayoutEffect(() => {
    if (Platform.OS !== 'web' || !value) return;
    const node: unknown = inputRef.current;
    if (typeof HTMLTextAreaElement === 'undefined' || !(node instanceof HTMLTextAreaElement)) return;
    const shown = node.style.height;
    node.style.height = '0px';
    const content = node.scrollHeight;
    node.style.height = shown;
    setInputHeight(Math.min(metrics.inputMaxHeight, Math.max(metrics.inputMinHeight, content)));
  }, [value, inputWidth]);
  const submit = () => { if (canSend) onSubmit(media.images); };
  const { reduceMotion } = useGlassAccessibility();
  const micFeedback = usePressFeedback(reduceMotion);
  const valueRef = useRef(value);
  useEffect(() => { valueRef.current = value; });
  const voice = useLiquidVoice(text => onChange(appendTranscript(valueRef.current, text)), setVoiceNotice);
  const startVoice = () => { setVoiceNotice(null); void voice.start(); };
  useEffect(() => {
    if (!voiceNotice) return undefined;
    const timer = setTimeout(() => setVoiceNotice(null), metrics.voiceHintDuration);
    return () => clearTimeout(timer);
  }, [voiceNotice]);
  const trigger = useRef<ComponentRef<typeof View>>(null);
  const [menuAnchor, setMenuAnchor] = useState<ComposerMenuAnchor | null>(null);
  const openMenu = () => {
    setMenuAnchor({ x: menu.fallbackX, bottom: menu.fallbackBottom });
    trigger.current?.measureInWindow((x, y) => setMenuAnchor({ x, bottom: Dimensions.get('window').height - y + menu.anchorGap }));
  };
  const photoUnavailable = locked || media.images.length >= composerImageLimit;
  const menuItems: readonly ComposerMenuItem[] = [
    { id: 'photos', label: 'Thêm ảnh/tệp', icon: 'attach', disabled: photoUnavailable, onPress: () => { onMediaChange?.(); setTimeout(() => { void media.pick(); }, menu.pickerLaunchDelay); } },
    { id: 'camera', label: 'Chụp ảnh', icon: 'camera', disabled: photoUnavailable, onPress: () => { onMediaChange?.(); setTimeout(() => { void media.capture(); }, menu.pickerLaunchDelay); } },
  ];
  return <View>
    <Presence visible={Boolean(errorText)} style={styles.errorSlot}>
      <Text accessibilityLiveRegion="polite" style={styles.error}>{retainedError}</Text>
    </Presence>
    <View style={styles.frame}>
    <AttachmentStrip files={media.images.map((item, index) => ({ id: String(index), name: `Ảnh ${index + 1}`, kind: 'image', progress: undefined, uri: item.uri, removeLabel: `Xóa ảnh ${index + 1}` }))} onRemove={id => { media.remove(Number(id)); onMediaChange?.(); }}/>
    <View style={styles.controls}>
    <View style={styles.inputSlot}>
      <TextInput
        ref={inputRef}
        accessibilityLabel="Nhắn Kael"
        style={[styles.input, Platform.OS === 'web' && webScrollbarStyle, Platform.OS === 'web' && { height: value ? inputHeight : metrics.inputMinHeight }]}
        value={value}
        editable={!locked}
        onChangeText={onChange}
        onFocus={onFocus}
        onBlur={onBlur}
        placeholder="What's on your home today...?"
        placeholderTextColor={colors.placeholder}
        multiline
        maxLength={5000}
        numberOfLines={1}
        onLayout={event => {
          if (Platform.OS === 'web') setInputWidth(event.nativeEvent.layout.width);
        }}
        submitBehavior={Platform.OS === 'web' ? 'submit' : 'newline'}
        blurOnSubmit={Platform.OS === 'web'}
        scrollEnabled={Platform.OS !== 'web' || inputHeight >= metrics.inputMaxHeight}
        onSubmitEditing={() => { Keyboard.dismiss(); submit(); }}
        autoCorrect
        spellCheck={false}
      />
    </View>
    <View style={styles.actions}>
    <View ref={trigger} collapsable={false}>
      <PressScale accessibilityRole="button" accessibilityLabel="Đính kèm" accessibilityState={{ expanded: menuAnchor !== null }} onPress={openMenu} style={styles.media}>
        <Icon name="plus" size={metrics.mediaIconSize} strokeWidth={metrics.mediaIconStroke} color={colors.mediaIcon} />
      </PressScale>
    </View>
    {menuAnchor && <ComposerMenu anchor={menuAnchor} items={menuItems} onClose={() => setMenuAnchor(null)}/>}
    {autonomy && <AutonomyPicker mode={autonomy.mode} value={autonomy.value} onChange={autonomy.onChange} failed={autonomy.failed} disabled={locked}/>}
    <View style={styles.actionSpacer}/>
    {history && <ChatHistory entries={history} onPick={onChange} disabled={locked}/>}
    <Animated.View style={{ transform: [{ scale: micFeedback.scale }] }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Nói với Kael"
        accessibilityHint="Nhấn để bắt đầu nói với Kael"
        disabled={locked}
        onPress={startVoice}
        onPressIn={micFeedback.pressIn}
        onPressOut={micFeedback.pressOut}
        style={styles.media}
      >
        <Icon name="mic" size={metrics.mediaIconSize} strokeWidth={metrics.mediaIconStroke} color={colors.voiceIcon} />
      </Pressable>
    </Animated.View>
    <View style={styles.sendSlot}>
      <PressScale accessibilityRole="button" accessibilityLabel="Gửi" accessibilityState={{ disabled: !canSend }} disabled={!canSend} onPress={submit} style={[styles.send, canSend && styles.sendActive]}>
        <Icon name="arrowUp" color={canSend ? colors.activeSendIcon : colors.idleSendIcon} size={metrics.sendIconSize} strokeWidth={metrics.sendIconStroke} />
      </PressScale>
    </View>
    </View>
    {voice.recording && <View style={styles.voiceLayer}><LiquidVoiceCapsule onCancel={voice.cancel} onSend={voice.finish}/></View>}
    </View>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  frame: { minHeight: metrics.frameMinHeight, padding: metrics.framePadding, borderRadius: metrics.frameRadius, borderWidth: metrics.frameBorderWidth, borderColor: colors.surfaceBorder, backgroundColor: colors.surface, boxShadow: colors.surfaceShadow },
  controls: { gap: metrics.controlGap },
  actions: { flexDirection: 'row', alignItems: 'center', gap: metrics.controlGap },
  actionSpacer: { flex: 1 },
  errorSlot: { position: 'absolute', left: metrics.errorInsetLeft, right: 0, bottom: metrics.errorBottom, marginBottom: metrics.errorGap },
  error: { color: colors.noticeText, fontSize: metrics.errorSize, lineHeight: metrics.errorLineHeight, textAlign: 'right' },
  media: { height: metrics.mediaSize, width: metrics.mediaSize, borderRadius: metrics.mediaRadius, alignItems: 'center', justifyContent: 'center' },
  input: { alignSelf: 'stretch', minWidth: 0, minHeight: metrics.inputMinHeight, maxHeight: metrics.inputMaxHeight, fontSize: metrics.inputFontSize, lineHeight: metrics.inputLineHeight, paddingHorizontal: metrics.inputPaddingHorizontal, paddingVertical: metrics.inputPaddingVertical, color: colors.inputText, textAlignVertical: 'top', outlineWidth: 0, outlineColor: 'transparent' },
  inputSlot: { alignSelf: 'stretch', minWidth: 0, justifyContent: 'center' },
  voiceLayer: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, flexDirection: 'row' },
  sendSlot: { height: metrics.sendSlotSize, width: metrics.sendSlotSize, alignItems: 'center', justifyContent: 'center' },
  send: { height: metrics.sendSize, width: metrics.sendSize, borderRadius: metrics.sendRadius, borderWidth: metrics.sendBorderWidth, borderColor: colors.idleSendBorder, backgroundColor: colors.idleSendSurface, alignItems: 'center', justifyContent: 'center' },
  sendActive: { borderColor: colors.activeSendBorder, backgroundColor: colors.activeSendSurface },
});
