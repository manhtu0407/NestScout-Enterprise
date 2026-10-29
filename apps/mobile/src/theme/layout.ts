export const layout = {
  screen: { padding: 24, gap: 16 },
  control: { minHeight: 48, radius: 10, horizontalPadding: 16, inactiveOpacity: 0.5, feedbackBorderWidth: 2 },
  input: { horizontalPadding: 12, borderWidth: 1 },
  loading: { gap: 12 },
  spacing: { none: 0, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
  radius: { small: 6, medium: 10, large: 16, pill: 999 },
  border: { thin: 1, focus: 2 },
  dimensions: { touch: 48, icon: 24, indicator: 8 },
  opacity: { disabled: 0.5, pressed: 0.72 },
  elevation: { flat: 0, raised: 2, shadowOpacity: 0.12, shadowRadius: 4, shadowOffset: 2 },
  motion: { instant: 0, quick: 120, standard: 220 },
} as const;

export const typography = {
  heading: { fontSize: 28, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 22 },
  control: { fontSize: 16, fontWeight: '600' },
  phoneInput: { fontSize: 18 },
  codeInput: { fontSize: 24, letterSpacing: 6 },
  title: { fontSize: 34, lineHeight: 41, fontWeight: '700' },
  subheading: { fontSize: 20, lineHeight: 26, fontWeight: '600' },
  caption: { fontSize: 13, lineHeight: 18 },
} as const;
