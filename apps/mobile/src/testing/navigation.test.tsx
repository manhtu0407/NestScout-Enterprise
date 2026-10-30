import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import * as ImagePicker from 'expo-image-picker';

import '@/features/access';
import '@/features/client';
import '@/features/worker';
import { createFakeAccessServices, type FakeOptions } from '@/features/access/testing/fake-access-services';

let mockServices: ReturnType<typeof createFakeAccessServices>['services'];

jest.mock('@/features/access/default-services', () => ({
  getDefaultAccessServices: () => mockServices,
}));

jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));

const user = { userId: 'user-a' };
const grant = (worker: 'none' | 'active' | 'revoked') => ({ kind: 'resolved', worker }) as const;

async function start(options: FakeOptions, initialUrl = '/') {
  const fake = createFakeAccessServices(options);
  mockServices = fake.services;
  await renderRouter('./src/app', { initialUrl });
  return fake;
}

const heading = async (name: string) => {
  if (['NestScout', 'Client mode', 'Worker mode'].includes(name)) {
    await waitFor(() => {
      if (!screen.queryByLabelText('Mở thanh bên') && !screen.queryByRole('header', { name })) throw new Error('Waiting for entry');
    });
    const menu = screen.queryByLabelText('Mở thanh bên');
    if (menu) {
      await fireEvent.press(screen.getByLabelText('Mở thanh bên'));
      await openAccountArea();
    }
  }
  return screen.findByRole('header', { name });
};
const press = async (name: string) => fireEvent.press(screen.getByRole('button', { name }));
const openAccount = async () => fireEvent.press(await screen.findByRole('button', { name: /^Tài khoản .*đang dùng:/ }));
const openModePicker = async () => { await openAccount(); await press('Chuyển chế độ'); await screen.findByRole('radio', { name: 'Khách hàng' }); };
const openAccountArea = async () => { await openAccount(); await press('Tài khoản và đăng nhập'); await waitFor(() => expect(screen.queryByRole('button', { name: 'Tài khoản và đăng nhập' })).toBeNull()); };

