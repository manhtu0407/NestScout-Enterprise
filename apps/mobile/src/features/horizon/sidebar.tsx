import { usePreferences } from '@/lib/preferences-provider';
import { horizonLayout } from '@/theme/layout';
import React, { useCallback, useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { GlassCapsuleButton, GlassIconButton, Icon, useGlassAccessibility, usePressFeedback } from '@/features/shared';
import { quickServices, sidebarGroups } from './content';
import type { SidebarItem } from './content';
import { horizonColors, horizonColors as colors } from '@/theme/palette';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ModePicker, type HorizonMode, type ModeNotice } from './mode-picker';
import { AccountSheet } from './account-sheet';
import { AvatarImage } from './avatar-image';
import { WorkerSidebarBody, type WorkerSidebarState } from './worker-sidebar-body';
import { CollapsibleGroup } from './sidebar-group';
import { PopBadge } from './motion-count';
import { SkeletonReveal } from './skeleton';
import { RecentSkeleton } from './skeleton-layouts';
import { RecentSessionRow } from './recent-session';
import type { RecentSession } from './recent-session';
import { SessionActions, type SessionActionResult } from './session-actions';

export type SessionHandlers = {
  rename: (id: string, title: string | null) => Promise<SessionActionResult>;
  setPinned: (id: string, pinned: boolean) => Promise<SessionActionResult>;
  setArchived: (id: string, archived: boolean) => Promise<SessionActionResult>;
  remove: (id: string) => Promise<SessionActionResult>;
};

export type SessionsStatus = 'idle' | 'loading' | 'ready' | 'error';

type Props = {
  visible: boolean;
  onClose: () => void;
  onNavigate: (screen: string) => void;
  onSelectService?: (categoryId: string) => void;
  mode: HorizonMode;
  modePending: boolean;
  modeNotice: ModeNotice;
  onModeSelect: (mode: 'client' | 'worker') => void;
  onModeCancel: () => void;
  onDismissModeNotice: () => void;
  profileName?: string;
  profileAvatarUri?: string;
  profileAvatarHeaders?: Readonly<Record<string, string>>;
  recentLoading?: boolean;
  badges?: Readonly<Record<string, number>>;
  workerProfile?: WorkerSidebarState;
  onSetAccepting?: (accepting: boolean) => Promise<void>;
  recentSessions?: readonly RecentSession[];
  activeSessionId?: string;
  onOpenSession?: (id: string) => void;
  onTogglePin?: (id: string) => void;
  onSessionMore?: (id: string) => void;
  sessionHandlers?: SessionHandlers;
  sessionsStatus?: SessionsStatus;
  sessionQuery?: string;
  onSessionQuery?: (query: string) => void;
  archivedView?: boolean;
  onToggleArchivedView?: () => void;
  onRetrySessions?: () => void;
};

const listColors = horizonColors.sidebarList;
const lockupWidth = horizonLayout.lockup.height * horizonLayout.lockup.aspect;
const drawerEasing = Easing.bezier(0.23, 1, 0.32, 1);

function Group({ title, first, children }: { title?: string; first?: boolean; children: React.ReactNode }) {
  return <View style={first ? undefined : styles.group}>
    {title && <Text accessibilityRole="header" style={styles.groupTitle}>{title}</Text>}
    {children}
  </View>;
}

function ItemRow({ item, onPress, badge = 0 }: { item: SidebarItem; onPress: () => void; badge?: number }) {
  const { reduceMotion } = useGlassAccessibility();
  const feedback = usePressFeedback(reduceMotion);
  return <Animated.View style={{ transform: [{ scale: feedback.scale }] }}>
    <Pressable accessibilityRole="button" accessibilityLabel={badge > 0 ? `${item.title}, ${badge} mới` : item.title} onPress={onPress} onPressIn={feedback.pressIn} onPressOut={feedback.pressOut} style={({ pressed }) => [styles.itemRow, pressed && styles.itemPressed]}>
      <Icon name={item.icon} size={horizonLayout.sidebarList.rowIconSize} color={listColors.icon} strokeWidth={1.7}/>
      <Text style={styles.itemTitle}>{item.title}</Text>
      <PopBadge count={badge} style={styles.badge} textStyle={styles.badgeText}/>
    </Pressable>
  </Animated.View>;
}

