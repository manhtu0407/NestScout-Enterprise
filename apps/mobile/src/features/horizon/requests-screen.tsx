import { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';
import { GlassIconButton, PressScale } from './glass-controls';
import { useGlassAccessibility } from './glass-interaction';
import { Icon } from './icon';
import type { IconName } from './icon';

const metrics = horizonLayout.requestsScreen;
const colors = horizonColors.requestsScreen;
const easeOut = Easing.bezier(0.23, 1, 0.32, 1);

export type RequestStage = 'waiting' | 'active' | 'done';

export type ServiceRequest = {
  id: string;
  title: string;
  icon: IconName;
  meta: string;
  status: string;
  stage: RequestStage;
  quoteCount?: number;
};

const tabs: readonly { stage: RequestStage; label: string; emptyTitle: string; emptyBody: string }[] = [
  { stage: 'waiting', label: 'Đang chờ', emptyTitle: 'Chưa có yêu cầu đang chờ', emptyBody: 'Hỏi Kael để tạo yêu cầu mới, báo giá sẽ về đây.' },
  { stage: 'active', label: 'Đang làm', emptyTitle: 'Chưa có việc đang làm', emptyBody: 'Việc đang được thợ thực hiện sẽ hiện ở đây.' },
  { stage: 'done', label: 'Đã xong', emptyTitle: 'Chưa có việc hoàn tất', emptyBody: 'Các việc đã hoàn tất sẽ được lưu lại ở đây.' },
];

type Props = {
  requests?: readonly ServiceRequest[];
  onBack: () => void;
  onOpenRequest?: (id: string) => void;
};

function RequestCard({ request, onPress }: { request: ServiceRequest; onPress: () => void }) {
  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={`${request.title}, ${request.meta}, ${request.status}`}
      onPress={onPress}
      style={styles.card}
    >
      <View style={styles.cardTop}>
        <View style={styles.tile}>
          <Icon name={request.icon} size={metrics.tileIconSize} />
        </View>
        <View style={styles.cardCopy}>
          <Text numberOfLines={1} style={styles.cardTitle}>{request.title}</Text>
          <Text numberOfLines={1} style={styles.cardMeta}>{request.meta}</Text>
        </View>
      </View>
      <View style={styles.cardBottom}>
        <Text style={styles.status}>{request.status}</Text>
        {request.quoteCount ? (
          <View style={styles.chip}>
            <Text style={styles.chipText}>{request.quoteCount} báo giá</Text>
          </View>
        ) : null}
      </View>
    </PressScale>
  );
}

