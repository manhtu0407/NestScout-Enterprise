import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Icon } from '@/features/shared';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

import { formatRating, minReviewsToShowRating } from './content';
import { LiquidSwitch } from './liquid-switch';
import { Presence, useRetained } from './motion-presence';
import { SlidingChips } from './sliding-chips';
import { ScreenHeader, SupportCard, SupportRow, SupportSection } from './support-shell';
import { ActionButton, actionRowStyles } from './worker-action-button';
import {
  maxCertificates, radiusOptionsKm, toWorkerProfileFields, validateWorkerProfileFields, workerProfileTabs, workerServiceOptions,
  type WorkerProfileCommand, type WorkerProfileFields, type WorkerProfilePerform, type WorkerProfileTab, type WorkerProfileView,
} from './worker-profile';
import { workflowMessage } from './workflow-messages';

const support = horizonLayout.supportScreens;
const supportColors = horizonColors.supportScreens;
const jobs = horizonLayout.workerJobs;
const jobColors = horizonColors.workerJobs;
const card = horizonLayout.requestsScreen;

type Props = {
  initialTab: WorkerProfileTab;
  profile: WorkerProfileView | null;
  fallbackName: string;
  perform: WorkerProfilePerform;
  onBack: () => void;
  sample?: boolean;
};

type Run = (command: WorkerProfileCommand) => Promise<boolean>;

type Coverage = { radiusKm: number; serviceIds: readonly string[] };

export function WorkerProfileScreen({ initialTab, profile, fallbackName, perform, onBack, sample = false }: Props) {
  const [tab, setTab] = useState(initialTab);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const mounted = useRef(true);
  const retainedNotice = useRetained(notice);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run: Run = async command => {
    if (running.current) return false;
    running.current = true;
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      const message = await perform(command);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (mounted.current) setNotice(message);
      return true;
    } catch (failure) {
      if (mounted.current) setError(workflowMessage(failure));
      return false;
    } finally {
      running.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  const select = (next: WorkerProfileTab) => {
    setTab(next);
    setNotice(null);
    setError(null);
  };

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <ScreenHeader title="Hồ sơ nghề" onBack={onBack} />
      </View>
      <View style={styles.tabs}>
        <SlidingChips items={workerProfileTabs.map(item => ({ key: item.tab, label: item.label }))} selectedKey={tab} onSelect={key => { const next = workerProfileTabs.find(item => item.tab === key); if (next) select(next.tab); }} />
      </View>
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Presence visible={notice !== null}>
          <View accessibilityLiveRegion="polite" style={styles.notice}>
            <Icon name="check" size={jobs.noticeIconSize} color={jobColors.noticeText} strokeWidth={card.toggleStroke} />
            <Text style={styles.noticeText}>{retainedNotice}</Text>
          </View>
        </Presence>
        {tab === 'profile' ? <ProfileTab profile={profile} fallbackName={fallbackName} busy={busy} error={error} onError={setError} run={run} /> : null}
        {tab === 'areas' ? <AreasTab profile={profile} busy={busy} error={error} run={run} onCreate={() => select('profile')} /> : null}
        {tab === 'reviews' ? <ReviewsTab profile={profile} onCreate={() => select('profile')} /> : null}
        {sample ? <Text style={styles.footnote}>Dữ liệu mẫu. Hồ sơ, chứng chỉ và đánh giá chưa được kết nối.</Text> : null}
      </ScrollView>
    </View>
  );
}

function initialOf(name: string): string {
  const word = name.trim().split(/\s+/).at(-1) ?? '';
  return Array.from(word)[0]?.toLocaleUpperCase('vi-VN') ?? '';
}

function Problem({ message }: { message: string | null }) {
  return message === null ? null : (
    <View accessibilityRole="alert" style={styles.problem}>
      <Text style={styles.problemText}>{message}</Text>
    </View>
  );
}

type FieldProps = { label: string; value: string; onChange: (value: string) => void; disabled: boolean; multiline?: boolean; keyboardType?: 'default' | 'number-pad'; maxLength: number };

function Field({ label, value, onChange, disabled, multiline = false, keyboardType = 'default', maxLength }: FieldProps) {
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholder={label}
        placeholderTextColor={jobColors.placeholder}
        value={value}
        onChangeText={onChange}
        editable={!disabled}
        multiline={multiline}
        keyboardType={keyboardType}
        maxLength={maxLength}
        style={[styles.field, multiline && styles.fieldMultiline]}
      />
    </View>
  );
}

