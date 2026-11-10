import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Animated, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

import { AvailabilitySwitch } from './availability-switch';
import { workerPreviewSummary, workerSidebarGroups } from './content';
import { CollapsibleGroup } from './sidebar-group';
import { PopBadge } from './motion-count';
import type { SidebarItem } from './content';
import { GlassCapsuleButton, GlassIconButton, Icon, useGlassAccessibility, usePressFeedback, type WorkerMissingItem } from '@/features/shared';

type Props = {
  onNavigate: (id: string) => void;
  onOpenAccount: () => void;
  onChooseMode: () => void;
  profileName?: string;
  accountLabel: string;
  badges?: Readonly<Record<string, number>>;
  workerProfile?: WorkerSidebarState;
  onSetAccepting?: (accepting: boolean) => Promise<void>;
};

export type WorkerSidebarProfile = { area: string; radiusKm: number; accepting: boolean; missing: readonly WorkerMissingItem[] };

export type WorkerSidebarState = WorkerSidebarProfile | null | 'loading';

const metrics = horizonLayout.workerSidebar;
const list = horizonLayout.sidebarList;
const colors = horizonColors.workerSidebar;
const listColors = horizonColors.sidebarList;
const avatarColors = horizonColors.accountSheet;
const supportGroupTitle = workerSidebarGroups[workerSidebarGroups.length - 1]?.title;
const lockupWidth = horizonLayout.lockup.height * horizonLayout.lockup.aspect;

function WorkerRow({ item, badge = 0, onPress }: { item: SidebarItem; badge?: number; onPress: () => void }) {
  const { reduceMotion } = useGlassAccessibility();
  const feedback = usePressFeedback(reduceMotion);
  return <Animated.View style={{ transform: [{ scale: feedback.scale }] }}>
    <Pressable accessibilityRole="button" accessibilityLabel={badge > 0 ? `${item.title}, ${badge} mới` : item.title} onPress={onPress} onPressIn={feedback.pressIn} onPressOut={feedback.pressOut} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      <Icon name={item.icon} size={list.rowIconSize} color={listColors.icon} strokeWidth={1.7}/>
      <Text style={styles.rowTitle}>{item.title}</Text>
      <PopBadge count={badge} style={styles.badge} textStyle={styles.badgeText}/>
    </Pressable>
  </Animated.View>;
}

function Profile({ profileName, roleLine, online, goHint, missingCount, onToggle }: { profileName?: string; roleLine: string; online: boolean; goHint?: string; missingCount: number; onToggle: () => void }) {
  const initial = profileName?.trim().charAt(0).toLocaleUpperCase();
  return <View style={styles.profile}>
    <View style={styles.identity}>
      <View>
        <View style={styles.avatar}>{initial ? <Text style={styles.avatarInitial}>{initial}</Text> : <Icon name="user" size={list.avatarIconSize + 2} color={avatarColors.avatarInitial}/>}</View>
        <View style={[styles.presence, { backgroundColor: online ? colors.online : colors.offline }]}/>
      </View>
      <View style={styles.identityCopy}>
        <Text numberOfLines={1} style={styles.name}>{profileName ?? 'Thợ NestScout'}</Text>
        <Text numberOfLines={1} style={styles.role}>{roleLine}</Text>
      </View>
    </View>
    <AvailabilitySwitch online={online} hint={goHint} missingCount={missingCount} onToggle={onToggle}/>
  </View>;
}

function roleLineFor(profile: WorkerSidebarState | undefined): string {
  if (profile === undefined) return workerPreviewSummary.area;
  if (profile === 'loading') return 'Đang tải hồ sơ…';
  return profile === null ? 'Chưa có hồ sơ nghề' : `${profile.area} · bán kính ${profile.radiusKm} km`;
}

function loadedWorkerProfile(profile: WorkerSidebarState | undefined): WorkerSidebarProfile | null {
  return profile !== undefined && profile !== null && profile !== 'loading' ? profile : null;
}

function onlineOf(profile: WorkerSidebarState | undefined, sampleOnline: boolean, requested: boolean | null): boolean {
  if (profile === undefined) return sampleOnline;
  if (requested !== null) return requested;
  return profile !== null && profile !== 'loading' && profile.accepting;
}

