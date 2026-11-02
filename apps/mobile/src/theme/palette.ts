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
    groupChevron: '#6B7683',
    pressed: 'rgba(60,60,67,0.08)', icon: '#11161C', accent: '#91E5D6', onAccent: '#0B0F14', badge: '#11161C', onBadge: '#FFFFFF',
  },
  workerSidebar: {
    surface: '#FFFFFF', cardFill: '#F4F6F8', ink: '#11161C', muted: '#6B7683', hairline: 'rgba(60,60,67,0.12)',
    accentText: '#0A6F64', accentSoft: 'rgba(14,158,142,0.14)', online: '#0E9E8E', offline: '#9AA0AB',
    statFill: '#FFFFFF', statIcon: '#11161C', goOffFill: '#0E9E8E', goOnFill: '#FDE6EA', goOffLabel: '#FFFFFF', goOnLabel: '#C2294A', badge: '#11161C', onBadge: '#FFFFFF',
  },
  kaelAvatar: { background: '#FFFFFF', border: '#E3E9EE', shadow: '#4F7482', ring: 'rgba(255,255,255,0.74)' },
  chatComposer: {
    surface: 'rgba(118,118,128,0.12)',
    mediaRemoveSurface: '#DDE1E6',
    noticeText: '#6B7078',
    surfaceBorder: 'rgba(60,60,67,0.16)',
    surfaceShadow: '0 2px 12px rgba(60,60,67,0.08)',
    inputText: '#0B0F14',
    placeholder: '#8A8A90',
    mediaIcon: '#1C2127',
    voiceIcon: '#4A525C',
    idleSendSurface: 'rgba(118,118,128,0.16)',
    idleSendBorder: 'rgba(60,60,67,0.06)',
    idleSendIcon: '#8E8E93',
    activeSendSurface: '#0B0F14',
    activeSendBorder: '#0B0F14',
    activeSendIcon: '#FFFFFF',
    voiceSurface: '#DEDEE1',
    voiceBar: '#3C4650',
    voiceCancelFill: '#0B0F14',
    voiceCancelIcon: '#FFFFFF',
    voiceSendFill: 'rgba(60,60,67,0.16)',
    voiceSendIcon: '#0B0F14',
  },
  slideConfirm: {
    track: '#0B0F14',
    fill: '#0E9E8E',
    thumb: '#FFFFFF',
    thumbIcon: '#0B0F14',
    label: 'rgba(255,255,255,0.68)',
    thumbShadow: '0 2px 8px rgba(0,0,0,0.28)',
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
    tint: { neutral: undefined, accent: '#91E5D6', light: '#FFFFFF' },
    lightFill: 'rgba(255,255,255,0.97)',
    lightShadow: '0 10px 26px rgba(20,30,40,0.16), inset 0 1px 0 rgba(255,255,255,0.9)',
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
  kaelMotionLab: {
    title: '#5B6672', chip: '#F2F4F7', chipActive: '#141820', chipText: '#141820', chipTextActive: '#FFFFFF', card: '#F7F8FA',
  },
  kaelMotion: {
    shimmerBase: '#7C7C7C', shimmerHighlight: '#0D0D0D',
    matrixBase: '#D5D9E0', matrixActive: '#141820',
    orbDot: '#141820', orbCore: '#141820', orbRest: '#9AA3AF',
    noteText: '#4A5260',
    spinnerTrack: '#E4E7EC', spinnerArc: '#141820', spinnerDone: '#141820', spinnerCheck: '#FFFFFF',
  },
  appMotion: {
    heartIdle: '#9AA3AF', labBadge: '#0E9E8E', labBadgeText: '#FFFFFF', labNotice: '#141820', labNoticeText: '#FFFFFF',
  },
  skeleton: {
    base: '#ECEFF3',
    shimmer: [
      { offset: 0, color: '#FFFFFF', opacity: 0 },
      { offset: 0.5, color: '#FFFFFF', opacity: 0.75 },
      { offset: 1, color: '#FFFFFF', opacity: 0 },
    ],
  },
  recentSession: {
    activeFill: 'rgba(14,158,142,0.10)', busyText: '#4A525C', actionIcon: '#1C2127',
  },
  requestsScreen: {
    tabsFill: 'rgba(118,118,128,0.12)', indicator: '#FFFFFF', indicatorShadow: '0 1px 4px rgba(0,0,0,0.12)',
    tabText: '#5B6672', tabTextActive: '#11161C', cardFill: '#F5F6F8', tileFill: '#FFFFFF',
    chipFill: '#11161C', chipText: '#FFFFFF', emptyIcon: '#8A8A90',
    stepFill: '#0E9E8E', stepTrack: 'rgba(118,118,128,0.18)', stepCaption: '#5B6672', nextFill: '#FFFFFF', nextAccent: '#0A6F64', nextAccentFill: 'rgba(14,158,142,0.12)', infoLabel: '#6B7683',
    timelineDone: '#0E9E8E', timelineDoneIcon: '#FFFFFF', timelineCurrent: '#11161C', timelinePending: 'rgba(118,118,128,0.22)', timelineLine: 'rgba(118,118,128,0.22)', timelinePendingText: '#8A8A90', actionFill: '#0B0F14', actionLabel: '#FFFFFF', actionSecondaryFill: 'rgba(118,118,128,0.12)', actionSecondaryLabel: '#11161C', chevron: '#9AA0AB', toggleFill: 'rgba(118,118,128,0.12)', toggleIcon: '#3C4650',
  },
  workerEarnings: {
    heroFill: '#0B0F14', heroLabel: 'rgba(255,255,255,0.68)', heroAmount: '#FFFFFF', heroMeta: 'rgba(255,255,255,0.68)',
    chartFill: '#F5F6F8', barFill: 'rgba(14,158,142,0.28)', barToday: '#0E9E8E', barLabel: '#6B7683', barLabelToday: '#11161C', chartTitle: '#6B7683',
    amount: '#0B7C70', quickFill: 'rgba(118,118,128,0.12)', quickText: '#11161C',
  },
  workerJobs: {
    chipFill: 'rgba(118,118,128,0.12)', chipClearFill: 'rgba(118,118,128,0)', chipText: '#3C4650', chipActiveFill: '#0B0F14', chipActiveText: '#FFFFFF',
    chipCountFill: 'rgba(60,60,67,0.14)', chipCountText: '#3C4650', chipActiveCountFill: 'rgba(255,255,255,0.22)',
    noticeFill: 'rgba(14,158,142,0.12)', noticeText: '#0A6F64',
    waitingFill: 'rgba(118,118,128,0.12)', waitingText: '#11161C',
    composerFill: '#FFFFFF', fieldFill: '#F5F6F8', fieldText: '#0B0F14', fieldBorder: 'transparent', fieldFocusBorder: '#0B0F14', placeholder: '#9A9AA1', factIcon: '#6B7683',
  },
  supportScreens: {
    cardFill: '#F5F6F8', tileFill: '#FFFFFF', separator: 'rgba(60,60,67,0.10)',
    sectionTitle: '#6B7683', chevron: '#9AA0AB', unreadDot: '#0E9E8E', unreadTile: 'rgba(14,158,142,0.14)', unreadIcon: '#0A6F64',
    danger: '#D4322C', switchOn: '#0E9E8E', switchOff: '#D9DCE1', switchThumb: '#FFFFFF',
    searchFill: 'rgba(118,118,128,0.12)', searchPlaceholder: '#8A8A90', searchIcon: '#5B6672',
    heroFill: '#F5F6F8', avatarFill: '#ECEEF1', avatarInitial: '#11161C', chipFill: 'rgba(118,118,128,0.12)', chipText: '#3C4650',
    primaryFill: '#0B0F14', primaryLabel: '#FFFFFF', secondaryFill: 'rgba(118,118,128,0.12)', secondaryLabel: '#11161C',
    actionLabel: '#0B7C70', quoteAccepted: '#0B7C70', quoteAcceptedFill: 'rgba(14,158,142,0.12)', quoteDeclined: '#B3261E', quoteDeclinedFill: 'rgba(212,50,44,0.10)', heartFilled: '#D4322C', emptyIcon: '#8A8A90',
    switchThumbShadow: '0 3px 8px rgba(0,0,0,0.15), 0 1px 1px rgba(0,0,0,0.16)', ratingStar: '#E8A317', strengthTrack: 'rgba(118,118,128,0.16)', strengthBar: '#0E9E8E', skillChipFill: 'rgba(14,158,142,0.10)', skillChipText: '#0A6F64',
  },
  accountSheet: {
    handle: 'rgba(60,60,67,0.22)', closeFill: 'rgba(118,118,128,0.12)', closeFocus: 'rgba(118,118,128,0.24)',
    avatarFill: '#ECEEF1', avatarRing: '#FFFFFF', avatarInitial: '#11161C',
    chipFill: 'rgba(118,118,128,0.12)', chipText: '#3C4650',
    cardFill: '#F5F6F8', tileFill: '#FFFFFF', separator: 'rgba(60,60,67,0.10)', rowActive: 'rgba(60,60,67,0.07)',
  },
  composerMenu: {
    scrim: 'rgba(0,0,0,0.06)', fill: '#DEDEE1', icon: '#11161C', labelSurface: '#FFFFFF', labelBorder: 'rgba(60,60,67,0.12)', detail: '#8A8A90',
  },
  conversationMenu: {
    scrim: 'rgba(0,0,0,0.12)', pressed: 'rgba(60,60,67,0.08)', icon: '#11161C', title: '#6B7683', danger: '#D4322C',
  },
  horizonEntry: { noticeSurface: '#FDEEE6', noticeText: '#8A3B12' },
  signIn: {
    backdrop: '#F3F4F6',
    aurora: {
      client: ['#D9DCE1', '#E6E8EC', '#DDE0E5'],
      worker: ['#D9DCE1', '#E6E8EC', '#DDE0E5'],
    },
    accent: { client: '#0E9E8E', worker: '#B45F06' },
    accentText: { client: '#0A6F64', worker: '#8F4A00' },
    accentSoft: { client: 'rgba(14,158,142,0.14)', worker: 'rgba(180,95,6,0.14)' },
    glow: { client: '#12B5A3', worker: '#F29A2E' },
    title: '#0B0F14', body: '#4A525C', muted: '#6B7683',
    switchTrack: 'rgba(118,118,128,0.14)', switchThumb: '#FFFFFF', switchThumbShadow: '0 3px 10px rgba(11,15,20,0.14), 0 0 0 0.5px rgba(60,60,67,0.10)',
    switchActive: '#0B0F14', switchIdle: '#5B6672',
    fieldFill: 'rgba(118,118,128,0.12)', fieldFocusFill: '#FFFFFF', fieldBorder: 'transparent', fieldFocusBorder: '#0B0F14', fieldFocusShadow: '0 6px 22px rgba(11,15,20,0.08)',
    prefixFill: '#FFFFFF', prefixText: '#0B0F14', prefixShadow: '0 1px 4px rgba(11,15,20,0.10)',
    inputText: '#0B0F14', placeholder: '#9A9AA1', caret: '#0B0F14',
    ctaShadow: { client: '0 14px 30px rgba(18,181,163,0.34)', worker: '0 14px 30px rgba(242,154,46,0.34)' },
    halo: { client: 'rgba(160,166,176,0.28)', worker: 'rgba(160,166,176,0.28)' },
    cta: '#0B0F14', ctaLabel: '#FFFFFF', ctaOff: 'rgba(118,118,128,0.20)', ctaOffLabel: '#8E8E93',
    error: '#C0262D', errorSoft: 'rgba(192,38,45,0.10)', success: '#176B43', successSoft: 'rgba(23,107,67,0.14)',
    otpFill: 'rgba(118,118,128,0.12)', otpFilledFill: '#FFFFFF', otpDigit: '#0B0F14',
    backFill: 'rgba(255,255,255,0.62)', backIcon: '#0B0F14', backShadow: '0 2px 10px rgba(11,15,20,0.10)',
    previewBadge: 'rgba(11,15,20,0.06)',
  },
  kaelCompanion: {
    body: '#66707D',
    navSurface: '#FFFFFF',
    navBorder: '#EEF0F3',
    introTitle: '#141820',
    introUnderline: '#9AA0AB',
    progressScrim: 'rgba(20,24,32,0.32)', progressSurface: '#FFFFFF', progressBorder: '#E4E7EC', progressTitle: '#141820', progressMuted: '#8A909C',
    progressClose: '#F1F2F5', progressCloseGlyph: '#4A5260', progressMarkerIdle: '#D5D9E0', progressMarkerDone: '#141820', progressMarkerCurrent: '#141820', progressMarkerGlyph: '#FFFFFF', progressTextIdle: '#8A909C', progressTextActive: '#141820',
    ambient: '#F3F4F7',
    welcomeSurface: '#F4F5F7',
    userBubble: '#ECEEF1',
    assistantBubble: '#F7F8FA',
    cardTitle: '#181E27',
    chipText: '#303844',
    scrim: 'rgba(26,33,43,0.13)',
  },
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
    popoverScrim: 'rgba(0,0,0,0.12)', popoverFill: '#FFFFFF', popoverShadow: '0 8px 28px rgba(0,0,0,0.16)', popoverPressed: 'rgba(118,118,128,0.12)', optionIcon: '#1C2127', popoverCheck: '#11161C',
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
