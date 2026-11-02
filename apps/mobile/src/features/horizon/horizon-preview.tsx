import { useEffect, useRef, useState } from 'react';
import { BackHandler, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';
import { KaelHomeScreen } from './kael-home-screen';
import { kaelIntroSession } from './kael-intro-session';
import type { ComposerImage } from './composer-media';
import { RequestsScreen } from './requests-screen';
import type { ServiceRequest } from './requests-screen';
import { Sidebar } from './sidebar';
import type { RecentSession } from './recent-session';
import { KaelHomeLoading } from './skeleton-layouts';
import { SignInPreview } from './sign-in-preview';
import { AccountScreen } from './account-screen';
import { HelpScreen } from './help-screen';
import { NotificationsScreen } from './notifications-screen';
import { SettingsScreen } from './settings-screen';
import { ProfileEditScreen } from './profile-edit-screen';
import { QuotesScreen } from './quotes-screen';
import { SavedWorkersScreen } from './saved-workers-screen';
import { sampleNotifications, sampleProfile, sampleQuotes, sampleSavedWorkers } from './content';
import { WorkerJobsScreen } from './worker-jobs-screen';
import { WorkerKaelScreen } from './worker-kael-screen';
import { WorkerProfileScreen } from './worker-profile-screen';
import { workerProfileTabForSidebarId, type WorkerProfileTab } from './worker-profile';
import { WorkerEarningsScreen, type EarningsMode } from './worker-earnings-screen';
import { sampleWorkerJobs, workerJobStageForSidebarId, type WorkerJobStage } from './worker-jobs';

type SupportScreenId = 'notifications' | 'help' | 'settings' | 'profile' | 'edit-profile' | 'quotes' | 'saved';

const sampleRequests: readonly ServiceRequest[] = [
  {
    id: 'req-1', title: 'Sửa vòi nước bồn rửa', icon: 'drop', meta: 'Quận 7 · Gửi hôm nay', status: 'Có báo giá chờ bạn quyết định', stage: 'waiting', quoteCount: 1,
    step: 2, nextAction: 'Xem phạm vi và giá, rồi chấp nhận hoặc từ chối trước khi báo giá hết hạn.',
    description: 'Vòi nước bồn rửa bếp bị rò ở chân vòi, nhỏ giọt cả ngày.', location: 'Quận 7, TP. Hồ Chí Minh', createdLabel: 'Hôm nay, 09:12', photoCount: 2,
  },
  {
    id: 'req-2', title: 'Lắp bóng đèn phòng khách', icon: 'bolt', meta: 'Quận 3 · Hôm qua', status: 'Có báo giá chờ bạn quyết định', stage: 'waiting', quoteCount: 1,
    step: 2, nextAction: 'Xem phạm vi và giá, rồi chấp nhận hoặc từ chối trước khi báo giá hết hạn.',
    description: 'Thay 3 bóng đèn âm trần phòng khách, trần cao khoảng 3 m.', location: 'Quận 3, TP. Hồ Chí Minh', createdLabel: 'Hôm qua, 18:40', photoCount: 0,
  },
  {
    id: 'req-3', title: 'Sơn lại tường phòng ngủ', icon: 'sofa', meta: 'Thủ Đức · Thứ Hai', status: 'Đã chấp nhận báo giá', stage: 'active',
    step: 3, nextAction: 'Chưa cần bạn làm gì. Chưa có thợ được giao, bước ghép thợ sẽ làm sau.',
    description: 'Sơn lại 4 bức tường phòng ngủ 14 m², tường có vài vết ẩm nhẹ.', location: 'Thủ Đức, TP. Hồ Chí Minh', createdLabel: 'Thứ Hai, 14:05', photoCount: 3,
  },
  {
    id: 'req-4', title: 'Thay ổ khoá cửa chính', icon: 'wrench', meta: 'Quận 1 · Tuần trước', status: 'Hoàn tất', stage: 'done',
    step: 6, nextAction: 'Việc đã hoàn tất và được nghiệm thu. Cần hỗ trợ thêm, hãy hỏi Kael.',
    description: 'Thay ổ khoá cửa chính, khoá cũ bị kẹt chìa.', location: 'Quận 1, TP. Hồ Chí Minh', createdLabel: 'Tuần trước, 10:20', photoCount: 1,
  },
];

const initialSessions:readonly RecentSession[] = [
  { id: 'sample-1', title: 'Vòi nước bếp bị rò rỉ', preview: 'Kael đã gợi ý 3 thợ gần bạn', timeLabel: 'Vừa xong', phase: 'working', pinned: false },
  { id: 'sample-2', title: 'Vệ sinh sofa 3 chỗ', preview: 'Báo giá dự kiến 450.000đ', timeLabel: '2 giờ', phase: 'completed', pinned: true },
  { id: 'sample-3', title: 'Máy lạnh không mát', preview: 'Bạn: Có thợ đến trong hôm nay không?', timeLabel: 'Hôm qua', phase: null, pinned: false },
];

type PreviewRole = 'guest' | 'client' | 'worker';

const roleStorageKey = 'nestscout.preview-role';

function readStoredRole(): PreviewRole {
  try {
    const stored = globalThis.sessionStorage?.getItem(roleStorageKey);
    return stored === 'client' || stored === 'worker' ? stored : 'guest';
  } catch {
    return 'guest';
  }
}

function writeStoredRole(role: PreviewRole) {
  try {
    globalThis.sessionStorage?.setItem(roleStorageKey, role);
  } catch {
    return;
  }
}

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
  const [role, setRole] = useState(readStoredRole);
  useEffect(() => { writeStoredRole(role); }, [role]);
  const [requestsOpen, setRequestsOpen] = useState(false);
  const [supportScreen, setSupportScreen] = useState<SupportScreenId | null>(null);
  const [editReturn, setEditReturn] = useState<SupportScreenId>('settings');
  const [quotesFromRequests, setQuotesFromRequests] = useState(false);
  const [jobsStage, setJobsStage] = useState<WorkerJobStage | null>(null);
  const [earningsMode, setEarningsMode] = useState<EarningsMode | null>(null);
  const [profileTab, setProfileTab] = useState<WorkerProfileTab | null>(null);
  const [workerKael, setWorkerKael] = useState(false);
  const backToSidebar = () => { setRequestsOpen(false); setSupportScreen(null); setJobsStage(null); setEarningsMode(null); setProfileTab(null); setWorkerKael(false); setDrawer(true); };
  const [profile, setProfile] = useState(sampleProfile);
  const editProfileFrom = (origin: SupportScreenId) => () => { setEditReturn(origin); setSupportScreen('edit-profile'); };
  const goBack = () => {
    if (supportScreen === 'edit-profile') setSupportScreen(editReturn);
    else if (supportScreen === 'quotes' && quotesFromRequests) { setQuotesFromRequests(false); setSupportScreen(null); setRequestsOpen(true); }
    else backToSidebar();
  };
  const goBackRef = useRef(goBack);
  useEffect(() => { goBackRef.current = goBack; });
  const screenOpen = requestsOpen || supportScreen !== null || jobsStage !== null || earningsMode !== null || profileTab !== null || workerKael;
  useEffect(() => {
    if (!screenOpen || Platform.OS === 'web') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { goBackRef.current(); return true; });
    return () => subscription.remove();
  }, [screenOpen]);
  const [signingInAs, setSigningInAs] = useState<'client' | 'worker' | null>(null);
  const [sessions, setSessions] = useState(initialSessions);
  const togglePin = (id: string) => setSessions(current => current.map(session => session.id === id ? { ...session, pinned: !session.pinned } : session));
  const [conversationKey, setConversationKey] = useState(0);
  const [composerError, setComposerError] = useState<string | null>(null);
  const start = (images: readonly ComposerImage[]) => {
    setComposerError(images.length > 0 ? 'Ảnh chưa được gửi vì chức năng phân tích ảnh chưa được kết nối.' : null);
  };
  const reset = () => { setMessages([]); setInput(''); setConversationKey(key => key + 1); setComposerError(null); setDrawer(false); };
  const homeLoading = useSimulatedLoading(true);
  const recentLoading = useSimulatedLoading(drawer);
  if (homeLoading) return <SafeAreaProvider><KaelHomeLoading label="Đang tải Kael"/></SafeAreaProvider>;
  return <SafeAreaProvider><SafeAreaView style={{ flex: 1, backgroundColor: horizonColors.bg }}>
    <View style={{ flex: 1 }}>
      <View style={screenOpen ? { display: 'none' } : { flex: 1 }}>
        <KaelHomeScreen input={input} onInput={value => { setInput(value); setComposerError(null); }} onSubmit={start} onMenu={() => setDrawer(true)} onNew={reset} messages={messages} composerError={composerError} onClearComposerError={() => setComposerError(null)} conversationKey={conversationKey} />
      </View>
      {requestsOpen && <RequestsScreen requests={sampleRequests} onBack={goBack} onViewQuotes={() => { setRequestsOpen(false); setQuotesFromRequests(true); setSupportScreen('quotes'); }} onAskKael={() => setRequestsOpen(false)} />}
      {jobsStage !== null && <WorkerJobsScreen key={jobsStage} initialStage={jobsStage} jobs={sampleWorkerJobs} onBack={goBack} onAskKael={() => setJobsStage(null)} />}
      {workerKael && <WorkerKaelScreen onBack={goBack} onAsk={prompt => { setInput(prompt); setComposerError(null); setWorkerKael(false); }} />}
      {profileTab !== null && <WorkerProfileScreen key={profileTab} initialTab={profileTab} name={profile.name} onBack={goBack} />}
      {earningsMode !== null && <WorkerEarningsScreen key={earningsMode} initialMode={earningsMode} onBack={goBack} />}
      {supportScreen === 'notifications' &&<NotificationsScreen items={sampleNotifications} onBack={goBack} />}
      {supportScreen === 'quotes' && <QuotesScreen items={sampleQuotes} onBack={goBack} onAskKael={() => setSupportScreen(null)} />}
      {supportScreen === 'saved' && <SavedWorkersScreen items={sampleSavedWorkers} onBack={goBack} onAskKael={() => setSupportScreen(null)} />}
      {supportScreen === 'help' && <HelpScreen onBack={goBack} onAskKael={() => setSupportScreen(null)} />}
      {supportScreen === 'settings' && <SettingsScreen onBack={goBack} profile={role === 'guest' ? undefined : profile} onEditProfile={editProfileFrom('settings')} />}
      {supportScreen === 'edit-profile' && <ProfileEditScreen profile={profile} onBack={goBack} onSave={setProfile} />}
      {supportScreen === 'profile' && <AccountScreen mode={role} profileName={role === 'guest' ? undefined : profile.name} avatarUri={role === 'guest' ? undefined : profile.avatarUri} phoneLabel={role === 'guest' ? undefined : profile.phone} onEditProfile={editProfileFrom('profile')} onBack={goBack} onSignIn={next => setSigningInAs(next)} onChangeMode={() => { setSupportScreen(null); setDrawer(true); }} onSignOut={() => { setSupportScreen(null); setRole('guest'); }} />}
    </View>
    <Sidebar profileName={role === 'guest' ? undefined : profile.name} profileAvatarUri={role === 'guest' ? undefined : profile.avatarUri} badges={{ quotes: 2 }} recentLoading={recentLoading} recentSessions={sessions} activeSessionId="sample-1" onOpenSession={() => setDrawer(false)} onTogglePin={togglePin} onSessionMore={() => undefined} visible={drawer} onClose={() => setDrawer(false)} mode={role} modePending={false} modeNotice={null} onModeSelect={next => { setDrawer(false); if (role === 'guest') setSigningInAs(next); else setRole(next); }} onModeCancel={() => undefined} onDismissModeNotice={() => undefined} onSelectService={prompt => { setInput(prompt); setComposerError(null); setDrawer(false); }} onNavigate={id => { if (id === 'new' || id === 'home') { reset(); setRequestsOpen(false); setSupportScreen(null); setJobsStage(null); setEarningsMode(null); setProfileTab(null); setWorkerKael(false); } else if (id === 'requests') { setRequestsOpen(true); setDrawer(false); } else if (id === 'notifications' || id === 'quotes' || id === 'saved' || id === 'help' || id === 'settings' || id === 'profile') { setQuotesFromRequests(false); setSupportScreen(id); setDrawer(false); } else if (workerJobStageForSidebarId(id) !== null) { setJobsStage(workerJobStageForSidebarId(id)); setDrawer(false); } else if (id === 'worker-earnings' || id === 'worker-payout') { setEarningsMode(id === 'worker-payout' ? 'payout' : 'overview'); setDrawer(false); } else if (workerProfileTabForSidebarId(id) !== null) { setProfileTab(workerProfileTabForSidebarId(id)); setDrawer(false); } else if (id === 'worker-kael') { setWorkerKael(true); setDrawer(false); } else if (id.startsWith('worker-')) { setDrawer(false); setComposerError('Tài khoản chưa được kết nối trong bản xem trước.'); } else { setInput(id); setDrawer(false); } }} />
  </SafeAreaView>
  {signingInAs && <View style={StyleSheet.absoluteFill}><SignInPreview initialRole={signingInAs} onClose={() => setSigningInAs(null)} onDone={next => { kaelIntroSession.markPlayed(); setRole(next); setSigningInAs(null); }} /></View>}
  </SafeAreaProvider>;
}
