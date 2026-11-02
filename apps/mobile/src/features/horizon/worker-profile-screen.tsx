import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/features/shared';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

import { formatRating, minReviewsToShowRating } from './content';
import { IosSwitch } from './ios-switch';
import { SlidingChips } from './sliding-chips';
import { ScreenHeader, SupportCard, SupportRow, SupportSection } from './support-shell';
import {
  defaultRadiusKm, homeAreaLabel, radiusOptionsKm, sampleRatingAverage, sampleWorkerCertificates, sampleWorkerProfile, sampleWorkerReviews,
  sampleWorkerStrengths, workerProfileTabs, workerServiceOptions, type WorkerProfileTab,
} from './worker-profile';

const support = horizonLayout.supportScreens;
const supportColors = horizonColors.supportScreens;
const jobs = horizonLayout.workerJobs;
const jobColors = horizonColors.workerJobs;
const card = horizonLayout.requestsScreen;

type Props = { initialTab: WorkerProfileTab; name: string; onBack: () => void };

export function WorkerProfileScreen({ initialTab, name, onBack }: Props) {
  const [tab, setTab] = useState(initialTab);
  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <ScreenHeader title="Hồ sơ nghề" onBack={onBack} />
      </View>
      <View style={styles.tabs}>
        <SlidingChips items={workerProfileTabs.map(item => ({ key: item.tab, label: item.label }))} selectedKey={tab} onSelect={key => { const next = workerProfileTabs.find(item => item.tab === key); if (next) setTab(next.tab); }} />
      </View>
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
        {tab === 'profile' ? <ProfileTab name={name} /> : null}
        {tab === 'areas' ? <AreasTab /> : null}
        {tab === 'reviews' ? <ReviewsTab /> : null}
        <Text style={styles.footnote}>Dữ liệu mẫu. Hồ sơ, chứng chỉ và đánh giá chưa được kết nối.</Text>
      </ScrollView>
    </View>
  );
}

function initialOf(name: string): string {
  const word = name.trim().split(/\s+/).at(-1) ?? '';
  return Array.from(word)[0]?.toLocaleUpperCase('vi-VN') ?? '';
}

function ProfileTab({ name }: { name: string }) {
  const profile = sampleWorkerProfile;
  return (
    <>
      <View style={styles.hero}>
        <View style={styles.avatar}>
          <Text style={styles.avatarInitial}>{initialOf(name)}</Text>
        </View>
        <View style={styles.heroCopy}>
          <Text numberOfLines={2} style={styles.heroName}>{name}</Text>
          <Text style={styles.heroMeta}>{profile.trade} · {profile.experienceYears} năm kinh nghiệm</Text>
        </View>
        <View style={styles.heroChip}>
          <Text style={styles.heroChipText}>Chưa xác minh</Text>
        </View>
      </View>
      <SupportSection title="Giới thiệu">
        <Text style={styles.body}>{profile.about}</Text>
      </SupportSection>
      <SupportSection title="Kỹ năng">
        <View style={styles.chips}>
          {profile.skills.map(skill => (
            <View key={skill} style={styles.skillChip}>
              <Text style={styles.skillText}>{skill}</Text>
            </View>
          ))}
        </View>
      </SupportSection>
      <SupportSection title="Chứng chỉ">
        <SupportCard>
          {sampleWorkerCertificates.map(certificate => (
            <SupportRow key={certificate.id} icon="receipt" title={certificate.title} detail={certificate.statusLabel} />
          ))}
        </SupportCard>
        <Text style={[styles.footnote, styles.footnoteLeft]}>Khách chỉ thấy chứng chỉ sau khi được xác minh.</Text>
      </SupportSection>
    </>
  );
}

