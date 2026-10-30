import { horizonLayout } from '@/theme/layout';
import React, { useCallback, useEffect, useState } from 'react';
import { AccessibilityInfo, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Icon } from './icon';
import { quickServices, sidebarGroups } from './content';
import type { SidebarItem } from './content';
import { horizonColors, horizonColors as colors } from '@/theme/palette';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ModePicker, type HorizonMode, type ModeNotice } from './mode-picker';
import { AccountSheet } from './account-sheet';
import { GlassCapsuleButton, GlassIconButton } from './glass-controls';
import { RecentSkeleton } from './skeleton-layouts';

type Props = {
  visible: boolean;
  onClose: () => void;
  onNavigate: (screen: string) => void;
  mode: HorizonMode;
  modePending: boolean;
  modeNotice: ModeNotice;
  onModeSelect: (mode: 'client' | 'worker') => void;
  onModeCancel: () => void;
  onDismissModeNotice: () => void;
  previewName?: string;
  recentLoading?: boolean;
};

const listColors = horizonColors.sidebarList;
const lockupWidth = horizonLayout.lockup.height * horizonLayout.lockup.aspect;
const lockupImageWidth = lockupWidth / horizonLayout.lockup.contentWidthRatio;
const lockupImageHeight = lockupImageWidth / horizonLayout.lockup.imageAspect;

function Group({ title, first, children }: { title?: string; first?: boolean; children: React.ReactNode }) {
  return <View style={first ? undefined : styles.group}>
    {title && <Text accessibilityRole="header" style={styles.groupTitle}>{title}</Text>}
    {children}
  </View>;
}

