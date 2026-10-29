import { horizonLayout } from '@/theme/layout';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { ChatComposer } from './chat-composer';
import { Icon } from './icon';
import { KaelOrb } from './kael-orb';
import { services, Service } from './content';
import { horizonColors, horizonColors as colors } from '@/theme/palette';

type Props = {
  input: string;
  onInput: (value: string) => void;
  onSubmit: () => void;
  onMenu: () => void;
  onNew: () => void;
  onService: (service: Service) => void;
  messages: { id: string; role: 'user' | 'assistant'; text: string }[];
  onAttach: () => void;
  onVoice: () => void;
};

export function KaelHomeScreen({ input, onInput, onSubmit, onMenu, onNew, onService, messages, onAttach, onVoice }: Props) {
  const { height } = useWindowDimensions();
  const compact = height < horizonLayout.kaelHomeScreen.compactHeight;
  return <View style={styles.root}>
    <View style={styles.nav}>
      <Pressable accessibilityLabel="Mở thanh bên" onPress={onMenu} style={styles.round}><Icon name="menu" size={20}/></Pressable>
      <Text style={styles.navTitle}>NestScout <Text style={styles.navMint}>Horizon</Text></Text>
      <Pressable accessibilityLabel="Trò chuyện mới" onPress={onNew} style={styles.round}><Icon name="plus" size={21}/></Pressable>
    </View>
    {messages.length === 0 ? <>
      <View style={[styles.hero, compact && styles.compactHero]}>
        <View style={[styles.orbStage, compact && styles.compactOrbStage]}><View style={[styles.orbit, compact && styles.compactOrbit]}/><KaelOrb size={compact ? horizonLayout.kaelHomeScreen.compactOrbSize : 194} /></View>
        <Text style={styles.headline}>Kael có thể giúp gì{'\n'}cho nhà cậu?</Text>
        <Text style={styles.heroSubtitle}>Hỏi bất cứ điều gì về ngôi nhà của bạn.</Text>
      </View>
      <View style={styles.services}>
        {services.map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={item.title} onPress={() => onService(item)} style={styles.serviceCard}>
          <View style={styles.iconBox}><Icon name={item.icon} size={21} color={colors.white}/></View>
          <View style={styles.serviceText}><Text style={styles.serviceTitle}>{item.title}</Text></View>
          <Icon name="chevron" size={20} color={horizonColors.kaelHomeScreen.iconColor}/>
        </Pressable>)}
      </View>
    </> : <ScrollView style={styles.chat} contentContainerStyle={styles.chatContent} keyboardShouldPersistTaps="handled">
      {messages.map(m => <View key={m.id} style={[styles.bubble, m.role === 'user' ? styles.userBubble : styles.assistantBubble]}>
        {m.role === 'assistant' && <KaelOrb compact size={36}/>}
        <Text style={styles.bubbleText}>{m.text}</Text>
      </View>)}
    </ScrollView>}
    <View style={styles.footer}><ChatComposer value={input} onChange={onInput} onSubmit={onSubmit} onAttach={onAttach} onVoice={onVoice}/></View>
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: horizonLayout.kaelHomeScreen.rootPaddingHorizontal },
  nav: { height: horizonLayout.kaelHomeScreen.navHeight, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navTitle: { color: colors.text, fontSize: horizonLayout.kaelHomeScreen.navTitleFontSize, fontWeight: horizonLayout.kaelHomeScreen.navTitleFontWeight, letterSpacing: horizonLayout.kaelHomeScreen.navTitleLetterSpacing },
  navMint: { color: horizonColors.kaelHomeScreen.navMintColor },
  round: { width: horizonLayout.kaelHomeScreen.roundWidth, height: horizonLayout.kaelHomeScreen.roundHeight, alignItems: 'center', justifyContent: 'center', backgroundColor: horizonColors.kaelHomeScreen.roundBackgroundColor, borderRadius: horizonLayout.kaelHomeScreen.roundBorderRadius, borderWidth: horizonLayout.kaelHomeScreen.roundBorderWidth, borderColor: colors.border },
  hero: { flex: 1, minHeight: horizonLayout.kaelHomeScreen.heroMinHeight, justifyContent: 'center', alignItems: 'center', paddingBottom: horizonLayout.kaelHomeScreen.heroPaddingBottom },
  compactHero: { minHeight: horizonLayout.kaelHomeScreen.compactHeroMinHeight },
  compactOrbStage: { height: horizonLayout.kaelHomeScreen.compactOrbStageHeight, width: horizonLayout.kaelHomeScreen.compactOrbStageWidth },
  compactOrbit: { width: horizonLayout.kaelHomeScreen.compactOrbitWidth, height: horizonLayout.kaelHomeScreen.compactOrbitHeight },
  orbStage: { height: horizonLayout.kaelHomeScreen.orbStageHeight, width: horizonLayout.kaelHomeScreen.orbStageWidth, alignItems: 'center', justifyContent: 'center' },
  orbit: { position: 'absolute', width: horizonLayout.kaelHomeScreen.orbitWidth, height: horizonLayout.kaelHomeScreen.orbitHeight, borderRadius: horizonLayout.kaelHomeScreen.orbitRadius, borderWidth: horizonLayout.kaelHomeScreen.orbitBorderWidth, borderColor: horizonColors.kaelHomeScreen.orbitBorderColor, transform: [{ rotate: horizonLayout.kaelHomeScreen.orbitRotation }] },
  heroSubtitle: { color: horizonColors.kaelHomeScreen.heroSubtitleColor, fontSize: horizonLayout.kaelHomeScreen.heroSubtitleSize, marginTop: horizonLayout.kaelHomeScreen.heroSubtitleGap, textAlign: 'center' },
  headline: { color: colors.text, fontSize: horizonLayout.kaelHomeScreen.headlineFontSize, lineHeight: horizonLayout.kaelHomeScreen.headlineLineHeight, textAlign: 'center', fontWeight: horizonLayout.kaelHomeScreen.headlineFontWeight, letterSpacing: horizonLayout.kaelHomeScreen.headlineLetterSpacing, marginTop: horizonLayout.kaelHomeScreen.headlineMarginTop },
  services: { gap: horizonLayout.kaelHomeScreen.servicesGap, paddingBottom: horizonLayout.kaelHomeScreen.servicesPaddingBottom },
  serviceCard: { minHeight: horizonLayout.kaelHomeScreen.serviceCardMinHeight, backgroundColor: colors.bgCard, borderRadius: horizonLayout.kaelHomeScreen.serviceCardBorderRadius, paddingHorizontal: horizonLayout.kaelHomeScreen.serviceCardPaddingHorizontal, flexDirection: 'row', alignItems: 'center', borderWidth: horizonLayout.kaelHomeScreen.serviceCardBorderWidth, borderColor: colors.border },
  iconBox: { width: horizonLayout.kaelHomeScreen.iconBoxWidth, height: horizonLayout.kaelHomeScreen.iconBoxHeight, backgroundColor: horizonColors.kaelHomeScreen.iconBoxBackgroundColor, borderRadius: horizonLayout.kaelHomeScreen.iconBoxBorderRadius, alignItems: 'center', justifyContent: 'center', marginRight: horizonLayout.kaelHomeScreen.iconBoxMarginRight },
  serviceText: { flex: 1 },
  serviceTitle: { color: colors.text, fontSize: horizonLayout.kaelHomeScreen.serviceTitleFontSize, fontWeight: horizonLayout.kaelHomeScreen.serviceTitleFontWeight },
  footer: { paddingBottom: horizonLayout.kaelHomeScreen.footerPaddingBottom },
  chat: { flex: 1 },
  chatContent: { paddingTop: horizonLayout.kaelHomeScreen.chatContentPaddingTop, gap: horizonLayout.kaelHomeScreen.chatContentGap, paddingBottom: horizonLayout.kaelHomeScreen.chatContentPaddingBottom },
  bubble: { maxWidth: horizonLayout.kaelHomeScreen.bubbleMaxWidth, borderRadius: horizonLayout.kaelHomeScreen.bubbleBorderRadius, padding: horizonLayout.kaelHomeScreen.bubblePadding, flexDirection: 'row', gap: horizonLayout.kaelHomeScreen.bubbleGap, alignItems: 'flex-start' },
  userBubble: { alignSelf: 'flex-end', backgroundColor: horizonColors.kaelHomeScreen.userBubbleBackgroundColor },
  assistantBubble: { alignSelf: 'flex-start', backgroundColor: horizonColors.kaelHomeScreen.assistantBubbleBackgroundColor },
  bubbleText: { color: colors.text, fontSize: horizonLayout.kaelHomeScreen.bubbleTextFontSize, lineHeight: horizonLayout.kaelHomeScreen.bubbleTextLineHeight, flexShrink: 1 }
});
