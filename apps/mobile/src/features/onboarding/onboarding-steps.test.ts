import type { Language } from '@/lib/preferences';

import { onboardingChrome, onboardingSteps, type OnboardingContext, type OnboardingRole, type OnboardingTargetId } from './onboarding-steps';

const everything: ReadonlySet<OnboardingTargetId> = new Set(['composer', 'autonomy', 'menu']);

function context(overrides: Partial<OnboardingContext> = {}): OnboardingContext {
  return { language: 'vi', consentNeeded: false, profileIncomplete: false, available: everything, ...overrides };
}

const roles: readonly OnboardingRole[] = ['client', 'worker'];
const languages: readonly Language[] = ['vi', 'en'];

describe('onboarding steps', () => {
  test.each(roles)('the %s tour walks welcome, composer, autonomy, then the sidebar', role => {
    const steps = onboardingSteps(role, context());
    expect(steps.map(step => step.id)).toEqual(['welcome', 'composer', 'autonomy', 'menu']);
    expect(steps.map(step => step.target)).toEqual([null, 'composer', 'autonomy', 'menu']);
    expect(steps.map(step => step.primary.action)).toEqual(['next', 'next', 'next', 'finish']);
  });

  test.each(roles)('the %s tour has the same shape in both languages', role => {
    const [vi, en] = languages.map(language => onboardingSteps(role, context({ language })));
    expect(vi?.map(step => [step.id, step.target, step.primary.action])).toEqual(en?.map(step => [step.id, step.target, step.primary.action]));
    expect(vi?.map(step => step.title)).not.toEqual(en?.map(step => step.title));
  });

  test.each(languages.flatMap(language => roles.map(role => [language, role] as const)))('every %s %s step has copy to show', (language, role) => {
    for (const step of onboardingSteps(role, context({ language, consentNeeded: true, profileIncomplete: true }))) {
      expect(step.title.trim()).not.toBe('');
      expect(step.body.trim()).not.toBe('');
      expect(step.primary.label.trim()).not.toBe('');
    }
  });

  test('a step is dropped when the control it points at is not on screen', () => {
    const steps = onboardingSteps('client', context({ available: new Set<OnboardingTargetId>(['composer', 'menu']) }));
    expect(steps.map(step => step.id)).toEqual(['welcome', 'composer', 'menu']);
  });

  test('the last remaining step always finishes the tour', () => {
    const steps = onboardingSteps('client', context({ available: new Set<OnboardingTargetId>(['composer']) }));
    expect(steps.map(step => step.id)).toEqual(['welcome', 'composer']);
    expect(steps.at(-1)?.primary.action).toBe('finish');
    expect(steps.filter(step => step.primary.action === 'finish')).toHaveLength(1);
  });

  test('with nothing on screen only the welcome step remains and it finishes', () => {
    const steps = onboardingSteps('client', context({ available: new Set() }));
    expect(steps).toHaveLength(1);
    expect(steps[0]?.primary.action).toBe('finish');
  });

  test('a missing AI sharing consent adds a note to the composer step and a Privacy link to the sidebar step', () => {
    const steps = onboardingSteps('client', context({ consentNeeded: true }));
    expect(steps.find(step => step.id === 'composer')?.note).toEqual(expect.stringContaining('Quyền riêng tư'));
    expect(steps.find(step => step.id === 'menu')?.links.map(link => link.action)).toEqual(['openMenu', 'openPrivacy']);
  });

  test('without the consent gap there is no note and no Privacy link', () => {
    const steps = onboardingSteps('client', context());
    expect(steps.some(step => step.note !== undefined)).toBe(false);
    expect(steps.find(step => step.id === 'menu')?.links.map(link => link.action)).toEqual(['openMenu']);
  });

  test('an incomplete worker profile changes the sidebar step and offers the profile', () => {
    const plain = onboardingSteps('worker', context()).find(step => step.id === 'menu');
    const incomplete = onboardingSteps('worker', context({ profileIncomplete: true })).find(step => step.id === 'menu');
    expect(incomplete?.body).not.toBe(plain?.body);
    expect(incomplete?.links.map(link => link.action)).toEqual(['openMenu', 'openProfile']);
  });

  test('a client never sees worker profile prompts', () => {
    const menu = onboardingSteps('client', context({ profileIncomplete: true })).find(step => step.id === 'menu');
    expect(menu?.links.map(link => link.action)).toEqual(['openMenu']);
  });

  test('worker and client copy differ', () => {
    const [client, worker] = roles.map(role => onboardingSteps(role, context()));
    expect(client?.[0]?.title).not.toBe(worker?.[0]?.title);
  });

  test('the dialog chrome is localised', () => {
    expect(onboardingChrome('vi').skip).toBe('Bỏ qua');
    expect(onboardingChrome('en').skip).toBe('Skip');
    expect(onboardingChrome('en').stepOf(2, 4)).toBe('2/4');
  });
});
