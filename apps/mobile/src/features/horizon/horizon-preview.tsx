import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';
import { KaelHomeScreen } from './kael-home-screen';
import type { ComposerImage } from './composer-media';
import { Sidebar } from './sidebar';
import { KaelHomeLoading } from './skeleton-layouts';

function useSimulatedLoading(active: boolean) {
  const [previous, setPrevious] = useState(active);
  const [done, setDone] = useState(false);
  if (previous !== active) { setPrevious(active); setDone(false); }
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => setDone(true), horizonLayout.skeleton.previewDuration);
    return () => clearTimeout(timer);
  }, [active]);
  return active && !done;
}

export function HorizonPreview() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<{ id: string; role: 'user' | 'assistant'; text: string }[]>([]);
  const [drawer, setDrawer] = useState(false);
  const [worker, setWorker] = useState(false);
  const [conversationKey, setConversationKey] = useState(0);
  const [composerError, setComposerError] = useState<string | null>(null);
  const start = (images: readonly ComposerImage[]) => {
    setComposerError(images.length > 0
      ? 'Ảnh chưa được gửi vì chức năng phân tích ảnh chưa được kết nối.'
      : 'Kael chưa được kết nối. Tin nhắn của bạn chưa được gửi.');
  };
  const reset = () => { setMessages([]); setInput(''); setConversationKey(key => key + 1); setComposerError(null); setDrawer(false); };
  const homeLoading = useSimulatedLoading(true);
  const recentLoading = useSimulatedLoading(drawer);
  if (homeLoading) return <SafeAreaProvider><KaelHomeLoading label="Đang tải Kael"/></SafeAreaProvider>;
  return <SafeAreaProvider><SafeAreaView style={{ flex: 1, backgroundColor: horizonColors.bg }}>
    <View style={{ flex: 1 }}>
      <KaelHomeScreen input={input} onInput={value => { setInput(value); setComposerError(null); }} onSubmit={start} onMenu={() => setDrawer(true)} onNew={reset} messages={messages} composerError={composerError} onClearComposerError={() => setComposerError(null)} conversationKey={conversationKey} />
    </View>
    <Sidebar previewName="Nguyễn Minh" recentLoading={recentLoading} visible={drawer} onClose={() => setDrawer(false)} mode={worker ? 'worker' : 'client'} modePending={false} modeNotice={null} onModeSelect={mode => setWorker(mode === 'worker')} onModeCancel={() => undefined} onDismissModeNotice={() => undefined} onNavigate={id => { if (id === 'new' || id === 'home') reset(); else if (id === 'profile') { setDrawer(false); setComposerError('Tài khoản chưa được kết nối trong bản xem trước.'); } else { setInput(id); setDrawer(false); } }} />
  </SafeAreaView></SafeAreaProvider>;
}
