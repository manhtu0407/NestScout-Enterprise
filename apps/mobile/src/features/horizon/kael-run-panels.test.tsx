import { fireEvent, render, screen } from '@testing-library/react-native';

import { KaelApprovalCard, KaelTaskList } from './kael-run-panels';

const approval = {
  id: '66666666-6666-4666-8666-666666666666',
  task_id: '55555555-5555-4555-8555-555555555555',
  tool: 'service_request_submit',
  summary: 'Gửi yêu cầu dịch vụ',
  details: { 'Mô tả': 'Máy lạnh rò nước', 'Địa điểm': 'Quận 3' },
  fingerprint: 'a'.repeat(64),
  expires_at: '2026-11-03T04:00:00Z',
};

test('the approval card shows exactly what will be submitted and lets the user decline', async () => {
  const onDecide = jest.fn();
  await render(<KaelApprovalCard approval={approval} disabled={false} onDecide={onDecide}/>);
  expect(screen.getByText('Máy lạnh rò nước')).toBeTruthy();
  expect(screen.getByText('Quận 3')).toBeTruthy();
  expect(screen.getByText('Chưa có gì được gửi cho đến khi bạn xác nhận.')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Không thực hiện'));
  expect(onDecide).toHaveBeenCalledWith(approval, false);
});

test('task rows name each task and its real status', async () => {
  await render(<KaelTaskList tasks={[
    { id: '1', title: 'Sửa máy lạnh', kind: 'service_request', status: 'waiting_for_input', version: 2, summary: '' },
    { id: '2', title: 'Soạn tin nhắn', kind: 'writing', status: 'paused', version: 1, summary: '' },
  ]}/>);
  expect(screen.getByLabelText('Sửa máy lạnh: Cần thêm thông tin')).toBeTruthy();
  expect(screen.getByLabelText('Soạn tin nhắn: Tạm dừng')).toBeTruthy();
});