function AreasTab() {
  const [radius, setRadius] = useState(defaultRadiusKm);
  const [enabled, setEnabled] = useState<readonly string[]>(workerServiceOptions.filter(option => option.defaultOn).map(option => option.id));
  const toggle = (id: string, on: boolean) => setEnabled(current => (on ? [...current, id] : current.filter(item => item !== id)));
  return (
    <>
      <SupportSection title="Khu vực nhận việc">
        <SupportCard>
          <SupportRow icon="pin" title={homeAreaLabel} detail={`Bán kính ${radius} km`} />
        </SupportCard>
        <View style={styles.radii}>
          <SlidingChips inset={false} role="radio" items={radiusOptionsKm.map(option => ({ key: String(option), label: `${option} km`, accessibilityLabel: `Bán kính ${option} km` }))} selectedKey={String(radius)} onSelect={key => setRadius(Number(key))} />
        </View>
      </SupportSection>
      <SupportSection title={`Dịch vụ nhận · ${enabled.length}/${workerServiceOptions.length}`}>
        <SupportCard>
          {workerServiceOptions.map(option => (
            <SupportRow
              key={option.id}
              icon={option.icon}
              title={option.label}
              trailing={<IosSwitch accessibilityLabel={`Nhận việc ${option.label}`} value={enabled.includes(option.id)} onValueChange={on => toggle(option.id, on)} />}
            />
          ))}
        </SupportCard>
        <Text style={[styles.footnote, styles.footnoteLeft]}>Chỉ việc thuộc dịch vụ và khu vực bạn chọn mới hiện ở mục Việc mới.</Text>
      </SupportSection>
    </>
  );
}

