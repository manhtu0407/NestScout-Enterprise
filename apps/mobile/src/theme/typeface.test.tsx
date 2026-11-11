import { render, screen } from '@testing-library/react-native';
import { forwardRef, type ComponentRef } from 'react';
import { StyleSheet, View, type StyleProp, type TextStyle, type ViewProps } from 'react-native';

import { applyInterTo, interFamilyFor, interStyleFor, typefaceAssets } from './typeface';

describe('Inter weight mapping', () => {
  it.each([
    [undefined, 'Inter_400Regular'],
    ['normal', 'Inter_400Regular'],
    ['400', 'Inter_400Regular'],
    ['500', 'Inter_500Medium'],
    ['600', 'Inter_600SemiBold'],
    ['700', 'Inter_700Bold'],
    ['bold', 'Inter_700Bold'],
    ['800', 'Inter_700Bold'],
    ['300', 'Inter_400Regular'],
  ] as const)('maps weight %s to %s', (weight, family) => {
    expect(interFamilyFor(weight)).toBe(family);
  });

  it('registers a font file for every mapped family', () => {
    for (const family of ['Inter_400Regular', 'Inter_500Medium', 'Inter_600SemiBold', 'Inter_700Bold'] as const) {
      expect(typefaceAssets[family]).toBeDefined();
    }
  });

  it('leaves text with an explicit family untouched', () => {
    expect(interStyleFor({ fontFamily: 'Menlo', fontSize: 12 })).toBeNull();
  });

  it('resets the weight so the weight-specific face is not synthesised twice', () => {
    expect(interStyleFor({ fontWeight: '600' })).toMatchObject({ fontFamily: 'Inter_600SemiBold', fontWeight: 'normal' });
  });
});

type ProbeProps = ViewProps & { style?: StyleProp<TextStyle> };

const Probe = forwardRef<ComponentRef<typeof View>, ProbeProps>(function Probe(props, ref) {
  return <View ref={ref} {...props} />;
});

describe('applied typeface', () => {
  beforeAll(() => { expect(applyInterTo(Probe)).toBe(true); });

  it('styles by weight and keeps other style props', async () => {
    await render(<Probe testID="t" style={{ fontSize: 20, fontWeight: '700' }} />);
    expect(StyleSheet.flatten(screen.getByTestId('t').props.style)).toMatchObject({ fontSize: 20, fontFamily: 'Inter_700Bold', fontWeight: 'normal' });
  });

  it('defaults unweighted text to the regular face', async () => {
    await render(<Probe testID="t" />);
    expect(StyleSheet.flatten(screen.getByTestId('t').props.style)).toMatchObject({ fontFamily: 'Inter_400Regular' });
  });

  it('keeps the monospace family used for timers', async () => {
    await render(<Probe testID="t" style={{ fontFamily: 'Menlo' }} />);
    expect(StyleSheet.flatten(screen.getByTestId('t').props.style)).toMatchObject({ fontFamily: 'Menlo' });
  });

  it('reports components that cannot be patched', () => {
    expect(applyInterTo(() => null)).toBe(false);
  });
});
