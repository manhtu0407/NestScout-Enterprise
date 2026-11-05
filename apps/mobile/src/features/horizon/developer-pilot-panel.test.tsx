import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { DeveloperPilotPanel, developerPilotEnabled } from './developer-pilot-panel';

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
