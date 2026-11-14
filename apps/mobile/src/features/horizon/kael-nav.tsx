import { StyleSheet, View } from 'react-native';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';
import { GlassIconButton, Icon } from '@/features/shared';
import { useOnboardingTarget } from '@/features/onboarding';

const metrics = horizonLayout.kaelCompanion;
const backing = { backgroundColor: horizonColors.bg, borderRadius: horizonLayout.glass.controlRadius };

type ChatProps = {
  onMenu: () => void;
  onOptions: () => void;
};

export function KaelChatNav({ onMenu, onOptions }: ChatProps) {
  const menuTarget = useOnboardingTarget('menu');
  return <View style={styles.bar}>
    <View {...menuTarget}>
      <GlassIconButton label="Mở thanh bên" onPress={onMenu} style={backing}><Icon name="menu" size={horizonLayout.glass.iconSize}/></GlassIconButton>
    </View>
    <GlassIconButton label="Tùy chọn cuộc trò chuyện" onPress={onOptions} style={backing}><Icon name="compose" size={horizonLayout.glass.iconSize}/></GlassIconButton>
  </View>;
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', top: metrics.navInset, left: metrics.navSideInset, right: metrics.navSideInset, height: metrics.avatarSize, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
