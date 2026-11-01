import { useEffect, useState } from 'react';
import { Animated, Easing, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

import { workerPreviewSummary, workerSidebarGroups } from './content';
import type { SidebarItem } from './content';
import { GlassCapsuleButton, GlassIconButton, Icon, PressScale, useGlassAccessibility, usePressFeedback } from '@/features/shared';

type Props = {
  onNavigate: (id: string) => void;
  onOpenAccount: () => void;
  onChooseMode: () => void;
  profileName?: string;
  accountLabel: string;
  badges?: Readonly<Record<string, number>>;
};

const metrics = horizonLayout.workerSidebar;
const list = horizonLayout.sidebarList;
const colors = horizonColors.workerSidebar;
const listColors = horizonColors.sidebarList;
const avatarColors = horizonColors.accountSheet;
const lockupWidth = horizonLayout.lockup.height * horizonLayout.lockup.aspect;

function WorkerRow({ item, badge = 0, onPress }: { item: SidebarItem; badge?: number; onPress: () => void }) {
  const { reduceMotion } = useGlassAccessibility();
  const feedback = usePressFeedback(reduceMotion);
  return <Animated.View style={{ transform: [{ scale: feedback.scale }] }}>
    <Pressable accessibilityRole="button" accessibilityLabel={badge > 0 ? `${item.title}, ${badge} mới` : item.title} onPress={onPress} onPressIn={feedback.pressIn} onPressOut={feedback.pressOut} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      <Icon name={item.icon} size={list.rowIconSize} color={listColors.icon} strokeWidth={1.7}/>
      <Text style={styles.rowTitle}>{item.title}</Text>
      {badge > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{badge}</Text></View>}
    </Pressable>
  </Animated.View>;
}

function PulseDot({ online }: { online: boolean }) {
  const { reduceMotion } = useGlassAccessibility();
  const [pulse] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!online || reduceMotion) { pulse.setValue(0); return; }
    const loop = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: metrics.pulseDuration, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [online, pulse, reduceMotion]);
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, metrics.pulseScale] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] });
  return <View style={styles.dotBox}>
    {online && <Animated.View style={[styles.pulse, { opacity, transform: [{ scale }] }]}/>}
    <View style={[styles.dot, { backgroundColor: online ? colors.online : colors.offline }]}/>
  </View>;
}

function GoButton({ online, onPress }: { online: boolean; onPress: () => void }) {
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
      accessibilityHint={online ? 'Chạm để chuyển sang tạm nghỉ' : 'Chạm để bắt đầu nhận việc'}
      accessibilityState={{ checked: online }}
      onPress={onPress}
      style={[styles.goPill, online ? styles.goOn : styles.goOff]}
    >
      {online
        ? <><PulseDot online/><Text style={styles.goOnLabel}>Đang nhận việc</Text></>
        : <><Icon name="bolt" size={metrics.goIconSize} color={colors.goOffLabel} strokeWidth={2}/><Text style={styles.goOffLabel}>Bật nhận việc</Text></>}
    </PressScale>
  </Animated.View>;
}

