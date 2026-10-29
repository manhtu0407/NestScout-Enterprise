import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ActionButton, BodyText, ErrorText, Heading, Screen } from '@/features/shared';
import { layout } from '@/theme/layout';
import { usePalette } from '@/theme/palette';

export function FoundationShowcase() {
  const palette = usePalette();
  const [pressed, setPressed] = useState(false);

  return (
    <Screen>
      <Heading>Development component showcase</Heading>
      <BodyText>Typography and long text</BodyText>
      <BodyText>Tiếng Việt có dấu: Yêu cầu hỗ trợ căn hộ, thông tin chi tiết và hướng dẫn tiếp theo.</BodyText>
      <BodyText muted>Muted text</BodyText>
      <ErrorText>Error text</ErrorText>
      <Heading>Colors</Heading>
      {Object.entries(palette).map(([name, color]) => (
        <View key={name} style={styles.swatchRow}>
          <View accessibilityLabel={`${name} color`} style={[styles.swatch, { backgroundColor: color, borderColor: palette.border }]} />
          <BodyText>{name}: {color}</BodyText>
        </View>
      ))}
      <Heading>Actions</Heading>
      <ActionButton label="Press to change state" onPress={() => setPressed(!pressed)} />
      <BodyText>{pressed ? 'Action pressed' : 'Action ready'}</BodyText>
      <ActionButton label="Secondary action" secondary onPress={() => setPressed(!pressed)} />
      <ActionButton label="Disabled action" disabled onPress={() => setPressed(!pressed)} />
      <ActionButton label="Loading action" busy onPress={() => setPressed(!pressed)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  swatchRow: { flexDirection: 'row', alignItems: 'center', gap: layout.loading.gap },
  swatch: { width: layout.control.minHeight, height: layout.control.minHeight, borderRadius: layout.control.radius, borderWidth: layout.input.borderWidth },
});
