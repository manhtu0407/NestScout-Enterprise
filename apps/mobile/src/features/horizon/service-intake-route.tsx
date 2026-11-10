import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ReactNode } from 'react';

import { useAccess } from '@/features/access';
import { PressScale } from '@/features/shared';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

import { useAskKael } from './horizon-sections';
import { serviceCategoryFor } from './service-catalog';
import { ServiceIntakeScreen } from './service-intake-screen';
import { SupportEmpty, SupportShell, supportStyles } from './support-shell';

function Frame({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      {children}
    </SafeAreaView>
  );
}

export function ServiceIntakeRoute() {
  const router = useRouter();
  const access = useAccess();
  const askKael = useAskKael();
  const { category: id } = useLocalSearchParams<{ category?: string }>();
  const category = serviceCategoryFor(id);
  const back = () => router.back();

  if (category === undefined) {
    return <Frame><SupportShell title="Dịch vụ" onBack={back}><SupportEmpty icon="grid" title="Không tìm thấy nhóm dịch vụ" body="Hãy quay lại và chọn một nhóm trong danh sách Dịch vụ." /></SupportShell></Frame>;
  }
  if (access.phase === 'bootstrapping' || access.phase === 'resolving') {
    return <Frame><SupportShell title={category.title} onBack={back}><SupportEmpty icon="clock" title="Đang kiểm tra tài khoản" body="Vui lòng đợi trong giây lát." /></SupportShell></Frame>;
  }
  if (access.phase === 'worker') {
    return <Frame><SupportShell title={category.title} onBack={back}><SupportEmpty icon="briefcase" title="Bạn đang ở vai trò Thợ" body="Chuyển sang vai trò Khách hàng trong menu để gửi yêu cầu dịch vụ." /></SupportShell></Frame>;
  }
  if (access.phase !== 'client' || access.identity !== 'verified' || access.userId === null) {
    return (
      <Frame>
        <SupportShell title={category.title} onBack={back}>
          <SupportEmpty icon="login" title="Đăng nhập để gửi yêu cầu" body="Bạn cần đăng nhập bằng số điện thoại để gửi yêu cầu dịch vụ. Yêu cầu chưa được gửi." />
          <PressScale accessibilityRole="button" accessibilityLabel="Đăng nhập" onPress={() => { access.setIntent('client'); router.push({ pathname: '/phone', params: { role: 'client' } }); }} style={supportStyles.primary} wrapperStyle={styles.action}>
            <Text style={supportStyles.primaryLabel}>Đăng nhập</Text>
          </PressScale>
        </SupportShell>
      </Frame>
    );
  }
  return (
    <Frame>
      <ServiceIntakeScreen
        key={`${access.userId}:${category.id}`}
        category={category}
        userId={access.userId}
        onBack={back}
        onOpenRequests={requestId => router.push({ pathname: '/requests', params: requestId ? { focus: requestId } : {} })}
        onAskKael={prompt => askKael(prompt, { fresh: true })}
      />
    </Frame>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: horizonColors.bg },
  action: { marginTop: horizonLayout.supportScreens.sectionGap },
});
