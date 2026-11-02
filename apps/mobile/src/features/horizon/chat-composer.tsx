import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';
import { useEffect, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import { Animated, Dimensions, Image, Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { composerImageLimit, useComposerMedia, type ComposerImage } from './composer-media';
import { Icon, PressScale, useGlassAccessibility, usePressFeedback } from '@/features/shared';
import { ComposerMenu } from './composer-menu';
import { Presence, useRetained } from './motion-presence';
import { LiquidVoiceCapsule, useLiquidVoice } from './liquid-voice';
import type { ComposerMenuAnchor, ComposerMenuItem } from './composer-menu';

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
};

const metrics = horizonLayout.chatComposer;
const menu = horizonLayout.composerMenu;
const colors = horizonColors.chatComposer;
const voiceUnavailable = 'Ghi âm chưa khả dụng nên Kael chưa nhận được lời nói.';
const webScrollbarStyle = { outlineStyle: 'solid', outlineWidth: 0, scrollbarWidth: 'none' } as const;

export function ChatComposer({ value, onChange, onSubmit, error, onMediaChange, initialImages, onImagesChange, mediaExternallyManaged, locked = false, onFocus, onBlur }: Props) {
  const media = useComposerMedia(initialImages, onImagesChange, mediaExternallyManaged);
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);
  const errorText = error || media.error || voiceNotice;
  const retainedError = useRetained(errorText);
  const canSend = !locked && (value.trim().length > 0 || media.images.length > 0);
  const [inputHeight, setInputHeight] = useState<number>(metrics.inputMinHeight);
  const submit = () => { if (canSend) onSubmit(media.images); };
  const { reduceMotion } = useGlassAccessibility();
  const micFeedback = usePressFeedback(reduceMotion);
  const voice = useLiquidVoice(() => setVoiceNotice(voiceUnavailable));
  const startVoice = () => { setVoiceNotice(null); voice.start(); };
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
    { id: 'photos', label: 'Thêm ảnh/tệp', icon: 'attach', disabled: photoUnavailable, onPress: () => { onMediaChange?.(); void media.pick(); } },
    { id: 'camera', label: 'Chụp ảnh', icon: 'camera', detail: 'Sắp có', disabled: true, onPress: () => undefined },
    { id: 'web', label: 'Tìm kiếm web', icon: 'globe', detail: 'Sắp có', disabled: true, onPress: () => undefined },
    { id: 'think', label: 'Suy nghĩ sâu', icon: 'bolt', detail: 'Sắp có', disabled: true, onPress: () => undefined },
  ];
  return <View>
    <Presence visible={Boolean(errorText)} style={styles.errorSlot}>
      <Text accessibilityLiveRegion="polite" style={styles.error}>{retainedError}</Text>
    </Presence>
    <View style={styles.frame}>
    {media.images.length > 0 && <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imageRail} contentContainerStyle={styles.imageContent} keyboardShouldPersistTaps="handled">
      {media.images.map((item, index) => <View key={`${item.uri}-${index}`} style={styles.imageFrame}>
        <Image source={{ uri: item.uri }} accessibilityLabel="Ảnh đã chọn" style={styles.image} />
        <Pressable accessibilityRole="button" accessibilityLabel={`Xóa ảnh ${index + 1}`} hitSlop={metrics.removeHitSlop} onPress={() => { media.remove(index); onMediaChange?.(); }} style={styles.removeImage}><Icon name="close" color={colors.inputText} size={metrics.removeIconSize}/></Pressable>
      </View>)}
    </ScrollView>}
    <View style={styles.controls}>
    <View ref={trigger} collapsable={false}>
      <PressScale accessibilityRole="button" accessibilityLabel="Đính kèm" accessibilityState={{ expanded: menuAnchor !== null }} onPress={openMenu} style={styles.media}>
        <Icon name="plus" size={metrics.mediaIconSize} strokeWidth={metrics.mediaIconStroke} color={colors.mediaIcon} />
      </PressScale>
    </View>
    {menuAnchor && <ComposerMenu anchor={menuAnchor} items={menuItems} onClose={() => setMenuAnchor(null)}/>}
    <View style={styles.inputSlot}>
      <TextInput
        accessibilityLabel="Nhắn Kael"
        style={[styles.input, Platform.OS === 'web' && webScrollbarStyle, Platform.OS === 'web' && { height: value ? inputHeight : metrics.inputMinHeight }]}
        value={value}
        editable={!locked}
        onChangeText={onChange}
        onFocus={onFocus}
        onBlur={onBlur}
        placeholder="Nhắn Kael..."
        placeholderTextColor={colors.placeholder}
        multiline
        maxLength={5000}
        numberOfLines={1}
        onContentSizeChange={event => {
          if (Platform.OS === 'web') setInputHeight(Math.min(metrics.inputMaxHeight, Math.max(metrics.inputMinHeight, event.nativeEvent.contentSize.height)));
        }}
        submitBehavior={Platform.OS === 'web' ? 'submit' : 'newline'}
        blurOnSubmit={Platform.OS === 'web'}
        scrollEnabled={Platform.OS !== 'web' || inputHeight >= metrics.inputMaxHeight}
        onSubmitEditing={() => { Keyboard.dismiss(); submit(); }}
        autoCorrect
        spellCheck={false}
      />
    </View>
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
    {voice.recording && <View style={styles.voiceLayer}><LiquidVoiceCapsule onCancel={voice.cancel} onSend={voice.finish}/></View>}
    </View>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  frame: { minHeight: metrics.frameMinHeight, padding: metrics.framePadding, borderRadius: metrics.frameRadius, borderWidth: metrics.frameBorderWidth, borderColor: colors.surfaceBorder, backgroundColor: colors.surface, boxShadow: colors.surfaceShadow },
  controls: { flexDirection: 'row', alignItems: 'flex-end', gap: metrics.controlGap },
  imageRail: { flexGrow: 0 },
  imageContent: { gap: metrics.imageGap, padding: metrics.imagePadding },
  imageFrame: { width: metrics.imageSize, height: metrics.imageSize },
  image: { width: metrics.imageSize, height: metrics.imageSize, borderRadius: metrics.imageRadius },
  removeImage: { position: 'absolute', top: -metrics.removeOffset, right: -metrics.removeOffset, width: metrics.removeSize, height: metrics.removeSize, borderRadius: metrics.removeRadius, backgroundColor: colors.mediaRemoveSurface, alignItems: 'center', justifyContent: 'center' },
  errorSlot: { position: 'absolute', left: metrics.errorInsetLeft, right: 0, bottom: metrics.errorBottom, marginBottom: metrics.errorGap },
  error: { color: colors.noticeText, fontSize: metrics.errorSize, lineHeight: metrics.errorLineHeight, textAlign: 'right' },
  media: { height: metrics.mediaSize, width: metrics.mediaSize, borderRadius: metrics.mediaRadius, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, minWidth: 0, minHeight: metrics.inputMinHeight, maxHeight: metrics.inputMaxHeight, fontSize: metrics.inputFontSize, lineHeight: metrics.inputLineHeight, paddingHorizontal: metrics.inputPaddingHorizontal, paddingVertical: metrics.inputPaddingVertical, color: colors.inputText, textAlignVertical: 'top', outlineWidth: 0, outlineColor: 'transparent' },
  inputSlot: { flex: 1, minWidth: 0, justifyContent: 'center' },
  voiceLayer: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, flexDirection: 'row' },
  sendSlot: { height: metrics.sendSlotSize, width: metrics.sendSlotSize, alignItems: 'center', justifyContent: 'center' },
  send: { height: metrics.sendSize, width: metrics.sendSize, borderRadius: metrics.sendRadius, borderWidth: metrics.sendBorderWidth, borderColor: colors.idleSendBorder, backgroundColor: colors.idleSendSurface, alignItems: 'center', justifyContent: 'center' },
  sendActive: { borderColor: colors.activeSendBorder, backgroundColor: colors.activeSendSurface },
});