type ProfileTabProps = { profile: WorkerProfileView | null; fallbackName: string; busy: boolean; error: string | null; onError: (message: string | null) => void; run: Run };

function ProfileTab({ profile, fallbackName, busy, error, onError, run }: ProfileTabProps) {
  const [editing, setEditing] = useState(profile === null);
  const [fields, setFields] = useState<WorkerProfileFields>(() => toWorkerProfileFields(profile, fallbackName));
  const [certificate, setCertificate] = useState('');
  const edit = (key: keyof WorkerProfileFields) => (value: string) => setFields(current => ({ ...current, [key]: value }));

  const save = async () => {
    const result = validateWorkerProfileFields(fields);
    if (result.draft === null) return onError(result.error);
    if (await run({ type: 'save', draft: result.draft })) setEditing(false);
  };

  const add = async () => {
    const title = certificate.trim();
    if (!title) return onError('Nhập tên chứng chỉ, tối đa 80 ký tự.');
    if (await run({ type: 'addCertificate', title })) setCertificate('');
  };

  if (profile === null || editing) {
    return (
      <>
        {profile === null ? (
          <Text style={styles.intro}>Tạo hồ sơ để khách biết bạn làm nghề gì, ở khu vực nào. Hồ sơ chỉ hiển thị công khai sau khi được duyệt.</Text>
        ) : null}
        <View style={styles.form}>
          <Field label="Tên hiển thị" value={fields.name} onChange={edit('name')} disabled={busy} maxLength={80} />
          <Field label="Nghề chính" value={fields.trade} onChange={edit('trade')} disabled={busy} maxLength={80} />
          <Field label="Khu vực chính" value={fields.area} onChange={edit('area')} disabled={busy} maxLength={80} />
          <Field label="Số năm kinh nghiệm" value={fields.experience} onChange={edit('experience')} disabled={busy} keyboardType="number-pad" maxLength={2} />
          <Field label="Giới thiệu" value={fields.about} onChange={edit('about')} disabled={busy} multiline maxLength={600} />
          <Field label="Kỹ năng (cách nhau bằng dấu phẩy)" value={fields.skills} onChange={edit('skills')} disabled={busy} multiline maxLength={600} />
          <Problem message={error} />
          <View style={actionRowStyles.actions}>
            {profile !== null ? (
              <ActionButton secondary disabled={busy} label="Hủy" accessibilityLabel="Hủy chỉnh sửa hồ sơ" onPress={() => { setEditing(false); setFields(toWorkerProfileFields(profile, fallbackName)); onError(null); }} />
            ) : null}
            <ActionButton disabled={busy} label={busy ? 'Đang lưu…' : 'Lưu hồ sơ'} accessibilityLabel="Lưu hồ sơ nghề" onPress={() => void save()} />
          </View>
        </View>
      </>
    );
  }

  return (
    <>
      <View style={styles.hero}>
        <View style={styles.avatar}>
          <Text style={styles.avatarInitial}>{initialOf(profile.name)}</Text>
        </View>
        <View style={styles.heroCopy}>
          <Text numberOfLines={2} style={styles.heroName}>{profile.name}</Text>
          <Text style={styles.heroMeta}>{profile.trade} · {profile.experienceYears} năm kinh nghiệm</Text>
        </View>
        <View style={styles.heroChip}>
          <Text style={styles.heroChipText}>{profile.listed ? 'Đang công khai' : 'Chưa công khai'}</Text>
        </View>
      </View>
      {profile.about ? (
        <SupportSection title="Giới thiệu">
          <Text style={styles.body}>{profile.about}</Text>
        </SupportSection>
      ) : null}
      {profile.skills.length > 0 ? (
        <SupportSection title="Kỹ năng">
          <View style={styles.chips}>
            {profile.skills.map(skill => (
              <View key={skill} style={styles.skillChip}>
                <Text style={styles.skillText}>{skill}</Text>
              </View>
            ))}
          </View>
        </SupportSection>
      ) : null}
      <View style={styles.sectionGap}>
        <ActionButton secondary disabled={busy} label="Chỉnh sửa hồ sơ" accessibilityLabel="Chỉnh sửa hồ sơ nghề" onPress={() => { setFields(toWorkerProfileFields(profile, fallbackName)); onError(null); setEditing(true); }} />
      </View>
      <SupportSection title={`Chứng chỉ · ${profile.certificates.length}/${maxCertificates}`}>
        {profile.certificates.length > 0 ? (
          <SupportCard>
            {profile.certificates.map(item => (
              <SupportRow
                key={item.id}
                icon="receipt"
                title={item.title}
                detail={item.statusLabel}
                trailing={
                  <Pressable accessibilityRole="button" accessibilityLabel={`Xóa chứng chỉ ${item.title}`} disabled={busy} hitSlop={jobs.removeHitSlop} onPress={() => void run({ type: 'removeCertificate', id: item.id })} style={styles.remove}>
                    <Text style={styles.removeLabel}>Xóa</Text>
                  </Pressable>
                }
              />
            ))}
          </SupportCard>
        ) : (
          <Text style={styles.body}>Chưa có chứng chỉ nào.</Text>
        )}
        {profile.certificates.length < maxCertificates ? (
          <View style={styles.addRow}>
            <Field label="Tên chứng chỉ" value={certificate} onChange={setCertificate} disabled={busy} maxLength={80} />
            <ActionButton disabled={busy} label="Thêm chứng chỉ" accessibilityLabel="Thêm chứng chỉ" onPress={() => void add()} />
          </View>
        ) : null}
        <Problem message={error} />
        <Text style={[styles.footnote, styles.footnoteLeft]}>Khách chỉ thấy chứng chỉ sau khi được xác minh. Hiện chưa tải được tài liệu chứng minh lên ứng dụng.</Text>
      </SupportSection>
    </>
  );
}

