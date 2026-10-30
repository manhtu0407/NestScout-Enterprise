import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';
import { Skeleton, SkeletonBlock } from './skeleton';

const metrics = horizonLayout.skeleton;
const home = horizonLayout.kaelHomeScreen;
const glass = horizonLayout.glass;
const composer = horizonLayout.chatComposer;
const sidebarList = horizonLayout.sidebarList;

function Lines({ widths }: { widths: readonly (`${number}%`)[] }) {
  return <>{widths.map((width, index) => <SkeletonBlock key={index} width={width} height={metrics.lineHeight} radius={metrics.lineRadius}/>)}</>;
}

function ChatPlaceholder() {
  return <View style={styles.chat}>
    <View style={styles.assistantRow}>
      <SkeletonBlock width={metrics.avatarSize} height={metrics.avatarSize} radius={metrics.avatarRadius}/>
      <View style={styles.assistantLines}><Lines widths={metrics.assistantLines}/></View>
    </View>
    <View style={styles.userLines}><Lines widths={metrics.userLines}/></View>
    <View style={styles.assistantRow}>
      <SkeletonBlock width={metrics.avatarSize} height={metrics.avatarSize} radius={metrics.avatarRadius}/>
      <View style={styles.assistantLines}><Lines widths={metrics.shortAssistantLines}/></View>
    </View>
  </View>;
}

export function KaelHomeLoading({ label }: { label: string }) {
  return <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
    <Skeleton label={label} style={styles.root}>
      <View style={styles.nav}>
        <View style={styles.slotStart}>
          <SkeletonBlock width={glass.controlSize} height={glass.controlSize} radius={glass.controlRadius} style={styles.lifted}/>
        </View>
        <SkeletonBlock width={horizonLayout.kaelAvatar.size} height={horizonLayout.kaelAvatar.size} radius={horizonLayout.kaelAvatar.size * horizonLayout.kaelAvatar.radiusRatio}/>
        <View style={styles.slotEnd}>
          <SkeletonBlock width={glass.pillSegmentWidth * 2} height={glass.controlSize} radius={glass.pillRadius} style={styles.lifted}/>
        </View>
      </View>
      <View style={styles.body}><ChatPlaceholder/></View>
      <View style={styles.footer}>
        <SkeletonBlock width="100%" height={composer.frameMinHeight} radius={composer.frameRadius}/>
        <SkeletonBlock width={metrics.disclaimerWidth} height={metrics.disclaimerHeight} radius={metrics.lineRadius} style={styles.disclaimer}/>
      </View>
    </Skeleton>
  </SafeAreaView>;
}

export function RecentSkeleton({ label }: { label: string }) {
  return <Skeleton label={label}>
    {metrics.recentRows.map((width, index) => <View key={index} style={styles.recentRow}>
      <SkeletonBlock width={width} height={metrics.recentTitleHeight} radius={metrics.recentTitleRadius}/>
    </View>)}
  </Skeleton>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: horizonColors.bg },
  root: { flex: 1, paddingHorizontal: home.rootPaddingHorizontal },
  nav: { height: home.navHeight, flexDirection: 'row', alignItems: 'center' },
  slotStart: { flex: 1, flexDirection: 'row', justifyContent: 'flex-start' },
  slotEnd: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end' },
  lifted: { position: 'relative', top: -home.controlLift },
  body: { flex: 1 },
  footer: { paddingBottom: home.footerPaddingBottom },
  disclaimer: { alignSelf: 'center', marginTop: home.disclaimerMarginTop },
  chat: { paddingTop: home.chatContentPaddingTop, gap: metrics.groupGap },
  assistantRow: { width: metrics.assistantWidth, flexDirection: 'row', alignItems: 'flex-start', gap: metrics.avatarGap },
  assistantLines: { flex: 1, gap: metrics.lineGap },
  userLines: { alignSelf: 'flex-end', width: metrics.userWidth, gap: metrics.lineGap },
  recentRow: { minHeight: sidebarList.rowHeight, justifyContent: 'center', paddingHorizontal: sidebarList.rowPadding },
});
