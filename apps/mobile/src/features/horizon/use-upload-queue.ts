import { useCallback, useEffect, useRef, useState } from 'react';
import { horizonLayout } from '@/theme/layout';

const metrics = horizonLayout.designKit;

export type AttachmentKind = 'image' | 'document' | 'spreadsheet' | 'presentation' | 'code' | 'video';

export type UploadFile = Readonly<{ id: string; name: string; kind: AttachmentKind; progress: number | undefined; uri?: string; removeLabel?: string }>;

export type PickedFile = Readonly<{ name: string; kind: AttachmentKind }>;

const gapProgress = (metrics.attachFull * metrics.uploadGap) / metrics.uploadDuration;
const stepProgress = (metrics.attachFull * metrics.uploadTick) / metrics.uploadDuration;

export function isLanded(file: UploadFile): boolean {
  return file.progress === undefined || file.progress >= metrics.attachFull;
}

export function displayProgress(file: UploadFile): number {
  return Math.min(metrics.attachFull, file.progress ?? metrics.attachFull);
}

export function visibleFiles(files: readonly UploadFile[]): readonly UploadFile[] {
  const active = files.findIndex(file => file.progress !== undefined);
  return files.filter((file, index) => file.progress === undefined || index === active);
}

export function advance(files: readonly UploadFile[]): readonly UploadFile[] {
  const active = files.findIndex(file => file.progress !== undefined);
  if (active < 0) return files;
  return files.map((file, index) => {
    if (index !== active || file.progress === undefined) return file;
    const next = file.progress + stepProgress;
    return { ...file, progress: next >= metrics.attachFull + gapProgress ? undefined : next };
  });
}

export function useUploadQueue() {
  const [files, setFiles] = useState<readonly UploadFile[]>([]);
  const counter = useRef(0);
  const waiting = files.some(file => file.progress !== undefined);
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => setFiles(advance), metrics.uploadTick);
    return () => clearInterval(timer);
  }, [waiting]);
  const add = useCallback((picked: readonly PickedFile[]) => {
    setFiles(current => [...current, ...picked.map(file => {
      counter.current += 1;
      return { id: `upload${counter.current}`, name: file.name, kind: file.kind, progress: 0 };
    })]);
  }, []);
  const remove = useCallback((id: string) => setFiles(current => current.filter(file => file.id !== id)), []);
  const clear = useCallback(() => setFiles([]), []);
  return { files, visible: visibleFiles(files), add, remove, clear };
}
