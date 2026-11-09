import { useEffect, useState } from 'react';
import { Animated, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { FileCode, FileSpreadsheet, FileText, FileVideo, Image as ImageIcon, Presentation, X } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';
import { displayProgress, isLanded } from './use-upload-queue';
import type { AttachmentKind, UploadFile } from './use-upload-queue';

const metrics = horizonLayout.designKit;
const colors = horizonColors.designKit;

const kindIcons: Readonly<Record<AttachmentKind, LucideIcon>> = {
  image: ImageIcon,
  document: FileText,
  spreadsheet: FileSpreadsheet,
  presentation: Presentation,
  code: FileCode,
  video: FileVideo,
};

const ringBox = metrics.attachTile - metrics.attachRing;
const ringPerimeter = 2 * (ringBox + ringBox) - (4 + 4 - 2 * Math.PI) * metrics.attachRadius;
const imageTint = colors.avatars[1] ?? colors.neutralBg;

type TileProps = { file: UploadFile; onRemove: (id: string) => void };

export function AttachmentTile({ file, onRemove }: TileProps) {
  const landed = isLanded(file);
  const percent = Math.floor(displayProgress(file));
  const [entry] = useState(() => new Animated.Value(0));
  const [settle] = useState(() => new Animated.Value(landed ? metrics.hair : 0));
  useEffect(() => {
    Animated.timing(entry, { toValue: metrics.hair, duration: metrics.attachFade, useNativeDriver: true }).start();
  }, [entry]);
  useEffect(() => {
    Animated.timing(settle, { toValue: landed ? metrics.hair : 0, duration: metrics.attachFade, useNativeDriver: true }).start();
  }, [landed, settle]);
  const Glyph = kindIcons[file.kind];
  const scale = entry.interpolate({ inputRange: [0, metrics.hair], outputRange: [metrics.attachScaleFrom, metrics.hair] });
  const percentOpacity = settle.interpolate({ inputRange: [0, metrics.hair], outputRange: [metrics.hair, 0] });
  const isImage = file.kind === 'image';
  return <Animated.View accessibilityLabel={landed ? file.name : `${file.name}, đang tải ${percent}%`} style={[styles.tile, isImage && styles.tileImage, { opacity: entry, transform: [{ scale }] }]}>
    {file.uri === undefined ? <Glyph size={metrics.attachIcon} color={colors.muted} strokeWidth={1.6}/> : <Image source={{ uri: file.uri }} accessibilityLabel="Ảnh đã chọn" style={styles.thumb}/>}
    {!isImage && <Text numberOfLines={1} style={styles.name}>{file.name}</Text>}
    {!landed && <Svg style={styles.ring} width={metrics.attachTile} height={metrics.attachTile}>
      <Rect
        x={metrics.attachRing / 2}
        y={metrics.attachRing / 2}
        width={ringBox}
        height={ringBox}
        rx={metrics.attachRadius}
        fill="none"
        stroke={colors.accent}
        strokeWidth={metrics.attachRing}
        strokeLinecap="round"
        strokeDasharray={ringPerimeter}
        strokeDashoffset={ringPerimeter * (1 - percent / metrics.attachFull)}
      />
    </Svg>}
    <Animated.View pointerEvents="none" style={[styles.percent, { opacity: percentOpacity }]}>
      <Text style={styles.percentText}>{percent}%</Text>
    </Animated.View>
    <Animated.View style={[styles.dismissSlot, { opacity: settle }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={file.removeLabel ?? `Xóa ${file.name}`} disabled={!landed} hitSlop={metrics.rowGap} onPress={() => onRemove(file.id)} style={styles.dismiss}>
        <X size={metrics.attachDismissIcon} color={colors.solidFg} strokeWidth={3}/>
      </Pressable>
    </Animated.View>
  </Animated.View>;
}

type StripProps = { files: readonly UploadFile[]; onRemove: (id: string) => void };

export function AttachmentStrip({ files, onRemove }: StripProps) {
  if (files.length === 0) return null;
  return <View style={styles.strip}>
    {files.map(file => <AttachmentTile key={file.id} file={file} onRemove={onRemove}/>)}
  </View>;
}

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', flexWrap: 'wrap', gap: metrics.attachGap, padding: metrics.attachPad },
  tile: { width: metrics.attachTile, height: metrics.attachTile, borderRadius: metrics.attachRadius, alignItems: 'center', justifyContent: 'center', gap: metrics.quarter, backgroundColor: colors.neutralBg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  tileImage: { backgroundColor: imageTint },
  name: { maxWidth: metrics.fullSize, paddingHorizontal: metrics.attachNamePad, color: colors.muted, fontSize: metrics.attachName },
  thumb: { ...StyleSheet.absoluteFill, borderRadius: metrics.attachRadius },
  ring: { position: 'absolute', top: 0, left: 0 },
  percent: { position: 'absolute', top: metrics.attachCorner, right: metrics.attachCorner },
  percentText: { color: colors.accent, fontSize: metrics.attachPct, fontWeight: metrics.titleWeight },
  dismissSlot: { position: 'absolute', top: metrics.attachCorner, right: metrics.attachCorner },
  dismiss: { width: metrics.attachDismiss, height: metrics.attachDismiss, borderRadius: metrics.pillRadius, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.solidBg },
});
