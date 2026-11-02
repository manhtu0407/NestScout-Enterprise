import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { PressScale } from '@/features/shared';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

import type { UserProfile } from './content';
import { ProfileAvatar } from './profile-avatar';
import { SupportShell, supportStyles } from './support-shell';

const metrics = horizonLayout.supportScreens;
const colors = horizonColors.supportScreens;
const webInputStyle = { outlineStyle: 'solid', outlineWidth: 0 } as const;

type Props = { profile: UserProfile; onBack: () => void; onSave: (next: UserProfile) => void | Promise<void>; avatarEnabled?: boolean };

type EditableField = 'name' | 'email' | 'address';

export function ProfileEditScreen({ profile, onBack, onSave, avatarEnabled = true }: Props) {
  const [draft, setDraft] = useState(profile);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const changed = draft.name !== profile.name || draft.email !== profile.email || draft.address !== profile.address || draft.avatarUri !== profile.avatarUri;
  const pickAvatar = async () => {
    setPickError(null);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
      const uri = result.canceled ? undefined : result.assets[0]?.uri;
      const asset = result.canceled ? undefined : result.assets[0];
      if (uri) setDraft(current => ({ ...current, avatarUri: uri, avatarHeaders: undefined, avatarMimeType: asset?.mimeType }));
    } catch {
      setPickError('Không thể mở thư viện ảnh. Vui lòng thử lại.');
    }
  };
  const removeAvatar = () => setDraft(current => ({ ...current, avatarUri: undefined, avatarHeaders: undefined, avatarMimeType: undefined }));
  const canSave = changed && draft.name.trim().length > 0 && !saving;
  const update = (field: EditableField) => (value: string) => setDraft(current => ({ ...current, [field]: value }));
  const save = async () => {
    if (!canSave) return;
    const next = { ...draft, name: draft.name.trim(), email: draft.email.trim(), address: draft.address.trim() };
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(next);
      onBack();
    } catch {
      setSaving(false);
      setSaveError('Chưa lưu được. Hãy kiểm tra họ tên, email và địa chỉ rồi thử lại.');
    }
  };
  return (
    <SupportShell title="Thông tin cá nhân" onBack={onBack}>
      <View style={styles.avatarBlock}>
        <ProfileAvatar name={draft.name} uri={draft.avatarUri} headers={draft.avatarHeaders} size={metrics.editAvatarSize} initialSize={metrics.editAvatarInitialSize} />
        {avatarEnabled ? <View style={styles.avatarActions}>
          <PressScale accessibilityRole="button" accessibilityLabel={draft.avatarUri ? 'Đổi ảnh đại diện' : 'Thêm ảnh đại diện'} onPress={pickAvatar} style={styles.avatarAction}>
            <Text style={styles.avatarActionLabel}>{draft.avatarUri ? 'Đổi ảnh' : 'Thêm ảnh'}</Text>
          </PressScale>
          {draft.avatarUri ? (
            <PressScale accessibilityRole="button" accessibilityLabel="Xoá ảnh đại diện" onPress={removeAvatar} style={styles.avatarAction}>
              <Text style={[styles.avatarActionLabel, styles.avatarActionDanger]}>Xoá ảnh</Text>
            </PressScale>
          ) : null}
        </View> : null}
        {pickError ? <Text style={styles.hint}>{pickError}</Text> : null}
      </View>
      <Field label="Họ và tên" value={draft.name} onChangeText={update('name')} placeholder="Nhập họ và tên" autoComplete="name" />
      {profile.phone ? <View style={styles.field}>
        <Text style={styles.label}>Số điện thoại</Text>
        <View style={[styles.box, styles.boxLocked]}>
          <Text style={styles.lockedValue}>{profile.phone}</Text>
        </View>
        <Text style={styles.hint}>Số điện thoại đã xác thực bằng mã OTP nên không đổi tại đây.</Text>
      </View> : null}
      <Field label="Email" value={draft.email} onChangeText={update('email')} placeholder="Không bắt buộc" autoComplete="email" keyboardType="email-address" />
      <Field label="Địa chỉ" value={draft.address} onChangeText={update('address')} placeholder="Số nhà, đường, phường, quận" autoComplete="street-address" />
      {saveError ? <Text accessibilityLiveRegion="polite" style={styles.hint}>{saveError}</Text> : null}
      <PressScale
        accessibilityRole="button"
        accessibilityLabel="Lưu thay đổi"
        accessibilityState={{ disabled: !canSave }}
        disabled={!canSave}
        onPress={save}
        style={[supportStyles.primary, !canSave && styles.saveDisabled]}
        wrapperStyle={styles.save}
      >
        <Text style={supportStyles.primaryLabel}>Lưu thay đổi</Text>
      </PressScale>
    </SupportShell>
  );
}

type FieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  autoComplete: 'name' | 'email' | 'street-address';
  keyboardType?: 'email-address';
};

function Field({ label, value, onChangeText, placeholder, autoComplete, keyboardType }: FieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.box}>
        <TextInput
          accessibilityLabel={label}
          style={[styles.input, webInputStyle]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.searchPlaceholder}
          autoComplete={autoComplete}
          keyboardType={keyboardType}
          autoCapitalize={keyboardType === 'email-address' ? 'none' : 'words'}
          spellCheck={false}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  avatarBlock: { alignItems: 'center', marginBottom: metrics.avatarBlockGap },
  avatarActions: { flexDirection: 'row', alignItems: 'center', gap: metrics.avatarActionGap, marginTop: metrics.avatarActionGap },
  avatarAction: { height: metrics.avatarActionHeight, paddingHorizontal: metrics.avatarActionPadding, alignItems: 'center', justifyContent: 'center' },
  avatarActionLabel: { color: colors.actionLabel, fontSize: metrics.avatarActionSize, fontWeight: metrics.notificationActionWeight },
  avatarActionDanger: { color: colors.danger },
  field: { marginBottom: metrics.fieldGap },
  label: { color: colors.sectionTitle, fontSize: metrics.fieldLabelSize, fontWeight: metrics.fieldLabelWeight, marginBottom: metrics.fieldLabelGap, marginLeft: metrics.sectionTitleInset },
  box: { height: metrics.fieldHeight, borderRadius: metrics.fieldRadius, paddingHorizontal: metrics.fieldPaddingHorizontal, backgroundColor: colors.searchFill, justifyContent: 'center' },
  boxLocked: { opacity: metrics.lockedOpacity },
  input: { color: horizonColors.text, fontSize: metrics.fieldFontSize, height: metrics.fieldHeight },
  lockedValue: { color: horizonColors.text, fontSize: metrics.fieldFontSize },
  hint: { color: horizonColors.muted, fontSize: metrics.fieldHintSize, lineHeight: metrics.rowDetailLineHeight, marginTop: metrics.fieldHintGap, marginLeft: metrics.sectionTitleInset },
  save: { marginTop: metrics.saveMarginTop },
  saveDisabled: { opacity: metrics.saveDisabledOpacity },
});
