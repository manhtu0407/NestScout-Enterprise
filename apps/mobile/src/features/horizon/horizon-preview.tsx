import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';
import { KaelHomeScreen } from './kael-home-screen';
import type { ComposerImage } from './composer-media';
import { RequestsScreen } from './requests-screen';
import type { ServiceRequest } from './requests-screen';
import { Sidebar } from './sidebar';
import type { RecentSession } from './recent-session';
import { KaelHomeLoading } from './skeleton-layouts';

const sampleRequests: readonly ServiceRequest[] = [
  { id: 'req-1', title: 'Sửa vòi nước bồn rửa', icon: 'drop', meta: 'Quận 7 · Gửi hôm nay', status: 'Đang chờ báo giá', stage: 'waiting', quoteCount: 2 },
  { id: 'req-2', title: 'Lắp bóng đèn phòng khách', icon: 'bolt', meta: 'Quận 3 · Hôm qua', status: 'Chưa có thợ nhận', stage: 'waiting' },
  { id: 'req-3', title: 'Sơn lại tường phòng ngủ', icon: 'sofa', meta: 'Thủ Đức · Thứ Hai', status: 'Thợ Minh đang thực hiện', stage: 'active' },
  { id: 'req-4', title: 'Thay ổ khoá cửa chính', icon: 'wrench', meta: 'Quận 1 · Tuần trước', status: 'Hoàn tất', stage: 'done' },
];

const initialSessions:readonly RecentSession[] = [
  { id: 'sample-1', title: 'Vòi nước bếp bị rò rỉ', preview: 'Kael đã gợi ý 3 thợ gần bạn', timeLabel: 'Vừa xong', phase: 'working', pinned: false },
  { id: 'sample-2', title: 'Vệ sinh sofa 3 chỗ', preview: 'Báo giá dự kiến 450.000đ', timeLabel: '2 giờ', phase: 'completed', pinned: true },
  { id: 'sample-3', title: 'Máy lạnh không mát', preview: 'Bạn: Có thợ đến trong hôm nay không?', timeLabel: 'Hôm qua', phase: null, pinned: false },
];

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
  const [role, setRole] = useState<'guest' | 'client' | 'worker'>('guest');
  const [requestsOpen, setRequestsOpen] = useState(false);
  const [sessions, setSessions] = useState(initialSessions);
  const togglePin = (id: string) => setSessions(current => current.map(session => session.id === id ? { ...session, pinned: !session.pinned } : session));
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
      {requestsOpen
        ? <RequestsScreen requests={sampleRequests} onBack={() => setRequestsOpen(false)} />
        : <KaelHomeScreen input={input} onInput={value => { setInput(value); setComposerError(null); }} onSubmit={start} onMenu={() => setDrawer(true)} onNew={reset} messages={messages} composerError={composerError} onClearComposerError={() => setComposerError(null)} conversationKey={conversationKey} />}
    </View>
    <Sidebar badges={{ quotes: 2 }} recentLoading={recentLoading} recentSessions={sessions} activeSessionId="sample-1" onOpenSession={() => setDrawer(false)} onTogglePin={togglePin} onSessionMore={() => undefined} visible={drawer} onClose={() => setDrawer(false)} mode={role} modePending={false} modeNotice={null} onModeSelect={setRole} onModeCancel={() => undefined} onDismissModeNotice={() => undefined} onNavigate={id => { if (id === 'new' || id === 'home') { reset(); setRequestsOpen(false); } else if (id === 'requests') { setRequestsOpen(true); setDrawer(false); } else if (id === 'profile') { setDrawer(false); setComposerError('Tài khoản chưa được kết nối trong bản xem trước.'); } else { setInput(id); setDrawer(false); } }} />
  </SafeAreaView></SafeAreaProvider>;
}
