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
  sidebarList: {
    pressed: 'rgba(60,60,67,0.08)', icon: '#11161C', accent: '#91E5D6', onAccent: '#0B0F14',
  },
  kaelAvatar: { background: '#FFFFFF', border: '#E3E9EE', shadow: '#4F7482', ring: 'rgba(255,255,255,0.74)' },
  chatComposer: {
    surface: 'rgba(118,118,128,0.12)',
    mediaRemoveSurface: '#DDE1E6',
    errorText: '#C0262D',
    surfaceBorder: 'rgba(60,60,67,0.16)',
    focusedSurfaceBorder: 'rgba(13,167,151,0.90)',
    surfaceShadow: '0 0 0 3px rgba(60,60,67,0.03), 0 6px 22px rgba(60,60,67,0.10)',
    inputText: '#0B0F14',
    placeholder: '#8A8A90',
    mediaIcon: '#0B0F14',
    idleSendSurface: 'rgba(118,118,128,0.16)',
    idleSendBorder: 'rgba(60,60,67,0.06)',
    idleSendIcon: '#8E8E93',
    activeSendSurface: '#0B0F14',
    activeSendBorder: '#0B0F14',
    activeSendIcon: '#FFFFFF',
  },
  kaelHomeScreen: {
    userBubbleBackgroundColor: '#D9F2EE',
    assistantBubbleBackgroundColor: '#F2F4F7',
    disclaimerColor: '#6B7683',
  },
  liquid: {
    controlFill: 'rgba(255,255,255,0.16)',
    sheetFill: 'rgba(255,255,255,0.74)',
    solidFill: '#F7F8FA',
    solidBorder: 'rgba(60,60,67,0.18)',
    controlShadow: '0 8px 18px rgba(20,73,66,0.08), inset 0 1px 0 rgba(255,255,255,0.40)',
    sheetShadow: '0 18px 38px rgba(20,73,66,0.14), inset 0 1px 0 rgba(255,255,255,0.40)',
    pressHighlight: 'rgba(60,60,67,0.08)',
    tint: { neutral: undefined, accent: '#91E5D6' },
    accentFill: 'rgba(145,229,214,0.62)',
    accentSolid: '#91E5D6',
    accentShadow: '0 10px 22px rgba(20,120,105,0.20), inset 0 1px 0 rgba(255,255,255,0.45)',
    frost: [
      { offset: 0, color: '#FFFFFF', opacity: 0.56 },
      { offset: 0.48, color: '#FFFFFF', opacity: 0.2 },
      { offset: 1, color: '#FFFFFF', opacity: 0.08 },
    ],
    rim: [
      { offset: 0, color: '#FFFFFF', opacity: 0.95 },
      { offset: 0.5, color: '#144942', opacity: 0.14 },
      { offset: 1, color: '#FFFFFF', opacity: 0.95 },
    ],
  },
  skeleton: {
    base: '#ECEFF3',
    shimmer: [
      { offset: 0, color: '#91E5D6', opacity: 0 },
      { offset: 0.5, color: '#91E5D6', opacity: 0.42 },
      { offset: 1, color: '#91E5D6', opacity: 0 },
    ],
  },
  conversationMenu: {
    scrim: 'rgba(0,0,0,0.12)', pressed: 'rgba(60,60,67,0.08)', icon: '#11161C', title: '#6B7683', danger: '#D4322C',
  },
  horizonEntry: { noticeSurface: '#FDEEE6', noticeText: '#8A3B12' },
  kaelOrb: {
    glowShadowColor: '#3CEBFD',
  },
  sidebarComponent: {
    brandIconColor: '#0E9E8E',
    brandAccentColor: '#0E9E8E',
    selectedIconColor: '#0E9E8E',
    serviceIconColor: '#46515C',
    drawerBackgroundColor: '#FFFFFF',
    drawerBorderRightColor: '#E3E7EC',
    brandIconBackgroundColor: '#E3F5F2',
    closeBackgroundColor: '#EEF1F4',
    searchBackgroundColor: '#EEF1F4',
    selectedBackgroundColor: '#E3F5F2',
    selectedBorderColor: '#9ADBD1',
    selectedLabelColor: '#0A6F64',
    countBackgroundColor: '#5B6672',
    serviceLabelColor: '#2A323B',
    profileBackgroundColor: '#F2F4F7',
    profileAvatarBackgroundColor: '#8A94A0',
    pillBackgroundColor: '#0B0F14',
    pillTextColor: '#FFFFFF',
  },
  modePicker: {
    rowSurface: '#F2F4F7',
    sheetSurface: '#FFFFFF',
    iconSurface: '#E3F5F2',
    focusSurface: '#E6EAEE',
    separator: 'rgba(60,60,67,0.12)',
    check: '#0E9E8E',
    notice: '#8A4A1F',
  },

  bg: '#FFFFFF',
  bgRaised: '#F7F8FA',
  bgCard: '#F2F4F7',
  bgCardLight: '#E9ECF0',
  sidebar: '#FFFFFF',
  label: '#0B0F14',
  onFill: '#FFFFFF',
  text: '#11161C',
  muted: '#5B6672',
  mutedSecondary: '#6B7683',
  mint: '#0E9E8E',
  mintBright: '#12B5A3',
  border: 'rgba(60,60,67,0.10)',
  borderBright: 'rgba(60,60,67,0.18)',
  glass: 'rgba(60,60,67,0.06)',
  scrim: 'rgba(0,0,0,0.36)'
} as const;
