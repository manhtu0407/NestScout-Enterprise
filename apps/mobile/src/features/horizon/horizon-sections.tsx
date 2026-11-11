import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/features/shared';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

import { AccountSection } from './account-section';
import { screenTitles } from './content';
import { CustomerSection, isCustomerSection, type CustomerSectionId } from './customer-sections';
import { WorkerSection, isWorkerSection } from './worker-sections';
import { handOffToKael } from './kael-handoff';

export function useAskKael(): (prompt: string, options?: { fresh?: boolean }) => void {
  const router = useRouter();
  return (prompt, options) => {
    handOffToKael(prompt, options);
    router.dismissTo('/');
  };
}

const metrics = horizonLayout.horizonEntry;

function useCustomerNavigation() {
  const router = useRouter();
  return (id: CustomerSectionId, focusId?: string) => {
    if (id === 'requests') router.push({ pathname: '/requests', params: focusId ? { focus: focusId } : {} });
    else router.push({ pathname: '/section', params: { id } });
  };
}

export function RequestsRoute() {
  const router = useRouter();
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  const navigate = useCustomerNavigation();
  const askKael = useAskKael();
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      <CustomerSection id="requests" focusId={focus} onBack={() => router.back()} onNavigate={navigate} onAskKael={askKael} />
    </SafeAreaView>
  );
}

export function SectionRoute() {
  const router = useRouter();
  const navigate = useCustomerNavigation();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const askKael = useAskKael();
  const title = (id && screenTitles[id]) ?? '';
  if (id === 'profile') {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <StatusBar style="dark" />
        <AccountSection onBack={() => router.back()} />
      </SafeAreaView>
    );
  }
  if (isCustomerSection(id)) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <StatusBar style="dark" />
        <CustomerSection id={id} onBack={() => router.back()} onNavigate={navigate} onAskKael={askKael} />
      </SafeAreaView>
    );
  }
  if (isWorkerSection(id)) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <StatusBar style="dark" />
        <WorkerSection id={id} onBack={() => router.back()} onAskKael={askKael} onNavigate={target => router.push({ pathname: '/section', params: { id: target } })} />
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      <View style={styles.placeholder}>
        <Pressable style={styles.back} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Quay về">
          <Icon name="back" />
        </Pressable>
        <Text accessibilityRole="header" style={styles.title}>{title}</Text>
        <Text style={styles.body}>Cấu trúc điều hướng đã hoạt động. Nội dung của màn này sẽ được xây dựng trong giai đoạn triển khai sản phẩm.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: horizonColors.bg },
  placeholder: { flex: 1, padding: metrics.placeholderPadding },
  back: { height: metrics.backHeight, width: metrics.backWidth, justifyContent: 'center' },
  title: { fontSize: metrics.placeholderTitleFontSize, color: horizonColors.label, fontWeight: metrics.placeholderTitleFontWeight, marginTop: metrics.placeholderTitleMarginTop },
  body: { color: horizonColors.muted, marginTop: metrics.placeholderBodyMarginTop, fontSize: metrics.placeholderBodyFontSize, lineHeight: metrics.placeholderBodyLineHeight },
});
