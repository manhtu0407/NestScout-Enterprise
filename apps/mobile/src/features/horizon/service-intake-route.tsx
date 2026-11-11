import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useState, type ReactNode } from 'react';

import { useAccess } from '@/features/access';
import { loadPendingRequest } from '@/features/shared';
import { horizonColors } from '@/theme/palette';

import { useAskKael } from './horizon-sections';
import { handOffServiceEntry } from './kael-handoff';
import { serviceCategoryFor } from './service-catalog';
import { readIntakeDraft } from './service-intake-drafts';
import { ServiceIntakeScreen } from './service-intake-screen';
import { SupportEmpty, SupportShell } from './support-shell';

function Frame({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      {children}
    </SafeAreaView>
  );
}

type LegacyIntake = 'checking' | 'legacy' | 'none';

function useLegacyIntake(userId: string | null, categoryId: string | null): LegacyIntake {
  const [pending, setPending] = useState<{ userId: string; found: boolean } | null>(null);
  useEffect(() => {
    if (userId === null) return;
    let active = true;
    loadPendingRequest(userId).then(
      item => { if (active) setPending({ userId, found: item !== null }); },
      () => { if (active) setPending({ userId, found: true }); },
    );
    return () => { active = false; };
  }, [userId]);
  if (categoryId === null) return 'checking';
  if (userId === null) return 'none';
  if (Object.values(readIntakeDraft(userId, categoryId)).some(value => value.trim() !== '')) return 'legacy';
  if (pending === null || pending.userId !== userId) return 'checking';
  return pending.found ? 'legacy' : 'none';
}

export function ServiceIntakeRoute() {
  const router = useRouter();
  const access = useAccess();
  const askKael = useAskKael();
  const { category: id } = useLocalSearchParams<{ category?: string }>();
  const category = serviceCategoryFor(id);
  const back = () => router.back();
  const verifiedUserId = access.phase === 'client' && access.identity === 'verified' ? access.userId : null;
  const ready = category !== undefined && access.phase !== 'bootstrapping' && access.phase !== 'resolving' && access.phase !== 'worker';
  const legacy = useLegacyIntake(ready ? verifiedUserId : null, ready ? category.id : null);
  useEffect(() => {
    if (!ready || legacy !== 'none') return;
    handOffServiceEntry(category.id);
    router.dismissTo('/');
  }, [category, legacy, ready, router]);

  if (category === undefined) {
    return <Frame><SupportShell title="Dịch vụ" onBack={back}><SupportEmpty icon="grid" title="Không tìm thấy nhóm dịch vụ" body="Hãy quay lại và chọn một nhóm trong danh sách Dịch vụ." /></SupportShell></Frame>;
  }
  if (access.phase === 'bootstrapping' || access.phase === 'resolving') {
    return <Frame><SupportShell title={category.title} onBack={back}><SupportEmpty icon="clock" title="Đang kiểm tra tài khoản" body="Vui lòng đợi trong giây lát." /></SupportShell></Frame>;
  }
  if (access.phase === 'worker') {
    return <Frame><SupportShell title={category.title} onBack={back}><SupportEmpty icon="briefcase" title="Bạn đang ở vai trò Thợ" body="Chuyển sang vai trò Khách hàng trong menu để gửi yêu cầu dịch vụ." /></SupportShell></Frame>;
  }
  if (legacy !== 'legacy' || verifiedUserId === null) {
    return <Frame><SupportShell title={category.title} onBack={back}><SupportEmpty icon="clock" title="Đang mở Kael" body="Vui lòng đợi trong giây lát." /></SupportShell></Frame>;
  }
  return (
    <Frame>
      <ServiceIntakeScreen
        key={`${verifiedUserId}:${category.id}`}
        category={category}
        userId={verifiedUserId}
        onBack={back}
        onOpenRequests={requestId => router.push({ pathname: '/requests', params: requestId ? { focus: requestId } : {} })}
        onAskKael={prompt => askKael(prompt, { fresh: true })}
      />
    </Frame>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: horizonColors.bg },
});
