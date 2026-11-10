import { renderHook } from '@testing-library/react-native';

import { consumeKaelHandoff } from './kael-handoff';
import { useAskKael } from './horizon-sections';

const mockRouter = { dismissTo: jest.fn(), back: jest.fn(), replace: jest.fn(), push: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => ({}) }));

beforeEach(() => {
  jest.clearAllMocks();
  consumeKaelHandoff();
});

test('asking Kael unwinds explicitly to the Kael home however deep the screen is', async () => {
  const { result } = await renderHook(() => useAskKael());
  result.current('Báo giá này gồm những gì?');
  expect(mockRouter.dismissTo).toHaveBeenCalledWith('/');
  expect(mockRouter.back).not.toHaveBeenCalled();
  expect(consumeKaelHandoff()).toBe('Báo giá này gồm những gì?');
});

test('a second question replaces an unread one and still leads to the Kael home', async () => {
  const { result } = await renderHook(() => useAskKael());
  result.current('Câu hỏi thứ nhất');
  result.current('Câu hỏi thứ hai');
  expect(mockRouter.dismissTo).toHaveBeenCalledTimes(2);
  expect(consumeKaelHandoff()).toBe('Câu hỏi thứ hai');
  expect(consumeKaelHandoff()).toBeNull();
});
