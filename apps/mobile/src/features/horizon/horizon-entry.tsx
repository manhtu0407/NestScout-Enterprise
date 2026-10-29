import { horizonLayout } from '@/theme/layout';
import React, { useCallback, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { EntryRedirect, useAccess } from '@/features/access';
import { Sidebar } from './sidebar';
import { Icon } from './icon';
import { IntroSequence } from './intro-sequence';
import { KaelHomeScreen } from './kael-home-screen';
import { Service } from './content';
import { horizonColors as colors } from '@/theme/palette';

type ChatMessage = { id: string; role: 'user' | 'assistant'; text: string };
type Screen = 'home' | 'placeholder';

export function HorizonEntry() {
  const router = useRouter();
  const access = useAccess();
  const { horizonScreen } = useLocalSearchParams<{ horizonScreen?: string }>();
  const [sequence, setSequence] = useState(true);
  const finishSequence = useCallback(() => setSequence(false), []);
  const screen: Screen = horizonScreen === 'placeholder' ? 'placeholder' : 'home';
  const setScreen = useCallback((next: Screen) => router.setParams({ horizonScreen: next }), [router]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [placeholder, setPlaceholder] = useState('');

  const newConversation = useCallback(() => {
    setMessages([]);
    setInput('');
    setDrawerOpen(false);
    setScreen('home');
  }, [setScreen]);

  const sendMessage = useCallback(() => {
    const text = input.trim();
    setInput('');
    setScreen('home');
    if (text.length === 0) return;
    setMessages(current => [
      ...current,
      { id: `${Date.now()}-user`, role: 'user', text },
      { id: `${Date.now()}-kael`, role: 'assistant', text: 'Mình đã nhận được yêu cầu. Đây là bản thử nghiệm UX; tính năng phân tích, báo giá và kết nối thợ sẽ được tích hợp khi có backend.' }
    ]);
  }, [input, setScreen]);

  const navigate = useCallback((id: string) => {
    setDrawerOpen(false);
    if (id === 'profile') {
      router.push(access.phase === 'worker' ? '/worker-home' : access.phase === 'client' ? '/client-home' : '/explore');
      return;
    }
    if (id === 'home' || id === 'new') {
      newConversation();
      return;
    }
    setPlaceholder(id === 'tasks' ? 'Công việc đang xử lý' : id === 'history' ? 'Lịch sử' : id === 'favorites' ? 'Yêu thích' : id === 'settings' ? 'Cài đặt' : id === 'search' ? 'Tìm kiếm' : id === 'help' ? 'Trợ giúp' : id === 'profile' ? 'Hồ sơ' : id);
    setScreen('placeholder');
  }, [access.phase, newConversation, router, setScreen]);

  const selectService = useCallback((service: Service) => {
    setInput(service.suggestedMessage);
    setMessages([]);
    setScreen('home');
  }, [setScreen]);

  const notify = useCallback((type: string) => {
    Alert.alert(type, 'Đây là prototype UX. Tính năng này chưa kết nối với thiết bị hoặc backend.');
  }, []);

  if (access.phase === 'bootstrapping' || access.phase === 'resolving') return <EntryRedirect />;

  return <>
    <StatusBar style="light"/>
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined} pointerEvents={sequence ? 'none' : 'auto'} accessibilityElementsHidden={sequence} importantForAccessibility={sequence ? 'no-hide-descendants' : 'auto'}>
        {screen === 'home' && <KaelHomeScreen input={input} onInput={setInput} onSubmit={sendMessage} onNew={newConversation} onMenu={() => setDrawerOpen(true)} onService={selectService} messages={messages} onAttach={() => notify('Đính kèm')} onVoice={() => notify('Giọng nói')}/>}
        {screen === 'placeholder' && <View style={styles.placeholder}>
          <Pressable style={styles.back} onPress={() => setScreen('home')} accessibilityLabel="Quay về"><Icon name="back" /></Pressable>
          <Text style={styles.placeholderTitle}>{placeholder}</Text>
          <Text style={styles.placeholderBody}>Cấu trúc điều hướng đã hoạt động. Nội dung của màn này sẽ được xây dựng trong giai đoạn triển khai sản phẩm.</Text>
        </View>}
      </KeyboardAvoidingView>
      {sequence && <IntroSequence onComplete={finishSequence} />}
    </SafeAreaView>
    <Sidebar visible={drawerOpen} onClose={() => setDrawerOpen(false)} onNavigate={navigate} workerMode={access.phase === 'worker'} onWorkerToggle={() => {
      if (access.phase === 'guest') { access.setIntent('worker'); router.push('/phone'); }
      else access.switchMode(access.phase === 'worker' ? 'client' : 'worker');
    }}/>
  </>;
}


export function HorizonRoute() {
  const access = useAccess();
  return <HorizonEntry key={access.userId ?? 'guest'} />;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  fill: { flex: 1 },
  placeholder: { flex: 1, padding: horizonLayout.horizonEntry.placeholderPadding },
  back: { height: horizonLayout.horizonEntry.backHeight, width: horizonLayout.horizonEntry.backWidth, justifyContent: 'center' },
  placeholderTitle: { fontSize: horizonLayout.horizonEntry.placeholderTitleFontSize, color: colors.white, fontWeight: horizonLayout.horizonEntry.placeholderTitleFontWeight, marginTop: horizonLayout.horizonEntry.placeholderTitleMarginTop },
  placeholderBody: { color: colors.muted, marginTop: horizonLayout.horizonEntry.placeholderBodyMarginTop, fontSize: horizonLayout.horizonEntry.placeholderBodyFontSize, lineHeight: horizonLayout.horizonEntry.placeholderBodyLineHeight }
});
