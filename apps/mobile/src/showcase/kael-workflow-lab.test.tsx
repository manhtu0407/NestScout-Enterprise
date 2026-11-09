import { AccessibilityInfo } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { KaelWorkflowLab } from './kael-workflow-lab';

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);

beforeEach(() => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('the lab opens on the approval card and lists exactly the three new designs plus the in-chat view', async () => {
  await render(<KaelWorkflowLab />);
  for (const name of ['Approval Card', 'Recommendation Card', 'Selection Actions', 'Trong chat']) expect(screen.getAllByText(name).length).toBeGreaterThan(0);
  expect(screen.getByText('Thợ cần đến khu vực nào?')).toBeTruthy();
});

test('every tab renders without an error', async () => {
  await render(<KaelWorkflowLab />);
  await fireEvent.press(screen.getByRole('tab', { name: 'Recommendation Card' }));
  expect(screen.getByText('Vệ sinh và kiểm tra gas')).toBeTruthy();
  await fireEvent.press(screen.getByRole('tab', { name: 'Selection Actions' }));
  expect(screen.getByLabelText('Đoạn văn có thể bôi đen')).toBeTruthy();
  await fireEvent.press(screen.getByRole('tab', { name: 'Trong chat' }));
  expect(screen.getByText('Thợ cần đến khu vực nào?')).toBeTruthy();
  expect(screen.getByText('Vệ sinh và kiểm tra gas')).toBeTruthy();
});

test('reset returns the approval card to its first step', async () => {
  await render(<KaelWorkflowLab />);
  await fireEvent.press(screen.getByRole('radio', { name: 'Quận 7' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Tiếp tục' }));
  expect(screen.getByText('Bạn muốn thợ đến vào ngày nào?')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Đặt lại' }));
  expect(screen.getByText('Thợ cần đến khu vực nào?')).toBeTruthy();
});
