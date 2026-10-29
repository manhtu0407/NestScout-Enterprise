import { useColorScheme } from 'react-native';

export type Palette = Readonly<{
  background: string;
  surface: string;
  text: string;
  mutedText: string;
  border: string;
  accent: string;
  onAccent: string;
  danger: string;
  success: string;
  warning: string;
  shadow: string;
  brandPrimary: string;
  brandSecondary: string;
}>;

const light: Palette = {
  background: '#f5fbf9', surface: '#ffffff', text: '#253436', mutedText: '#465e5d',
  border: '#687d7a', accent: '#145c57', onAccent: '#ffffff', danger: '#b00020',
  success: '#176b43', warning: '#795200', shadow: '#000000', brandPrimary: '#a5e6d8', brandSecondary: '#8fe3d4',
};

const dark: Palette = {
  background: '#071a1a', surface: '#172d2c', text: '#f1f8f6', mutedText: '#b2c7c3',
  border: '#819994', accent: '#a5e6d8', onAccent: '#253436', danger: '#ff8f96',
  success: '#8bd7aa', warning: '#f2c86b', shadow: '#000000', brandPrimary: '#a5e6d8', brandSecondary: '#8fe3d4',
};

export function paletteForAppearance(appearance: 'light' | 'dark' | null | undefined): Palette {
  return appearance === 'dark' ? dark : light;
}

export function usePalette(): Palette {
  return paletteForAppearance(useColorScheme());
}

export const horizonColors = {
  welcomeIntro: { root: '#071625', sky: '#0B1C31', star: '#CBEEFF', veil: 'rgba(10,25,42,0.48)', accent: '#87DFE2', slogan: '#D8E7F5' },
  transition: { root: '#08182B', veil: 'rgba(4,14,32,0.32)', star: '#B0EFFF', starShadow: '#8BF1FF', glow: 'rgba(50,158,243,0.12)', glowShadow: '#59E5FF', orbit: 'rgba(119,223,252,0.54)', orbitSecond: 'rgba(181,171,250,0.43)', title: '#F5FBFF', subtitle: '#BCD0E2' },
    chatComposer: {
      iconColor: "#071C21",
      rowBackgroundColor: '#242932',
      rowShadowColor: '#000',
      addBackgroundColor: '#303640',
    },
    kaelHomeScreen: {
      orbitBorderColor: 'rgba(110,222,251,0.45)',
      heroSubtitleColor: '#A7B4C2',
      iconColor: "#DCE4EB",
      navMintColor: '#A2EEE2',
      roundBackgroundColor: '#22272D',
      iconBoxBackgroundColor: '#2A3038',
      userBubbleBackgroundColor: '#263F43',
      assistantBubbleBackgroundColor: '#1B222A',
    },
    kaelOrb: {
      glowShadowColor: '#3CEBFD',
    },
    sidebarComponent: {
      brandIconColor: "#9BEDE7",
      brandAccentColor: '#9BEDE7',
      selectedIconColor: '#ABF3E9',
      serviceIconColor: "#CDD8E1",
      drawerBackgroundColor: '#111922',
      drawerBorderRightColor: '#29343D',
      brandIconBackgroundColor: '#183339',
      closeBackgroundColor: '#272E36',
      searchBackgroundColor: '#222933',
      selectedBackgroundColor: '#203A3E',
      selectedBorderColor: '#397371',
      selectedLabelColor: '#A7F6E7',
      countBackgroundColor: '#424C57',
      serviceLabelColor: '#D3DCE5',
      roleRowBackgroundColor: '#232D38',
      roleActiveBackgroundColor: '#8AE2D4',
      roleTextColor: '#D1D8E0',
      roleActiveTextColor: '#07302B',
      profileBackgroundColor: '#222B36',
      profileAvatarBackgroundColor: '#657180',
    },

  bg: '#0B0F14',
  bgRaised: '#111820',
  bgCard: '#1A1F26',
  bgCardLight: '#252B32',
  sidebar: '#101820',
  white: '#F8FAFC',
  text: '#F6F8FA',
  muted: '#ACB4BE',
  mutedSecondary: '#7F8A96',
  mint: '#91E5D6',
  mintBright: '#68DCCE',
  border: 'rgba(255,255,255,0.065)',
  borderBright: 'rgba(255,255,255,0.14)',
  glass: 'rgba(255,255,255,0.10)',
  scrim: 'rgba(0,0,0,0.58)'
} as const;
