import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { deviceStorage } from '@/lib/device-storage';

import { proposeScope, type Job } from './worker-repository';
import { ScopeProposal } from './scope-proposal';

jest.mock('expo-crypto', () => ({ randomUUID: () => '00000000-0000-4000-8000-000000000123' }));
jest.mock('@/lib/device-storage', () => ({ deviceStorage: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() } }));
jest.mock('./worker-repository', () => ({ proposeScope: jest.fn() }));

const job: Job = { job_id: 'job', stage: 'working', version: 4, scope: 'Old fixture', amount_minor: 100, currency: 'VND' };

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(deviceStorage.getItem).mockResolvedValue(null);
  jest.mocked(deviceStorage.setItem).mockResolvedValue();
  jest.mocked(deviceStorage.removeItem).mockResolvedValue();
});

test('a blank amount is not interpreted as zero', async () => {
  await render(<ScopeProposal userId="worker-a" job={job} hasPending={false} onRefresh={() => undefined} />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Propose scope change' })).toBeEnabled());
  await fireEvent.changeText(screen.getByLabelText('Proposed scope'), 'New fixture scope');
  await fireEvent.changeText(screen.getByLabelText('Reason for change'), 'Fixture reason');
  await fireEvent.press(screen.getByRole('button', { name: 'Propose scope change' }));
  await screen.findByText('Enter scope, a whole VND amount and the reason.');
  expect(proposeScope).not.toHaveBeenCalled();
});

test('uncertain proposal retries the same fixture terms and key', async () => {
  jest.mocked(proposeScope).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce();
  await render(<ScopeProposal userId="worker-a" job={job} hasPending={false} onRefresh={() => undefined} />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Propose scope change' })).toBeEnabled());
  await fireEvent.changeText(screen.getByLabelText('Proposed scope'), 'New fixture scope');
  await fireEvent.changeText(screen.getByLabelText('Proposed total VND'), '150');
  await fireEvent.changeText(screen.getByLabelText('Reason for change'), 'Fixture reason');
  await fireEvent.press(screen.getByRole('button', { name: 'Propose scope change' }));
  await screen.findByText('Proposal was not confirmed. Retry the same terms or refresh the job.');
  await fireEvent.press(screen.getByRole('button', { name: 'Retry scope proposal' }));
  await screen.findByText('Fixture proposal recorded. Refresh to see the current Customer decision.');
  expect(proposeScope).toHaveBeenNthCalledWith(1, 'worker-a', 'job', 4, '00000000-0000-4000-8000-000000000123', 'New fixture scope', 150, 'Fixture reason', expect.anything());
  expect(proposeScope).toHaveBeenNthCalledWith(2, 'worker-a', 'job', 4, '00000000-0000-4000-8000-000000000123', 'New fixture scope', 150, 'Fixture reason', expect.anything());
});
