import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';
import { Skeleton, SkeletonBlock } from './skeleton';

const metrics = horizonLayout.skeleton;
const home = horizonLayout.kaelHomeScreen;
const companion = horizonLayout.kaelCompanion;
const composer = horizonLayout.chatComposer;
const sidebarList = horizonLayout.sidebarList;

export function KaelHomeLoading({ label }: { label: string }) {
  const introHeight = companion.introKaelWidth * companion.plushAspectRatio;
  return <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
    <Skeleton label={label} style={styles.root}>
      <View style={styles.body}>
        <View style={styles.ambient}/>
        <View style={styles.copy}>
          {metrics.introLineWidths.map((width, index) => <SkeletonBlock key={index} width={width} height={metrics.introLineHeight} radius={metrics.introLineRadius}/>)}
          <SkeletonBlock width={companion.introUnderlineWidth} height={companion.introUnderlineHeight} radius={metrics.introLineRadius}/>
        </View>
        <SkeletonBlock width={companion.introKaelWidth} height={introHeight} radius={metrics.introKaelRadius} style={styles.figure}/>
      </View>
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
  root: { flex: 1, paddingHorizontal: home.rootPaddingHorizontal, overflow: 'hidden' },
  body: { flex: 1, marginTop: companion.navHeight },
  ambient: { position: 'absolute', top: companion.ambientTop, right: companion.ambientRight - home.rootPaddingHorizontal, width: companion.ambientWidth, height: companion.ambientHeight, borderRadius: companion.ambientHeight, backgroundColor: horizonColors.kaelCompanion.ambient },
  copy: { position: 'absolute', top: companion.introTaglineTop, left: companion.introCopyLeft - home.rootPaddingHorizontal, gap: metrics.introLineGap },
  figure: { position: 'absolute', top: companion.introKaelTop, left: companion.introKaelLeft - home.rootPaddingHorizontal },
  footer: { paddingBottom: home.footerPaddingBottom },
  disclaimer: { alignSelf: 'center', marginTop: home.disclaimerMarginTop },
  recentRow: { minHeight: sidebarList.rowHeight, justifyContent: 'center', paddingHorizontal: sidebarList.rowPadding },
});