function EmptyProfile({ onCreate, body }: { onCreate: () => void; body: string }) {
  return (
    <View accessibilityLiveRegion="polite" style={styles.empty}>
      <Icon name="user" size={card.emptyIconSize} color={horizonColors.requestsScreen.emptyIcon} />
      <Text style={styles.emptyTitle}>Chưa có hồ sơ nghề</Text>
      <Text style={styles.emptyBody}>{body}</Text>
      <ActionButton label="Tạo hồ sơ" accessibilityLabel="Tạo hồ sơ nghề" onPress={onCreate} />
    </View>
  );
}

type AreasTabProps = { profile: WorkerProfileView | null; busy: boolean; error: string | null; run: Run; onCreate: () => void };

function coverageKey(radiusKm: number, serviceIds: readonly string[]): string {
  return `${radiusKm}|${[...serviceIds].sort().join(',')}`;
}

function AreasTab({ profile, busy, error, run, onCreate }: AreasTabProps) {
  const [pending, setPending] = useState<{ coverage: Coverage; base: string } | null>(null);

  if (profile === null) return <EmptyProfile onCreate={onCreate} body="Tạo hồ sơ trước để chọn khu vực và dịch vụ nhận việc." />;

  const saved: Coverage = { radiusKm: profile.radiusKm, serviceIds: profile.serviceIds };
  const base = coverageKey(saved.radiusKm, saved.serviceIds);
  const shown = pending !== null && pending.base === base ? pending.coverage : saved;
  const apply = async (next: Coverage) => {
    setPending({ coverage: next, base });
    if (!(await run({ type: 'coverage', radiusKm: next.radiusKm, serviceIds: next.serviceIds }))) setPending(null);
  };
  const toggle = (id: string, on: boolean) => apply({ radiusKm: shown.radiusKm, serviceIds: on ? [...shown.serviceIds, id] : shown.serviceIds.filter(item => item !== id) });

  return (
    <>
      <SupportSection title="Khu vực nhận việc">
        <SupportCard>
          <SupportRow icon="pin" title={profile.area} detail={`Bán kính ${shown.radiusKm} km`} />
        </SupportCard>
        <View style={styles.radii}>
          <SlidingChips inset={false} role="radio" items={radiusOptionsKm.map(option => ({ key: String(option), label: `${option} km`, accessibilityLabel: `Bán kính ${option} km` }))} selectedKey={String(shown.radiusKm)} onSelect={key => void apply({ radiusKm: Number(key), serviceIds: shown.serviceIds })} />
        </View>
      </SupportSection>
      <SupportSection title={`Dịch vụ nhận · ${shown.serviceIds.length}/${workerServiceOptions.length}`}>
        <SupportCard>
          {workerServiceOptions.map(option => (
            <SupportRow
              key={option.id}
              icon={option.icon}
              title={option.label}
              trailing={<LiquidSwitch accessibilityLabel={`Nhận việc ${option.label}`} value={shown.serviceIds.includes(option.id)} onValueChange={on => { if (!busy) void toggle(option.id, on); }} />}
            />
          ))}
        </SupportCard>
        <Problem message={error} />
        <Text style={[styles.footnote, styles.footnoteLeft]}>Lựa chọn được lưu vào hồ sơ. Việc mới chỉ gửi tới bạn khi hệ thống ghép việc hoạt động; hiện chưa có ghép việc tự động.</Text>
      </SupportSection>
    </>
  );
}

