import { useEffect, useState, type ReactNode } from 'react';
import { Image, Platform, StyleSheet } from 'react-native';

type Headers = Readonly<Record<string, string>>;
type Resolved = { key: string; uri: string | null };
type Source = { uri: string; headers?: Record<string, string> };

function useImageSource(uri: string, headers: Headers | undefined): Source | null {
  const fetched = Platform.OS === 'web' && headers !== undefined;
  const [resolved, setResolved] = useState<Resolved | null>(null);

  useEffect(() => {
    if (!fetched) return undefined;
    const controller = new AbortController();
    let objectUrl: string | null = null;
    fetch(uri, { headers: { ...headers }, signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error('Avatar request failed');
        return response.blob();
      })
      .then(blob => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setResolved({ key: uri, uri: objectUrl });
      })
      .catch(() => {
        if (!controller.signal.aborted) setResolved({ key: uri, uri: null });
      });
    return () => {
      controller.abort();
      if (objectUrl !== null) URL.revokeObjectURL(objectUrl);
    };
  }, [fetched, uri, headers]);

  if (!fetched) return { uri, headers: headers ? { ...headers } : undefined };
  return resolved !== null && resolved.key === uri && resolved.uri !== null ? { uri: resolved.uri } : null;
}

type Props = { uri: string; headers?: Headers; fallback: ReactNode };

export function AvatarImage({ uri, headers, fallback }: Props) {
  const source = useImageSource(uri, headers);
  const [failedUri, setFailedUri] = useState<string | null>(null);
  if (source === null || failedUri === source.uri) return <>{fallback}</>;
  return <Image source={source} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityLabel="Ảnh đại diện" onError={() => setFailedUri(source.uri)} />;
}