describe('cold start', () => {
  test('a guest can reach the existing guest shell without forced login', async () => {
    await start({ session: null });
    expect(await heading('NestScout')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign in with phone' })).toBeTruthy();
    expect(screen.queryByText(/choose.*(client|worker)/i)).toBeNull();
    expect(screen.queryByRole('header', { name: 'Client mode' })).toBeNull();
    expect(screen.queryByRole('header', { name: 'Worker mode' })).toBeNull();
  });

  test('protected content is not rendered while the session is still being restored', async () => {
    await start({ restore: () => new Promise(() => undefined) });
    expect(await screen.findByLabelText('Starting NestScout')).toBeTruthy();
    expect(screen.queryByRole('header', { name: 'NestScout' })).toBeNull();
    expect(screen.queryByRole('header', { name: 'Client mode' })).toBeNull();
  });

  test('a restored account opens Client when no Worker grant exists', async () => {
    await start({ session: user, capability: grant('none') });
    expect(await heading('Client mode')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Switch to Worker mode' })).toBeNull();
  });

  test('a session the server rejects falls back to the guest shell', async () => {
    const fake = await start({ session: user, identityCheck: { status: 'invalid' } });
    expect(await heading('NestScout')).toBeTruthy();
    expect(fake.calls.signOut).toBe(0);
  });

  test('an unreachable server keeps the account in Client without Worker access', async () => {
    await start({ session: user, identityCheck: { status: 'unreachable' }, capability: { kind: 'error', reason: 'unavailable' }, storedMode: { userId: 'user-a', mode: 'worker' } });
    expect(await heading('Client mode')).toBeTruthy();
    expect(screen.getByText('Worker access could not be verified, so Client mode is shown.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Switch to Worker mode' })).toBeNull();
  });
});

describe('unverified identity', () => {
  test('an active grant and a saved Worker preference do not open Worker while getUser is unreachable', async () => {
    await start({ session: user, identityCheck: { status: 'unreachable' }, capability: grant('active'), storedMode: { userId: 'user-a', mode: 'worker' } }, '/worker-home');
    expect(await heading('Client mode')).toBeTruthy();
    expect(screen.queryByRole('header', { name: 'Worker mode' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Switch to Worker mode' })).toBeNull();
    expect(screen.getByText('Worker access could not be verified, so Client mode is shown.')).toBeTruthy();
  });

  test('a later successful re-check from the banner opens the saved Worker mode', async () => {
    let answer: { status: 'unreachable' } | { status: 'valid'; identity: { userId: string } } = { status: 'unreachable' };
    await start({ session: user, verifyIdentity: async () => answer, capability: grant('active'), storedMode: { userId: 'user-a', mode: 'worker' } });
    expect(await heading('Client mode')).toBeTruthy();
    answer = { status: 'valid', identity: user };
    await press('Check Worker access again');
    expect(await heading('Worker mode')).toBeTruthy();
  });
});

describe('protected routes', () => {
  test.each(['/client-home', '/worker-home'])('a guest opening %s is sent to the guest shell', async (url) => {
    await start({ session: null }, url);
    expect(await heading('NestScout')).toBeTruthy();
    expect(screen.queryByRole('header', { name: 'Client mode' })).toBeNull();
    expect(screen.queryByRole('header', { name: 'Worker mode' })).toBeNull();
  });

  test('a signed-in account without a grant opening the Worker route lands in Client', async () => {
    await start({ session: user, capability: grant('none') }, '/worker-home');
    expect(await heading('Client mode')).toBeTruthy();
    expect(screen.queryByRole('header', { name: 'Worker mode' })).toBeNull();
  });

  test('a forged Worker preference without a grant never opens Worker', async () => {
    await start({ session: user, capability: grant('none'), storedMode: { userId: 'user-a', mode: 'worker' } }, '/worker-home');
    expect(await heading('Client mode')).toBeTruthy();
    expect(screen.queryByRole('header', { name: 'Worker mode' })).toBeNull();
  });

  test('a revoked grant with a stored Worker preference opens Client', async () => {
    await start({ session: user, capability: grant('revoked'), storedMode: { userId: 'user-a', mode: 'worker' } });
    expect(await heading('Client mode')).toBeTruthy();
  });

  test("another account's stored preference is ignored", async () => {
    await start({ session: user, capability: grant('active'), storedMode: { userId: 'user-b', mode: 'worker' } });
    expect(await heading('Client mode')).toBeTruthy();
  });

  test('an authorized account with a saved Worker preference opens Worker', async () => {
    await start({ session: user, capability: grant('active'), storedMode: { userId: 'user-a', mode: 'worker' } });
    expect(await heading('Worker mode')).toBeTruthy();
  });

  test('an authenticated account cannot reach the sign-in routes', async () => {
    await start({ session: user, capability: grant('none') }, '/phone');
    expect(await heading('Client mode')).toBeTruthy();
  });
});

describe('mode switch and sign-out', () => {
  test('a dual-capability account switches modes without another login', async () => {
    const fake = await start({ session: user, capability: grant('active') });
    expect(await heading('Client mode')).toBeTruthy();
    await press('Switch to Worker mode');
    expect(await heading('Worker mode')).toBeTruthy();
    expect(fake.storedMode()).toEqual({ userId: 'user-a', mode: 'worker' });
    await press('Switch to Client mode');
    expect(await heading('Client mode')).toBeTruthy();
    expect(fake.calls.requestOtp).toHaveLength(0);
    expect(fake.calls.verifyOtp).toHaveLength(0);
  });

  test('a grant revoked before the switch is answered keeps the account in Client', async () => {
    let answers = 0;
    await start({ session: user, capability: async () => grant(answers++ === 0 ? 'active' : 'revoked') });
    expect(await heading('Client mode')).toBeTruthy();
    await press('Switch to Worker mode');
    expect(await screen.findByText('Worker mode is not available for this account.')).toBeTruthy();
    expect(screen.queryByRole('header', { name: 'Worker mode' })).toBeNull();
  });

  test('a failed re-check never promotes the account to Worker', async () => {
    let answers = 0;
    await start({ session: user, capability: async () => (answers++ === 0 ? grant('active') : { kind: 'error', reason: 'unavailable' }) });
    expect(await heading('Client mode')).toBeTruthy();
    await press('Switch to Worker mode');
    expect(await screen.findByText('Worker access could not be verified, so Client mode is shown.')).toBeTruthy();
    expect(screen.queryByRole('header', { name: 'Worker mode' })).toBeNull();
  });

  test('sign-out returns to the guest shell and clears the stored preference', async () => {
    const fake = await start({ session: user, capability: grant('active'), storedMode: { userId: 'user-a', mode: 'worker' } });
    expect(await heading('Worker mode')).toBeTruthy();
    await press('Sign out');
    expect(await heading('NestScout')).toBeTruthy();
    expect(fake.calls.signOut).toBe(1);
    await waitFor(() => expect(fake.storedMode()).toBeNull());
    expect(screen.queryByRole('header', { name: 'Worker mode' })).toBeNull();
  });

  test('a sign-out that cannot remove the session keeps the account signed in and can be retried', async () => {
    let attempts = 0;
    const fake = await start({
      session: user,
      capability: grant('none'),
      signOut: async () => (attempts++ === 0 ? { ok: false, failure: 'network' } : { ok: true, value: undefined }),
    });
    expect(await heading('Client mode')).toBeTruthy();
    await press('Sign out');
    expect(await screen.findByText('Could not sign out. Check your connection and try again.')).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Client mode' })).toBeTruthy();
    expect(screen.queryByRole('header', { name: 'NestScout' })).toBeNull();
    await press('Sign out');
    expect(await heading('NestScout')).toBeTruthy();
    expect(fake.calls.signOut).toBe(2);
  });

  test('a sign-out reported by the auth service closes the protected area', async () => {
    const fake = await start({ session: user, capability: grant('none') });
    expect(await heading('Client mode')).toBeTruthy();
    await act(async () => fake.emit({ type: 'signed_out' }));
    expect(await heading('NestScout')).toBeTruthy();
  });
});

describe('phone sign-in', () => {
  async function openPhoneEntry(options: FakeOptions = {}) {
    const fake = await start({ session: null, capability: grant('none'), ...options });
    await heading('NestScout');
    await press('Sign in with phone');
    expect(await heading('Sign in with your phone')).toBeTruthy();
    return fake;
  }

  test('rejects a malformed number without calling the auth service', async () => {
    const fake = await openPhoneEntry();
    await fireEvent.changeText(screen.getByLabelText('Mobile number'), '12345');
    await press('Send code');
    expect(await screen.findByText('This is not a valid Vietnamese mobile number.')).toBeTruthy();
    expect(fake.calls.requestOtp).toHaveLength(0);
  });

  test('requests the normalized number once, verifies the code and reaches Client', async () => {
    const fake = await openPhoneEntry();
    await fireEvent.changeText(screen.getByLabelText('Mobile number'), '0912 345 678');
    await press('Send code');
    expect(await heading('Enter the code')).toBeTruthy();
    expect(fake.calls.requestOtp).toEqual(['+84912345678']);
    expect(screen.getByText(/\+84 ••• ••• 678/)).toBeTruthy();
    expect(screen.queryByText(/912345678/)).toBeNull();

    await fireEvent.changeText(screen.getByLabelText('One-time code'), '111111');
    await press('Verify code');
    expect(await screen.findByText('The code is not correct. Check it and try again.')).toBeTruthy();
    expect(screen.queryByRole('header', { name: 'Client mode' })).toBeNull();

    await fireEvent.changeText(screen.getByLabelText('One-time code'), '654321');
    await press('Verify code');
    expect(await heading('Client mode')).toBeTruthy();
  });

  test('a second tap while the request is in flight sends nothing more', async () => {
    let finish: (outcome: { ok: true; value: undefined }) => void = () => undefined;
    const fake = await openPhoneEntry({ requestOtp: () => new Promise((resolve) => (finish = resolve)) });
    await fireEvent.changeText(screen.getByLabelText('Mobile number'), '0912345678');
    await press('Send code');
    await press('Send code');
    expect(fake.calls.requestOtp).toEqual(['+84912345678']);
    expect(screen.getByRole('button', { name: 'Send code' })).toBeDisabled();
    await act(async () => finish({ ok: true, value: undefined }));
    expect(await heading('Enter the code')).toBeTruthy();
    expect(fake.calls.requestOtp).toHaveLength(1);
  });

  test('incomplete codes are rejected locally', async () => {
    const fake = await openPhoneEntry();
    await fireEvent.changeText(screen.getByLabelText('Mobile number'), '0912345678');
    await press('Send code');
    await heading('Enter the code');
    await fireEvent.changeText(screen.getByLabelText('One-time code'), '12');
    await press('Verify code');
    expect(await screen.findByText('Enter all 6 digits.')).toBeTruthy();
    expect(fake.calls.verifyOtp).toHaveLength(0);
  });

  test('a network failure shows a retry message and signs nobody in', async () => {
    const fake = await openPhoneEntry({ requestOtp: async () => ({ ok: false, failure: 'network' }) });
    await fireEvent.changeText(screen.getByLabelText('Mobile number'), '0912345678');
    await press('Send code');
    expect(await screen.findByText('Could not reach the sign-in service. Check your connection and retry.')).toBeTruthy();
    expect(screen.queryByRole('header', { name: 'Enter the code' })).toBeNull();
    expect(fake.calls.verifyOtp).toHaveLength(0);
  });

  test('a server rate limit disables resend and is reported', async () => {
    await openPhoneEntry({ requestOtp: async () => ({ ok: false, failure: 'rate_limited' }) });
    await fireEvent.changeText(screen.getByLabelText('Mobile number'), '0912345678');
    await press('Send code');
    expect(await screen.findByText('Too many attempts. Wait a moment before trying again.')).toBeTruthy();
  });

  test('resend is throttled after a code was sent, and cancelling returns to number entry', async () => {
    const fake = await openPhoneEntry();
    await fireEvent.changeText(screen.getByLabelText('Mobile number'), '0912345678');
    await press('Send code');
    await heading('Enter the code');
    expect(screen.getByRole('button', { name: /Resend code in \d+s/ })).toBeDisabled();
    expect(fake.calls.requestOtp).toHaveLength(1);
    await press('Use a different number');
    expect(await heading('Sign in with your phone')).toBeTruthy();
  });

  test('the verification route without a pending code returns to number entry', async () => {
    await start({ session: null }, '/verify');
    expect(await heading('NestScout')).toBeTruthy();
  });

  test('guest sign-in intents: Client opens Client; Worker without a grant opens Client with a notice', async () => {
    await openPhoneEntry();
    await fireEvent.changeText(screen.getByLabelText('Mobile number'), '0912345678');
    await press('Send code');
    await heading('Enter the code');
    await fireEvent.changeText(screen.getByLabelText('One-time code'), '654321');
    await press('Verify code');
    expect(await heading('Client mode')).toBeTruthy();
  });
});

describe('guest protected action', () => {
  test('a guest draft returns after sign-in without submitting automatically', async () => {
    await start({ session: null, capability: grant('none') });
    await heading('NestScout');
    await fireEvent.changeText(screen.getByLabelText('Guest request draft'), 'A leaking tap');
    await press('Sign in with phone');
    await heading('Sign in with your phone');
    await fireEvent.changeText(screen.getByLabelText('Mobile number'), '0912345678');
    await press('Send code');
    await heading('Enter the code');
    await fireEvent.changeText(screen.getByLabelText('One-time code'), '654321');
    await press('Verify code');
    await heading('Client mode');
    expect(screen.getByLabelText('Service request').props.value).toBe('A leaking tap');
    expect(screen.queryByText('Request received. Refresh for its current status.')).toBeNull();
  });

  test('requesting the Worker area as a guest signs in, then lands in Client with a notice when ungranted', async () => {
    await start({ session: null, capability: grant('none') });
    await heading('NestScout');
    await press('Open Worker area');
    await heading('Sign in with your phone');
    await fireEvent.changeText(screen.getByLabelText('Mobile number'), '0912345678');
    await press('Send code');
    await heading('Enter the code');
    await fireEvent.changeText(screen.getByLabelText('One-time code'), '654321');
    await press('Verify code');
    expect(await heading('Client mode')).toBeTruthy();
    expect(screen.getByText('Worker mode is not available for this account.')).toBeTruthy();
  });

  test('requesting the Worker area as a guest opens Worker when the backend grant is active', async () => {
    await start({ session: null, capability: grant('active') });
    await heading('NestScout');
    await press('Open Worker area');
    await heading('Sign in with your phone');
    await fireEvent.changeText(screen.getByLabelText('Mobile number'), '0912345678');
    await press('Send code');
    await heading('Enter the code');
    await fireEvent.changeText(screen.getByLabelText('One-time code'), '654321');
    await press('Verify code');
    expect(await heading('Worker mode')).toBeTruthy();
  });
});


describe('Horizon guest entry', () => {
  test('guest opens Kael Home directly and can use the sidebar', async () => {
    await start({ session: null });
    expect(await screen.findByLabelText('Mở thanh bên')).toBeTruthy();
    expect(screen.getByLabelText('Kael đang sẵn sàng')).toBeTruthy();
    expect(screen.getByLabelText('Nhắn Kael')).toBeTruthy();
    expect(screen.queryByLabelText('NestScout Horizon, đang khởi động')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Mở thanh bên'));
    expect(await screen.findByText('Yêu cầu của tôi')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Đóng sidebar'));
    expect(screen.queryByText('Yêu cầu của tôi')).toBeNull();
  });

  test('one account card shows the guest mode and opens the account actions', async () => {
    await start({ session: null });
    await screen.findByLabelText('Mở thanh bên');
    await fireEvent.press(screen.getByLabelText('Mở thanh bên'));
    expect(screen.getByRole('button', { name: 'Tài khoản Khách, đang dùng: Khách' })).toBeTruthy();
    expect(screen.queryByText('Chế độ hoạt động')).toBeNull();
    await openAccount();
    expect(screen.getByRole('button', { name: 'Chuyển chế độ' })).toBeTruthy();
    expect(screen.getByText('Hồ sơ cá nhân trong Cài đặt chưa được kết nối.')).toBeTruthy();
    await press('Đóng bảng tài khoản');
    expect(await screen.findByRole('button', { name: 'Tài khoản Khách, đang dùng: Khách' })).toBeTruthy();
  });

  test('guest Worker selection requires phone sign-in and does not grant Worker access', async () => {
    await start({ session: null, capability: grant('none') });
    await screen.findByLabelText('Mở thanh bên');
    await fireEvent.press(screen.getByLabelText('Mở thanh bên'));
    await openModePicker();
    await fireEvent.press(screen.getByRole('radio', { name: 'Thợ' }));
    await heading('Sign in with your phone');
    await fireEvent.changeText(screen.getByLabelText('Mobile number'), '0912345678');
    await press('Send code');
    await heading('Enter the code');
    await fireEvent.changeText(screen.getByLabelText('One-time code'), '654321');
    await press('Verify code');
    expect(await screen.findByText('Không thể chuyển sang chế độ Thợ vì tài khoản chưa có quyền.')).toBeTruthy();
    expect(await heading('Client mode')).toBeTruthy();
    expect(screen.queryByRole('header', { name: 'Worker mode' })).toBeNull();
    expect(screen.getByText('Worker mode is not available for this account.')).toBeTruthy();
  });

  test('the explicit Worker sign-in preserves the guest chat text and selected photo', async () => {
    let finishPicking: ((result: ImagePicker.ImagePickerResult) => void) | undefined;
    jest.mocked(ImagePicker.launchImageLibraryAsync).mockImplementationOnce(() => new Promise(resolve => { finishPicking = resolve; }));
    await start({ session: null, capability: grant('active') });
    await screen.findByLabelText('Nhắn Kael');
    await fireEvent.press(screen.getByRole('button', { name: 'Đính kèm' }));
    await fireEvent.changeText(screen.getByLabelText('Nhắn Kael'), 'Nước bị rò rỉ');
    await act(async () => finishPicking?.({ canceled: false, assets: [{ uri: 'file:///draft-photo.png', width: 10, height: 10, type: 'image' }] }));
    expect(await screen.findByLabelText('Ảnh đã chọn')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Mở thanh bên'));
    await openModePicker();
    await fireEvent.press(screen.getByRole('radio', { name: 'Thợ' }));
    await heading('Sign in with your phone');
    await fireEvent.changeText(screen.getByLabelText('Mobile number'), '0912345678');
    await press('Send code');
    await heading('Enter the code');
    await fireEvent.changeText(screen.getByLabelText('One-time code'), '654321');
    await press('Verify code');
    await waitFor(() => expect(screen.getByLabelText('Nhắn Kael').props.value).toBe('Nước bị rò rỉ'));
    expect(screen.getByLabelText('Ảnh đã chọn')).toBeTruthy();
  });

  test('backing out of Worker sign-in keeps the guest draft without enabling transfer for a later sign-in', async () => {
    await start({ session: null, capability: grant('none') });
    await screen.findByLabelText('Nhắn Kael');
    await fireEvent.changeText(screen.getByLabelText('Nhắn Kael'), 'Bản nháp của khách');
    await fireEvent.press(screen.getByLabelText('Mở thanh bên'));
    await openModePicker();
    await fireEvent.press(screen.getByRole('radio', { name: 'Thợ' }));
    await heading('Sign in with your phone');
    await press('Back');
    await waitFor(() => expect(screen.getByLabelText('Nhắn Kael').props.value).toBe('Bản nháp của khách'));
    await fireEvent.press(screen.getByLabelText('Mở thanh bên'));
    await openAccountArea();
    await heading('NestScout');
    await press('Sign in with phone');
    await heading('Sign in with your phone');
    await fireEvent.changeText(screen.getByLabelText('Mobile number'), '0912345678');
    await press('Send code');
    await heading('Enter the code');
    await fireEvent.changeText(screen.getByLabelText('One-time code'), '654321');
    await press('Verify code');
    await waitFor(() => expect(screen.getByLabelText('Nhắn Kael').props.value).toBe(''));
  });
});


describe('Horizon authenticated role selection', () => {
  test('closing the mode picker leaves the current mode and draft untouched', async () => {
    const fake = await start({ session: user, capability: grant('active') });
    await screen.findByLabelText('Nhắn Kael');
    await fireEvent.changeText(screen.getByLabelText('Nhắn Kael'), 'Bản nháp chưa gửi');
    await fireEvent.press(screen.getByLabelText('Mở thanh bên'));
    const before = fake.calls.capability;
    await openModePicker();
    await fireEvent.press(screen.getByRole('button', { name: 'Đóng bảng chọn chế độ' }));
    expect(fake.calls.capability).toBe(before);
    expect(screen.getByRole('button', { name: /^Tài khoản .*đang dùng: Khách hàng/ })).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Đóng sidebar'));
    expect(screen.getByLabelText('Nhắn Kael').props.value).toBe('Bản nháp chưa gửi');
  });

  test('an unavailable permission check explains the failure and keeps the current mode', async () => {
    let failing = false;
    await start({ session: user, capability: async () => failing ? { kind: 'error', reason: 'unavailable' } : grant('active') });
    await screen.findByLabelText('Mở thanh bên');
    failing = true;
    await fireEvent.press(screen.getByLabelText('Mở thanh bên'));
    await openModePicker();
    await fireEvent.press(screen.getByRole('radio', { name: 'Thợ' }));
    expect(await screen.findByText('Chưa thể kiểm tra quyền sử dụng chế độ Thợ. Vui lòng thử lại.')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Khách hàng' }).props.accessibilityState.checked).toBe(true);
  });

  test('cancelling while permission is checked does not switch after a late response', async () => {
    let delayed = false;
    let finish: ((result: ReturnType<typeof grant>) => void) | undefined;
    await start({ session: user, capability: async () => delayed ? new Promise<ReturnType<typeof grant>>(resolve => { finish = resolve; }) : grant('active') });
    await screen.findByLabelText('Mở thanh bên');
    delayed = true;
    await fireEvent.press(screen.getByLabelText('Mở thanh bên'));
    await openModePicker();
    await fireEvent.press(screen.getByRole('radio', { name: 'Thợ' }));
    expect(await screen.findByText('Đang kiểm tra quyền sử dụng chế độ Thợ…')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Đóng bảng chọn chế độ' }));
    await act(async () => finish?.(grant('active')));
    expect(screen.getByRole('button', { name: /^Tài khoản .*đang dùng: Khách hàng/ })).toBeTruthy();
  });
  test.each(['none', 'revoked'] as const)('a %s Worker grant cannot open Worker from Horizon', async (worker) => {
    const fake = await start({ session: user, capability: grant(worker) });
    await screen.findByLabelText('Mở thanh bên');
    await fireEvent.press(screen.getByLabelText('Mở thanh bên'));
    await openModePicker();
    await fireEvent.press(screen.getByRole('radio', { name: 'Thợ' }));
    await waitFor(() => expect(fake.calls.capability).toBeGreaterThan(1));
    expect(await screen.findByText('Tài khoản này chưa có quyền sử dụng chế độ Thợ.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Đóng bảng chọn chế độ' }));
    await openAccountArea();
    expect(await heading('Client mode')).toBeTruthy();
    expect(screen.queryByRole('header', { name: 'Worker mode' })).toBeNull();
  });

  test('an active Worker grant is rechecked before Horizon opens the Worker area', async () => {
    const fake = await start({ session: user, capability: grant('active') });
    await screen.findByLabelText('Mở thanh bên');
    await fireEvent.press(screen.getByLabelText('Mở thanh bên'));
    await openModePicker();
    await fireEvent.press(screen.getByRole('radio', { name: 'Thợ' }));
    await waitFor(() => expect(fake.storedMode()).toEqual({ userId: 'user-a', mode: 'worker' }));
    await openAccountArea();
    expect(await heading('Worker mode')).toBeTruthy();
  });

  test('switching in both directions preserves the signed-in text and selected photo', async () => {
    jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///same-account.png', width: 10, height: 10, type: 'image' }] });
    const fake = await start({ session: user, capability: grant('active') });
    await screen.findByLabelText('Nhắn Kael');
    await fireEvent.changeText(screen.getByLabelText('Nhắn Kael'), 'Nội dung chưa gửi');
    await fireEvent.press(screen.getByRole('button', { name: 'Đính kèm' }));
    expect(await screen.findByLabelText('Ảnh đã chọn')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Mở thanh bên'));
    await openModePicker();
    await fireEvent.press(screen.getByRole('radio', { name: 'Thợ' }));
    await waitFor(() => expect(fake.storedMode()).toEqual({ userId: 'user-a', mode: 'worker' }));
    await fireEvent.press(screen.getByLabelText('Đóng sidebar'));
    expect(screen.getByLabelText('Nhắn Kael').props.value).toBe('Nội dung chưa gửi');
    expect(screen.getByLabelText('Ảnh đã chọn')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Mở thanh bên'));
    await openModePicker();
    await fireEvent.press(screen.getByRole('radio', { name: 'Khách hàng' }));
    await waitFor(() => expect(fake.storedMode()).toEqual({ userId: 'user-a', mode: 'client' }));
    await fireEvent.press(screen.getByLabelText('Đóng sidebar'));
    expect(screen.getByLabelText('Nhắn Kael').props.value).toBe('Nội dung chưa gửi');
    expect(screen.getByLabelText('Ảnh đã chọn')).toBeTruthy();
  });

  test('a protected draft is hidden while identity is unverified and returns after a successful recheck', async () => {
    let valid = true;
    await start({ session: user, capability: async () => valid ? grant('active') : { kind: 'unauthenticated' }, verifyIdentity: async () => valid ? { status: 'valid', identity: user } : { status: 'unreachable' } });
    await screen.findByLabelText('Nhắn Kael');
    await fireEvent.changeText(screen.getByLabelText('Nhắn Kael'), 'Bản nháp riêng tư');
    valid = false;
    await fireEvent.press(screen.getByLabelText('Mở thanh bên'));
    await openModePicker();
    await fireEvent.press(screen.getByRole('radio', { name: 'Thợ' }));
    expect(await screen.findByText('Không thể mở bản nháp')).toBeTruthy();
    expect(screen.queryByLabelText('Nhắn Kael')).toBeNull();
    valid = true;
    await fireEvent.press(screen.getByRole('button', { name: 'Thử xác minh lại' }));
    await waitFor(() => expect(screen.getByLabelText('Nhắn Kael').props.value).toBe('Bản nháp riêng tư'));
  });
});


test('Horizon conversation state is cleared when the account changes', async () => {
  await start({ session: null, capability: grant('none') });
  await screen.findByLabelText('Mở thanh bên');
  await fireEvent.changeText(screen.getByLabelText('Nhắn Kael'), 'Private guest message');
  await fireEvent.press(screen.getByLabelText('Gửi'));
  expect(await screen.findByText('Kael chưa được kết nối. Tin nhắn của bạn chưa được gửi.')).toBeTruthy();
  expect(screen.getByLabelText('Nhắn Kael').props.value).toBe('Private guest message');
  await fireEvent.press(screen.getByLabelText('Mở thanh bên'));
  await openAccountArea();
  await heading('NestScout');
  await press('Sign in with phone');
  await heading('Sign in with your phone');
  await fireEvent.changeText(screen.getByLabelText('Mobile number'), '0912345678');
  await press('Send code');
  await heading('Enter the code');
  await fireEvent.changeText(screen.getByLabelText('One-time code'), '654321');
  await press('Verify code');
  await screen.findByLabelText('Mở thanh bên');
  await screen.findByLabelText('Mở thanh bên');
  expect(screen.getByLabelText('Nhắn Kael').props.value).toBe('');
});