function Profile({ profileName, online, onToggle }: { profileName?: string; online: boolean; onToggle: () => void }) {
  const initial = profileName?.trim().charAt(0).toLocaleUpperCase();
  return <View style={styles.profile}>
    <View style={styles.identity}>
      <View>
        <View style={styles.avatar}>{initial ? <Text style={styles.avatarInitial}>{initial}</Text> : <Icon name="user" size={list.avatarIconSize + 2} color={avatarColors.avatarInitial}/>}</View>
        <View style={[styles.presence, { backgroundColor: online ? colors.online : colors.offline }]}/>
      </View>
      <View style={styles.identityCopy}>
        <Text numberOfLines={1} style={styles.name}>{profileName ?? 'Thợ NestScout'}</Text>
        <Text numberOfLines={1} style={styles.role}>{workerPreviewSummary.area}</Text>
      </View>
    </View>
    <View style={styles.summary}>
      <View style={styles.summaryItem} accessible accessibilityLabel={`Thu nhập hôm nay, ${workerPreviewSummary.earningsToday}`}>
        <Text style={styles.summaryHeadline}>Thu nhập hôm nay</Text>
        <Text numberOfLines={1} style={styles.summaryValue}>{workerPreviewSummary.earningsToday}</Text>
      </View>
      <View style={styles.summaryItem} accessible accessibilityLabel={`Lịch hẹn tiếp theo, ${workerPreviewSummary.nextAppointment}`}>
        <Text style={styles.summaryHeadline}>Lịch hẹn tiếp theo</Text>
        <Text numberOfLines={1} style={styles.summaryValue}>{workerPreviewSummary.nextAppointment}</Text>
      </View>
    </View>
    <GoButton online={online} onPress={onToggle}/>
  </View>;
}

export function WorkerSidebarBody({ onNavigate, onOpenAccount, onChooseMode, profileName, accountLabel, badges = {} }: Props) {
  const [online, setOnline] = useState(true);
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
      <Profile profileName={profileName} online={online} onToggle={() => setOnline(value => !value)}/>
      {workerSidebarGroups.map(group => <View key={group.title} style={styles.group}>
        <Text accessibilityRole="header" style={styles.groupTitle}>{group.title}</Text>
        {group.items.map(item => <WorkerRow key={item.id} item={item} badge={badges[item.id]} onPress={() => onNavigate(item.id)}/>)}
        {group === workerSidebarGroups[workerSidebarGroups.length - 1] && <>
          <WorkerRow item={{ id: 'mode', title: 'Đổi vai trò', icon: 'user' }} onPress={onChooseMode}/>
          <WorkerRow item={{ id: 'account', title: 'Tài khoản và đăng nhập', icon: 'login' }} onPress={() => onNavigate('profile')}/>
        </>}
      </View>)}
    </ScrollView>
    <View pointerEvents="box-none" style={styles.floating}>
      <GlassIconButton label={accountLabel} hint="Mở tài khoản và chuyển vai trò" onPress={onOpenAccount}>
        <View style={styles.floatingAvatar}>{initial ? <Text style={styles.floatingInitial}>{initial}</Text> : <Icon name="user" size={list.avatarIconSize} color={avatarColors.avatarInitial}/>}</View>
      </GlassIconButton>
      <GlassCapsuleButton label="Trò chuyện mới" tone="light" radius={list.floatingRadius} onPress={() => onNavigate('new')} style={styles.newChat}>
        <Icon name="plus" size={22} color={listColors.onAccent} strokeWidth={2}/><Text style={styles.newChatLabel}>Trò chuyện mới</Text>
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
  summary: { gap: metrics.summaryGap },
  summaryItem: { gap: metrics.summaryItemGap },
  summaryHeadline: { color: colors.ink, fontSize: metrics.summaryHeadlineSize, fontWeight: metrics.summaryHeadlineWeight, letterSpacing: metrics.summaryHeadlineTracking },
  summaryValue: { color: colors.muted, fontSize: metrics.summaryValueSize, fontVariant: ['tabular-nums'] },
  group: { marginTop: metrics.sectionGap },
  groupTitle: { color: colors.ink, fontSize: list.groupTitleFontSize, fontWeight: list.groupTitleFontWeight, marginBottom: list.groupTitleMarginBottom },
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
  goOnLabel: { color: colors.accentText, fontSize: metrics.goFontSize, fontWeight: list.floatingFontWeight },
  dotBox: { width: metrics.dotSize, height: metrics.dotSize, alignItems: 'center', justifyContent: 'center' },
  dot: { width: metrics.dotSize, height: metrics.dotSize, borderRadius: metrics.dotRadius },
  pulse: { position: 'absolute', width: metrics.dotSize, height: metrics.dotSize, borderRadius: metrics.dotRadius, backgroundColor: colors.online },
});