export function WorkerSidebarBody({ onNavigate, onOpenAccount, onChooseMode, profileName, accountLabel, badges = {}, workerProfile, onSetAccepting }: Props) {
  const [sampleOnline, setSampleOnline] = useState(true);
  const [pending, setPending] = useState<{ value: boolean; from: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const loadedProfile = loadedWorkerProfile(workerProfile);
  const confirmed = loadedProfile === null ? null : loadedProfile.accepting;
  const missingCount = loadedProfile === null ? 0 : loadedProfile.missing.filter(item => item !== 'identity').length;
  const requested = pending !== null && (saving || confirmed === pending.from) ? pending.value : null;
  const online = onlineOf(workerProfile, sampleOnline, requested);
  const toggle = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (workerProfile === undefined) return setSampleOnline(value => !value);
    if (workerProfile === 'loading') return;
    if (workerProfile === null) return onNavigate('worker-profile');
    if (!online && missingCount > 0) return onNavigate('worker-profile');
    if (saving || !onSetAccepting) return;
    setPending({ value: !online, from: online });
    setSaving(true);
    onSetAccepting(!online)
      .catch(() => setPending(null))
      .finally(() => setSaving(false));
  };
  const [openGroups, setOpenGroups] = useState<ReadonlySet<string>>(() => new Set(workerSidebarGroups.slice(0, 1).map(group => group.title)));
  const toggleGroup = (title: string) => setOpenGroups(current => { const next = new Set(current); if (!next.delete(title)) next.add(title); return next; });
  const initial = profileName?.trim().charAt(0).toLocaleUpperCase();
  return <>
    <View style={styles.heading}>
      <View style={styles.brand}>
        <View accessible accessibilityRole="header" accessibilityLabel="NestScout Horizon cho Thợ" style={styles.lockup}>
          <Image source={require('../../../assets/horizon/nestscout-lockup.png')} style={styles.lockupImage} resizeMode="contain"/>
        </View>
      </View>
    </View>
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Profile profileName={profileName} roleLine={roleLineFor(workerProfile)} online={online} goHint={workerProfile === null ? 'Chưa có hồ sơ nghề. Chạm để tạo hồ sơ' : undefined} missingCount={missingCount} onToggle={toggle}/>
      <View style={styles.groups}>{workerSidebarGroups.map((group, index) => <CollapsibleGroup first={index === 0} key={group.title} title={group.title} expanded={openGroups.has(group.title)} onToggle={() => toggleGroup(group.title)} badge={group.items.reduce((total, item) => total + (badges[item.id] ?? 0), 0)}>
        {group.items.map(item => <WorkerRow key={item.id} item={item} badge={badges[item.id]} onPress={() => onNavigate(item.id)}/>)}
        {group.title === supportGroupTitle && <>
          <WorkerRow item={{ id: 'mode', title: 'Đổi vai trò', icon: 'user' }} onPress={onChooseMode}/>
          <WorkerRow item={{ id: 'account', title: 'Tài khoản và đăng nhập', icon: 'login' }} onPress={() => onNavigate('profile')}/>
        </>}
      </CollapsibleGroup>)}</View>
    </ScrollView>
    <View pointerEvents="box-none" style={styles.floating}>
      <GlassIconButton label={accountLabel} hint="Mở tài khoản và chuyển vai trò" onPress={onOpenAccount}>
        <View style={styles.floatingAvatar}>{initial ? <Text style={styles.floatingInitial}>{initial}</Text> : <Icon name="user" size={list.avatarIconSize} color={avatarColors.avatarInitial}/>}</View>
      </GlassIconButton>
      <GlassCapsuleButton label="Chat" tone="light" radius={list.floatingRadius} onPress={() => onNavigate('new')} style={styles.newChat}>
        <Icon name="plus" size={22} color={listColors.onAccent} strokeWidth={2}/><Text style={styles.newChatLabel}>Chat</Text>
      </GlassCapsuleButton>
    </View>
  </>;
}

const styles = StyleSheet.create({
  heading: { height: horizonLayout.sidebar.headingHeight, flexDirection: 'row', alignItems: 'center', marginTop: horizonLayout.sidebar.headingMarginTop, marginBottom: horizonLayout.sidebar.headingMarginBottom },
  brand: { flex: 1 },
  lockup: { width: lockupWidth, height: horizonLayout.lockup.height },
  lockupImage: { width: lockupWidth, height: horizonLayout.lockup.height },
  scroll: { flex: 1 },
  content: { paddingTop: metrics.contentTop, paddingBottom: list.listBottomPadding },
  profile: { gap: metrics.profileGap, paddingBottom: metrics.profileGap, borderBottomWidth: metrics.hairlineWidth, borderBottomColor: colors.hairline },
  identity: { flexDirection: 'row', alignItems: 'center', gap: metrics.identityGap },
  avatar: { width: metrics.avatarSize, height: metrics.avatarSize, borderRadius: metrics.avatarRadius, backgroundColor: avatarColors.avatarFill, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: avatarColors.avatarInitial, fontSize: metrics.avatarInitialSize, fontWeight: list.avatarFontWeight },
  presence: { position: 'absolute', right: -metrics.presenceRing, bottom: -metrics.presenceRing, width: metrics.presenceSize, height: metrics.presenceSize, borderRadius: metrics.presenceRadius, borderWidth: metrics.presenceRing, borderColor: colors.surface },
  identityCopy: { flex: 1, gap: metrics.identityCopyGap },
  name: { color: colors.ink, fontSize: metrics.nameSize, fontWeight: metrics.nameWeight, letterSpacing: metrics.nameTracking },
  role: { color: colors.muted, fontSize: metrics.roleSize },
  groups: { paddingTop: metrics.groupsTop },
  row: { minHeight: list.rowHeight, flexDirection: 'row', alignItems: 'center', gap: list.rowGap, paddingVertical: list.rowPaddingVertical },
  rowPressed: { backgroundColor: listColors.pressed },
  rowTitle: { flex: 1, color: colors.ink, fontSize: list.rowFontSize, fontWeight: list.rowFontWeight },
  badge: { minWidth: list.badgeSize, height: list.badgeSize, paddingHorizontal: list.badgePaddingHorizontal, borderRadius: list.badgeRadius, backgroundColor: colors.badge, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: colors.onBadge, fontSize: list.badgeFontSize, fontWeight: list.badgeFontWeight },
  floating: { position: 'absolute', left: horizonLayout.sidebar.drawerPaddingHorizontal, right: horizonLayout.sidebar.drawerPaddingHorizontal, bottom: list.floatingBottom, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  floatingAvatar: { width: list.avatarDiscSize, height: list.avatarDiscSize, borderRadius: list.avatarDiscRadius, backgroundColor: avatarColors.avatarFill, alignItems: 'center', justifyContent: 'center' },
  floatingInitial: { color: avatarColors.avatarInitial, fontSize: list.avatarInitialSize, fontWeight: list.avatarFontWeight },
  newChat: { height: list.floatingHeight, paddingHorizontal: list.floatingPaddingHorizontal, flexDirection: 'row', alignItems: 'center', gap: list.floatingGap },
  newChatLabel: { color: listColors.onAccent, fontSize: list.floatingFontSize, fontWeight: list.floatingFontWeight },
});
