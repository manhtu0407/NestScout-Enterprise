import { useMemo, useState, type ReactNode } from 'react';
import { Text } from 'react-native';

import { formatNational, toNationalDigits, useAccess } from '@/features/access';
import { PressScale, decideSubmission, setPreferredVisit, acceptedImageTypes, cancelAccountDeletion, exportPersonalData, readDeletionRequest, readReviewReactions, toggleReviewReaction, recordConsent, requestAccountDeletion, submitSupportRequest, type CustomerSettings, type ReviewReactionId } from '@/features/shared';

import type { UserProfile } from './content';
import { HelpScreen } from './help-screen';
import { jobChangesApiFor } from './job-changes-api';
import { legalDocument } from './legal-content';
import { useAiConsent } from './use-ai-consent';
import { NotificationsScreen } from './notifications-screen';
import { ProfileEditScreen } from './profile-edit-screen';
import { QuotesScreen } from './quotes-screen';
import { toNotificationItems, toQuoteItems, toRequestViews, toSavedWorkers } from './request-views';
import { RequestsScreen } from './requests-screen';
import { SavedWorkersScreen } from './saved-workers-screen';
import { SettingsScreen, defaultSettings } from './settings-screen';
import { SupportEmpty, SupportShell, supportStyles } from './support-shell';
import { useCustomerData } from './use-customer-data';
import { quotePrompt, requestPrompt, savedWorkerPrompt } from './kael-handoff';
import { retryMessage } from './dispatch-copy';
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

type Props = { id: CustomerSectionId; focusId?: string; onBack: () => void; onNavigate: (id: CustomerSectionId, focusId?: string) => void; onAskKael?: (prompt: string) => void };

function StateShell({ title, onBack, children }: { title: string; onBack: () => void; children: ReactNode }) {
  return <SupportShell title={title} onBack={onBack}>{children}</SupportShell>;
}

export function CustomerSection({ id, focusId, onBack, onNavigate, onAskKael }: Props) {
  const access = useAccess();
  const userId = access.identity === 'verified' ? access.userId : null;
  const customer = useCustomerData(userId);
  const reviewReactions = useMemo(() => userId === null ? undefined : {
    load: (reviewIds: readonly string[], signal: AbortSignal) => readReviewReactions(userId, reviewIds, signal),
    toggle: (reviewId: string, reaction: ReviewReactionId, signal: AbortSignal) => toggleReviewReaction(userId, reviewId, reaction, signal),
  }, [userId]);
  const [editing, setEditing] = useState(false);
  const aiConsent = useAiConsent(userId);
  const compliance = useMemo(() => userId === null ? null : {
    accountDeletion: {
      read: () => readDeletionRequest(userId, new AbortController().signal),
      request: () => requestAccountDeletion(userId, new AbortController().signal),
      cancel: () => cancelAccountDeletion(userId, new AbortController().signal),
    },
  }, [userId]);
  const dataExport = useMemo(() => userId === null ? undefined : () => exportPersonalData(userId, new AbortController().signal), [userId]);
  const jobChanges = useMemo(() => userId === null ? undefined : { userId, api: jobChangesApiFor(userId) }, [userId]);
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

  const currentSettings = data.settings ?? defaultSettings;
  const changeSettings = async (next: CustomerSettings) => {
    if (userId !== null && next.push !== currentSettings.push) {
      await recordConsent(userId, 'push_notifications', next.push, legalDocument('vi', 'privacy').versionId, new AbortController().signal);
    }
    await customer.saveSettings(next);
  };

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
      requests={toRequestViews({ requests: data.requests, quotes: data.quotes, activity: data.activity, workers: data.jobWorkers, photos: data.photos, dispatch: data.dispatch }, now)}
      focusId={focusId}
      jobChanges={jobChanges}
      onBack={onBack}
      onViewQuotes={() => onNavigate('quotes')}
      onAskKael={onAskKael ? request => onAskKael(requestPrompt(request)) : undefined}
      onSetPreferredVisit={async (request, at) => {
        try {
          await setPreferredVisit(userId, request.id, at, new AbortController().signal);
        } catch (error) {
          throw new Error(workflowMessage(error));
        }
        customer.refresh();
      }}
      onDecideSubmission={async (request, decision, reason) => {
        const pending = request.pendingSubmission;
        if (!pending) return;
        try {
          await decideSubmission(userId, pending.id, pending.jobVersion, decision, reason, new AbortController().signal);
        } catch (error) {
          throw new Error(workflowMessage(error));
        }
        customer.refresh();
      }}
      onToggleSaveWorker={worker => customer.setWorkerSaved(worker.profileId, !worker.saved)}
      onReviewWorker={(worker, review) => customer.reviewJob(worker.jobId, review)}
      onRetryDispatch={async request => {
        try {
          return retryMessage(await customer.retryDispatch(request.id));
        } catch (error) {
          throw new Error(workflowMessage(error));
        }
      }}
      onSetRequestService={async (request, serviceId) => {
        try {
          await customer.classifyRequest(request.id, serviceId);
        } catch (error) {
          throw new Error(workflowMessage(error));
        }
      }}
      onCancelRequest={async request => {
        try {
          await customer.cancelServiceRequest(request.id);
        } catch (error) {
          throw new Error(workflowMessage(error));
        }
      }}
    />;
  }

  if (id === 'quotes') {
    return <QuotesScreen
      items={toQuoteItems(data.requests, data.quotes, now)}
      onBack={onBack}
      onAskKael={onAskKael ? quote => onAskKael(quotePrompt(quote)) : undefined}
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
      onAskKael={onAskKael ? worker => onAskKael(savedWorkerPrompt(worker)) : undefined}
      onRemove={worker => customer.removeSavedWorker(worker.id)}
      reactions={reviewReactions}
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
    settings={currentSettings}
    onChangeSettings={changeSettings}
    onClearHistory={customer.clearChatHistory}
    accountDeletion={compliance?.accountDeletion}
    aiConsent={aiConsent}
    dataExport={dataExport}
  />;
}