function ReviewsTab() {
  const count = sampleWorkerReviews.length;
  const rated = count >= minReviewsToShowRating;
  return (
    <>
      <View style={styles.stats}>
        <View style={styles.stat}>
          <View style={styles.statValueRow}>
            {rated ? <Icon name="star" size={support.workerStatIconSize} color={supportColors.ratingStar} fill={supportColors.ratingStar} /> : null}
            <Text style={styles.statValue}>{rated ? formatRating(sampleRatingAverage) : 'Chưa đủ'}</Text>
          </View>
          <Text style={styles.statLabel}>Điểm trung bình</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.stat}>
          <Text style={styles.statValue}>{count}</Text>
          <Text style={styles.statLabel}>Đánh giá</Text>
        </View>
      </View>
      <SupportSection title="Điểm mạnh khách khen">
        <View style={styles.strengthPanel}>
          {rated ? (
            sampleWorkerStrengths.map(strength => (
              <View key={strength.label} style={styles.strengthRow}>
                <View style={styles.strengthHead}>
                  <Text style={styles.strengthLabel}>{strength.label}</Text>
                  <Text style={styles.strengthCount}>{strength.count} khách khen</Text>
                </View>
                <View style={styles.strengthTrack}>
                  <View style={[styles.strengthBar, { flex: strength.count }]} />
                  <View style={{ flex: Math.max(count - strength.count, 0) }} />
                </View>
              </View>
            ))
          ) : (
            <Text style={styles.body}>Điểm mạnh sẽ hiện khi bạn có ít nhất {minReviewsToShowRating} đánh giá từ khách.</Text>
          )}
        </View>
      </SupportSection>
      <SupportSection title="Nhận xét gần đây">
        <View style={styles.reviews}>
          {sampleWorkerReviews.map(review => (
            <View key={review.id} style={styles.review}>
              <Text style={styles.reviewMeta}>{review.author} · {review.service} · {review.time}</Text>
              <Text style={styles.reviewText}>{review.text}</Text>
            </View>
          ))}
        </View>
      </SupportSection>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: card.paddingHorizontal },
  tabs: { marginTop: jobs.chipsMarginTop },
  radii: { marginTop: jobs.chipsGap },
  list: { flex: 1 },
  listContent: { paddingHorizontal: card.paddingHorizontal, paddingTop: card.listPaddingTop, paddingBottom: card.listPaddingBottom },
  hero: { flexDirection: 'row', alignItems: 'center', gap: support.heroGap, padding: support.heroPadding, borderRadius: support.heroRadius, backgroundColor: supportColors.heroFill, marginBottom: support.sectionGap },
  avatar: { width: support.avatarSize, height: support.avatarSize, borderRadius: support.avatarRadius, backgroundColor: supportColors.avatarFill, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: supportColors.avatarInitial, fontSize: support.avatarInitialSize, fontWeight: support.avatarInitialWeight },
  heroCopy: { flex: 1, minWidth: 0, gap: support.workerStatGap },
  heroName: { color: horizonColors.text, fontSize: support.heroNameSize, fontWeight: support.heroNameWeight },
  heroMeta: { color: horizonColors.muted, fontSize: support.workerMetaSize },
  heroChip: { height: support.heroChipHeight, paddingHorizontal: support.heroChipPaddingHorizontal, borderRadius: support.heroChipRadius, backgroundColor: jobColors.waitingFill, justifyContent: 'center' },
  heroChipText: { color: jobColors.waitingText, fontSize: support.heroChipSize, fontWeight: support.heroChipWeight },
  body: { color: horizonColors.text, fontSize: support.quoteScopeSize, lineHeight: support.quoteScopeLineHeight },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: support.skillChipGap },
  skillChip: { minHeight: support.skillChipHeight, paddingHorizontal: support.skillChipPaddingHorizontal, borderRadius: support.skillChipRadius, backgroundColor: supportColors.skillChipFill, justifyContent: 'center' },
  skillText: { color: supportColors.skillChipText, fontSize: support.skillChipSize, fontWeight: support.fieldLabelWeight },
  stats: { flexDirection: 'row', alignItems: 'center', paddingVertical: support.workerStatsPaddingVertical, borderRadius: support.workerStatsRadius, backgroundColor: supportColors.cardFill, marginBottom: support.sectionGap },
  stat: { flex: 1, alignItems: 'center', gap: support.workerStatGap },
  statValueRow: { flexDirection: 'row', alignItems: 'center', gap: support.workerStatInlineGap },
  statValue: { color: horizonColors.text, fontSize: support.workerStatValueSize, fontWeight: support.workerStatValueWeight, lineHeight: support.workerStatValueLineHeight, fontVariant: ['tabular-nums'] },
  statLabel: { color: supportColors.sectionTitle, fontSize: support.workerStatLabelSize },
  statDivider: { width: support.separatorHeight, alignSelf: 'stretch', backgroundColor: supportColors.separator },
  strengthPanel: { gap: support.strengthListGap, padding: support.strengthPanelPadding, borderRadius: support.workerStatsRadius, backgroundColor: supportColors.cardFill },
  strengthRow: { gap: support.strengthRowGap },
  strengthHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: support.rowGap },
  strengthLabel: { flex: 1, minWidth: 0, color: horizonColors.text, fontSize: support.strengthLabelSize, fontWeight: support.strengthLabelWeight },
  strengthCount: { color: supportColors.sectionTitle, fontSize: support.strengthCountSize, fontVariant: ['tabular-nums'] },
  strengthTrack: { flexDirection: 'row', height: support.strengthBarHeight, borderRadius: support.strengthBarRadius, backgroundColor: supportColors.strengthTrack, overflow: 'hidden' },
  strengthBar: { borderRadius: support.strengthBarRadius, backgroundColor: supportColors.strengthBar },
  reviews: { gap: support.reviewListGap },
  review: { gap: support.reviewGap, padding: support.strengthPanelPadding, borderRadius: support.workerStatsRadius, backgroundColor: supportColors.cardFill },
  reviewMeta: { color: supportColors.sectionTitle, fontSize: support.reviewMetaSize },
  reviewText: { color: horizonColors.text, fontSize: support.reviewTextSize, lineHeight: support.reviewTextLineHeight },
  footnote: { color: horizonColors.muted, fontSize: jobs.footnoteSize, lineHeight: jobs.footnoteLineHeight, textAlign: 'center' },
  footnoteLeft: { textAlign: 'left', marginTop: jobs.noticeGap, marginLeft: support.sectionTitleInset },
});
