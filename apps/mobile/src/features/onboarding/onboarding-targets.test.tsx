import { act, render, screen } from '@testing-library/react-native';
import { View } from 'react-native';

import { OnboardingTargetsProvider, useOnboardingTarget, useOnboardingTargets, type OnboardingTargets } from './onboarding-targets';
import type { OnboardingTargetId } from './onboarding-steps';

const measure = jest.fn();

beforeAll(() => {
  Object.assign(View.prototype, { measureInWindow: measure });
});

beforeEach(() => {
  measure.mockReset();
  measure.mockImplementation((callback: (x: number, y: number, width: number, height: number) => void) => callback(10, 20, 100, 50));
});

function Target({ id, testID }: { id: OnboardingTargetId; testID: string }) {
  return <View {...useOnboardingTarget(id)} testID={testID}/>;
}

function Probe({ onTargets }: { onTargets: (targets: OnboardingTargets | null) => void }) {
  onTargets(useOnboardingTargets());
  return null;
}

test('a target outside a provider is inert and still renders', async () => {
  await render(<Target id="composer" testID="plain"/>);
  expect(screen.getByTestId('plain')).toBeTruthy();
});

test('targets report what is on screen and where', async () => {
  let targets: OnboardingTargets | null = null;
  await render(<OnboardingTargetsProvider><Probe onTargets={value => { targets = value; }}/><Target id="composer" testID="a"/><Target id="menu" testID="b"/></OnboardingTargetsProvider>);
  const current = targets as OnboardingTargets | null;
  expect(current?.has('composer')).toBe(true);
  expect(current?.has('autonomy')).toBe(false);
  expect([...(current?.available() ?? [])].sort()).toEqual(['composer', 'menu']);
  expect(await current?.measure('menu')).toEqual({ x: 10, y: 20, width: 100, height: 50 });
  expect(await current?.measure('autonomy')).toBeNull();
});

test('a control without a size is treated as not measurable', async () => {
  let targets: OnboardingTargets | null = null;
  measure.mockImplementation((callback: (x: number, y: number, width: number, height: number) => void) => callback(0, 0, 0, 0));
  await render(<OnboardingTargetsProvider><Probe onTargets={value => { targets = value; }}/><Target id="composer" testID="a"/></OnboardingTargetsProvider>);
  expect(await (targets as OnboardingTargets | null)?.measure('composer')).toBeNull();
});

test('a control that leaves the screen stops being a target and the registry version moves', async () => {
  let targets: OnboardingTargets | null = null;
  const tree = (withMenu: boolean) => <OnboardingTargetsProvider><Probe onTargets={value => { targets = value; }}/><Target id="composer" testID="a"/>{withMenu && <Target id="menu" testID="b"/>}</OnboardingTargetsProvider>;
  const view = await render(tree(true));
  const before = (targets as OnboardingTargets | null)?.version ?? -1;
  expect((targets as OnboardingTargets | null)?.has('menu')).toBe(true);
  await act(async () => { view.rerender(tree(false)); });
  expect((targets as OnboardingTargets | null)?.has('menu')).toBe(false);
  expect((targets as OnboardingTargets | null)?.version).toBeGreaterThan(before);
});
