import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ActionButton, AppText, BodyText, Divider, ErrorText, Heading, IconButton, LoadingView, Screen, StateView, StatusIndicator, Surface, TextField } from '@/features/shared';
import { layout } from '@/theme/layout';
import { usePalette } from '@/theme/palette';

export function FoundationShowcase() {
  const palette = usePalette();
  const [pressed, setPressed] = useState(false);
  const [value, setValue] = useState('');

  return (
    <Screen>
      <Heading>Development component showcase</Heading>
      <BodyText>Revision: {process.env.EXPO_PUBLIC_DESIGN_REVISION || 'not supplied'}</BodyText>
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
      <ActionButton label="Selected action" secondary selected onPress={() => setPressed(!pressed)} />
      <IconButton label="Toggle selection" selected={pressed} onPress={() => setPressed(!pressed)}><AppText>★</AppText></IconButton>
      <Heading>Typography</Heading>
      <AppText variant="title">Tiêu đề lớn</AppText>
      <AppText variant="subheading">Thông tin dịch vụ</AppText>
      <AppText variant="caption" muted>Thông tin bổ sung</AppText>
      <Heading>Fields and surfaces</Heading>
      <TextField label="Your name" value={value} onChangeText={setValue} hint="Enter a name" />
      <TextField label="Example error" value="" error="This field is required" />
      <TextField label="Unavailable field" value="" editable={false} />
      <Surface elevated><AppText variant="subheading">Surface</AppText><Divider /><BodyText>Shared content for Client and Worker.</BodyText><StatusIndicator label="Ready" tone="success" /><StatusIndicator label="Needs attention" tone="warning" /><StatusIndicator label="Unavailable" tone="danger" /></Surface>
      <StateView title="Nothing here yet" message="Items will appear here when available." />
      <StateView title="Unable to load" message="Please try again." action={{ label: 'Retry', onPress: () => setPressed(!pressed) }} />
      <LoadingView label="Loading example" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  swatchRow: { flexDirection: 'row', alignItems: 'center', gap: layout.loading.gap },
  swatch: { width: layout.control.minHeight, height: layout.control.minHeight, borderRadius: layout.control.radius, borderWidth: layout.input.borderWidth },
});
