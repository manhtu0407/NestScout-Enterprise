import { useMemo, useState, type ReactNode } from 'react';
import { Text } from 'react-native';

import { formatNational, toNationalDigits, useAccess } from '@/features/access';
import { PressScale, acceptedImageTypes, submitSupportRequest } from '@/features/shared';

import type { UserProfile } from './content';
import { HelpScreen } from './help-screen';
import { NotificationsScreen } from './notifications-screen';
import { ProfileEditScreen } from './profile-edit-screen';
import { QuotesScreen } from './quotes-screen';
import { toNotificationItems, toQuoteItems, toRequestViews, toSavedWorkers } from './request-views';
import { RequestsScreen } from './requests-screen';
import { SavedWorkersScreen } from './saved-workers-screen';
import { SettingsScreen, defaultSettings } from './settings-screen';
import { SupportEmpty, SupportShell, supportStyles } from './support-shell';
import { useCustomerData } from './use-customer-data';
import { workflowMessage } from './workflow-messages';

export const customerSectionIds = ['requests', 'quotes', 'saved', 'notifications', 'help', 'settings'] as const;

export type CustomerSectionId = (typeof customerSectionIds)[number];

export function isCustomerSection(id: string | undefined): id is CustomerSectionId {
  return customerSectionIds.some(section => section === id);
}

const titles: Record<CustomerSectionId, string> = {
  requests: 'Yêu cầu của tôi',
  quotes: 'Báo giá',
  saved: 'Thợ đã lưu',
  notifications: 'Thông báo',
  help: 'Trợ giúp',
  settings: 'Cài đặt',
};

type Props = { id: CustomerSectionId; focusId?: string; onBack: () => void; onNavigate: (id: CustomerSectionId, focusId?: string) => void };

function StateShell({ title, onBack, children }: { title: string; onBack: () => void; children: ReactNode }) {
  return <SupportShell title={title} onBack={onBack}>{children}</SupportShell>;
}

export function CustomerSection({ id, focusId, onBack, onNavigate }: Props) {
  const access = useAccess();
  const userId = access.identity === 'verified' ? access.userId : null;
  const customer = useCustomerData(userId);
  const [editing, setEditing] = useState(false);
  const [now] = useState(() => new Date());
  const { data } = customer;
  const title = titles[id];

  const profile: UserProfile = useMemo(() => ({
    name: data.profile?.display_name ?? '',
    phone: data.phone ? `+84 ${formatNational(toNationalDigits(data.phone))}` : '',
    email: data.profile?.email ?? '',
    address: data.profile?.address ?? '',
    avatarUri: data.avatar?.uri,
    avatarHeaders: data.avatar?.headers,
  }), [data.profile, data.phone, data.avatar]);

  if (id === 'help') {
    const submitSupport = userId === null ? undefined : (key: string, subject: string, body: string) => submitSupportRequest(userId, key, subject, body, new AbortController().signal).then(() => undefined);
    return <HelpScreen onBack={onBack} onSubmitSupport={submitSupport} />;
  }

  if (userId === null) {
    return <StateShell title={title} onBack={onBack}>
      <SupportEmpty icon="user" title="Cần đăng nhập" body="Đăng nhập bằng số điện thoại để xem mục này." />
    </StateShell>;
  }

  if (customer.status === 'error' && !customer.loaded) {
    return <StateShell title={title} onBack={onBack}>
      <SupportEmpty icon="clock" title="Không tải được dữ liệu" body="Kiểm tra kết nối rồi thử lại." />
      <PressScale accessibilityRole="button" accessibilityLabel="Tải lại" onPress={customer.refresh} style={supportStyles.primary}>
        <Text style={supportStyles.primaryLabel}>Tải lại</Text>
      </PressScale>
    </StateShell>;
  }

  if (!customer.loaded) {
    return <StateShell title={title} onBack={onBack}>
      <SupportEmpty icon="clock" title="Đang tải" body="Vui lòng chờ trong giây lát." />
    </StateShell>;
  }

  if (id === 'requests') {
    return <RequestsScreen
      requests={toRequestViews({ requests: data.requests, quotes: data.quotes, activity: data.activity, workers: data.jobWorkers, photos: data.photos }, now)}
      focusId={focusId}
      onBack={onBack}
      onViewQuotes={() => onNavigate('quotes')}
      onToggleSaveWorker={worker => customer.setWorkerSaved(worker.profileId, !worker.saved)}
      onReviewWorker={(worker, review) => customer.reviewJob(worker.jobId, review)}
    />;
  }

  if (id === 'quotes') {
    return <QuotesScreen
      items={toQuoteItems(data.requests, data.quotes, now)}
      onBack={onBack}
      onDecide={async (quote, decision) => {
        try {
          await customer.decideQuote({ id: quote.id, version: quote.version }, decision);
        } catch (error) {
          throw new Error(workflowMessage(error));
        }
      }}
    />;
  }

  if (id === 'saved') {
    return <SavedWorkersScreen
      items={toSavedWorkers(data.savedWorkers, now)}
      onBack={onBack}
      onRemove={worker => customer.removeSavedWorker(worker.id)}
    />;
  }

  if (id === 'notifications') {
    return <NotificationsScreen
      items={toNotificationItems(data.notifications, now)}
      onBack={onBack}
      onMarkRead={customer.markRead}
      onOpenRequest={requestId => onNavigate('requests', requestId)}
    />;
  }

  if (editing) {
    return <ProfileEditScreen
      profile={profile}
      onBack={() => setEditing(false)}
      onSave={async next => {
        await customer.saveProfile({ display_name: next.name, email: next.email, address: next.address });
        if (next.avatarUri === profile.avatarUri) return;
        if (!next.avatarUri) await customer.clearAvatar();
        else if (next.avatarMimeType && acceptedImageTypes.includes(next.avatarMimeType)) await customer.changeAvatar({ uri: next.avatarUri, mimeType: next.avatarMimeType });
        else throw new Error('Unsupported image type');
      }}
    />;
  }

  return <SettingsScreen
    onBack={onBack}
    profile={{ ...profile, name: profile.name || 'Tài khoản của bạn' }}
    onEditProfile={() => setEditing(true)}
    settings={data.settings ?? defaultSettings}
    onChangeSettings={customer.saveSettings}
  />;
}
