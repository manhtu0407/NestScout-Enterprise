import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { DeveloperPilotPanel, developerPilotEnabled } from './developer-pilot-panel';
import { Platform } from 'react-native';

const mockSignIn = jest.fn();
const mockRpc = jest.fn();
const mockRuns = jest.fn();
const mockAccess = { phase: 'guest', identity: 'verified', userId: null as string | null, signOut: jest.fn() };
jest.mock('@/features/access', () => ({ useAccess: () => mockAccess }));
jest.mock('@/lib/config', () => ({ loadConfig: () => ({ supabaseUrl: 'http://127.0.0.1:23624' }) }));
jest.mock('@/lib/supabase-client', () => ({ getSupabaseClient: () => ({
  auth: { signInWithPassword: mockSignIn }, rpc: mockRpc,
  from: mockRuns,
}) }));

beforeEach(() => {
  jest.clearAllMocks();
  mockAccess.phase = 'guest';
  mockAccess.userId = null;
  mockSignIn.mockResolvedValue({ error: null });
  mockRpc.mockResolvedValue({ data: { budgets: [], calls: [], tools: [] }, error: null });
  mockRuns.mockReturnValue({ select: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }) }) });
});

test('pilot stays unavailable without its explicit web preview flag', () => {
  expect(developerPilotEnabled()).toBe(false);
});

test('actual pilot gate requires development web, an explicit flag and the exact loopback 8085 origin', () => {
  const dev = Object.getOwnPropertyDescriptor(globalThis, '__DEV__');
  const savedWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const flag = process.env.EXPO_PUBLIC_KAEL_DEVELOPER_PILOT;
  const os = jest.replaceProperty(Platform, 'OS', 'web');
  try {
    Object.defineProperty(globalThis, '__DEV__', { configurable: true, value: true });
    process.env.EXPO_PUBLIC_KAEL_DEVELOPER_PILOT = '1';
    for (const [origin, enabled] of [['http://localhost:8085', true], ['http://127.0.0.1:8085', true],
      ['http://localhost:8086', false], ['https://hosted.example', false], ['http://localhost:8085.evil', false]] as const) {
      Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { origin } } });
      expect(developerPilotEnabled()).toBe(enabled);
    }
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { origin: 'http://localhost:8085' } } });
    Object.defineProperty(globalThis, '__DEV__', { configurable: true, value: false });
    expect(developerPilotEnabled()).toBe(false);
    Object.defineProperty(globalThis, '__DEV__', { configurable: true, value: true });
    os.replaceValue('ios');
    expect(developerPilotEnabled()).toBe(false);
    os.replaceValue('web');
    delete process.env.EXPO_PUBLIC_KAEL_DEVELOPER_PILOT;
    expect(developerPilotEnabled()).toBe(false);
  } finally {
    os.restore();
    if (dev) Object.defineProperty(globalThis, '__DEV__', dev);
    if (savedWindow) Object.defineProperty(globalThis, 'window', savedWindow);
    else Reflect.deleteProperty(globalThis, 'window');
    if (flag === undefined) delete process.env.EXPO_PUBLIC_KAEL_DEVELOPER_PILOT;
    else process.env.EXPO_PUBLIC_KAEL_DEVELOPER_PILOT = flag;
  }
});

test('local login uses real Auth SDK credentials without synthesizing an app identity', async () => {
  await render(<DeveloperPilotPanel />);
  await fireEvent.press(screen.getByLabelText('Thông tin pilot local'));
  await fireEvent.changeText(screen.getByLabelText('Email local'), ' qa@example.invalid ');
  await fireEvent.changeText(screen.getByLabelText('Mật khẩu local'), 'disposable-local-password');
  await fireEvent.press(screen.getByText('Đăng nhập local'));
  await waitFor(() => expect(mockSignIn).toHaveBeenCalledWith({ email: 'qa@example.invalid', password: 'disposable-local-password' }));
  expect(screen.getByText('Đã đăng nhập Supabase Auth local.')).toBeTruthy();
  expect(screen.getByLabelText('Mật khẩu local').props.value).toBe('');
  expect(mockAccess.phase).toBe('guest');
  expect(mockRpc).not.toHaveBeenCalled();
});

test('Auth refusal remains visible and does not invent successful identity', async () => {
  mockSignIn.mockResolvedValue({ error: { message: 'invalid' } });
  await render(<DeveloperPilotPanel />);
  await fireEvent.press(screen.getByLabelText('Thông tin pilot local'));
  await fireEvent.changeText(screen.getByLabelText('Email local'), 'qa@example.invalid');
  await fireEvent.changeText(screen.getByLabelText('Mật khẩu local'), 'wrong');
  await fireEvent.press(screen.getByText('Đăng nhập local'));
  await waitFor(() => expect(screen.getByText('Đăng nhập local không thành công.')).toBeTruthy());
  expect(mockRpc).not.toHaveBeenCalled();
});

test('verified session reads owner-scoped status and reports no paid results truthfully', async () => {
  mockAccess.phase = 'client';
  mockAccess.userId = 'local-qa-user';
  await render(<DeveloperPilotPanel />);
  await fireEvent.press(screen.getByLabelText('Thông tin pilot local'));
  await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('kael_pilot_status'));
  expect(screen.getByText(/LIVE_PROVIDER_NOT_RUN/)).toBeTruthy();
  expect(screen.getByText(/IMAGE_NOT_CONNECTED/)).toBeTruthy();
  expect(mockSignIn).not.toHaveBeenCalled();
});