export function Sidebar({ visible, onClose, onNavigate, onSelectService, mode, modePending, modeNotice, onModeSelect, onModeCancel, onDismissModeNotice, profileName, profileAvatarUri, profileAvatarHeaders, recentLoading = false, badges = {}, workerProfile, onSetAccepting, recentSessions = [], activeSessionId, onOpenSession, onTogglePin, onSessionMore, sessionHandlers, sessionsStatus = 'ready', sessionQuery = '', onSessionQuery, archivedView = false, onToggleArchivedView, onRetrySessions }: Props) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const topInset = Platform.select({ web: 0, default: insets.top }) ?? 0;
  const [servicesOpen, setServicesOpen] = useState(true);
  const [activityOpen, setActivityOpen] = useState(true);
  const [supportOpen, setSupportOpen] = useState(false);
  const [modeOpen, setModeOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountCloseRequest, setAccountCloseRequest] = useState(0);
  const [menuSessionId, setMenuSessionId] = useState<string | null>(null);
  const [systemReduceMotion, setReduceMotion] = useState(true);
  const preferredReduceMotion = usePreferences().reduceMotion;
  const reduceMotion = systemReduceMotion || preferredReduceMotion;
  useEffect(() => {
    let active = true;
    let changed = false;
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', value => { changed = true; setReduceMotion(value); });
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active && !changed) setReduceMotion(value); }, () => undefined);
    return () => { active = false; subscription.remove(); };
  }, []);
  const [mounted, setMounted] = useState(visible);
  const [progress] = useState(() => new Animated.Value(visible ? 1 : 0));
  if (visible && !mounted) setMounted(true);
  useEffect(() => {
    const motion = horizonLayout.sidebar;
    const animation = Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: reduceMotion ? motion.reducedDuration : visible ? motion.enterDuration : motion.exitDuration,
      easing: drawerEasing,
      useNativeDriver: true,
    });
    animation.start(({ finished }) => { if (finished && !visible) setMounted(false); });
    return () => animation.stop();
  }, [visible, reduceMotion, progress]);
  const [requestedWorker, setRequestedWorker] = useState(false);
  const modeLabel = mode === 'worker' ? 'Thợ' : mode === 'guest' ? 'Khách' : 'Khách hàng';
  const accountName = profileName ?? (mode === 'guest' ? 'Khách' : 'của bạn');
  const initial = profileName?.trim().charAt(0).toLocaleUpperCase();
  const avatarPlaceholder = initial ? <Text style={styles.avatarInitial}>{initial}</Text> : <Icon name="user" size={horizonLayout.sidebarList.accountAvatarIconSize} color={horizonColors.sidebarComponent.avatarForeground}/>;
  const pinnedSessions = recentSessions.filter(session => session.pinned);
  const unpinnedSessions = recentSessions.filter(session => !session.pinned);
  const renderSession = (session: RecentSession) => <RecentSessionRow key={session.id} session={session} active={session.id === activeSessionId} onPress={() => onOpenSession?.(session.id)} onMore={() => (sessionHandlers ? setMenuSessionId(session.id) : onSessionMore?.(session.id))} onTogglePin={() => onTogglePin?.(session.id)}/>;
  const pickerVisible = visible && modeOpen && !(requestedWorker && mode === 'worker');
  const closePicker = () => {
    if (requestedWorker && (modePending || !modeNotice)) onModeCancel();
    setRequestedWorker(false);
    setModeOpen(false);
  };
  const closeAccount = useCallback(() => setAccountOpen(false), []);
  const chooseMode = () => { onDismissModeNotice(); setRequestedWorker(false); setModeOpen(true); };
  const closeSidebar = () => { closePicker(); closeAccount(); setMenuSessionId(null); onClose(); };
  const menuSession = menuSessionId === null ? undefined : recentSessions.find(session => session.id === menuSessionId);
  const searching = sessionQuery.trim() !== '';
  const emptySessions = archivedView ? 'Chưa có cuộc trò chuyện nào được lưu trữ.' : searching ? 'Không có cuộc trò chuyện nào khớp với tên bạn tìm.' : 'Chưa có cuộc trò chuyện nào. Gửi tin nhắn đầu tiên để bắt đầu.';
  const selectMode = (next: HorizonMode) => {
    if (next === mode || next === 'guest') { closePicker(); return; }
    if (next === 'worker' && mode !== 'guest') setRequestedWorker(true);
    else setModeOpen(false);
    onModeSelect(next);
  };
  const drawerWidth = Math.min(width * horizonLayout.sidebar.drawerWidthRatio, horizonLayout.sidebar.drawerMaxWidth);
  const drawerMotion = reduceMotion
    ? { opacity: progress }
    : { opacity: drawerOpacity(progress), transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [-drawerWidth, 0] }) }] };
  return <Modal visible={mounted} transparent animationType="none" onRequestClose={pickerVisible ? closePicker : accountOpen ? () => setAccountCloseRequest(value => value + 1) : closeSidebar} statusBarTranslucent>
    <View pointerEvents={visible ? 'auto' : 'none'} style={styles.full}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.dim, { opacity: progress }]}/>
      <Animated.View pointerEvents={pickerVisible || accountOpen ? 'none' : 'auto'} accessibilityElementsHidden={pickerVisible || accountOpen} importantForAccessibility={pickerVisible || accountOpen ? 'no-hide-descendants' : 'auto'} aria-hidden={pickerVisible || accountOpen} style={[styles.drawer, drawerMotion, { width: drawerWidth, paddingTop: topInset, paddingBottom: Math.max(insets.bottom, horizonLayout.sidebar.drawerMinimumBottom) }]}>
        {mode === 'worker' ? <WorkerSidebarBody onNavigate={onNavigate} onOpenAccount={() => { setAccountCloseRequest(0); setAccountOpen(true); }} onChooseMode={chooseMode} profileName={profileName} profileAvatarUri={profileAvatarUri} profileAvatarHeaders={profileAvatarHeaders} accountLabel={`Tài khoản ${accountName}, đang dùng: ${modeLabel}`} badges={badges} workerProfile={workerProfile} onSetAccepting={onSetAccepting}/> : <>
        <View style={styles.heading}>
          <View style={styles.brand}>
            <View accessible accessibilityRole="header" accessibilityLabel="NestScout Horizon" style={styles.lockup}>
              <Image source={require('../../../assets/horizon/nestscout-lockup.png')} style={styles.lockupImage} resizeMode="contain"/>
            </View>
          </View>
        </View>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <CollapsibleGroup first title={sidebarGroups[0]?.title ?? ''} expanded={activityOpen} onToggle={() => setActivityOpen(open => !open)} badge={(sidebarGroups[0]?.items ?? []).reduce((total, item) => total + (badges[item.id] ?? 0), 0)}>
            {sidebarGroups[0]?.items.map(item => <ItemRow key={item.id} item={item} badge={badges[item.id]} onPress={() => onNavigate(item.id)}/>)}
          </CollapsibleGroup>
          {!archivedView && pinnedSessions.length > 0 && <Group title="Đã ghim">
            {pinnedSessions.map(renderSession)}
          </Group>}
          <Group title={archivedView ? 'Lưu trữ' : 'Gần đây'}>
            {onSessionQuery && <View style={styles.sessionTools}>
              <View style={styles.sessionSearch}>
                <Icon name="search" size={horizonLayout.supportScreens.searchIconSize} color={horizonColors.supportScreens.searchIcon}/>
                <TextInput accessibilityLabel="Tìm cuộc trò chuyện theo tên" value={sessionQuery} onChangeText={onSessionQuery} placeholder="Tìm theo tên" placeholderTextColor={horizonColors.supportScreens.searchPlaceholder} autoCorrect={false} maxLength={80} style={styles.sessionSearchInput}/>
              </View>
              {onToggleArchivedView && <Pressable accessibilityRole="button" accessibilityState={{ selected: archivedView }} accessibilityLabel={archivedView ? 'Quay lại cuộc trò chuyện gần đây' : 'Xem cuộc trò chuyện đã lưu trữ'} onPress={onToggleArchivedView} style={styles.archiveToggle}><Icon name={archivedView ? 'back' : 'archive'} size={horizonLayout.supportScreens.searchIconSize} color={horizonColors.supportScreens.searchIcon}/></Pressable>}
            </View>}
            <SkeletonReveal loading={recentLoading === true || (sessionsStatus === 'loading' && recentSessions.length === 0)} skeleton={<RecentSkeleton label="Đang tải cuộc trò chuyện gần đây"/>}>
              {sessionsStatus === 'error'
                ? <View accessibilityLiveRegion="polite"><Text style={styles.emptyText}>Chưa tải được danh sách cuộc trò chuyện.</Text>{onRetrySessions && <Pressable accessibilityRole="button" accessibilityLabel="Thử tải lại danh sách cuộc trò chuyện" onPress={onRetrySessions} style={styles.retry}><Text style={styles.retryLabel}>Thử lại</Text></Pressable>}</View>
                : (archivedView ? recentSessions : unpinnedSessions).length === 0 && !(pinnedSessions.length > 0 && !archivedView)
                  ? <Text style={styles.emptyText}>{emptySessions}</Text>
                  : (archivedView ? recentSessions : unpinnedSessions).map(renderSession)}
            </SkeletonReveal>
          </Group>
          <CollapsibleGroup title="Dịch vụ" expanded={servicesOpen} onToggle={() => setServicesOpen(open => !open)}>
            {quickServices.map(service => <ItemRow key={service.id} item={{ id: service.id, title: service.title, icon: service.icon }} onPress={() => (onSelectService ?? onNavigate)(service.id)}/>)}
          </CollapsibleGroup>
          <CollapsibleGroup title={sidebarGroups[1]?.title ?? ''} expanded={supportOpen} onToggle={() => setSupportOpen(open => !open)} badge={(sidebarGroups[1]?.items ?? []).reduce((total, item) => total + (badges[item.id] ?? 0), 0)}>
            {sidebarGroups[1]?.items.map(item => <ItemRow key={item.id} item={item} badge={badges[item.id]} onPress={() => onNavigate(item.id)}/>)}
            <ItemRow item={{ id: 'mode', title: 'Đổi vai trò', icon: 'user' }} onPress={chooseMode}/>
            <ItemRow item={{ id: 'account', title: 'Tài khoản và đăng nhập', icon: 'login' }} onPress={() => onNavigate('profile')}/>
          </CollapsibleGroup>
        </ScrollView>
        <View pointerEvents="box-none" style={styles.floating}>
          <GlassIconButton label={`Tài khoản ${accountName}, đang dùng: ${modeLabel}`} hint="Mở tài khoản và chuyển vai trò" onPress={() => { setAccountCloseRequest(0); setAccountOpen(true); }}><View style={styles.avatarDisc}>{profileAvatarUri ? <AvatarImage uri={profileAvatarUri} headers={profileAvatarHeaders} fallback={avatarPlaceholder}/> : avatarPlaceholder}</View></GlassIconButton>
          <GlassCapsuleButton label="Chat" tone="light" radius={horizonLayout.sidebarList.floatingRadius} onPress={() => onNavigate('new')} style={styles.newChat}>
            <Icon name="plus" size={22} color={listColors.onAccent} strokeWidth={2}/><Text style={styles.newChatLabel}>Chat</Text>
          </GlassCapsuleButton>
        </View>
        </>}
      </Animated.View>
      <Pressable style={styles.scrim} onPress={closeSidebar} accessibilityLabel="Đóng sidebar" importantForAccessibility={pickerVisible || accountOpen ? 'no-hide-descendants' : 'auto'} aria-hidden={pickerVisible || accountOpen} pointerEvents={pickerVisible || accountOpen ? 'none' : 'auto'}/>
      {visible && accountOpen && <AccountSheet closeRequest={accountCloseRequest} reduceMotion={reduceMotion} profileName={profileName} avatarUri={profileAvatarUri} avatarHeaders={profileAvatarHeaders} modeLabel={modeLabel} onClose={closeAccount}/>}
      {visible && menuSession && sessionHandlers && <SessionActions key={menuSession.id} title={menuSession.title} pinned={menuSession.pinned} archived={archivedView} onClose={() => setMenuSessionId(null)} onRename={title => sessionHandlers.rename(menuSession.id, title)} onPin={() => sessionHandlers.setPinned(menuSession.id, !menuSession.pinned)} onArchive={() => sessionHandlers.setArchived(menuSession.id, !archivedView)} onDelete={() => sessionHandlers.remove(menuSession.id)}/>}
      {pickerVisible && <ModePicker mode={mode} pending={requestedWorker && !modeNotice} notice={modeNotice} onSelect={selectMode} onClose={closePicker}/>}
    </View>
  </Modal>;
}

