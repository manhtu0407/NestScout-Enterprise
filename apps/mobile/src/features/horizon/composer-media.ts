import * as ImagePicker from 'expo-image-picker';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

export type ComposerImage = { uri: string; mimeType?: string; fileSize?: number };
export const composerImageLimit = 5;

export function useComposerMedia(initialImages: readonly ComposerImage[] = [], onImagesChange?: (images: readonly ComposerImage[]) => void, externallyManaged = false) {
  const [images, setImages] = useState<ComposerImage[]>(() => [...initialImages]);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const active = useRef(true);
  const objectUrls = useRef(new Set<string>());

  useLayoutEffect(() => {
    active.current = true;
    const ownedUrls = objectUrls.current;
    return () => {
      active.current = false;
      if (Platform.OS === 'web') for (const uri of ownedUrls) URL.revokeObjectURL(uri);
      ownedUrls.clear();
    };
  }, []);

  const pick = useCallback(async () => {
    if (inFlight.current || images.length >= composerImageLimit) return;
    inFlight.current = true;
    setError(null);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'], allowsMultipleSelection: true,
        selectionLimit: composerImageLimit - images.length, quality: 1,
      });
      if (result.canceled) return;
      if (!active.current) {
        if (Platform.OS === 'web') for (const asset of result.assets) if (asset.uri.startsWith('blob:')) URL.revokeObjectURL(asset.uri);
        return;
      }
      const picked = result.assets.filter(asset => asset.uri && (!asset.type || asset.type === 'image'))
        .map(asset => ({ uri: asset.uri, mimeType: asset.mimeType, fileSize: asset.fileSize }));
      if (picked.length === 0) { setError('Không thể đọc ảnh đã chọn. Vui lòng thử lại.'); return; }
      const accepted = picked.slice(0, composerImageLimit - images.length);
      if (Platform.OS === 'web') {
        if (!externallyManaged) for (const item of accepted) if (item.uri.startsWith('blob:')) objectUrls.current.add(item.uri);
        for (const item of picked.slice(accepted.length)) if (item.uri.startsWith('blob:')) URL.revokeObjectURL(item.uri);
      }
      const next = [...images, ...accepted];
      setImages(next);
      onImagesChange?.(next);
    } catch {
      if (active.current) setError('Không thể mở thư viện ảnh. Vui lòng thử lại.');
    } finally {
      inFlight.current = false;
    }
  }, [images, onImagesChange, externallyManaged]);

  const remove = useCallback((index: number) => {
    const removed = images[index];
    if (removed && objectUrls.current.delete(removed.uri)) URL.revokeObjectURL(removed.uri);
    const next = images.filter((_, itemIndex) => itemIndex !== index);
    setImages(next);
    onImagesChange?.(next);
    setError(null);
  }, [images, onImagesChange]);
  return { images, error, pick, remove };
}