function ItemRow({ item, onPress }: { item: SidebarItem; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={item.title} onPress={onPress} style={({ pressed }) => [styles.itemRow, pressed && styles.itemPressed]}>
    <Icon name={item.icon} size={horizonLayout.sidebarList.rowIconSize} color={listColors.icon} strokeWidth={1.7}/>
    <Text style={styles.itemTitle}>{item.title}</Text>
  </Pressable>;
}

export function Sidebar({ visible, onClose, onNavigate, mode, modePending, modeNotice, onModeSelect, onModeCancel, onDismissModeNotice, previewName, recentLoading = false }: Props) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const topInset = Platform.select({ web: 0, default: insets.top }) ?? 0;
  const [modeOpen, setModeOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountCloseRequest, setAccountCloseRequest] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(true);
  useEffect(() => {
    let active = true;
    let changed = false;
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', value => { changed = true; setReduceMotion(value); });
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active && !changed) setReduceMotion(value); }, () => undefined);
    return () => { active = false; subscription.remove(); };
  }, []);
  const [requestedWorker, setRequestedWorker] = useState(false);
  const modeLabel = mode === 'worker' ? 'Thợ' : mode === 'guest' ? 'Khách' : 'Khách hàng';
  const accountName = previewName ?? (mode === 'guest' ? 'Khách' : 'Tài khoản');
  const initial = previewName?.trim().charAt(0).toLocaleUpperCase() || (mode === 'guest' ? 'K' : 'T');
  const pickerVisible = visible && modeOpen && !(requestedWorker && mode === 'worker');
  const closePicker = () => {
    if (requestedWorker && (modePending || !modeNotice)) onModeCancel();
    setRequestedWorker(false);
    setModeOpen(false);
  };
  const closeAccount = useCallback(() => setAccountOpen(false), []);
  const closeSidebar = () => { closePicker(); closeAccount(); onClose(); };
  const selectMode = (next: 'client' | 'worker') => {
    if ((next === 'client' && mode !== 'worker') || (next === 'worker' && mode === 'worker')) { closePicker(); return; }
    if (next === 'worker' && mode !== 'guest') setRequestedWorker(true);
    else setModeOpen(false);
    onModeSelect(next);
  };
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={pickerVisible ? closePicker : accountOpen ? () => setAccountCloseRequest(value => value + 1) : closeSidebar} statusBarTranslucent>
    <View style={styles.full}>
      <View pointerEvents={pickerVisible || accountOpen ? 'none' : 'auto'} accessibilityElementsHidden={pickerVisible || accountOpen} importantForAccessibility={pickerVisible || accountOpen ? 'no-hide-descendants' : 'auto'} aria-hidden={pickerVisible || accountOpen} style={[styles.drawer, { width: Math.min(width * horizonLayout.sidebar.drawerWidthRatio, horizonLayout.sidebar.drawerMaxWidth), paddingTop: topInset, paddingBottom: Math.max(insets.bottom, horizonLayout.sidebar.drawerMinimumBottom) }]}>
        <View style={styles.heading}>
          <View style={styles.brand}>
            <View accessible accessibilityRole="header" accessibilityLabel="NestScout Horizon" style={styles.lockup}>
              <Image source={require('../../../assets/horizon/nestscout-lockup.png')} style={styles.lockupImage} resizeMode="contain"/>
            </View>
          </View>
          <GlassIconButton label="Tìm kiếm cuộc trò chuyện" onPress={() => onNavigate('search')}><Icon name="search" size={horizonLayout.glass.iconSize}/></GlassIconButton>
        </View>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <Group first>
            {sidebarGroups[0]?.items.map(item => <ItemRow key={item.id} item={item} onPress={() => onNavigate(item.id)}/>)}
          </Group>
          <Group title="Gần đây">
            {recentLoading
              ? <RecentSkeleton label="Đang tải cuộc trò chuyện gần đây"/>
              : <Text style={styles.emptyText}>Chưa có cuộc trò chuyện nào. Bấm “Trò chuyện mới” để hỏi Kael.</Text>}
          </Group>
          <Group title="Dịch vụ">
            {quickServices.map(service => <ItemRow key={service.title} item={{ id: service.title, title: service.title, icon: service.icon }} onPress={() => onNavigate(service.title)}/>)}
          </Group>
          <Group title={sidebarGroups[1]?.title ?? ''}>
            {sidebarGroups[1]?.items.map(item => <ItemRow key={item.id} item={item} onPress={() => onNavigate(item.id)}/>)}
          </Group>
        </ScrollView>
        <View pointerEvents="box-none" style={styles.floating}>
          <GlassCapsuleButton label="Trò chuyện mới" tone="accent" radius={horizonLayout.sidebarList.floatingRadius} onPress={() => onNavigate('new')} style={styles.newChat}>
            <Icon name="compose" size={22} color={listColors.onAccent}/><Text style={styles.newChatLabel}>Trò chuyện mới</Text>
          </GlassCapsuleButton>
          <GlassIconButton label={`Tài khoản ${accountName}, đang dùng: ${modeLabel}`} hint="Mở tài khoản và chuyển chế độ" onPress={() => { setAccountCloseRequest(0); setAccountOpen(true); }}><Text style={styles.avatarInitial}>{initial}</Text></GlassIconButton>
        </View>
      </View>
      <Pressable style={styles.scrim} onPress={closeSidebar} accessibilityLabel="Đóng sidebar" importantForAccessibility={pickerVisible || accountOpen ? 'no-hide-descendants' : 'auto'} aria-hidden={pickerVisible || accountOpen} pointerEvents={pickerVisible || accountOpen ? 'none' : 'auto'}/>
      {visible && accountOpen && <AccountSheet closeRequest={accountCloseRequest} reduceMotion={reduceMotion} name={accountName} initial={initial} modeLabel={modeLabel} preview={Boolean(previewName)} onClose={closeAccount} onChooseMode={() => { closeAccount(); onDismissModeNotice(); setRequestedWorker(false); setModeOpen(true); }} onAccount={() => { closeAccount(); onNavigate('profile'); }}/>}
      {pickerVisible && <ModePicker mode={mode} pending={requestedWorker && !modeNotice} notice={modeNotice} onSelect={selectMode} onClose={closePicker}/>}
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  full: { flex: 1, flexDirection: 'row' },
  scrim: { flex: 1, backgroundColor: colors.scrim },
  drawer: { backgroundColor: horizonColors.sidebarComponent.drawerBackgroundColor, paddingHorizontal: horizonLayout.sidebar.drawerPaddingHorizontal, borderRightWidth: horizonLayout.sidebar.drawerBorderRightWidth, borderRightColor: horizonColors.sidebarComponent.drawerBorderRightColor },
  heading: { height: horizonLayout.sidebar.headingHeight, flexDirection: 'row', alignItems: 'center', marginBottom: horizonLayout.sidebar.headingMarginBottom },
  brandIcon: { width: horizonLayout.sidebar.brandIconWidth, height: horizonLayout.sidebar.brandIconHeight, borderRadius: horizonLayout.sidebar.brandIconBorderRadius, backgroundColor: horizonColors.sidebarComponent.brandIconBackgroundColor, alignItems: 'center', justifyContent: 'center', marginRight: horizonLayout.sidebar.brandIconMarginRight },
  brand: { flex: 1 },
  lockup: { width: lockupWidth, height: horizonLayout.lockup.height, overflow: 'hidden' },
  lockupImage: { position: 'absolute', width: lockupImageWidth, height: lockupImageHeight, left: -lockupImageWidth * horizonLayout.lockup.left, top: -lockupImageHeight * horizonLayout.lockup.top },
  brandName: { color: colors.label, fontSize: horizonLayout.sidebarList.titleFontSize, fontWeight: horizonLayout.sidebarList.titleFontWeight, flex: 1 },
  listContent: { paddingBottom: horizonLayout.sidebarList.listBottomPadding },
  floating: { position: 'absolute', left: horizonLayout.sidebar.drawerPaddingHorizontal, right: horizonLayout.sidebar.drawerPaddingHorizontal, bottom: horizonLayout.sidebarList.floatingBottom, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  close: { height: horizonLayout.sidebar.closeHeight, width: horizonLayout.sidebar.closeWidth, borderRadius: horizonLayout.sidebar.closeBorderRadius, backgroundColor: horizonColors.sidebarComponent.closeBackgroundColor, alignItems: 'center', justifyContent: 'center' },
  search: { height: horizonLayout.sidebar.searchHeight, borderRadius: horizonLayout.sidebar.searchBorderRadius, backgroundColor: horizonColors.sidebarComponent.searchBackgroundColor, paddingHorizontal: horizonLayout.sidebar.searchPaddingHorizontal, flexDirection: 'row', alignItems: 'center', gap: horizonLayout.sidebar.searchGap, marginBottom: horizonLayout.sidebar.searchMarginBottom },
  searchText: { color: colors.mutedSecondary, fontSize: horizonLayout.sidebar.searchTextFontSize },
  scroll: { flex: 1 },
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
  groupTitle: { color: colors.text, fontSize: horizonLayout.sidebarList.groupTitleFontSize, fontWeight: horizonLayout.sidebarList.groupTitleFontWeight, marginBottom: horizonLayout.sidebarList.groupTitleMarginBottom, paddingHorizontal: horizonLayout.sidebarList.rowPadding },
  itemRow: { minHeight: horizonLayout.sidebarList.rowHeight, flexDirection: 'row', alignItems: 'center', gap: horizonLayout.sidebarList.rowGap, paddingHorizontal: horizonLayout.sidebarList.rowPadding, paddingVertical: horizonLayout.sidebarList.rowPaddingVertical },
  itemPressed: { backgroundColor: listColors.pressed },
  itemTitle: { color: colors.text, fontSize: horizonLayout.sidebarList.rowFontSize, fontWeight: horizonLayout.sidebarList.rowFontWeight },
  avatarInitial: { color: colors.label, fontSize: horizonLayout.sidebarList.floatingFontSize, fontWeight: horizonLayout.sidebarList.avatarFontWeight },
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
