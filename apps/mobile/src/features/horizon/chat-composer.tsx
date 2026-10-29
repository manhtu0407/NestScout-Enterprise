import { horizonLayout } from '@/theme/layout';
import React from 'react';
import { Keyboard, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Icon } from './icon';
import { horizonColors, horizonColors as colors } from '@/theme/palette';

type Props = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onAttach?: () => void;
  onVoice?: () => void;
};

export function ChatComposer({ value, onChange, onSubmit, onAttach, onVoice }: Props) {
  return (
    <View style={styles.row}>
      <Pressable accessibilityLabel="Đính kèm" onPress={onAttach} style={styles.add}><Icon name="plus" size={23}/></Pressable>
      <TextInput
        accessibilityLabel="Nhắn Kael"
        style={styles.input}
        value={value}
        onChangeText={onChange}
        placeholder="Nhắn Kael..."
        placeholderTextColor={colors.muted}
        returnKeyType="send"
        onSubmitEditing={() => { Keyboard.dismiss(); onSubmit(); }}
        blurOnSubmit={false}
        autoCorrect
      />
      <Pressable accessibilityLabel="Giọng nói" style={styles.micro} onPress={onVoice}><Icon name="mic" size={22}/></Pressable>
      <Pressable accessibilityLabel="Gửi" style={styles.send} onPress={onSubmit}><Icon name="arrowUp" color={horizonColors.chatComposer.iconColor} size={22}/></Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { height: horizonLayout.chatComposer.rowHeight, minWidth: 0, flexDirection: 'row', alignItems: 'center', backgroundColor: horizonColors.chatComposer.rowBackgroundColor, borderRadius: horizonLayout.chatComposer.rowBorderRadius, borderColor: colors.borderBright, borderWidth: horizonLayout.chatComposer.rowBorderWidth, padding: horizonLayout.chatComposer.rowPadding, shadowColor: horizonColors.chatComposer.rowShadowColor, shadowOffset: { width: 0, height: horizonLayout.chatComposer.shadowOffsetHeight }, shadowRadius: horizonLayout.chatComposer.rowShadowRadius, shadowOpacity: Platform.select({ ios: horizonLayout.chatComposer.rowShadowOpacity, default: 0 }) },
  input: { flex: 1, minWidth: 0, height: horizonLayout.chatComposer.inputHeight, fontSize: horizonLayout.chatComposer.inputFontSize, color: colors.text, paddingHorizontal: horizonLayout.chatComposer.inputPaddingHorizontal, paddingVertical: 0 },
  add: { height: horizonLayout.chatComposer.addHeight, width: horizonLayout.chatComposer.addWidth, borderRadius: horizonLayout.chatComposer.addBorderRadius, backgroundColor: horizonColors.chatComposer.addBackgroundColor, alignItems: 'center', justifyContent: 'center' },
  micro: { height: horizonLayout.chatComposer.microHeight, width: horizonLayout.chatComposer.microWidth, alignItems: 'center', justifyContent: 'center', marginRight: horizonLayout.chatComposer.microMarginRight },
  send: { height: horizonLayout.chatComposer.sendHeight, width: horizonLayout.chatComposer.sendWidth, borderRadius: horizonLayout.chatComposer.sendBorderRadius, backgroundColor: colors.mint, alignItems: 'center', justifyContent: 'center' },
});
