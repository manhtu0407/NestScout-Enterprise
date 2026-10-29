import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { horizonColors } from '@/theme/palette';
import { horizonLayout } from '@/theme/layout';
import { IntroSequence } from './intro-sequence';
import { KaelHomeScreen } from './kael-home-screen';
import { Sidebar } from './sidebar';
import { TransitionScreen } from './transition-screen';
import { WelcomeScreen } from './welcome-screen';

type PreviewScreen = 'sequence' | 'welcome' | 'transition' | 'home';
export function HorizonPreview() {
  const [screen, setScreen] = useState<PreviewScreen>('sequence');
  const [replay, setReplay] = useState(0);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<{ id: string; role: 'user' | 'assistant'; text: string }[]>([]);
  const [drawer, setDrawer] = useState(false);
  const [worker, setWorker] = useState(false);
  const finishSequence = useCallback(() => setScreen('home'), []);
  const start = () => {
    if (input.trim()) setMessages([{ id: 'preview-message', role: 'user', text: input.trim() }]);
    setInput('');
    setScreen('home');
  };
  const reset = () => { setMessages([]); setInput(''); setDrawer(false); setScreen('home'); };
  return <SafeAreaProvider><SafeAreaView style={{ flex: 1, backgroundColor: horizonColors.bg }}>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: horizonLayout.preview.controlGap, paddingVertical: horizonLayout.preview.controlPadding }}>
      {(['sequence', 'welcome', 'transition', 'home'] as const).map(item => <Pressable key={item} accessibilityRole="button" onPress={() => { if (item === 'sequence') setReplay(value => value + 1); setScreen(item); }}><Text style={{ color: horizonColors.white }}>{item === 'sequence' ? 'Replay flow' : item === 'welcome' ? 'Welcome' : item === 'transition' ? 'Transition' : 'Kael Home'}</Text></Pressable>)}
    </View>
    <View style={{ flex: 1 }}>
      {screen === 'welcome' && <WelcomeScreen />}
      {screen === 'transition' && <TransitionScreen />}
      {(screen === 'home' || screen === 'sequence') && <View style={{ flex: 1 }} pointerEvents={screen === 'sequence' ? 'none' : 'auto'} accessibilityElementsHidden={screen === 'sequence'} importantForAccessibility={screen === 'sequence' ? 'no-hide-descendants' : 'auto'}><KaelHomeScreen input={input} onInput={setInput} onSubmit={start} onMenu={() => setDrawer(true)} onNew={reset} onService={service => setInput(service.suggestedMessage)} messages={messages} onAttach={() => setInput('Đính kèm')} onVoice={() => setInput('Giọng nói')} /></View>}
      {screen === 'sequence' && <IntroSequence key={replay} onComplete={finishSequence} />}
    </View>
    <Sidebar visible={drawer} onClose={() => setDrawer(false)} workerMode={worker} onWorkerToggle={() => setWorker(value => !value)} onNavigate={id => { if (id === 'new' || id === 'home') reset(); else { setInput(id); setDrawer(false); } }} />
  </SafeAreaView></SafeAreaProvider>;
}
