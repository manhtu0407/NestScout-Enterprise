import { StyleSheet, View } from 'react-native';
import { horizonLayout } from '@/theme/layout';
import { GlassIconButton, Icon } from '@/features/shared';

const metrics = horizonLayout.kaelCompanion;

type ChatProps = {
  onMenu: () => void;
  onOptions: () => void;
};

export function KaelChatNav({ onMenu, onOptions }: ChatProps) {
  return <View style={styles.bar}>
    <GlassIconButton label="Mở thanh bên" onPress={onMenu}><Icon name="menu" size={horizonLayout.glass.iconSize}/></GlassIconButton>
    <GlassIconButton label="Tùy chọn cuộc trò chuyện" onPress={onOptions}><Icon name="compose" size={horizonLayout.glass.iconSize}/></GlassIconButton>
  </View>;
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', top: metrics.navInset, left: metrics.navSideInset, right: metrics.navSideInset, height: metrics.avatarSize, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
