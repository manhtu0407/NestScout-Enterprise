import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { readOperatorAccess } from '@/features/shared';

import { AccountScreen } from './account-screen';
import { AccountSection } from './account-section';

const mockPush = jest.fn();
let mockIdentity: { identity: string; userId?: string; phase: string } = { identity: 'verified', userId: 'operator-1', phase: 'client' };

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@/features/access', () => ({
  ...jest.requireActual('@/features/access'),
  useAccess: () => ({ ...mockIdentity, setIntent: jest.fn(), signOut: jest.fn() }),
}));
jest.mock('./use-customer-data', () => ({ useCustomerData: () => ({ data: { profile: null, avatar: null } }) }));
jest.mock('@/features/shared', () => ({ ...jest.requireActual('@/features/shared'), readOperatorAccess: jest.fn() }));

const handlers = { onBack: jest.fn(), onSignIn: jest.fn(), onChangeMode: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  mockIdentity = { identity: 'verified', userId: 'operator-1', phase: 'client' };
});

test('an operator sees a persistent entry with the number of waiting cases', async () => {
  const onOpenOperator = jest.fn();
  await render(<AccountScreen mode="client" operatorCases={3} onOpenOperator={onOpenOperator} {...handlers} />);
  expect(screen.getByText('Xử lý sự cố')).toBeTruthy();
  expect(screen.getByText('3 sự cố đang chờ')).toBeTruthy();
  await fireEvent.press(screen.getByText('Xử lý sự cố'));
  expect(onOpenOperator).toHaveBeenCalledTimes(1);
});

test('an operator with an empty queue still sees the entry', async () => {
  await render(<AccountScreen mode="worker" operatorCases={0} onOpenOperator={jest.fn()} {...handlers} />);
  expect(screen.getByText('Không có sự cố nào đang chờ')).toBeTruthy();
});

test.each([[null], [undefined]])('an account without operator access shows no entry (%s)', async operatorCases => {
  await render(<AccountScreen mode="client" operatorCases={operatorCases} onOpenOperator={jest.fn()} {...handlers} />);
  expect(screen.queryByText('Xử lý sự cố')).toBeNull();
});

test('the section reads operator access and opens the queue from the entry', async () => {
  jest.mocked(readOperatorAccess).mockResolvedValue({ expiresAt: '2026-12-13T09:00:00.000Z', openCases: 2 });
  await render(<AccountSection onBack={jest.fn()} />);
  expect(await screen.findByText('2 sự cố đang chờ')).toBeTruthy();
  expect(readOperatorAccess).toHaveBeenCalledWith('operator-1', expect.any(AbortSignal));
  await fireEvent.press(screen.getByText('Xử lý sự cố'));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/section', params: { id: 'operator-escalations' } });
});

test('an ordinary account is not offered the queue', async () => {
  jest.mocked(readOperatorAccess).mockResolvedValue(null);
  await render(<AccountSection onBack={jest.fn()} />);
  await waitFor(() => expect(readOperatorAccess).toHaveBeenCalled());
  expect(screen.queryByText('Xử lý sự cố')).toBeNull();
});

test('a failed access check hides the entry instead of guessing', async () => {
  jest.mocked(readOperatorAccess).mockRejectedValue(new Error('offline'));
  await render(<AccountSection onBack={jest.fn()} />);
  await waitFor(() => expect(readOperatorAccess).toHaveBeenCalled());
  expect(screen.queryByText('Xử lý sự cố')).toBeNull();
});

test('a guest session never probes operator access', async () => {
  mockIdentity = { identity: 'guest', phase: 'guest' };
  await render(<AccountSection onBack={jest.fn()} />);
  expect(readOperatorAccess).not.toHaveBeenCalled();
});
