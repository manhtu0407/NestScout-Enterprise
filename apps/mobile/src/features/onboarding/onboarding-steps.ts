import type { Language } from '@/lib/preferences';

export type OnboardingRole = 'client' | 'worker';
export type OnboardingTargetId = 'composer' | 'autonomy' | 'menu';
export type OnboardingAction = 'next' | 'finish' | 'openMenu' | 'openPrivacy' | 'openProfile';

export type OnboardingStepAction = Readonly<{ label: string; action: OnboardingAction }>;

export type OnboardingStep = Readonly<{
  id: string;
  target: OnboardingTargetId | null;
  title: string;
  body: string;
  note?: string;
  primary: OnboardingStepAction;
  links: readonly OnboardingStepAction[];
}>;

export type OnboardingContext = Readonly<{
  language: Language;
  consentNeeded: boolean;
  profileIncomplete: boolean;
  available: ReadonlySet<OnboardingTargetId>;
}>;

export type OnboardingChrome = Readonly<{ skip: string; back: string; stepOf: (step: number, total: number) => string; dialog: string }>;

type Copy = Readonly<{
  chrome: OnboardingChrome;
  next: string;
  start: string;
  finish: string;
  openMenu: string;
  openPrivacy: string;
  openProfile: string;
  client: Readonly<{ welcomeTitle: string; welcomeBody: string; composerTitle: string; composerBody: string; consentNote: string; autonomyTitle: string; autonomyBody: string; menuTitle: string; menuBody: string }>;
  worker: Readonly<{ welcomeTitle: string; welcomeBody: string; composerTitle: string; composerBody: string; consentNote: string; autonomyTitle: string; autonomyBody: string; menuTitle: string; menuBody: string; menuProfileBody: string }>;
}>;

const vi: Copy = {
  chrome: { skip: 'Bỏ qua', back: 'Quay lại', stepOf: (step, total) => `${step}/${total}`, dialog: 'Hướng dẫn làm quen NestScout' },
  next: 'Tiếp',
  start: 'Bắt đầu',
  finish: 'Bắt đầu với Kael',
  openMenu: 'Mở thanh bên',
  openPrivacy: 'Mở Quyền riêng tư',
  openProfile: 'Hoàn thiện hồ sơ',
  client: {
    welcomeTitle: 'Chào mừng đến NestScout',
    welcomeBody: 'Kael giúp bạn đi từ việc cần làm đến thợ phù hợp và báo giá rõ ràng. Xem nhanh cách bắt đầu, chưa đầy một phút.',
    composerTitle: 'Kể cho Kael việc cần làm',
    composerBody: 'Mô tả bằng lời của bạn, ví dụ “vòi nước bếp bị rò”. Kael sẽ hỏi lại những gì còn thiếu rồi lập yêu cầu giúp bạn.',
    consentNote: 'Lần đầu, hãy bật “Chia sẻ dữ liệu với AI” trong Cài đặt › Quyền riêng tư để Kael có thể trả lời.',
    autonomyTitle: 'Chọn cách Kael làm việc',
    autonomyBody: 'Ask: Kael dừng lại và hỏi từng bước. Auto: Kael chạy liên tục, chỉ dừng khi cần bạn xác nhận thông tin, thợ và giá. Bạn đổi được bất cứ lúc nào.',
    menuTitle: 'Mọi thứ nằm trong thanh bên',
    menuBody: 'Chọn dịch vụ có sẵn, theo dõi yêu cầu, quyết định báo giá, xem thông báo và quay lại các cuộc trò chuyện cũ.',
  },
  worker: {
    welcomeTitle: 'Chào mừng bạn đến với vai trò Thợ',
    welcomeBody: 'NestScout đưa việc phù hợp đến bạn. Kael giúp bạn nhận việc, theo dõi tiến độ và thu nhập. Xem nhanh cách bắt đầu.',
    composerTitle: 'Hỏi Kael về công việc',
    composerBody: 'Hỏi về việc được giao, bước tiếp theo hay cách xử lý một tình huống. Kael giải thích và gợi ý, quyết định vẫn là của bạn.',
    consentNote: 'Lần đầu, hãy bật “Chia sẻ dữ liệu với AI” trong Cài đặt › Quyền riêng tư để Kael có thể trả lời.',
    autonomyTitle: 'Chọn cách Kael nhận việc',
    autonomyBody: 'Ask: Kael hỏi từng bước và để bạn tự quyết định nhận từng việc. Auto: Kael tự nhận việc khớp hồ sơ của bạn rồi báo qua thông báo.',
    menuTitle: 'Việc, thu nhập và hồ sơ ở thanh bên',
    menuBody: 'Bật “Đang nhận việc”, xem Việc mới, Thu nhập và Rút tiền, và quản lý hồ sơ nghề của bạn.',
    menuProfileBody: 'Hồ sơ của bạn còn thiếu một số mục. Hoàn thiện hồ sơ để bật “Đang nhận việc” và bắt đầu nhận việc.',
  },
};