export function RequestsScreen({ requests = [], onBack, onOpenRequest }: Props) {
  const { reduceMotion } = useGlassAccessibility();
  const [index, setIndex] = useState(0);
  const [trackWidth, setTrackWidth] = useState(0);
  const [position] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (reduceMotion) {
      position.setValue(index);
      return;
    }
    const slide = Animated.timing(position, {
      toValue: index,
      duration: metrics.indicatorDuration,
      easing: easeOut,
      useNativeDriver: true,
    });
    slide.start();
    return () => slide.stop();
  }, [index, position, reduceMotion]);

  const tabWidth = trackWidth / tabs.length;
  const current = tabs[index] ?? tabs[0];
  const visible = requests.filter(request => request.stage === current?.stage);
  const handleLayout = (event: LayoutChangeEvent) =>
    setTrackWidth(event.nativeEvent.layout.width - metrics.tabsPadding * 2);

  return (
    <View style={styles.root}>
      <GlassIconButton label="Quay về" onPress={onBack} style={styles.back}>
        <Icon name="back" size={horizonLayout.glass.iconSize} />
      </GlassIconButton>
      <Text accessibilityRole="header" style={styles.title}>Yêu cầu của tôi</Text>
      <View accessibilityRole="tablist" onLayout={handleLayout} style={styles.tabs}>
        {trackWidth > 0 && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.indicator,
              {
                width: tabWidth,
                transform: [{
                  translateX: position.interpolate({
                    inputRange: [0, tabs.length - 1],
                    outputRange: [0, tabWidth * (tabs.length - 1)],
                  }),
                }],
              },
            ]}
          />
        )}
        {tabs.map((tab, tabIndex) => {
          const count = requests.filter(request => request.stage === tab.stage).length;
          const selected = tabIndex === index;
          return (
            <Pressable
              key={tab.stage}
              accessibilityRole="tab"
              accessibilityLabel={`${tab.label}, ${count}`}
              accessibilityState={{ selected }}
              onPress={() => setIndex(tabIndex)}
              style={styles.tab}
            >
              <Text style={[styles.tabLabel, selected && styles.tabLabelActive]}>{tab.label}</Text>
              <Text style={[styles.tabLabel, selected && styles.tabLabelActive]}>{count}</Text>
            </Pressable>
          );
        })}
      </View>
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
        {visible.length > 0 ? (
          visible.map(request => (
            <RequestCard key={request.id} request={request} onPress={() => onOpenRequest?.(request.id)} />
          ))
        ) : (
          <View accessibilityLiveRegion="polite" style={styles.empty}>
            <Icon name="requests" size={metrics.emptyIconSize} color={colors.emptyIcon} />
            <Text style={styles.emptyTitle}>{current?.emptyTitle}</Text>
            <Text style={styles.emptyBody}>{current?.emptyBody}</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: metrics.paddingHorizontal },
  back: { alignSelf: 'flex-start', marginTop: metrics.backMarginTop, marginLeft: metrics.backMarginLeft },
  title: {
    color: horizonColors.text,
    fontSize: metrics.titleSize,
    fontWeight: metrics.titleWeight,
    marginTop: metrics.titleMarginTop,
    marginBottom: metrics.titleMarginBottom,
  },
  tabs: { flexDirection: 'row', padding: metrics.tabsPadding, borderRadius: metrics.tabsRadius, backgroundColor: colors.tabsFill },
  indicator: {
    position: 'absolute',
    top: metrics.tabsPadding,
    left: metrics.tabsPadding,
    bottom: metrics.tabsPadding,
    borderRadius: metrics.tabRadius,
    backgroundColor: colors.indicator,
    boxShadow: colors.indicatorShadow,
  },
  tab: { flex: 1, height: metrics.tabHeight, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: metrics.tabGap },
  tabLabel: { color: colors.tabText, fontSize: metrics.tabFontSize, fontWeight: metrics.tabFontWeight },
  tabLabelActive: { color: colors.tabTextActive },
  list: { flex: 1 },
  listContent: { gap: metrics.listGap, paddingTop: metrics.listPaddingTop, paddingBottom: metrics.listPaddingBottom },
  card: { padding: metrics.cardPadding, gap: metrics.cardGap, borderRadius: metrics.cardRadius, backgroundColor: colors.cardFill },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: metrics.cardGap },
  tile: {
    width: metrics.tileSize,
    height: metrics.tileSize,
    borderRadius: metrics.tileRadius,
    backgroundColor: colors.tileFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardCopy: { flex: 1, minWidth: 0 },
  cardTitle: { color: horizonColors.text, fontSize: metrics.cardTitleSize, fontWeight: metrics.cardTitleWeight },
  cardMeta: { color: horizonColors.muted, fontSize: metrics.metaSize, marginTop: metrics.metaGap },
  cardBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: metrics.cardGap },
  status: { flex: 1, color: horizonColors.text, fontSize: metrics.statusSize, fontWeight: metrics.statusWeight },
  chip: {
    height: metrics.chipHeight,
    paddingHorizontal: metrics.chipPaddingHorizontal,
    borderRadius: metrics.chipRadius,
    backgroundColor: colors.chipFill,
    justifyContent: 'center',
  },
  chipText: { color: colors.chipText, fontSize: metrics.chipFontSize, fontWeight: metrics.chipFontWeight },
  empty: { alignItems: 'center', paddingTop: metrics.emptyPaddingTop, paddingHorizontal: metrics.emptyPaddingHorizontal, gap: metrics.emptyGap },
  emptyTitle: { color: horizonColors.text, fontSize: metrics.emptyTitleSize, fontWeight: metrics.emptyTitleWeight, textAlign: 'center' },
  emptyBody: { color: horizonColors.muted, fontSize: metrics.emptyBodySize, lineHeight: metrics.emptyBodyLineHeight, textAlign: 'center' },
});
