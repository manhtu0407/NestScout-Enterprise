import { StyleSheet, Text, View } from 'react-native';

import { PressScale } from '@/features/shared';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

import { ProfileAvatar } from './profile-avatar';
import { SupportCard, SupportRow, SupportSection, SupportShell, supportStyles } from './support-shell';

const metrics = horizonLayout.supportScreens;
const colors = horizonColors.supportScreens;

type Props = {
  mode: 'guest' | 'client' | 'worker';
  profileName?: string;
  avatarUri?: string;
  phoneLabel?: string;
  onBack: () => void;
  onSignIn: (role: 'client' | 'worker') => void;
  onChangeMode: () => void;
  onSignOut?: () => void;
  onEditProfile?: () => void;
};

export function AccountScreen({ mode, profileName, avatarUri, phoneLabel, onBack, onSignIn, onChangeMode, onSignOut, onEditProfile }: Props) {
  if (mode === 'guest') {
    return (
      <SupportShell title="Tài khoản và đăng nhập" onBack={onBack}>
        <View style={styles.hero}>
          <ProfileAvatar size={metrics.avatarSize} initialSize={metrics.avatarInitialSize} />
          <Text style={styles.heroName}>Bạn đang dùng với tư cách khách</Text>
          <Text style={styles.heroBody}>Đăng nhập để gửi yêu cầu và nhận báo giá từ thợ gần bạn.</Text>
          <View style={styles.actions}>
            <PressScale accessibilityRole="button" accessibilityLabel="Đăng nhập với vai trò Khách hàng" onPress={() => onSignIn('client')} style={supportStyles.primary}>
              <Text style={supportStyles.primaryLabel}>Đăng nhập Khách hàng</Text>
            </PressScale>
            <PressScale accessibilityRole="button" accessibilityLabel="Đăng nhập với vai trò Thợ" onPress={() => onSignIn('worker')} style={supportStyles.secondary}>
              <Text style={supportStyles.secondaryLabel}>Đăng nhập Thợ</Text>
            </PressScale>
          </View>
        </View>
        <SupportSection title="Vai trò">
          <SupportCard>
            <SupportRow icon="user" title="Đổi vai trò" detail="Khách" onPress={onChangeMode} />
          </SupportCard>
        </SupportSection>
      </SupportShell>
    );
  }
  const modeLabel = mode === 'worker' ? 'Thợ' : 'Khách hàng';
  return (
    <SupportShell title="Tài khoản và đăng nhập" onBack={onBack}>
      <View style={styles.hero}>
        <ProfileAvatar name={profileName} uri={avatarUri} size={metrics.avatarSize} initialSize={metrics.avatarInitialSize} />
        <Text style={styles.heroName}>{profileName ?? 'Tài khoản của bạn'}</Text>
        {phoneLabel ? <Text style={styles.heroBody}>{phoneLabel}</Text> : null}
        <View style={styles.chip}>
          <Text style={styles.chipText}>{modeLabel}</Text>
        </View>
      </View>
      <SupportSection title="Tài khoản">
        <SupportCard>
          <SupportRow icon="user" title="Thông tin cá nhân" detail="Tên, email, địa chỉ" onPress={onEditProfile ?? (() => undefined)} />
          <SupportRow icon="home" title="Địa chỉ đã lưu" onPress={() => undefined} />
          <SupportRow icon="login" title="Đăng nhập và bảo mật" detail="Số điện thoại, mã xác thực" onPress={() => undefined} />
        </SupportCard>
      </SupportSection>
      <SupportSection title="Vai trò">
        <SupportCard>
          <SupportRow icon="user" title="Đổi vai trò" detail={modeLabel} onPress={onChangeMode} />
        </SupportCard>
      </SupportSection>
      <SupportSection>
        <SupportCard>
          <SupportRow icon="login" title="Đăng xuất" danger onPress={onSignOut ?? (() => undefined)} />
        </SupportCard>
      </SupportSection>
    </SupportShell>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: metrics.heroRadius, padding: metrics.heroPadding, gap: metrics.heroGap, backgroundColor: colors.heroFill, alignItems: 'center', marginBottom: metrics.sectionGap },
  heroName: { color: horizonColors.text, fontSize: metrics.heroNameSize, fontWeight: metrics.heroNameWeight, textAlign: 'center' },
  heroBody: { color: horizonColors.muted, fontSize: metrics.heroBodySize, lineHeight: metrics.heroBodyLineHeight, textAlign: 'center' },
  chip: { height: metrics.heroChipHeight, paddingHorizontal: metrics.heroChipPaddingHorizontal, borderRadius: metrics.heroChipRadius, backgroundColor: colors.chipFill, justifyContent: 'center' },
  chipText: { color: colors.chipText, fontSize: metrics.heroChipSize, fontWeight: metrics.heroChipWeight },
  actions: { alignSelf: 'stretch', gap: metrics.primaryGap, marginTop: metrics.primaryGap },
});
