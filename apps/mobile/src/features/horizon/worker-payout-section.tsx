import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { acceptedImageTypes, Icon, PressScale, type MediaFile, type StorageSource } from '@/features/shared';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

import { AvatarImage } from './avatar-image';
import { ConfirmMorph } from './confirm-morph';
import { FadeIn } from './earnings-motion';
import { Presence } from './motion-presence';
import { ActionButton, actionRowStyles } from './worker-action-button';
import {
  emptyPayoutFields, maskAccountNumber, normalizeAccountHolder, payoutBanks, validatePayoutFields,
  type WorkerPayoutFields, type WorkerPayoutPerform, type WorkerPayoutView,
} from './worker-payout';
import { workflowMessage } from './workflow-messages';

const webField = Platform.select({ web: { outlineStyle: 'solid', outlineWidth: 0 } as const, default: undefined });
const kit = horizonLayout.profileKit;
const kitColors = horizonColors.profileKit;
const jobs = horizonLayout.workerJobs;
const jobColors = horizonColors.workerJobs;
const support = horizonLayout.supportScreens;
const supportColors = horizonColors.supportScreens;
const maxQrBytes = 5 * 1024 * 1024;

type Props = {
  payout: WorkerPayoutView | null;
  perform: WorkerPayoutPerform;
  loadQr?: (path: string, version: string, signal: AbortSignal) => Promise<StorageSource>;
};

type QrState = { source: StorageSource | null; key: string };

function useStoredQr(path: string | null, version: string, loadQr: Props['loadQr']): StorageSource | null {
  const [state, setState] = useState<QrState>({ source: null, key: '' });
  const key = `${path ?? ''}|${version}`;
  useEffect(() => {
    if (path === null || loadQr === undefined) return undefined;
    const controller = new AbortController();
    loadQr(path, version, controller.signal).then(
      source => { if (!controller.signal.aborted) setState({ source, key }); },
      () => { if (!controller.signal.aborted) setState({ source: null, key }); },
    );
    return () => controller.abort();
  }, [path, version, loadQr, key]);
  return state.key === key ? state.source : null;
}

function Label({ children }: { children: string }) {
  return <Text style={styles.label}>{children}</Text>;
}

function StatusTag({ view }: { view: WorkerPayoutView }) {
  const tone = view.status === 'verified' ? [kitColors.verifiedFill, kitColors.verifiedText] : view.status === 'rejected' ? [kitColors.rejectedFill, kitColors.rejectedText] : [kitColors.pendingFill, kitColors.pendingText];
  return (
    <View style={[styles.tag, { backgroundColor: tone[0] }]}>
      <Text style={[styles.tagText, { color: tone[1] }]}>{view.statusLabel}</Text>
    </View>
  );
}

