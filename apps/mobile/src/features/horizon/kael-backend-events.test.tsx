import { act, renderHook, waitFor } from '@testing-library/react-native';

import { readKaelStream } from '@/features/shared/kael-runtime-repository';
import type { KaelConversationSnapshot } from '@/features/shared';
import { localGatewayEvents } from '@/testing/kael-local-events';

import { deriveKaelAttention } from './kael-attention';
import { useKaelConversation } from './use-kael-conversation';

jest.mock('expo/fetch', () => ({ fetch: jest.fn() }));

const empty: KaelConversationSnapshot = { conversationId: null, busy: false, messages: [], tasks: [], approvals: [] };
const loader = async () => empty;
const now = Date.parse(localGatewayEvents.approval.find(event => event.type === 'approval_required')!.approval.expires_at) - 60000;

function recordedStream(events: readonly unknown[], pauseAfter = -1) {
  let release = () => {};
  const barrier = new Promise<void>(resolve => { release = resolve; });
  const streamer: Parameters<typeof useKaelConversation>[2] = async (_user, _request, onEvent, signal) => {
    let index = 0;
    return readKaelStream({
      read: async () => {
        if (index === pauseAfter) await barrier;
        return index < events.length
          ? { done: false, value: new TextEncoder().encode(JSON.stringify(events[index++]) + '\n') }
          : { done: true };
      },
      cancel: async () => {},
    }, onEvent, signal);
  };
  return { streamer, release };
}

beforeEach(() => { jest.spyOn(Date, 'now').mockReturnValue(now); });
afterEach(() => { jest.restoreAllMocks(); });

test('captured real local gateway bytes drive activity, task progress and the confirmation attention banner', async () => {
  const paused = localGatewayEvents.approval.findIndex(event => event.type === 'tool_started') + 1;
  const replay = recordedStream(localGatewayEvents.approval, paused);
  const { result } = await renderHook(() => useKaelConversation('synthetic-local-account', 'client', replay.streamer, loader));
  await act(async () => { result.current.send('Prepare the captured synthetic request'); });
  await waitFor(() => expect(result.current.activity).toBe(localGatewayEvents.approval.find(event => event.type === 'tool_started')!.label));
  expect(result.current.running).toBe(true);
  await act(async () => { replay.release(); });
  await waitFor(() => expect(result.current.running).toBe(false));
  expect(result.current.tasks.at(-1)?.status).toBe('waiting_for_approval');
  expect(result.current.approvals[0]?.kind).toBe('confirm');
  expect(result.current.receipt).toBeNull();
  expect(deriveKaelAttention({ ...result.current, dismissedReceipt: null, now })?.kind).toBe('confirm');
});

test.each(['uncertain', 'submitted', 'reconciled'] as const)('captured %s outcome controls reconciliation and receipts from verified tool events', async name => {
  const replay = recordedStream(localGatewayEvents[name]);
  const { result } = await renderHook(() => useKaelConversation('synthetic-local-account', 'client', replay.streamer, loader));
  await act(async () => { result.current.send('Consume recorded local gateway outcome'); });
  await waitFor(() => expect(result.current.running).toBe(false));
  const attention = deriveKaelAttention({ ...result.current, dismissedReceipt: null, now });
  if (name === 'uncertain') {
    expect(result.current.receipt).toBeNull();
    expect(result.current.approvals[0]?.kind).toBe('reconcile');
    expect(attention?.kind).toBe('verify');
  } else {
    expect(result.current.receipt).toMatch(/^approval:/);
    expect(result.current.tasks.at(-1)?.status).toBe('completed');
    expect(attention?.kind).toBe('receipt');
  }
});

test('the real Edge provider-unavailable terminal event becomes a failure notice without a receipt', async () => {
  const replay = recordedStream(localGatewayEvents.edgeUnavailable);
  const { result } = await renderHook(() => useKaelConversation('synthetic-local-account', 'client', replay.streamer, loader));
  await act(async () => { result.current.send('Provider is unavailable'); });
  await waitFor(() => expect(result.current.running).toBe(false));
  expect(result.current.notice).toBe(localGatewayEvents.edgeUnavailable.find(event => event.type === 'run_failed')!.message);
  expect(result.current.receipt).toBeNull();
});

test('an interrupted captured stream preserves an honest recovery notice and cannot produce a receipt', async () => {
  const replay = recordedStream(localGatewayEvents.greeting.slice(0, -1));
  const { result } = await renderHook(() => useKaelConversation('synthetic-local-account', 'client', replay.streamer, loader));
  await act(async () => { result.current.send('Interrupted local stream'); });
  await waitFor(() => expect(result.current.running).toBe(false));
  expect(result.current.notice).not.toBeNull();
  expect(result.current.receipt).toBeNull();
});
