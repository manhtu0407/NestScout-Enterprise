import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Animated, Easing, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

import { workerPreviewSummary, workerSidebarGroups } from './content';
import { CollapsibleGroup } from './sidebar-group';
import { PopBadge } from './motion-count';
import type { SidebarItem } from './content';
import { GlassCapsuleButton, GlassIconButton, Icon, PressScale, useGlassAccessibility, usePressFeedback } from '@/features/shared';

type Props = {
  onNavigate: (id: string) => void;
  onOpenAccount: () => void;
  onChooseMode: () => void;
  profileName?: string;
  accountLabel: string;
  badges?: Readonly<Record<string, number>>;
  workerProfile?: WorkerSidebarState;
  workerStats?: WorkerSidebarStats;
  onSetAccepting?: (accepting: boolean) => Promise<void>;
};

export type WorkerSidebarProfile = { area: string; radiusKm: number; accepting: boolean };

export type WorkerSidebarStats = { acceptedToday: string; nextJob: string };

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

function GoButton({ online, hint, onPress }: { online: boolean; hint?: string; onPress: () => void }) {
  const { reduceMotion } = useGlassAccessibility();
  const [enter] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (reduceMotion) { enter.setValue(1); return; }
    enter.setValue(0);
    const motion = Animated.timing(enter, { toValue: 1, duration: metrics.stateDuration, easing: Easing.bezier(0.23, 1, 0.32, 1), useNativeDriver: true });
    motion.start();
    return () => motion.stop();
  }, [enter, online, reduceMotion]);
  const scale = enter.interpolate({ inputRange: [0, 1], outputRange: [metrics.enterScale, 1] });
  const opacity = enter.interpolate({ inputRange: [0, 1], outputRange: [metrics.enterOpacity, 1] });
  return <Animated.View style={[styles.go, { opacity, transform: [{ scale }] }]}>
    <PressScale
      accessibilityRole="switch"
      accessibilityLabel="Nhận việc mới"
      accessibilityHint={hint ?? (online ? 'Đang nhận việc. Chạm để tắt nhận việc' : 'Đang tắt. Chạm để bắt đầu nhận việc')}
      accessibilityState={{ checked: online }}
      onPress={onPress}
      style={[styles.goPill, online ? styles.goOn : styles.goOff]}
    >
      {online
        ? <><Icon name="close" size={metrics.goIconSize} color={colors.goOnLabel} strokeWidth={2}/><Text style={styles.goOnLabel}>Tắt nhận việc</Text></>
        : <><Icon name="bolt" size={metrics.goIconSize} color={colors.goOffLabel} strokeWidth={2}/><Text style={styles.goOffLabel}>Bật nhận việc</Text></>}
    </PressScale>
  </Animated.View>;
}

function Stat({ icon, caption, value }: { icon: SidebarItem['icon']; caption: string; value: string }) {
  return <View style={styles.stat} accessible accessibilityLabel={`${caption}, ${value}`}>
    <View style={styles.statDisc}><Icon name={icon} size={metrics.statIconSize} color={colors.statIcon} strokeWidth={1.8}/></View>
    <View style={styles.statCopy}>
      <Text style={styles.statCaption}>{caption}</Text>
      <Text numberOfLines={1} style={styles.statValue}>{value}</Text>
    </View>
  </View>;
}

function Profile({ profileName, roleLine, online, stats, goHint, onToggle }: { profileName?: string; roleLine: string; online: boolean; stats: WorkerSidebarStats; goHint?: string; onToggle: () => void }) {
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
    <View style={styles.card}>
      <Stat icon="wallet" caption="Đã nghiệm thu hôm nay" value={stats.acceptedToday}/>
      <View style={styles.cardDivider}/>
      <Stat icon="pin" caption="Việc kế tiếp" value={stats.nextJob}/>
    </View>
    <GoButton online={online} hint={goHint} onPress={onToggle}/>
  </View>;
}

function roleLineFor(profile: WorkerSidebarState | undefined): string {
  if (profile === undefined) return workerPreviewSummary.area;
  if (profile === 'loading') return 'Đang tải hồ sơ…';
  return profile === null ? 'Chưa có hồ sơ nghề' : `${profile.area} · bán kính ${profile.radiusKm} km`;
}

function statsFor(profile: WorkerSidebarState | undefined, stats: WorkerSidebarStats | undefined): WorkerSidebarStats {
  if (stats !== undefined) return stats;
  return profile === undefined ? workerPreviewSummary : { acceptedToday: '…', nextJob: '…' };
}