export function WorkerPayoutSection({ payout, perform, loadQr }: Props) {
  const [editing, setEditing] = useState(payout === null);
  const [fields, setFields] = useState<WorkerPayoutFields>(() => emptyPayoutFields(payout));
  const [qr, setQr] = useState<MediaFile | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const stored = useStoredQr(payout?.qrPath ?? null, payout?.updatedAt ?? '', loadQr);

  const bank = payoutBanks.find(item => item.code === fields.bankCode);
  const matches = payoutBanks.filter(item => `${item.name} ${item.code}`.toLowerCase().includes(search.trim().toLowerCase()));

  const run = async (action: () => Promise<string>): Promise<boolean> => {
    if (busy) return false;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      setNotice(await action());
      return true;
    } catch (failure) {
      setError(workflowMessage(failure));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const pickQr = async () => {
    setError(null);
    let result: ImagePicker.ImagePickerResult;
    try {
      result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: false, quality: 0.9 });
    } catch {
      setError('Không mở được thư viện ảnh. Kiểm tra quyền truy cập ảnh rồi thử lại.');
      return;
    }
    const asset = result.canceled ? undefined : result.assets[0];
    if (asset === undefined) return;
    const mimeType = asset.mimeType ?? '';
    if (!acceptedImageTypes.includes(mimeType)) return setError('Chỉ nhận ảnh JPG, PNG hoặc WebP.');
    if (typeof asset.fileSize === 'number' && asset.fileSize > maxQrBytes) return setError('Ảnh quá lớn. Tối đa 5 MB.');
    setQr({ uri: asset.uri, mimeType });
  };

  const save = async () => {
    const result = validatePayoutFields(fields, qr, payout?.qrPath ?? null);
    if (result.draft === null) return setError(result.error);
    const { draft } = result;
    const saved = await run(() => perform({ type: 'save', draft, existingQrPath: payout?.qrPath ?? null }));
    if (saved) {
      setEditing(false);
      setQr(null);
      setPickerOpen(false);
      setFields(current => ({ ...current, confirmed: false }));
    }
  };

  const startEditing = () => {
    setFields(emptyPayoutFields(payout));
    setQr(null);
    setError(null);
    setNotice(null);
    setEditing(true);
  };

  const cancel = () => {
    setEditing(false);
    setQr(null);
    setPickerOpen(false);
    setError(null);
  };

  const remove = async () => {
    if (!(await run(() => perform({ type: 'remove' })))) throw new Error('payout remove failed');
    setEditing(true);
    setFields(emptyPayoutFields(null));
    setQr(null);
  };

  if (payout !== null && !editing) {
    return (
      <View style={styles.stack}>
        {notice !== null ? (
          <FadeIn><View accessibilityLiveRegion="polite" style={styles.notice}><Icon name="check" size={jobs.noticeIconSize} color={jobColors.noticeText} strokeWidth={2} /><Text style={styles.noticeText}>{notice}</Text></View></FadeIn>
        ) : null}
        <FadeIn style={styles.card}>
          <View style={styles.cardHead}>
            <View style={styles.bankTile}><Icon name="wallet" size={20} color={kitColors.tileIcon} /></View>
            <View style={styles.cardCopy}>
              <Text style={styles.bankName}>{payout.bankName}</Text>
              <StatusTag view={payout} />
            </View>
          </View>
          <View style={styles.facts}>
            <View style={styles.fact}><Text style={styles.factLabel}>Số tài khoản</Text><Text accessibilityLabel={`Số tài khoản kết thúc bằng ${payout.accountNumber.slice(-4)}`} style={styles.factValue}>{maskAccountNumber(payout.accountNumber)}</Text></View>
            <View style={styles.fact}><Text style={styles.factLabel}>Chủ tài khoản</Text><Text style={styles.factValue}>{payout.accountHolder}</Text></View>
          </View>
          <View style={styles.qrRow}>
            <View style={styles.qrThumb}>
              {stored !== null ? <AvatarImage uri={stored.uri} headers={stored.headers} resizeMode="contain" label="Mã QR nhận tiền" fallback={<Icon name="image" size={20} color={kitColors.dropMuted} />} /> : <Icon name="image" size={20} color={kitColors.dropMuted} />}
            </View>
            <Text style={styles.qrNote}>Mã QR do bạn cung cấp. Chỉ nhân viên xác minh xem được, dùng để đối chiếu tên và số tài khoản.</Text>
          </View>
          {payout.status === 'rejected' ? <Text style={styles.rejected}>Thông tin không khớp với mã QR. Hãy cập nhật lại tài khoản và QR.</Text> : null}
        </FadeIn>
        {error !== null ? <FadeIn><View accessibilityRole="alert" style={styles.problem}><Text style={styles.problemText}>{error}</Text></View></FadeIn> : null}
        <View style={actionRowStyles.actions}>
          <ActionButton disabled={busy} label="Cập nhật" accessibilityLabel="Cập nhật tài khoản nhận tiền" onPress={startEditing} />
        </View>
        <ConfirmMorph
          label="Xóa tài khoản nhận tiền"
          accessibilityLabel="Xóa tài khoản nhận tiền"
          prompt="Xóa tài khoản và mã QR đã lưu?"
          disabled={busy}
          onConfirm={remove}
        />
      </View>
    );
  }

  const qrShown = qr !== null ? { uri: qr.uri, headers: undefined } : payout !== null ? stored : null;

  return (
    <FadeIn style={styles.stack}>
      <View style={styles.form}>
        <View style={styles.fieldBlock}>
          <Label>Ngân hàng</Label>
          <Pressable accessibilityRole="button" accessibilityLabel={bank ? `Ngân hàng ${bank.name}. Đổi ngân hàng` : 'Chọn ngân hàng'} accessibilityState={{ expanded: pickerOpen }} disabled={busy} onPress={() => setPickerOpen(open => !open)} style={styles.select}>
            <Text style={[styles.selectText, !bank && styles.selectPlaceholder]}>{bank ? bank.name : 'Chọn ngân hàng nhận tiền'}</Text>
            <Icon name="chevron" size={16} color={kitColors.dropMuted} />
          </Pressable>
          <Presence visible={pickerOpen} style={styles.picker}>
              <TextInput accessibilityLabel="Tìm ngân hàng" placeholder="Tìm ngân hàng" placeholderTextColor={jobColors.placeholder} value={search} onChangeText={setSearch} style={styles.search} />
              <View style={styles.options}>
                {matches.length === 0 ? <Text style={styles.empty}>Không tìm thấy ngân hàng.</Text> : matches.map(item => (
                  <PressScale key={item.code} accessibilityRole="button" accessibilityLabel={item.name} accessibilityState={{ selected: item.code === fields.bankCode }} onPress={() => { setFields(current => ({ ...current, bankCode: item.code })); setPickerOpen(false); setSearch(''); }} style={[styles.option, item.code === fields.bankCode && styles.optionActive]}>
                    <Text style={[styles.optionText, item.code === fields.bankCode && styles.optionTextActive]}>{item.name}</Text>
                  </PressScale>
                ))}
              </View>
          </Presence>
        </View>
        <View style={styles.fieldBlock}>
          <Label>Số tài khoản</Label>
          <TextInput accessibilityLabel="Số tài khoản" placeholder="Nhập số tài khoản" placeholderTextColor={jobColors.placeholder} value={fields.accountNumber} onChangeText={value => setFields(current => ({ ...current, accountNumber: value.replace(/[^0-9 ]/g, '') }))} editable={!busy} keyboardType="number-pad" maxLength={24} style={styles.field} />
        </View>
        <View style={styles.fieldBlock}>
          <Label>Tên chủ tài khoản</Label>
          <TextInput accessibilityLabel="Tên chủ tài khoản" placeholder="NGUYEN VAN A" placeholderTextColor={jobColors.placeholder} value={fields.accountHolder} onChangeText={value => setFields(current => ({ ...current, accountHolder: value }))} onBlur={() => setFields(current => ({ ...current, accountHolder: normalizeAccountHolder(current.accountHolder) }))} editable={!busy} autoCapitalize="characters" maxLength={60} style={styles.field} />
          <Text style={styles.hint}>Viết hoa, không dấu, đúng như tên hiển thị trong ứng dụng ngân hàng.</Text>
        </View>
        <View style={styles.fieldBlock}>
          <Label>Mã QR nhận tiền của bạn</Label>
          {qrShown !== null && qrShown !== undefined ? (
            <View style={styles.qrPreviewCard}>
              <View style={styles.qrPreview}>
                {qr !== null ? <Image source={{ uri: qr.uri }} style={StyleSheet.absoluteFill} resizeMode="contain" accessibilityLabel="Mã QR đã chọn" /> : <AvatarImage uri={qrShown.uri} headers={qrShown.headers} resizeMode="contain" label="Mã QR hiện tại" fallback={<Icon name="image" size={24} color={kitColors.dropMuted} />} />}
              </View>
              <PressScale accessibilityRole="button" accessibilityLabel="Chọn lại ảnh mã QR" disabled={busy} onPress={() => void pickQr()} style={styles.swap}>
                <Text style={styles.swapText}>Chọn ảnh khác</Text>
              </PressScale>
            </View>
          ) : (
            <PressScale accessibilityRole="button" accessibilityLabel="Tải ảnh mã QR nhận tiền" disabled={busy} onPress={() => void pickQr()} style={styles.drop}>
              <Icon name="plus" size={kit.dropIcon} color={kitColors.dropText} strokeWidth={2} />
              <Text style={styles.dropLabel}>Tải ảnh mã QR</Text>
            </PressScale>
          )}
          <Text style={styles.hint}>Xuất mã QR nhận tiền từ ứng dụng ngân hàng của chính bạn. Tên và số tài khoản trong QR phải khớp với thông tin đã nhập, nếu không hồ sơ sẽ bị từ chối.</Text>
        </View>
        <PressScale accessibilityRole="checkbox" accessibilityState={{ checked: fields.confirmed }} disabled={busy} onPress={() => setFields(current => ({ ...current, confirmed: !current.confirmed }))} style={styles.confirm}>
          <View style={[styles.box, fields.confirmed && styles.boxOn]}>{fields.confirmed ? <Icon name="check" size={14} color="#FFFFFF" strokeWidth={2.6} /> : null}</View>
          <Text style={styles.confirmText}>Tôi xác nhận đây là tài khoản chính chủ của tôi và thông tin trên là đúng.</Text>
        </PressScale>
        {error !== null ? <FadeIn><View accessibilityRole="alert" style={styles.problem}><Text style={styles.problemText}>{error}</Text></View></FadeIn> : null}
        <View style={actionRowStyles.actions}>
          {payout !== null ? <ActionButton secondary disabled={busy} label="Hủy" accessibilityLabel="Hủy cập nhật tài khoản" onPress={cancel} /> : null}
          <ActionButton disabled={busy} label={busy ? 'Đang lưu…' : 'Lưu tài khoản'} accessibilityLabel="Lưu tài khoản nhận tiền" onPress={() => void save()} />
        </View>
      </View>
    </FadeIn>
  );
}

