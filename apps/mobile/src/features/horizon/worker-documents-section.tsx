import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { acceptedImageTypes, Icon, PressScale, type WorkerDocumentKind } from '@/features/shared';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

import { ConfirmMorph } from './confirm-morph';
import { documentKindLabels, workerDocumentSlots, type WorkerCertificate, type WorkerDocument, type WorkerDocumentSlot, type WorkerProfileCommand } from './worker-profile';

const metrics = horizonLayout.profileKit;
const colors = horizonColors.profileKit;
const maxImageBytes = 5 * 1024 * 1024;

type Props = {
  documents: readonly WorkerDocument[];
  certificates: readonly WorkerCertificate[];
  busy: boolean;
  onError: (message: string | null) => void;
  run: (command: WorkerProfileCommand) => Promise<boolean>;
};

const statusStyles = {
  pending: { fill: colors.pendingFill, text: colors.pendingText },
  verified: { fill: colors.verifiedFill, text: colors.verifiedText },
  rejected: { fill: colors.rejectedFill, text: colors.rejectedText },
} as const;

function StatusTag({ status, label }: { status: WorkerDocument['status']; label: string }) {
  const tone = statusStyles[status];
  return (
    <View style={[styles.tag, { backgroundColor: tone.fill }]}>
      <Text style={[styles.tagText, { color: tone.text }]}>{label}</Text>
    </View>
  );
}

type FileRowProps = { title: string; status: WorkerDocument['status']; statusLabel: string; icon: 'image' | 'receipt'; busy: boolean; removeLabel: string; onRemove: () => Promise<void> };

function FileRow({ title, status, statusLabel, icon, busy, removeLabel, onRemove }: FileRowProps) {
  const [confirming, setConfirming] = useState(false);
  if (confirming) {
    return (
      <View style={styles.fileRow}>
        <View style={styles.fileCopy}>
          <ConfirmMorph
            defaultOpen
            label="Gỡ tệp"
            accessibilityLabel={removeLabel}
            prompt={`Gỡ "${title}"?`}
            confirmLabel="Gỡ"
            pendingLabel="Đang gỡ…"
            doneLabel="Đã gỡ"
            onConfirm={onRemove}
            onDismiss={() => setConfirming(false)}
          />
        </View>
      </View>
    );
  }
  return (
    <View style={styles.fileRow}>
      <Icon name={icon} size={metrics.fileIcon} color={colors.tileIcon} />
      <View style={styles.fileCopy}>
        <Text numberOfLines={1} style={styles.fileTitle}>{title}</Text>
        <StatusTag status={status} label={statusLabel} />
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={removeLabel} disabled={busy} hitSlop={8} onPress={() => setConfirming(true)} style={[styles.remove, busy && styles.disabled]}>
        <Icon name="close" size={metrics.removeIcon} color={colors.removeIcon} strokeWidth={2} />
      </Pressable>
    </View>
  );
}

function defaultTitle(kind: WorkerDocumentKind, existing: number, fileName: string | null | undefined): string {
  const name = fileName?.trim();
  if (name) return name.slice(0, 80);
  return `${documentKindLabels[kind]} ${existing + 1}`;
}

function Slot({ slot, documents, certificates, busy, uploading, onPick, onRemoveDocument, onRemoveCertificate }: {
  slot: WorkerDocumentSlot;
  documents: readonly WorkerDocument[];
  certificates: readonly WorkerCertificate[];
  busy: boolean;
  uploading: boolean;
  onPick: () => void;
  onRemoveDocument: (id: string) => Promise<void>;
  onRemoveCertificate: (id: string) => Promise<void>;
}) {
  const legacy = slot.kind === 'qualification' ? certificates : [];
  const count = documents.length + legacy.length;
  const full = count >= slot.limit;
  return (
    <View style={styles.slot}>
      <View style={styles.slotHead}>
        <View style={styles.tile}><Icon name={slot.icon} size={20} color={colors.tileIcon} /></View>
        <View style={styles.slotCopy}>
          <Text accessibilityRole="header" style={styles.slotTitle}>{slot.title}</Text>
          <View style={[styles.tag, { backgroundColor: slot.required ? colors.requiredFill : colors.optionalFill }]}>
            <Text style={[styles.tagText, { color: slot.required ? colors.required : colors.optional }]}>{slot.required ? 'Bắt buộc' : 'Tùy chọn'}</Text>
          </View>
        </View>
      </View>
      <Text style={styles.slotBody}>{slot.body}</Text>
      {count > 0 ? (
        <View style={styles.files}>
          {documents.map(item => (
            <FileRow key={item.id} title={item.title} status={item.status} statusLabel={item.statusLabel} icon="image" busy={busy} removeLabel={`Xóa ${item.title}`} onRemove={() => onRemoveDocument(item.id)} />
          ))}
          {legacy.map(item => (
            <FileRow key={item.id} title={item.title} status={item.status} statusLabel={item.statusLabel} icon="receipt" busy={busy} removeLabel={`Xóa chứng chỉ ${item.title}`} onRemove={() => onRemoveCertificate(item.id)} />
          ))}
        </View>
      ) : null}
      {full ? (
        <Text style={styles.limit}>Đã đủ {slot.limit} tệp. Xóa bớt để tải thêm.</Text>
      ) : (
        <PressScale
          accessibilityRole="button"
          accessibilityLabel={`${slot.action}. Đã có ${count} trên ${slot.limit}`}
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={onPick}
          style={[styles.drop, busy && styles.disabled]}
        >
          <Icon name={uploading ? 'clock' : 'plus'} size={metrics.dropIcon} color={colors.dropText} strokeWidth={2} />
          <Text style={styles.dropLabel}>{uploading ? 'Đang tải lên…' : slot.action}</Text>
          <Text style={styles.dropCount}>{count}/{slot.limit}</Text>
        </PressScale>
      )}
    </View>
  );
}

