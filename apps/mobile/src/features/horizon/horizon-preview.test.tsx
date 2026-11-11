import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { HorizonPreview } from './horizon-preview';
import { kaelIntroSession } from './kael-intro-session';
import { guestSendNotice } from './service-entry';

jest.mock('react-native-safe-area-context', () => jest.requireActual<{ default: object }>('react-native-safe-area-context/jest/mock').default);
jest.mock('@/lib/supabase-client', () => ({ getSupabaseClient: () => { throw new Error('the preview must not reach Supabase'); } }));
jest.mock('expo/fetch', () => ({ fetch: jest.fn(() => { throw new Error('the preview must not call the network'); }) }));

jest.setTimeout(20000);

const plumbingOpening = 'Kael ơi, mình đang gặp vấn đề về nước ở nhà. Bạn giúp mình nhé.';
let storedRole: string | null = null;
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');

beforeEach(() => {
  jest.useFakeTimers();
  kaelIntroSession.markPlayed();
  storedRole = null;
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: { getItem: () => storedRole, setItem: (_key: string, value: string) => { storedRole = value; } } });
});

afterEach(() => {
  jest.useRealTimers();
  if (originalStorage) Object.defineProperty(globalThis, 'sessionStorage', originalStorage);
  else Reflect.deleteProperty(globalThis, 'sessionStorage');
});

async function openPreview() {
  await render(<HorizonPreview/>);
  await act(async () => { jest.advanceTimersByTime(5000); });
}

async function chooseService(title: string) {
  await act(async () => { fireEvent.press(screen.getByLabelText('Mở thanh bên')); });
  await act(async () => { jest.advanceTimersByTime(5000); });
  await act(async () => { fireEvent.press(screen.getByLabelText(title)); });
}

const composer = () => screen.getByPlaceholderText('Nhắn Kael...');

test('the preview is labelled as a demo and a service tile only prefills the composer', async () => {
  storedRole = 'client';
  await openPreview();
  expect(screen.getByText('DEMO · không kết nối Kael thật')).toBeTruthy();
  await chooseService('Sửa nước');
  expect(composer().props.value).toBe(plumbingOpening);
  expect(screen.queryByText(/Bản mô phỏng giao diện/)).toBeNull();
  expect(screen.queryByLabelText('Xem lại yêu cầu')).toBeNull();
});

test('sending in the preview shows a demo-labelled reply with short choices', async () => {
  storedRole = 'client';
  await openPreview();
  await chooseService('Sửa nước');
  await act(async () => { fireEvent.press(screen.getByLabelText('Gửi')); });
  expect(screen.getByText(plumbingOpening)).toBeTruthy();
  expect(screen.getAllByText(/Bản mô phỏng giao diện/).length).toBeGreaterThan(0);
  expect(composer().props.value).toBe('');
});

test('a guest keeps the prefilled draft and is told to sign in before sending', async () => {
  await openPreview();
  await chooseService('Sửa điện');
  await act(async () => { fireEvent.press(screen.getByLabelText('Gửi')); });
  expect(screen.getByText(guestSendNotice)).toBeTruthy();
  expect(composer().props.value).toBe('Kael ơi, mình đang gặp vấn đề về điện ở nhà. Bạn giúp mình nhé.');
});
