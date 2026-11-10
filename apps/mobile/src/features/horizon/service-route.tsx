import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAccess } from '@/features/access';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

import { handOffToNewKaelSession } from './kael-handoff';
import { isServiceKey } from './service-catalog';
import { ServiceIntakeScreen } from './service-intake-screen';
import { ScreenHeader, supportStyles } from './support-shell';

const metrics = horizonLayout.supportScreens;

export const serviceGateCopy = {
  invalid: 'Không tìm thấy loại dịch vụ này.',
  guest: 'Đăng nhập bằng số điện thoại để gửi yêu cầu dịch vụ. Bạn vẫn có thể xem các nhóm dịch vụ trước.',
  worker: 'Gửi yêu cầu dịch vụ dành cho vai trò Khách hàng. Hãy đổi sang Khách hàng trong menu Đổi vai trò.',
  verifying: 'Cần xác minh tài khoản trước khi gửi yêu cầu. Vui lòng thử lại sau ít phút.',
} as const;

function Gate({ message, action, onAction, onBack }: { message: string; action?: string; onAction?: () => void; onBack: () => void }) {
  return <View style={styles.gate}>
    <ScreenHeader title="Dịch vụ" onBack={onBack}/>
    <Text accessibilityLiveRegion="polite" style={styles.message}>{message}</Text>
    {action !== undefined && onAction !== undefined && <Pressable accessibilityRole="button" accessibilityLabel={action} onPress={onAction} style={supportStyles.primary}><Text style={supportStyles.primaryLabel}>{action}</Text></Pressable>}
  </View>;
}

export function ServiceRoute() {
  const router = useRouter();
  const access = useAccess();
  const { key } = useLocalSearchParams<{ key?: string }>();
  const back = () => router.back();
  let body;
  if (!isServiceKey(key)) body = <Gate message={serviceGateCopy.invalid} onBack={back}/>;
  else if (access.phase === 'guest') {
    body = <Gate message={serviceGateCopy.guest} action="Đăng nhập" onBack={back} onAction={() => { access.setIntent('client'); router.push({ pathname: '/phone', params: { role: 'client' } }); }}/>;
  } else if (access.phase === 'worker') body = <Gate message={serviceGateCopy.worker} onBack={back}/>;
  else if (access.phase !== 'client' || access.identity !== 'verified' || access.userId === null) body = <Gate message={serviceGateCopy.verifying} onBack={back}/>;
  else {
    body = <ServiceIntakeScreen
      key={`${access.userId}:${key}`}
      userId={access.userId}
      serviceKey={key}
      kaelAvailable
      onBack={back}
      onOpenRequests={() => router.replace('/requests')}
      onAskKael={prompt => { handOffToNewKaelSession(prompt); router.dismissTo('/'); }}/>;
  }
  return <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
    <StatusBar style="dark"/>
    {body}
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: horizonColors.bg },
  gate: { flex: 1, paddingHorizontal: metrics.paddingHorizontal, gap: metrics.fieldGap },
  message: { color: horizonColors.text, fontSize: metrics.subtitleSize, lineHeight: metrics.subtitleLineHeight },
});