function drawerOpacity(progress: Animated.Value): Animated.AnimatedInterpolation<number> {
  return progress.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1] });
}

const styles = StyleSheet.create({
  full: { flex: 1, flexDirection: 'row' },
  dim: { backgroundColor: colors.scrim },
  scrim: { flex: 1 },
  drawer: { backgroundColor: horizonColors.sidebarComponent.drawerBackgroundColor, paddingHorizontal: horizonLayout.sidebar.drawerPaddingHorizontal, borderRightWidth: horizonLayout.sidebar.drawerBorderRightWidth, borderRightColor: horizonColors.sidebarComponent.drawerBorderRightColor },
  heading: { height: horizonLayout.sidebar.headingHeight, flexDirection: 'row', alignItems: 'center', marginTop: horizonLayout.sidebar.headingMarginTop, marginBottom: horizonLayout.sidebar.headingMarginBottom },
  brandIcon: { width: horizonLayout.sidebar.brandIconWidth, height: horizonLayout.sidebar.brandIconHeight, borderRadius: horizonLayout.sidebar.brandIconBorderRadius, backgroundColor: horizonColors.sidebarComponent.brandIconBackgroundColor, alignItems: 'center', justifyContent: 'center', marginRight: horizonLayout.sidebar.brandIconMarginRight },
  brand: { flex: 1 },
  lockup: { width: lockupWidth, height: horizonLayout.lockup.height },
  lockupImage: { width: lockupWidth, height: horizonLayout.lockup.height },
  brandName: { color: colors.label, fontSize: horizonLayout.sidebarList.titleFontSize, fontWeight: horizonLayout.sidebarList.titleFontWeight, flex: 1 },
  listContent: { paddingBottom: horizonLayout.sidebarList.listBottomPadding, paddingHorizontal: horizonLayout.sidebar.drawerPaddingHorizontal },
  floating: { position: 'absolute', left: horizonLayout.sidebar.drawerPaddingHorizontal, right: horizonLayout.sidebar.drawerPaddingHorizontal, bottom: horizonLayout.sidebarList.floatingBottom, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  close: { height: horizonLayout.sidebar.closeHeight, width: horizonLayout.sidebar.closeWidth, borderRadius: horizonLayout.sidebar.closeBorderRadius, backgroundColor: horizonColors.sidebarComponent.closeBackgroundColor, alignItems: 'center', justifyContent: 'center' },
  search: { height: horizonLayout.sidebar.searchHeight, borderRadius: horizonLayout.sidebar.searchBorderRadius, backgroundColor: horizonColors.sidebarComponent.searchBackgroundColor, paddingHorizontal: horizonLayout.sidebar.searchPaddingHorizontal, flexDirection: 'row', alignItems: 'center', gap: horizonLayout.sidebar.searchGap, marginBottom: horizonLayout.sidebar.searchMarginBottom },
  searchText: { color: colors.mutedSecondary, fontSize: horizonLayout.sidebar.searchTextFontSize },
  scroll: { flex: 1, marginHorizontal: -horizonLayout.sidebar.drawerPaddingHorizontal },
  navRow: { minHeight: horizonLayout.sidebar.navRowMinHeight, flexDirection: 'row', alignItems: 'center', gap: horizonLayout.sidebar.navRowGap, paddingHorizontal: horizonLayout.sidebar.navRowPaddingHorizontal, borderRadius: horizonLayout.sidebar.navRowBorderRadius },
  selected: { backgroundColor: horizonColors.sidebarComponent.selectedBackgroundColor, borderWidth: horizonLayout.sidebar.selectedBorderWidth, borderColor: horizonColors.sidebarComponent.selectedBorderColor },
  selectedLabel: { color: horizonColors.sidebarComponent.selectedLabelColor },
  navLabel: { flex: 1, fontSize: horizonLayout.sidebar.navLabelFontSize, color: colors.text },
  count: { minWidth: horizonLayout.sidebar.countMinWidth, height: horizonLayout.sidebar.countHeight, paddingHorizontal: horizonLayout.sidebar.countPaddingHorizontal, borderRadius: horizonLayout.sidebar.countBorderRadius, backgroundColor: horizonColors.sidebarComponent.countBackgroundColor, alignItems: 'center', justifyContent: 'center' },
  countText: { color: colors.onFill, fontSize: horizonLayout.sidebar.countTextFontSize },
  separator: { height: horizonLayout.sidebar.separatorHeight, backgroundColor: colors.border, marginVertical: horizonLayout.sidebar.separatorMarginVertical },
  sectionRow: { paddingVertical: horizonLayout.sidebar.sectionRowPaddingVertical, paddingHorizontal: horizonLayout.sidebar.sectionRowPaddingHorizontal, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { color: colors.muted, fontSize: horizonLayout.sidebar.sectionTitleFontSize, paddingHorizontal: horizonLayout.sidebarList.rowPadding, paddingVertical: horizonLayout.sidebar.sectionTitlePaddingVertical },
  serviceRow: { minHeight: horizonLayout.sidebar.serviceRowMinHeight, flexDirection: 'row', alignItems: 'center', paddingHorizontal: horizonLayout.sidebar.serviceRowPaddingHorizontal, gap: horizonLayout.sidebar.serviceRowGap },
  serviceLabel: { color: horizonColors.sidebarComponent.serviceLabelColor, fontSize: horizonLayout.sidebar.serviceLabelFontSize },
  group: { marginTop: horizonLayout.sidebarList.groupMarginTop },
  sessionTools: { flexDirection: 'row', alignItems: 'center', gap: horizonLayout.supportScreens.searchGap, marginBottom: horizonLayout.sidebarList.groupTitleMarginBottom, paddingHorizontal: horizonLayout.sidebarList.rowPadding },
  sessionSearch: { flex: 1, height: horizonLayout.sidebar.searchHeight, borderRadius: horizonLayout.sidebar.searchBorderRadius, backgroundColor: horizonColors.supportScreens.searchFill, paddingHorizontal: horizonLayout.sidebar.searchPaddingHorizontal, flexDirection: 'row', alignItems: 'center', gap: horizonLayout.sidebar.searchGap },
  sessionSearchInput: { flex: 1, color: colors.text, fontSize: horizonLayout.sidebar.searchTextFontSize, height: horizonLayout.sidebar.searchHeight },
  archiveToggle: { width: horizonLayout.supportScreens.notificationActionHeight, height: horizonLayout.supportScreens.notificationActionHeight, alignItems: 'center', justifyContent: 'center' },
  retry: { minHeight: horizonLayout.supportScreens.notificationActionHeight, justifyContent: 'center', paddingHorizontal: horizonLayout.sidebarList.rowPadding },
  retryLabel: { color: horizonColors.supportScreens.actionLabel, fontSize: horizonLayout.supportScreens.notificationActionSize, fontWeight: horizonLayout.supportScreens.notificationActionWeight },
  groupTitle: { color: colors.text, fontSize: horizonLayout.sidebarList.groupTitleFontSize, fontWeight: horizonLayout.sidebarList.groupTitleFontWeight, marginBottom: horizonLayout.sidebarList.groupTitleMarginBottom, paddingHorizontal: horizonLayout.sidebarList.rowPadding },
  itemRow: { minHeight: horizonLayout.sidebarList.rowHeight, flexDirection: 'row', alignItems: 'center', gap: horizonLayout.sidebarList.rowGap, paddingHorizontal: horizonLayout.sidebarList.rowPadding, paddingVertical: horizonLayout.sidebarList.rowPaddingVertical },
  badge: { minWidth: horizonLayout.sidebarList.badgeSize, height: horizonLayout.sidebarList.badgeSize, paddingHorizontal: horizonLayout.sidebarList.badgePaddingHorizontal, borderRadius: horizonLayout.sidebarList.badgeRadius, backgroundColor: listColors.badge, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: listColors.onBadge, fontSize: horizonLayout.sidebarList.badgeFontSize, fontWeight: horizonLayout.sidebarList.badgeFontWeight },
  itemPressed: { backgroundColor: listColors.pressed },
  itemTitle: { flex: 1, color: colors.text, fontSize: horizonLayout.sidebarList.rowFontSize, fontWeight: horizonLayout.sidebarList.rowFontWeight },
  avatarDisc: { width: horizonLayout.sidebarList.accountAvatarSize, height: horizonLayout.sidebarList.accountAvatarSize, borderRadius: horizonLayout.sidebarList.accountAvatarRadius, backgroundColor: horizonColors.sidebarComponent.avatarFill, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarInitial: { color: horizonColors.sidebarComponent.avatarForeground, fontSize: horizonLayout.sidebarList.accountAvatarInitialSize, fontWeight: horizonLayout.sidebarList.avatarFontWeight },
  newChat: { height: horizonLayout.sidebarList.floatingHeight, paddingHorizontal: horizonLayout.sidebarList.floatingPaddingHorizontal, flexDirection: 'row', alignItems: 'center', gap: horizonLayout.sidebarList.floatingGap },
  newChatLabel: { color: listColors.onAccent, fontSize: horizonLayout.sidebarList.floatingFontSize, fontWeight: horizonLayout.sidebarList.floatingFontWeight },
  emptyText: { color: colors.mutedSecondary, fontSize: horizonLayout.sidebar.searchTextFontSize, paddingHorizontal: horizonLayout.sidebarList.rowPadding, paddingVertical: horizonLayout.sidebar.sectionTitlePaddingVertical },
  profile: { minHeight: horizonLayout.sidebar.profileMinHeight, backgroundColor: horizonColors.sidebarComponent.profileBackgroundColor, flexDirection: 'row', alignItems: 'center', borderRadius: horizonLayout.sidebar.profileBorderRadius, paddingHorizontal: horizonLayout.sidebar.profilePaddingHorizontal, gap: horizonLayout.sidebar.profileGap },
  profilePressed: { opacity: horizonLayout.sidebar.profilePressedOpacity },
  profileAvatar: { height: horizonLayout.sidebar.profileAvatarHeight, width: horizonLayout.sidebar.profileAvatarWidth, borderRadius: horizonLayout.sidebar.profileAvatarBorderRadius, backgroundColor: horizonColors.sidebarComponent.profileAvatarBackgroundColor, alignItems: 'center', justifyContent: 'center' },
  profileInitial: { color: colors.onFill, fontSize: horizonLayout.sidebar.profileInitialFontSize, fontWeight: horizonLayout.sidebar.profileInitialFontWeight },
  profileCopy: { flex: 1 },
  profileName: { fontSize: horizonLayout.sidebar.profileNameFontSize, color: colors.label, fontWeight: horizonLayout.sidebar.profileNameFontWeight },
  profileSub: { fontSize: horizonLayout.sidebar.profileSubFontSize, color: colors.muted, marginTop: horizonLayout.sidebar.profileSubMarginTop }
});