const styles = StyleSheet.create({
  stack: { gap: kit.cardGap },
  form: { gap: kit.sectionGap - 12 },
  fieldBlock: { gap: jobs.noticeGap },
  label: { color: supportColors.sectionTitle, fontSize: support.sectionTitleSize, fontWeight: support.sectionTitleWeight, marginLeft: support.sectionTitleInset },
  field: { ...webField, minHeight: jobs.fieldHeight, paddingHorizontal: jobs.fieldPaddingHorizontal, paddingVertical: jobs.composerPadding, borderRadius: jobs.fieldRadius, backgroundColor: jobColors.fieldFill, color: jobColors.fieldText, fontSize: jobs.fieldFontSize },
  hint: { color: horizonColors.muted, fontSize: kit.slotBodySize, lineHeight: kit.slotBodyLineHeight, marginLeft: support.sectionTitleInset },
  select: { minHeight: jobs.fieldHeight, paddingHorizontal: jobs.fieldPaddingHorizontal, borderRadius: jobs.fieldRadius, backgroundColor: jobColors.fieldFill, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  selectText: { color: jobColors.fieldText, fontSize: jobs.fieldFontSize },
  selectPlaceholder: { color: jobColors.placeholder },
  picker: { borderRadius: jobs.fieldRadius, backgroundColor: kitColors.cardFill, padding: 10, gap: 10 },
  search: { ...webField, minHeight: 42, paddingHorizontal: 14, borderRadius: 14, backgroundColor: kitColors.tileFill, color: jobColors.fieldText, fontSize: jobs.fieldFontSize },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: { minHeight: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: kitColors.tileFill, justifyContent: 'center' },
  optionActive: { backgroundColor: '#0B0F14' },
  optionText: { color: horizonColors.text, fontSize: 14, fontWeight: '500' },
  optionTextActive: { color: '#FFFFFF' },
  empty: { color: horizonColors.muted, fontSize: 14 },
  drop: { minHeight: kit.dropHeight + 24, borderRadius: kit.dropRadius, borderWidth: kit.dropBorder, borderStyle: 'dashed', borderColor: kitColors.dropBorder, backgroundColor: kitColors.dropFill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  dropLabel: { color: kitColors.dropText, fontSize: kit.dropLabelSize, fontWeight: '600' },
  qrPreviewCard: { borderRadius: kit.cardRadius, backgroundColor: kitColors.cardFill, padding: 12, gap: 12, alignItems: 'center' },
  qrPreview: { width: '100%', aspectRatio: 1, maxWidth: 240, borderRadius: 16, backgroundColor: '#FFFFFF', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  swap: { height: kit.pillHeight, borderRadius: kit.pillRadius, paddingHorizontal: kit.pillPaddingHorizontal, backgroundColor: kitColors.tileFill, justifyContent: 'center' },
  swapText: { color: horizonColors.text, fontSize: kit.pillSize, fontWeight: '600' },
  confirm: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 4 },
  box: { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, borderColor: kitColors.dropBorder, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  boxOn: { backgroundColor: '#0E9E8E', borderColor: '#0E9E8E' },
  confirmText: { flex: 1, minWidth: 0, color: horizonColors.text, fontSize: 14, lineHeight: 20 },
  problem: { padding: jobs.noticePadding, borderRadius: jobs.noticeRadius, backgroundColor: jobColors.waitingFill },
  problemText: { color: jobColors.waitingText, fontSize: jobs.noticeSize, lineHeight: jobs.noticeLineHeight },
  notice: { flexDirection: 'row', alignItems: 'center', gap: jobs.noticeGap, padding: jobs.noticePadding, borderRadius: jobs.noticeRadius, backgroundColor: jobColors.noticeFill },
  noticeText: { flex: 1, minWidth: 0, color: jobColors.noticeText, fontSize: jobs.noticeSize, lineHeight: jobs.noticeLineHeight },
  card: { borderRadius: kit.cardRadius, backgroundColor: kitColors.cardFill, padding: kit.cardPadding, gap: kit.innerGap + 4 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: kit.innerGap },
  bankTile: { width: kit.slotTile, height: kit.slotTile, borderRadius: kit.slotTileRadius, backgroundColor: kitColors.tileFill, alignItems: 'center', justifyContent: 'center' },
  cardCopy: { flex: 1, minWidth: 0, alignItems: 'flex-start', gap: 4 },
  bankName: { color: horizonColors.text, fontSize: kit.slotTitleSize, fontWeight: '600' },
  tag: { height: kit.tagHeight, borderRadius: kit.tagRadius, paddingHorizontal: kit.tagPaddingHorizontal, justifyContent: 'center' },
  tagText: { fontSize: kit.tagSize, fontWeight: '600' },
  facts: { gap: 10, padding: 12, borderRadius: 14, backgroundColor: kitColors.tileFill },
  fact: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  factLabel: { color: horizonColors.muted, fontSize: 13 },
  factValue: { color: horizonColors.text, fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'], flexShrink: 1, textAlign: 'right' },
  qrRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  qrThumb: { width: 56, height: 56, borderRadius: 12, backgroundColor: '#FFFFFF', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  qrNote: { flex: 1, minWidth: 0, color: horizonColors.muted, fontSize: 13, lineHeight: 18 },
  rejected: { color: kitColors.rejectedText, fontSize: 13, lineHeight: 18 },
});
