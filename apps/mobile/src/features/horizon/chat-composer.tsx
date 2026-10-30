import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';
import { useState } from 'react';
import { Image, Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { composerImageLimit, useComposerMedia, type ComposerImage } from './composer-media';
import { Icon } from './icon';

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
};

const metrics = horizonLayout.chatComposer;
const colors = horizonColors.chatComposer;
const webScrollbarStyle = { outlineStyle: 'solid', outlineWidth: 0, scrollbarWidth: 'none' } as const;

export function ChatComposer({ value, onChange, onSubmit, error, onMediaChange, initialImages, onImagesChange, mediaExternallyManaged, locked = false }: Props) {
  const media = useComposerMedia(initialImages, onImagesChange, mediaExternallyManaged);
  const canSend = !locked && (value.trim().length > 0 || media.images.length > 0);
  const [inputHeight, setInputHeight] = useState<number>(metrics.inputMinHeight);
  const [focused, setFocused] = useState(false);
  const submit = () => { if (canSend) onSubmit(media.images); };
  return <View>
    {(error || media.error) && <Text accessibilityLiveRegion="polite" style={styles.error}>{error ?? media.error}</Text>}
    <View style={[styles.frame, focused && styles.focusedFrame]}>
    {media.images.length > 0 && <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imageRail} contentContainerStyle={styles.imageContent} keyboardShouldPersistTaps="handled">
      {media.images.map((item, index) => <View key={`${item.uri}-${index}`} style={styles.imageFrame}>
        <Image source={{ uri: item.uri }} accessibilityLabel="Ảnh đã chọn" style={styles.image} />
        <Pressable accessibilityRole="button" accessibilityLabel={`Xóa ảnh ${index + 1}`} onPress={() => { media.remove(index); onMediaChange?.(); }} style={styles.removeImage}><Icon name="close" color={colors.inputText} size={metrics.removeIconSize}/></Pressable>
      </View>)}
    </ScrollView>}
    <View style={styles.controls}>
    <Pressable accessibilityRole="button" accessibilityLabel="Đính kèm" accessibilityState={{ disabled: locked || media.images.length >= composerImageLimit }} disabled={locked || media.images.length >= composerImageLimit} onPress={() => { onMediaChange?.(); void media.pick(); }} style={styles.media}>
      <Icon name="camera" size={metrics.mediaIconSize} strokeWidth={2.04} color={colors.mediaIcon} />
    </Pressable>
    <TextInput
      accessibilityLabel="Nhắn Kael"
      style={[styles.input, Platform.OS === 'web' && webScrollbarStyle, Platform.OS === 'web' && { height: value ? inputHeight : metrics.inputMinHeight }]}
      value={value}
      editable={!locked}
      onChangeText={onChange}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
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
    />
    <View style={styles.sendSlot}>
      <Pressable accessibilityRole="button" accessibilityLabel="Gửi" accessibilityState={{ disabled: !canSend }} disabled={!canSend} onPress={submit} style={[styles.send, canSend && styles.sendActive]}>
        <Icon name="arrowUp" color={canSend ? colors.activeSendIcon : colors.idleSendIcon} size={metrics.sendIconSize} strokeWidth={metrics.sendIconStroke} />
      </Pressable>
    </View>
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
  error: { color: colors.errorText, fontSize: metrics.errorSize, marginBottom: metrics.errorGap },
  focusedFrame: { borderColor: colors.focusedSurfaceBorder },
  media: { height: metrics.mediaSize, width: metrics.mediaSize, borderRadius: metrics.mediaRadius, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, minWidth: 0, minHeight: metrics.inputMinHeight, maxHeight: metrics.inputMaxHeight, fontSize: metrics.inputFontSize, paddingHorizontal: metrics.inputPaddingHorizontal, paddingVertical: metrics.inputPaddingVertical, color: colors.inputText, textAlignVertical: 'top', outlineWidth: 0, outlineColor: 'transparent' },
  sendSlot: { height: metrics.sendSlotSize, width: metrics.sendSlotSize, alignItems: 'center', justifyContent: 'center' },
  send: { height: metrics.sendSize, width: metrics.sendSize, borderRadius: metrics.sendRadius, borderWidth: metrics.sendBorderWidth, borderColor: colors.idleSendBorder, backgroundColor: colors.idleSendSurface, alignItems: 'center', justifyContent: 'center' },
  sendActive: { borderColor: colors.activeSendBorder, backgroundColor: colors.activeSendSurface },
});
