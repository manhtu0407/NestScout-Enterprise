export const layout = {
  screen: { padding: 24, gap: 16 },
  control: { minHeight: 48, radius: 10, horizontalPadding: 16, inactiveOpacity: 0.5 },
  input: { horizontalPadding: 12, borderWidth: 1 },
  loading: { gap: 12 },
} as const;

export const typography = {
  heading: { fontSize: 28, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 22 },
  control: { fontSize: 16, fontWeight: '600' },
  phoneInput: { fontSize: 18 },
  codeInput: { fontSize: 24, letterSpacing: 6 },
} as const;
