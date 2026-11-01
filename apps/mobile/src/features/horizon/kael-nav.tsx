import { Image, StyleSheet, Text, View } from 'react-native';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';
import { GlassIconButton } from './glass-controls';
import { Icon } from './icon';
import { kaelPlushImage } from './kael-assets';

const metrics = horizonLayout.kaelCompanion;
const colors = horizonColors.kaelCompanion;

type ChatProps = {
  onMenu: () => void;
  onOptions: () => void;
};

export function KaelChatNav({ onMenu, onOptions }: ChatProps) {
  return <View style={styles.bar}>
    <GlassIconButton label="Mở thanh bên" onPress={onMenu}><Icon name="menu" size={horizonLayout.glass.iconSize}/></GlassIconButton>
    <View accessible accessibilityLabel="Kael" style={styles.identity}>
      <View style={styles.avatar}>
        <Image source={kaelPlushImage} accessibilityIgnoresInvertColors style={styles.avatarImage} resizeMode="cover"/>
      </View>
      <Text style={styles.name}>Kael</Text>
    </View>
    <GlassIconButton label="Tùy chọn cuộc trò chuyện" onPress={onOptions}><Icon name="compose" size={horizonLayout.glass.iconSize}/></GlassIconButton>
  </View>;
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', top: metrics.navInset, left: metrics.navSideInset, right: metrics.navSideInset, height: metrics.avatarSize, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  identity: { flexDirection: 'row', alignItems: 'center', gap: metrics.identityGap },
  avatar: { width: metrics.avatarSize, height: metrics.avatarSize, borderRadius: metrics.avatarRadius, borderWidth: metrics.suggestionBorderWidth, borderColor: colors.navBorder, backgroundColor: colors.navSurface, overflow: 'hidden' },
  avatarImage: { position: 'absolute', width: metrics.avatarImageWidth, height: metrics.avatarImageWidth * metrics.plushAspectRatio, top: metrics.avatarImageTop, left: metrics.avatarImageLeft },
  name: { fontSize: metrics.identityNameSize, fontWeight: metrics.identityNameWeight, color: colors.introTitle },
});
