import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/features/shared';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

import { screenTitles } from './content';
import { RequestsScreen } from './requests-screen';

const metrics = horizonLayout.horizonEntry;

export function RequestsRoute() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      <RequestsScreen onBack={() => router.back()} />
    </SafeAreaView>
  );
}

export function SectionRoute() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const title = (id && screenTitles[id]) ?? '';
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