export function WorkerDocumentsSection({ documents, certificates, busy, onError, run }: Props) {
  const [uploading, setUploading] = useState<WorkerDocumentKind | null>(null);

  const pick = async (kind: WorkerDocumentKind) => {
    onError(null);
    let result: ImagePicker.ImagePickerResult;
    try {
      result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: false, quality: 0.8 });
    } catch {
      onError('Không mở được thư viện ảnh. Kiểm tra quyền truy cập ảnh rồi thử lại.');
      return;
    }
    const asset = result.canceled ? undefined : result.assets[0];
    if (asset === undefined) return;
    const mimeType = asset.mimeType ?? '';
    if (!acceptedImageTypes.includes(mimeType)) return onError('Chỉ nhận ảnh JPG, PNG hoặc WebP.');
    if (typeof asset.fileSize === 'number' && asset.fileSize > maxImageBytes) return onError('Ảnh quá lớn. Mỗi ảnh tối đa 5 MB.');
    const existing = documents.filter(item => item.kind === kind).length;
    setUploading(kind);
    try {
      await run({ type: 'addDocument', kind, file: { uri: asset.uri, mimeType }, title: defaultTitle(kind, existing, asset.fileName) });
    } finally {
      setUploading(null);
    }
  };

  const remove = async (command: WorkerProfileCommand) => {
    if (!(await run(command))) throw new Error('document remove failed');
  };

  return (
    <View style={styles.list}>
      {workerDocumentSlots.map(slot => (
        <Slot
          key={slot.kind}
          slot={slot}
          documents={documents.filter(item => item.kind === slot.kind)}
          certificates={certificates}
          busy={busy}
          uploading={uploading === slot.kind}
          onPick={() => void pick(slot.kind)}
          onRemoveDocument={id => remove({ type: 'removeDocument', id })}
          onRemoveCertificate={id => remove({ type: 'removeCertificate', id })}
        />
      ))}
    </View>
  );
}

function half(size: number): number {
  return size / 2;
}

const styles = StyleSheet.create({
  list: { gap: metrics.cardGap },
  slot: { borderRadius: metrics.cardRadius, backgroundColor: colors.cardFill, padding: metrics.cardPadding, gap: metrics.innerGap },
  slotHead: { flexDirection: 'row', alignItems: 'center', gap: metrics.innerGap },
  tile: { width: metrics.slotTile, height: metrics.slotTile, borderRadius: metrics.slotTileRadius, backgroundColor: colors.tileFill, alignItems: 'center', justifyContent: 'center' },
  slotCopy: { flex: 1, minWidth: 0, alignItems: 'flex-start', gap: horizonLayout.workerDocumentsSectionStyle.slotCopyGap },
  slotTitle: { color: horizonColors.text, fontSize: metrics.slotTitleSize, fontWeight: horizonLayout.workerDocumentsSectionStyle.slotTitleFontWeight },
  slotBody: { color: horizonColors.muted, fontSize: metrics.slotBodySize, lineHeight: metrics.slotBodyLineHeight },
  files: { borderRadius: horizonLayout.workerDocumentsSectionStyle.filesBorderRadius, backgroundColor: colors.tileFill, paddingHorizontal: horizonLayout.workerDocumentsSectionStyle.filesPaddingHorizontal },
  fileRow: { minHeight: metrics.fileRowHeight, flexDirection: 'row', alignItems: 'center', gap: horizonLayout.workerDocumentsSectionStyle.fileRowGap, paddingVertical: horizonLayout.workerDocumentsSectionStyle.fileRowPaddingVertical },
  fileCopy: { flex: 1, minWidth: 0, alignItems: 'flex-start', gap: horizonLayout.workerDocumentsSectionStyle.fileCopyGap },
  fileTitle: { color: horizonColors.text, fontSize: metrics.fileTitleSize, fontWeight: horizonLayout.workerDocumentsSectionStyle.fileTitleFontWeight },
  remove: { width: metrics.removeSize, height: metrics.removeSize, borderRadius: half(metrics.removeSize), backgroundColor: colors.removeFill, alignItems: 'center', justifyContent: 'center' },
  tag: { height: metrics.tagHeight, borderRadius: metrics.tagRadius, paddingHorizontal: metrics.tagPaddingHorizontal, justifyContent: 'center' },
  tagText: { fontSize: metrics.tagSize, fontWeight: horizonLayout.workerDocumentsSectionStyle.tagTextFontWeight },
  drop: { minHeight: metrics.dropHeight, borderRadius: metrics.dropRadius, borderWidth: metrics.dropBorder, borderStyle: 'dashed', borderColor: colors.dropBorder, backgroundColor: colors.dropFill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: horizonLayout.workerDocumentsSectionStyle.dropGap, paddingHorizontal: horizonLayout.workerDocumentsSectionStyle.dropPaddingHorizontal },
  dropLabel: { color: colors.dropText, fontSize: metrics.dropLabelSize, fontWeight: horizonLayout.workerDocumentsSectionStyle.dropLabelFontWeight },
  dropCount: { color: colors.dropMuted, fontSize: horizonLayout.workerDocumentsSectionStyle.dropCountFontSize, fontVariant: ['tabular-nums'] },
  limit: { color: colors.dropMuted, fontSize: horizonLayout.workerDocumentsSectionStyle.limitFontSize },
  disabled: { opacity: horizonLayout.workerDocumentsSectionStyle.disabledOpacity },
});
