import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PressScale, type CustomerSettings } from '@/features/shared';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

import type { UserProfile } from './content';
import { LiquidSwitch } from './liquid-switch';
import { ProfileAvatar } from './profile-avatar';
import { SupportCard, SupportRow, SupportSection, SupportShell } from './support-shell';

const metrics = horizonLayout.supportScreens;
const colors = horizonColors.supportScreens;

type ToggleId = keyof CustomerSettings;

export const defaultSettings: CustomerSettings = { push: true, quotes: true, messages: true, promotions: false, reduce_motion: false };

type Props = {
  onBack: () => void;
  profile?: UserProfile;
  onEditProfile?: () => void;
  settings?: CustomerSettings;
  onChangeSettings?: (next: CustomerSettings) => Promise<void>;
};

export function SettingsScreen({ onBack, profile, onEditProfile, settings, onChangeSettings }: Props) {
  const [toggles, setToggles] = useState<CustomerSettings>(settings ?? defaultSettings);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const toggle = (id: ToggleId) => {
    if (saving) return;
    const previous = toggles;
    const next = { ...toggles, [id]: !toggles[id] };
    setToggles(next);
    if (!onChangeSettings) return;
    setSaving(true);
    setSaveError(null);
    onChangeSettings(next).then(
      () => setSaving(false),
      () => {
        setToggles(previous);
        setSaving(false);
        setSaveError('Chưa lưu được cài đặt. Kiểm tra kết nối rồi thử lại.');
      },
    );
  };
  const switchFor = (id: ToggleId, label: string) => (
    <LiquidSwitch accessibilityLabel={label} value={toggles[id]} onValueChange={() => toggle(id)} />
  );
  return (
    <SupportShell title="Cài đặt" onBack={onBack}>
      {profile && onEditProfile ? (
        <SupportSection>
          <SupportCard>
            <PressScale accessibilityRole="button" accessibilityLabel={`Thông tin cá nhân, ${profile.name}`} onPress={onEditProfile} style={styles.profile}>
              <ProfileAvatar name={profile.name} uri={profile.avatarUri} headers={profile.avatarHeaders} size={metrics.profileAvatarSize} initialSize={metrics.profileAvatarInitialSize} />
              <View style={styles.profileCopy}>
                <Text numberOfLines={1} style={styles.profileName}>{profile.name}</Text>
                <Text numberOfLines={1} style={styles.profileDetail}>{profile.email || profile.phone}</Text>
              </View>
              <Text style={styles.profileAction}>Chỉnh sửa</Text>
            </PressScale>
          </SupportCard>
        </SupportSection>
      ) : null}
      <SupportSection title="Thông báo">
        {saveError ? <Text accessibilityLiveRegion="polite" style={styles.error}>{saveError}</Text> : null}
        <SupportCard>
          <SupportRow icon="bell" title="Thông báo đẩy" detail="Nhận cập nhật ngay trên thiết bị" trailing={switchFor('push', 'Thông báo đẩy')} />
          <SupportRow icon="receipt" title="Báo giá mới" trailing={switchFor('quotes', 'Báo giá mới')} />
          <SupportRow icon="chat" title="Tin nhắn từ thợ và Kael" trailing={switchFor('messages', 'Tin nhắn từ thợ và Kael')} />
          <SupportRow icon="star" title="Ưu đãi và tin tức" trailing={switchFor('promotions', 'Ưu đãi và tin tức')} />
        </SupportCard>
      </SupportSection>
      <SupportSection title="Chung">
        <SupportCard>
          <SupportRow icon="globe" title="Ngôn ngữ" detail="Tiếng Việt" onPress={() => undefined} />
          <SupportRow icon="eye" title="Giao diện" detail="Sáng" onPress={() => undefined} />
          <SupportRow icon="bolt" title="Giảm chuyển động" trailing={switchFor('reduce_motion', 'Giảm chuyển động')} />
        </SupportCard>
      </SupportSection>
      <SupportSection title="Quyền riêng tư">
        <SupportCard>
          <SupportRow icon="home" title="Vị trí" detail="Khi dùng ứng dụng" onPress={() => undefined} />
          <SupportRow icon="trash" title="Xoá lịch sử trò chuyện" danger onPress={() => undefined} />
        </SupportCard>
      </SupportSection>
      <SupportSection title="Giới thiệu">
        <SupportCard>
          <SupportRow icon="requests" title="Điều khoản dịch vụ" onPress={() => undefined} />
          <SupportRow icon="eye" title="Chính sách quyền riêng tư" onPress={() => undefined} />
          <SupportRow icon="help" title="Phiên bản" detail="Bản xem trước" />
        </SupportCard>
      </SupportSection>
    </SupportShell>
  );
}

const styles = StyleSheet.create({
  profile: { minHeight: metrics.rowMinHeight, flexDirection: 'row', alignItems: 'center', gap: metrics.rowGap, paddingHorizontal: metrics.rowPaddingHorizontal, paddingVertical: metrics.rowPaddingVertical },
  profileCopy: { flex: 1, minWidth: 0 },
  profileName: { color: horizonColors.text, fontSize: metrics.profileNameSize, fontWeight: metrics.rowTitleWeight },
  profileDetail: { color: horizonColors.muted, fontSize: metrics.rowDetailSize, lineHeight: metrics.rowDetailLineHeight, marginTop: metrics.rowDetailGap },
  error: { color: colors.danger, fontSize: metrics.rowDetailSize, lineHeight: metrics.rowDetailLineHeight, marginBottom: metrics.sectionTitleGap, marginLeft: metrics.sectionTitleInset },
  profileAction: { color: colors.actionLabel, fontSize: metrics.rowDetailSize, fontWeight: metrics.heroChipWeight },
});