const en: Copy = {
  chrome: { skip: 'Skip', back: 'Back', stepOf: (step, total) => `${step}/${total}`, dialog: 'NestScout welcome tour' },
  next: 'Next',
  start: 'Get started',
  finish: 'Start with Kael',
  openMenu: 'Open the sidebar',
  openPrivacy: 'Open Privacy',
  openProfile: 'Complete your profile',
  client: {
    welcomeTitle: 'Welcome to NestScout',
    welcomeBody: 'Kael takes you from the job you need done to the right worker and a clear quote. A quick look, under a minute.',
    composerTitle: 'Tell Kael what needs doing',
    composerBody: 'Describe it in your own words, like “the kitchen tap is leaking”. Kael asks about anything missing, then prepares the request for you.',
    consentNote: 'The first time, turn on “Share data with AI” in Settings › Privacy so Kael can reply.',
    autonomyTitle: 'Choose how Kael works',
    autonomyBody: 'Ask: Kael stops and checks with you at every step. Auto: Kael keeps going and only stops when it needs you to confirm details, the worker and the price. You can change it any time.',
    menuTitle: 'Everything lives in the sidebar',
    menuBody: 'Pick a service, follow your requests, decide on quotes, read notifications and return to earlier conversations.',
  },
  worker: {
    welcomeTitle: 'Welcome to the Worker role',
    welcomeBody: 'NestScout brings matching jobs to you. Kael helps you take jobs and follow progress and earnings. A quick look.',
    composerTitle: 'Ask Kael about your jobs',
    composerBody: 'Ask about an assigned job, the next step or how to handle a situation. Kael explains and suggests; the decision stays yours.',
    consentNote: 'The first time, turn on “Share data with AI” in Settings › Privacy so Kael can reply.',
    autonomyTitle: 'Choose how Kael takes jobs',
    autonomyBody: 'Ask: Kael checks with you at every step and lets you decide on each job. Auto: Kael takes jobs that match your profile and notifies you.',
    menuTitle: 'Jobs, earnings and profile are in the sidebar',
    menuBody: 'Turn on “Accepting jobs”, open New jobs, Earnings and Payout, and manage your trade profile.',
    menuProfileBody: 'Your profile is missing a few items. Complete it to turn on “Accepting jobs” and start taking work.',
  },
};

const copyByLanguage: Readonly<Record<Language, Copy>> = { vi, en };

export function onboardingChrome(language: Language): OnboardingChrome {
  return copyByLanguage[language].chrome;
}

export function onboardingSteps(role: OnboardingRole, context: OnboardingContext): readonly OnboardingStep[] {
  const copy = copyByLanguage[context.language];
  const text = role === 'worker' ? copy.worker : copy.client;
  const next = { label: copy.next, action: 'next' } as const;
  const privacyLink: OnboardingStepAction = { label: copy.openPrivacy, action: 'openPrivacy' };
  const menuLinks: OnboardingStepAction[] = [{ label: copy.openMenu, action: 'openMenu' }];
  if (role === 'worker' && context.profileIncomplete) menuLinks.push({ label: copy.openProfile, action: 'openProfile' });
  if (context.consentNeeded) menuLinks.push(privacyLink);
  const menuBody = role === 'worker' && context.profileIncomplete ? copy.worker.menuProfileBody : text.menuBody;
  const steps: OnboardingStep[] = [
    { id: 'welcome', target: null, title: text.welcomeTitle, body: text.welcomeBody, primary: { label: copy.start, action: 'next' }, links: [] },
    { id: 'composer', target: 'composer', title: text.composerTitle, body: text.composerBody, ...(context.consentNeeded ? { note: text.consentNote } : {}), primary: next, links: [] },
    { id: 'autonomy', target: 'autonomy', title: text.autonomyTitle, body: text.autonomyBody, primary: next, links: [] },
    { id: 'menu', target: 'menu', title: text.menuTitle, body: menuBody, primary: { label: copy.finish, action: 'finish' }, links: menuLinks },
  ];
  const visible = steps.filter(step => step.target === null || context.available.has(step.target));
  const last = visible[visible.length - 1];
  if (last === undefined || last.primary.action !== 'next') return visible;
  return [...visible.slice(0, -1), { ...last, primary: { label: copy.finish, action: 'finish' } }];
}
