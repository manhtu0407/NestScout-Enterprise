import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { WorkflowError } from '@/features/shared';
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

test('an unreadable proposal draft can be re-read without losing the saved retry key', async () => {
  const saved = JSON.stringify({ key: '00000000-0000-4000-8000-000000000456', version: 4, scope: 'New fixture scope', amount: 150, rationale: 'Fixture reason' });
  jest.mocked(deviceStorage.getItem).mockRejectedValueOnce(new Error('locked')).mockResolvedValue(saved);
  await render(<ScopeProposal userId="worker-a" job={job} hasPending={false} onRefresh={() => undefined} />);
  await screen.findByText('Could not read the pending scope proposal on this device.');
  expect(screen.getByRole('button', { name: 'Propose scope change' })).toBeDisabled();
  await fireEvent.press(screen.getByRole('button', { name: 'Retry reading saved draft' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Retry scope proposal' })).toBeEnabled());
  expect(screen.getByLabelText('Proposed scope').props.value).toBe('New fixture scope');
  expect(screen.getByLabelText('Proposed total VND').props.value).toBe('150');
  expect(deviceStorage.removeItem).not.toHaveBeenCalled();
});

test('a corrupt proposal draft is removed only after an explicit discard', async () => {
  jest.mocked(deviceStorage.getItem).mockResolvedValue('{not json');
  await render(<ScopeProposal userId="worker-a" job={job} hasPending={false} onRefresh={() => undefined} />);
  await screen.findByText('Could not read the pending scope proposal on this device.');
  expect(deviceStorage.removeItem).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Discard saved draft' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Propose scope change' })).toBeEnabled());
  expect(deviceStorage.removeItem).toHaveBeenCalledTimes(1);
});

test('a definitive refusal releases the proposal key and keeps the typed terms', async () => {
  jest.mocked(proposeScope).mockRejectedValueOnce(new WorkflowError('stale'));
  await render(<ScopeProposal userId="worker-a" job={job} hasPending={false} onRefresh={() => undefined} />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Propose scope change' })).toBeEnabled());
  await fireEvent.changeText(screen.getByLabelText('Proposed scope'), 'New fixture scope');
  await fireEvent.changeText(screen.getByLabelText('Proposed total VND'), '150');
  await fireEvent.changeText(screen.getByLabelText('Reason for change'), 'Fixture reason');
  await fireEvent.press(screen.getByRole('button', { name: 'Propose scope change' }));
  await screen.findByText(/changed after it was loaded/);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Propose scope change' })).toBeEnabled());
  expect(deviceStorage.removeItem).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText('Proposed scope').props.value).toBe('New fixture scope');
});

const savedProposal = JSON.stringify({ key: '00000000-0000-4000-8000-000000000456', version: 4, scope: 'First job scope', amount: 150, rationale: 'First job reason' });
const switches = [
  ['job', 'worker-a', { ...job, job_id: 'other-job' }],
  ['account', 'worker-b', job],
] as const;

test.each(switches)('a draft read that settles after the %s changed is discarded', async (_label, userId, next) => {
  let settle: (raw: string | null) => void = () => undefined;
  jest.mocked(deviceStorage.getItem).mockImplementationOnce(() => new Promise<string | null>((resolve) => { settle = resolve; })).mockResolvedValue(null);
  const view = await render(<ScopeProposal userId="worker-a" job={job} hasPending={false} onRefresh={() => undefined} />);
  await view.rerender(<ScopeProposal userId={userId} job={next} hasPending={false} onRefresh={() => undefined} />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Propose scope change' })).toBeEnabled());
  await act(async () => settle(savedProposal));
  expect(screen.getByRole('button', { name: 'Propose scope change' })).toBeEnabled();
  expect(screen.getByLabelText('Proposed scope').props.value).toBe('');
});

test.each(switches)('the draft of the previous %s does not carry over', async (_label, userId, next) => {
  jest.mocked(deviceStorage.getItem).mockImplementation(async (key: string) => (key === 'nestscout.scope-proposal.worker-a.job' ? savedProposal : null));
  const view = await render(<ScopeProposal userId="worker-a" job={job} hasPending={false} onRefresh={() => undefined} />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Retry scope proposal' })).toBeEnabled());
  expect(screen.getByLabelText('Proposed scope').props.value).toBe('First job scope');
  await view.rerender(<ScopeProposal userId={userId} job={next} hasPending={false} onRefresh={() => undefined} />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Propose scope change' })).toBeEnabled());
  expect(screen.getByLabelText('Proposed scope').props.value).toBe('');
  expect(screen.getByLabelText('Proposed total VND').props.value).toBe('');
});

test('a locked form cannot be edited or submitted until it is unlocked', async () => {
  const view = await render(<ScopeProposal userId="worker-a" job={job} hasPending={false} onRefresh={() => undefined} />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Propose scope change' })).toBeEnabled());
  await fireEvent.changeText(screen.getByLabelText('Proposed scope'), 'New fixture scope');
  await view.rerender(<ScopeProposal userId="worker-a" job={job} hasPending={false} locked onRefresh={() => undefined} />);
  expect(screen.getByRole('button', { name: 'Propose scope change' })).toBeDisabled();
  expect(screen.getByLabelText('Proposed scope').props.editable).toBe(false);
  await fireEvent.press(screen.getByRole('button', { name: 'Propose scope change' }));
  expect(proposeScope).not.toHaveBeenCalled();
  await view.rerender(<ScopeProposal userId="worker-a" job={job} hasPending={false} onRefresh={() => undefined} />);
  expect(screen.getByRole('button', { name: 'Propose scope change' })).toBeEnabled();
  expect(screen.getByLabelText('Proposed scope').props.value).toBe('New fixture scope');
});
