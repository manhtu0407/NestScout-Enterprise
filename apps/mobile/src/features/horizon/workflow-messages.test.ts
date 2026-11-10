import { WorkflowError } from '@/features/shared';

import { uncertainMessage, workflowMessage } from './workflow-messages';

test('each definitive failure has its own message', () => {
  const messages = (['forbidden', 'stale', 'expired', 'unavailable', 'invalid', 'rejected'] as const).map(failure => workflowMessage(new WorkflowError(failure)));
  expect(new Set(messages).size).toBe(messages.length);
  expect(messages.every(message => message !== uncertainMessage)).toBe(true);
});

test('unknown failures and foreign errors read as uncertain', () => {
  expect(workflowMessage(new WorkflowError('unknown'))).toBe(uncertainMessage);
  expect(workflowMessage(new Error('network'))).toBe(uncertainMessage);
  expect(workflowMessage(undefined)).toBe(uncertainMessage);
});