function ReviewsTab({ profile, onCreate }: { profile: WorkerProfileView | null; onCreate: () => void }) {
  if (profile === null) return <EmptyProfile onCreate={onCreate} body="Tạo hồ sơ trước để nhận đánh giá từ khách sau mỗi việc hoàn tất." />;
  const count = profile.reviewCount;
  const rated = count >= minReviewsToShowRating;
  return (
    <>
      <View style={styles.stats}>
        <View style={styles.stat}>
          <View style={styles.statValueRow}>
            {rated ? <Icon name="star" size={support.workerStatIconSize} color={supportColors.ratingStar} fill={supportColors.ratingStar} /> : null}
            <Text style={styles.statValue}>{rated ? formatRating(profile.ratingAverage) : 'Chưa đủ'}</Text>
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
          {rated && profile.strengths.length > 0 ? (
            profile.strengths.map(strength => (
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
        {profile.reviews.length > 0 ? (
          <View style={styles.reviews}>
            {profile.reviews.map(review => (
              <View key={review.id} style={styles.review}>
                <Text style={styles.reviewMeta}>{review.author} · {review.service} · {review.time}</Text>
                {review.text ? <Text style={styles.reviewText}>{review.text}</Text> : null}
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.body}>Chưa có nhận xét nào.</Text>
        )}
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
  notice: { flexDirection: 'row', alignItems: 'center', gap: jobs.noticeGap, padding: jobs.noticePadding, borderRadius: jobs.noticeRadius, backgroundColor: jobColors.noticeFill, marginBottom: support.sectionGap },
  noticeText: { flex: 1, minWidth: 0, color: jobColors.noticeText, fontSize: jobs.noticeSize, lineHeight: jobs.noticeLineHeight, fontWeight: card.stepCaptionWeight },
  problem: { padding: jobs.noticePadding, borderRadius: jobs.noticeRadius, backgroundColor: jobColors.waitingFill, marginTop: jobs.noticeGap },
  problemText: { color: jobColors.waitingText, fontSize: jobs.noticeSize, lineHeight: jobs.noticeLineHeight },
  intro: { color: horizonColors.muted, fontSize: jobs.footnoteSize, lineHeight: jobs.footnoteLineHeight, marginBottom: support.sectionGap },
  form: { gap: jobs.composerGap },
  fieldBlock: { gap: jobs.noticeGap },
  fieldLabel: { color: supportColors.sectionTitle, fontSize: support.sectionTitleSize, fontWeight: support.sectionTitleWeight, marginLeft: support.sectionTitleInset },
  field: { minHeight: jobs.fieldHeight, paddingHorizontal: jobs.fieldPaddingHorizontal, paddingVertical: jobs.composerPadding, borderRadius: jobs.fieldRadius, backgroundColor: jobColors.fieldFill, color: jobColors.fieldText, fontSize: jobs.fieldFontSize },
  fieldMultiline: { minHeight: jobs.fieldMultilineHeight, textAlignVertical: 'top' },
  sectionGap: { marginBottom: support.sectionGap },
  addRow: { gap: jobs.composerGap, marginTop: jobs.noticeGap },
  remove: { minHeight: support.heroChipHeight, justifyContent: 'center', paddingHorizontal: support.heroChipPaddingHorizontal },
  removeLabel: { color: supportColors.danger, fontSize: jobs.noticeSize, fontWeight: support.sectionTitleWeight },
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
  empty: { alignItems: 'center', paddingTop: card.emptyPaddingTop, paddingHorizontal: card.emptyPaddingHorizontal, gap: card.emptyGap },
  emptyTitle: { color: horizonColors.text, fontSize: card.emptyTitleSize, fontWeight: card.emptyTitleWeight, textAlign: 'center' },
  emptyBody: { color: horizonColors.muted, fontSize: card.emptyBodySize, lineHeight: card.emptyBodyLineHeight, textAlign: 'center' },
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