function onlineOf(profile: WorkerSidebarState | undefined, sampleOnline: boolean, requested: boolean | null): boolean {
  if (profile === undefined) return sampleOnline;
  if (requested !== null) return requested;
  return profile !== null && profile !== 'loading' && profile.accepting;
}

export function WorkerSidebarBody({ onNavigate, onOpenAccount, onChooseMode, profileName, accountLabel, badges = {}, workerProfile, workerStats, onSetAccepting }: Props) {
  const stats = statsFor(workerProfile, workerStats);
  const [sampleOnline, setSampleOnline] = useState(true);
  const [requested, setRequested] = useState<boolean | null>(null);
  const online = onlineOf(workerProfile, sampleOnline, requested);
  const toggle = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (workerProfile === undefined) return setSampleOnline(value => !value);
    if (workerProfile === 'loading') return;
    if (workerProfile === null) return onNavigate('worker-profile');
    if (requested !== null || !onSetAccepting) return;
    setRequested(!online);
    void onSetAccepting(!online).finally(() => setRequested(null));
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
      <GlassIconButton label="Thông báo" onPress={() => onNavigate('notifications')}><Icon name="bell" size={horizonLayout.glass.iconSize}/></GlassIconButton>
    </View>
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Profile profileName={profileName} roleLine={roleLineFor(workerProfile)} online={online} stats={stats} goHint={workerProfile === null ? 'Chưa có hồ sơ nghề. Chạm để tạo hồ sơ' : undefined} onToggle={toggle}/>
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
  card: { borderRadius: metrics.cardRadius, backgroundColor: colors.cardFill, paddingHorizontal: metrics.cardPadding },
  cardDivider: { height: metrics.hairlineWidth, backgroundColor: colors.hairline },
  stat: { flexDirection: 'row', alignItems: 'center', gap: metrics.statGap, paddingVertical: metrics.statPaddingVertical },
  statDisc: { width: metrics.statDisc, height: metrics.statDisc, borderRadius: metrics.statDiscRadius, backgroundColor: colors.statFill, alignItems: 'center', justifyContent: 'center' },
  statCopy: { flex: 1, gap: metrics.statCopyGap },
  statCaption: { color: colors.muted, fontSize: metrics.statCaptionSize },
  statValue: { color: colors.ink, fontSize: metrics.statValueSize, fontWeight: metrics.statValueWeight, fontVariant: ['tabular-nums'] },
  row: { minHeight: list.rowHeight, flexDirection: 'row', alignItems: 'center', gap: list.rowGap, paddingVertical: list.rowPaddingVertical },
  rowPressed: { backgroundColor: listColors.pressed },
  rowTitle: { flex: 1, color: colors.ink, fontSize: list.rowFontSize, fontWeight: list.rowFontWeight },
  badge: { minWidth: list.badgeSize, height: list.badgeSize, paddingHorizontal: list.badgePaddingHorizontal, borderRadius: list.badgeRadius, backgroundColor: colors.badge, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: colors.onBadge, fontSize: list.badgeFontSize, fontWeight: list.badgeFontWeight },
  floating: { position: 'absolute', left: horizonLayout.sidebar.drawerPaddingHorizontal, right: horizonLayout.sidebar.drawerPaddingHorizontal, bottom: list.floatingBottom, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  floatingAvatar: { width: list.avatarDiscSize, height: list.avatarDiscSize, borderRadius: list.avatarDiscRadius, backgroundColor: avatarColors.avatarFill, alignItems: 'center', justifyContent: 'center' },
  floatingInitial: { color: avatarColors.avatarInitial, fontSize: list.avatarInitialSize, fontWeight: list.avatarFontWeight },
  go: { alignSelf: 'stretch' },
  newChat: { height: list.floatingHeight, paddingHorizontal: list.floatingPaddingHorizontal, flexDirection: 'row', alignItems: 'center', gap: list.floatingGap },
  newChatLabel: { color: listColors.onAccent, fontSize: list.floatingFontSize, fontWeight: list.floatingFontWeight },
  goPill: { height: metrics.goHeight, borderRadius: metrics.goRadius, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: metrics.goGap },
  goOff: { backgroundColor: colors.goOffFill },
  goOn: { backgroundColor: colors.goOnFill },
  goOffLabel: { color: colors.goOffLabel, fontSize: metrics.goFontSize, fontWeight: list.floatingFontWeight },
  goOnLabel: { color: colors.goOnLabel, fontSize: metrics.goFontSize, fontWeight: list.floatingFontWeight },
});
