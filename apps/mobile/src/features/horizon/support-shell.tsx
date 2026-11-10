import { Children, Fragment, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { GlassIconButton, Icon, type IconName, PressScale } from '@/features/shared';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

const metrics = horizonLayout.supportScreens;
const colors = horizonColors.supportScreens;

type ShellProps = { title: string; subtitle?: string; onBack: () => void; backLabel?: string; headerAction?: ReactNode; children: ReactNode };

export function ScreenHeader({ title, onBack, action, backLabel = 'Quay về' }: { title: string; onBack: () => void; action?: ReactNode; backLabel?: string }) {
  return (
    <View style={styles.topBar}>
      <GlassIconButton label={backLabel} onPress={onBack} style={styles.back}>
        <Icon name="back" size={horizonLayout.glass.iconSize} />
      </GlassIconButton>
      <Text accessibilityRole="header" numberOfLines={1} style={styles.title}>{title}</Text>
      {action}
    </View>
  );
}

export function SupportShell({ title, subtitle, onBack, backLabel, headerAction, children }: ShellProps) {
  return (
    <View style={styles.root}>
      <ScreenHeader title={title} onBack={onBack} action={headerAction} backLabel={backLabel} />
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </View>
  );
}

export function SupportSection({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      {title ? <Text accessibilityRole="header" style={styles.sectionTitle}>{title}</Text> : null}
      {children}
    </View>
  );
}

export function SupportCard({ children }: { children: ReactNode }) {
  const rows = Children.toArray(children);
  return (
    <View style={styles.card}>
      {rows.map((row, index) => (
        <Fragment key={index}>
          {index > 0 ? <View style={styles.separator} /> : null}
          {row}
        </Fragment>
      ))}
    </View>
  );
}

type RowProps = {
  icon: IconName;
  title: string;
  detail?: string;
  danger?: boolean;
  highlighted?: boolean;
  onPress?: () => void;
  trailing?: ReactNode;
  accessibilityState?: { expanded?: boolean };
};

export function SupportRow({ icon, title, detail, danger = false, highlighted = false, onPress, trailing, accessibilityState }: RowProps) {
  const content = (
    <>
      <View style={[styles.tile, highlighted && styles.tileHighlighted]}>
        <Icon name={icon} size={metrics.tileIconSize} color={danger ? colors.danger : highlighted ? colors.unreadIcon : undefined} />
      </View>
      <View style={styles.copy}>
        <Text style={[styles.rowTitle, danger && styles.rowTitleDanger]}>{title}</Text>
        {detail ? <Text style={styles.rowDetail}>{detail}</Text> : null}
      </View>
      {trailing ?? (onPress ? <Icon name="chevron" size={metrics.chevronSize} color={colors.chevron} /> : null)}
    </>
  );
  if (!onPress) return <View style={styles.row}>{content}</View>;
  return (
    <PressScale accessibilityRole="button" accessibilityLabel={detail ? `${title}, ${detail}` : title} accessibilityState={accessibilityState} onPress={onPress} style={styles.row}>
      {content}
    </PressScale>
  );
}

export function SupportEmpty({ icon, title, body }: { icon: IconName; title: string; body: string }) {
  return (
    <View accessibilityLiveRegion="polite" style={styles.empty}>
      <Icon name={icon} size={metrics.emptyIconSize} color={colors.emptyIcon} />
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
    </View>
  );
}

export const supportStyles = StyleSheet.create({
  primary: { minHeight: metrics.primaryHeight, borderRadius: metrics.primaryRadius, backgroundColor: colors.primaryFill, alignItems: 'center', justifyContent: 'center' },
  primaryLabel: { color: colors.primaryLabel, fontSize: metrics.primarySize, fontWeight: metrics.primaryWeight },
  secondary: { minHeight: metrics.primaryHeight, borderRadius: metrics.primaryRadius, backgroundColor: colors.secondaryFill, alignItems: 'center', justifyContent: 'center' },
  secondaryLabel: { color: colors.secondaryLabel, fontSize: metrics.primarySize, fontWeight: metrics.primaryWeight },
});

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: metrics.paddingHorizontal },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: metrics.headerGap, marginTop: metrics.backMarginTop },
  back: { marginLeft: metrics.backMarginLeft },
  title: { flex: 1, minWidth: 0, color: horizonColors.text, fontSize: metrics.titleSize, lineHeight: metrics.titleLineHeight, fontWeight: metrics.titleWeight },
  subtitle: { color: horizonColors.muted, fontSize: metrics.subtitleSize, lineHeight: metrics.subtitleLineHeight, marginTop: metrics.titleMarginBottom, marginLeft: metrics.subtitleInset, marginBottom: metrics.subtitleMarginBottom },
  scroll: { flex: 1 },
  content: { paddingTop: metrics.contentPaddingTop, paddingBottom: metrics.scrollBottom },
  section: { marginBottom: metrics.sectionGap },
  sectionTitle: { color: colors.sectionTitle, fontSize: metrics.sectionTitleSize, fontWeight: metrics.sectionTitleWeight, marginBottom: metrics.sectionTitleGap, marginLeft: metrics.sectionTitleInset },
  card: { borderRadius: metrics.cardRadius, backgroundColor: colors.cardFill, overflow: 'hidden' },
  separator: { height: metrics.separatorHeight, marginLeft: metrics.separatorInset, backgroundColor: colors.separator },
  row: { minHeight: metrics.rowMinHeight, flexDirection: 'row', alignItems: 'center', gap: metrics.rowGap, paddingHorizontal: metrics.rowPaddingHorizontal, paddingVertical: metrics.rowPaddingVertical },
  tile: { width: metrics.tileSize, height: metrics.tileSize, borderRadius: metrics.tileRadius, backgroundColor: colors.tileFill, alignItems: 'center', justifyContent: 'center' },
  tileHighlighted: { backgroundColor: colors.unreadTile },
  copy: { flex: 1, minWidth: 0 },
  rowTitle: { color: horizonColors.text, fontSize: metrics.rowTitleSize, fontWeight: metrics.rowTitleWeight },
  rowTitleDanger: { color: colors.danger },
  rowDetail: { color: horizonColors.muted, fontSize: metrics.rowDetailSize, lineHeight: metrics.rowDetailLineHeight, marginTop: metrics.rowDetailGap },
  empty: { alignItems: 'center', paddingTop: metrics.emptyPaddingTop, paddingHorizontal: metrics.emptyPaddingHorizontal, gap: metrics.emptyGap },
  emptyTitle: { color: horizonColors.text, fontSize: metrics.emptyTitleSize, fontWeight: metrics.emptyTitleWeight, textAlign: 'center' },
  emptyBody: { color: horizonColors.muted, fontSize: metrics.emptyBodySize, lineHeight: metrics.emptyBodyLineHeight, textAlign: 'center' },
});
