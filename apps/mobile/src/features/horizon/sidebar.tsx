import { horizonLayout } from '@/theme/layout';
import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Icon, IconName } from './icon';
import { menuEntries, quickServices } from './content';
import { horizonColors, horizonColors as colors } from '@/theme/palette';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = {
  visible: boolean;
  onClose: () => void;
  onNavigate: (screen: string) => void;
  workerMode: boolean;
  onWorkerToggle: () => void;
};

export function Sidebar({ visible, onClose, onNavigate, workerMode, onWorkerToggle }: Props) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [servicesOpen, setServicesOpen] = useState(true);
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
    <View style={styles.full}>
      <View style={[styles.drawer, { width: Math.min(width * horizonLayout.sidebar.drawerWidthRatio, horizonLayout.sidebar.drawerMaxWidth), paddingTop: Math.max(insets.top + horizonLayout.sidebar.drawerSafeTopGap, horizonLayout.sidebar.drawerMinimumTop), paddingBottom: Math.max(insets.bottom, horizonLayout.sidebar.drawerMinimumBottom) }]}>
        <View style={styles.heading}>
          <View style={styles.brandIcon}><Icon name="home" color={horizonColors.sidebarComponent.brandIconColor} size={19}/></View>
          <Text style={styles.brandName}>NestScout <Text style={{ color: horizonColors.sidebarComponent.brandAccentColor }}>Horizon</Text></Text>
          <Pressable accessibilityLabel="Đóng thanh bên" onPress={onClose} style={styles.close}><Icon name="close" size={17}/></Pressable>
        </View>
        <Pressable onPress={() => onNavigate('search')} style={styles.search} accessibilityLabel="Tìm kiếm cuộc trò chuyện">
          <Icon name="search" size={19} color={colors.muted}/><Text style={styles.searchText}>Tìm kiếm cuộc trò chuyện...</Text>
        </Pressable>
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          {menuEntries.map((item, i) => <Pressable key={item.id} onPress={() => onNavigate(item.id)} style={[styles.navRow, i === 0 && styles.selected]}>
            <Icon name={item.icon} size={20} color={i === 0 ? horizonColors.sidebarComponent.selectedIconColor : colors.text}/>
            <Text style={[styles.navLabel, i === 0 && styles.selectedLabel]}>{item.title}</Text>
            {item.id === 'tasks' && <View style={styles.count}><Text style={styles.countText}>2</Text></View>}
          </Pressable>)}
          <View style={styles.separator}/>
          <Pressable onPress={() => setServicesOpen(!servicesOpen)} style={styles.sectionRow} accessibilityLabel="Ẩn hoặc mở dịch vụ nhanh">
            <Text style={styles.sectionTitle}>Dịch vụ nhanh</Text><Icon name={servicesOpen ? 'arrowUp' : 'chevron'} size={16} color={colors.muted}/>
          </Pressable>
          {servicesOpen && quickServices.map(service => <Pressable key={service.title} onPress={() => onNavigate(service.title)} style={styles.serviceRow}>
            <Icon name={service.icon as IconName} size={19} color={horizonColors.sidebarComponent.serviceIconColor}/><Text style={styles.serviceLabel}>{service.title}</Text>
          </Pressable>)}
          <View style={styles.separator}/>
          <Text style={styles.sectionTitle}>Chế độ</Text>
          <View style={styles.roleRow}>
            <Pressable onPress={() => workerMode && onWorkerToggle()} style={[styles.roleBtn, !workerMode && styles.roleActive]}><Text style={[styles.roleText, !workerMode && styles.roleActiveText]}>Khách hàng</Text></Pressable>
            <Pressable onPress={() => !workerMode && onWorkerToggle()} style={[styles.roleBtn, workerMode && styles.roleActive]}><Text style={[styles.roleText, workerMode && styles.roleActiveText]}>Thợ</Text></Pressable>
          </View>
          <Pressable onPress={() => onNavigate('settings')} style={styles.navRow}><Icon name="gear" size={20}/><Text style={styles.navLabel}>Cài đặt</Text></Pressable>
          <Pressable onPress={() => onNavigate('help')} style={styles.navRow}><Icon name="help" size={20}/><Text style={styles.navLabel}>Trợ giúp</Text></Pressable>
        </ScrollView>
        <Pressable onPress={() => onNavigate('profile')} style={styles.profile}>
          <View style={styles.profileAvatar}><Text style={styles.profileInitial}>N</Text></View>
          <View style={{ flex: 1 }}><Text style={styles.profileName}>Nguyễn Minh</Text><Text style={styles.profileSub}>Xem hồ sơ</Text></View><Icon name="chevron" size={18} color={colors.muted}/>
        </Pressable>
      </View>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Đóng sidebar"/>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  full: { flex: 1, flexDirection: 'row' },
  scrim: { flex: 1, backgroundColor: colors.scrim },
  drawer: { backgroundColor: horizonColors.sidebarComponent.drawerBackgroundColor, paddingHorizontal: horizonLayout.sidebar.drawerPaddingHorizontal, borderRightWidth: horizonLayout.sidebar.drawerBorderRightWidth, borderRightColor: horizonColors.sidebarComponent.drawerBorderRightColor },
  heading: { height: horizonLayout.sidebar.headingHeight, flexDirection: 'row', alignItems: 'center', marginBottom: horizonLayout.sidebar.headingMarginBottom },
  brandIcon: { width: horizonLayout.sidebar.brandIconWidth, height: horizonLayout.sidebar.brandIconHeight, borderRadius: horizonLayout.sidebar.brandIconBorderRadius, backgroundColor: horizonColors.sidebarComponent.brandIconBackgroundColor, alignItems: 'center', justifyContent: 'center', marginRight: horizonLayout.sidebar.brandIconMarginRight },
  brandName: { color: colors.white, fontSize: horizonLayout.sidebar.brandNameFontSize, fontWeight: horizonLayout.sidebar.brandNameFontWeight, flex: 1 },
  close: { height: horizonLayout.sidebar.closeHeight, width: horizonLayout.sidebar.closeWidth, borderRadius: horizonLayout.sidebar.closeBorderRadius, backgroundColor: horizonColors.sidebarComponent.closeBackgroundColor, alignItems: 'center', justifyContent: 'center' },
  search: { height: horizonLayout.sidebar.searchHeight, borderRadius: horizonLayout.sidebar.searchBorderRadius, backgroundColor: horizonColors.sidebarComponent.searchBackgroundColor, paddingHorizontal: horizonLayout.sidebar.searchPaddingHorizontal, flexDirection: 'row', alignItems: 'center', gap: horizonLayout.sidebar.searchGap, marginBottom: horizonLayout.sidebar.searchMarginBottom },
  searchText: { color: colors.mutedSecondary, fontSize: horizonLayout.sidebar.searchTextFontSize },
  scroll: { flex: 1 },
  navRow: { minHeight: horizonLayout.sidebar.navRowMinHeight, flexDirection: 'row', alignItems: 'center', gap: horizonLayout.sidebar.navRowGap, paddingHorizontal: horizonLayout.sidebar.navRowPaddingHorizontal, borderRadius: horizonLayout.sidebar.navRowBorderRadius },
  selected: { backgroundColor: horizonColors.sidebarComponent.selectedBackgroundColor, borderWidth: horizonLayout.sidebar.selectedBorderWidth, borderColor: horizonColors.sidebarComponent.selectedBorderColor },
  selectedLabel: { color: horizonColors.sidebarComponent.selectedLabelColor },
  navLabel: { flex: 1, fontSize: horizonLayout.sidebar.navLabelFontSize, color: colors.text },
  count: { minWidth: horizonLayout.sidebar.countMinWidth, height: horizonLayout.sidebar.countHeight, paddingHorizontal: horizonLayout.sidebar.countPaddingHorizontal, borderRadius: horizonLayout.sidebar.countBorderRadius, backgroundColor: horizonColors.sidebarComponent.countBackgroundColor, alignItems: 'center', justifyContent: 'center' },
  countText: { color: colors.white, fontSize: horizonLayout.sidebar.countTextFontSize },
  separator: { height: horizonLayout.sidebar.separatorHeight, backgroundColor: colors.border, marginVertical: horizonLayout.sidebar.separatorMarginVertical },
  sectionRow: { paddingVertical: horizonLayout.sidebar.sectionRowPaddingVertical, paddingHorizontal: horizonLayout.sidebar.sectionRowPaddingHorizontal, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { color: colors.muted, fontSize: horizonLayout.sidebar.sectionTitleFontSize, paddingHorizontal: horizonLayout.sidebar.sectionTitlePaddingHorizontal, paddingVertical: horizonLayout.sidebar.sectionTitlePaddingVertical },
  serviceRow: { minHeight: horizonLayout.sidebar.serviceRowMinHeight, flexDirection: 'row', alignItems: 'center', paddingHorizontal: horizonLayout.sidebar.serviceRowPaddingHorizontal, gap: horizonLayout.sidebar.serviceRowGap },
  serviceLabel: { color: horizonColors.sidebarComponent.serviceLabelColor, fontSize: horizonLayout.sidebar.serviceLabelFontSize },
  roleRow: { backgroundColor: horizonColors.sidebarComponent.roleRowBackgroundColor, padding: horizonLayout.sidebar.roleRowPadding, borderRadius: horizonLayout.sidebar.roleRowBorderRadius, flexDirection: 'row', marginVertical: horizonLayout.sidebar.roleRowMarginVertical },
  roleBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', height: horizonLayout.sidebar.roleBtnHeight, borderRadius: horizonLayout.sidebar.roleBtnBorderRadius },
  roleActive: { backgroundColor: horizonColors.sidebarComponent.roleActiveBackgroundColor },
  roleText: { color: horizonColors.sidebarComponent.roleTextColor, fontSize: horizonLayout.sidebar.roleTextFontSize },
  roleActiveText: { color: horizonColors.sidebarComponent.roleActiveTextColor, fontWeight: horizonLayout.sidebar.roleActiveTextFontWeight },
  profile: { minHeight: horizonLayout.sidebar.profileMinHeight, backgroundColor: horizonColors.sidebarComponent.profileBackgroundColor, flexDirection: 'row', alignItems: 'center', borderRadius: horizonLayout.sidebar.profileBorderRadius, paddingHorizontal: horizonLayout.sidebar.profilePaddingHorizontal, gap: horizonLayout.sidebar.profileGap },
  profileAvatar: { height: horizonLayout.sidebar.profileAvatarHeight, width: horizonLayout.sidebar.profileAvatarWidth, borderRadius: horizonLayout.sidebar.profileAvatarBorderRadius, backgroundColor: horizonColors.sidebarComponent.profileAvatarBackgroundColor, alignItems: 'center', justifyContent: 'center' },
  profileInitial: { color: colors.white, fontSize: horizonLayout.sidebar.profileInitialFontSize, fontWeight: horizonLayout.sidebar.profileInitialFontWeight },
  profileName: { fontSize: horizonLayout.sidebar.profileNameFontSize, color: colors.white, fontWeight: horizonLayout.sidebar.profileNameFontWeight },
  profileSub: { fontSize: horizonLayout.sidebar.profileSubFontSize, color: colors.muted, marginTop: horizonLayout.sidebar.profileSubMarginTop }
});
