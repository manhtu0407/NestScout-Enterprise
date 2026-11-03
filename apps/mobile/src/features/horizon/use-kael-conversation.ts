import * as Crypto from 'expo-crypto';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { loadKaelConversation, streamKaelTurn, type KaelApproval, type KaelConversationSnapshot, type KaelEvent, type KaelMode, type KaelTask, type KaelTaskStatus, type KaelTurnAction, type KaelTurnOutcome } from '@/features/shared';

export type KaelChatMessage = { id: string; role: 'user' | 'assistant'; text: string; incomplete?: boolean };

export type KaelConversationState = {
  messages: KaelChatMessage[];
  activity: string | null;
  tasks: KaelTask[];
  approvals: KaelApproval[];
  notice: string | null;
  running: boolean;
  conversationId: string | null;
};

type Streamer = typeof streamKaelTurn;
type Loader = (userId: string, mode: KaelMode, signal: AbortSignal) => Promise<KaelConversationSnapshot>;

const idleState: KaelConversationState = { messages: [], activity: null, tasks: [], approvals: [], notice: null, running: false, conversationId: null };
const interruptedNotice = 'Kết nối bị gián đoạn trước khi Kael trả lời xong. Nội dung phía trên có thể chưa đầy đủ.';
const restoreFailedNotice = 'Chưa tải lại được cuộc trò chuyện trước đó. Bạn vẫn có thể tiếp tục trò chuyện với Kael.';
const stillRunningNotice = 'Kael vẫn đang xử lý tin nhắn trước trong cuộc trò chuyện này. Vui lòng mở lại sau ít phút.';
const busyLabel = 'Kael đang xử lý';
const reconcilableStatuses: readonly KaelTaskStatus[] = ['running', 'paused', 'waiting_for_input'];

function stillOpen(approval: KaelApproval, status: KaelTaskStatus): boolean {
  return approval.kind === 'confirm' ? status === 'waiting_for_approval' : reconcilableStatuses.includes(status);
}

function unexpired(approval: KaelApproval): boolean {
  return approval.expires_at === null || Date.parse(approval.expires_at) > Date.now();
}

function applyEvent(state: KaelConversationState, event: KaelEvent, assistantId: string): KaelConversationState {
  switch (event.type) {
    case 'run_started':
      return { ...state, conversationId: event.conversation_id };
    case 'message_delta': {
      const existing = state.messages.find(message => message.id === assistantId);
      const messages = existing
        ? state.messages.map(message => (message.id === assistantId ? { ...message, text: message.text + event.text } : message))
        : [...state.messages, { id: assistantId, role: 'assistant' as const, text: event.text }];
      return { ...state, messages, activity: busyLabel };
    }
    case 'tool_started':
      return { ...state, activity: event.label };
    case 'tool_completed':
      return { ...state, activity: busyLabel };
    case 'task_updated': {
      const others = state.tasks.filter(task => task.id !== event.task.id);
      return { ...state, tasks: [...others, event.task], approvals: state.approvals.filter(item => item.task_id !== event.task.id || stillOpen(item, event.task.status)) };
    }
    case 'approval_required':
      return { ...state, approvals: [...state.approvals.filter(item => item.task_id !== event.approval.task_id), event.approval] };
    case 'run_completed': {
      const existing = state.messages.some(message => message.id === assistantId);
      const messages = existing
        ? state.messages.map(message => (message.id === assistantId ? { ...message, text: event.text, incomplete: false } : message))
        : event.text ? [...state.messages, { id: assistantId, role: 'assistant' as const, text: event.text }] : state.messages;
      return { ...state, messages, activity: null, running: false };
    }
    case 'run_failed':
      return {
        ...state,
        messages: state.messages.map(message => (message.id === assistantId ? { ...message, incomplete: true } : message)),
        activity: null,
        running: false,
        notice: event.message,
      };
  }
}

function settle(state: KaelConversationState, outcome: KaelTurnOutcome, assistantId: string): KaelConversationState {
  if (outcome.kind === 'terminal') return state;
  const base = { ...state, activity: null, running: false };
  if (outcome.kind === 'refused') return { ...base, notice: outcome.message };
  if (outcome.kind === 'cancelled') return base;
  return { ...base, notice: interruptedNotice, messages: state.messages.map(message => (message.id === assistantId ? { ...message, incomplete: true } : message)) };
}

function restored(state: KaelConversationState, snapshot: KaelConversationSnapshot): KaelConversationState {
  return {
    ...state,
    conversationId: snapshot.conversationId,
    messages: snapshot.messages.map(message => ({ id: `stored-${message.id}`, role: message.role, text: message.text, incomplete: message.incomplete })),
    tasks: snapshot.tasks,
    approvals: snapshot.approvals,
    notice: snapshot.busy ? stillRunningNotice : state.notice,
  };
}

export function useKaelConversation(userId: string | null, mode: KaelMode, streamer: Streamer = streamKaelTurn, loader: Loader = loadKaelConversation) {
  const scope = `${userId ?? 'guest'}:${mode}`;
  const [state, setState] = useState<KaelConversationState>(idleState);
  const [seenScope, setSeenScope] = useState(scope);
  const controllerRef = useRef<AbortController | null>(null);
  const restoreRef = useRef<AbortController | null>(null);
  const runningRef = useRef(false);

  if (seenScope !== scope) {
    setSeenScope(scope);
    setState(idleState);
  }

  const rehydrate = useCallback(async (expected: string | null) => {
    if (userId === null) return;
    restoreRef.current?.abort();
    const controller = new AbortController();
    restoreRef.current = controller;
    let snapshot: KaelConversationSnapshot | null = null;
    let failed = false;
    try {
      snapshot = await loader(userId, mode, controller.signal);
    } catch {
      failed = true;
    }
    if (controller.signal.aborted || restoreRef.current !== controller) return;
    restoreRef.current = null;
    setState(current => {
      if (current.running || current.conversationId !== expected) return current;
      if (failed || !snapshot) return { ...current, notice: restoreFailedNotice };
      if (expected === null ? current.messages.length > 0 : snapshot.conversationId !== expected) return current;
      return restored(current, snapshot);
    });
  }, [loader, mode, userId]);

  useEffect(() => {
    void rehydrate(null);
    return () => {
      restoreRef.current?.abort();
      restoreRef.current = null;
      controllerRef.current?.abort();
      controllerRef.current = null;
      runningRef.current = false;
    };
  }, [rehydrate]);

  const verifyDecision = useCallback(async (expected: string, decided: KaelApproval, accepted: boolean) => {
    if (userId === null) return;
    restoreRef.current?.abort();
    const controller = new AbortController();
    restoreRef.current = controller;
    let snapshot: KaelConversationSnapshot | null = null;
    try {
      snapshot = await loader(userId, mode, controller.signal);
    } catch {
      snapshot = null;
    }
    if (controller.signal.aborted || restoreRef.current !== controller) return;
    restoreRef.current = null;
    setState(current => {
      if (current.running || current.conversationId !== expected) return current;
      if (snapshot === null) {
        return accepted || current.approvals.some(item => item.id === decided.id) || !unexpired(decided) ? current : { ...current, approvals: [...current.approvals, decided] };
      }
      return snapshot.conversationId === expected ? { ...current, tasks: snapshot.tasks, approvals: snapshot.approvals } : current;
    });
  }, [loader, mode, userId]);

  const nextExpiry = useMemo(() => Math.min(...state.approvals.flatMap(approval => (approval.expires_at === null ? [] : [Date.parse(approval.expires_at)]))), [state.approvals]);
  useEffect(() => {
    if (!Number.isFinite(nextExpiry)) return;
    const timer = setTimeout(() => {
      setState(current => ({ ...current, approvals: current.approvals.filter(unexpired) }));
    }, Math.max(0, nextExpiry - Date.now()) + 50);
    return () => clearTimeout(timer);
  }, [nextExpiry]);

  const reset = useCallback(() => {
    restoreRef.current?.abort();
    restoreRef.current = null;
    controllerRef.current?.abort();
    controllerRef.current = null;
    runningRef.current = false;
    setState(idleState);
  }, []);

  const run = useCallback(async (action: KaelTurnAction, userText: string, decided: KaelApproval | null = null) => {
    if (userId === null || runningRef.current) return;
    runningRef.current = true;
    restoreRef.current?.abort();
    restoreRef.current = null;
    const requestId = Crypto.randomUUID();
    const assistantId = `assistant-${requestId}`;
    const controller = new AbortController();
    controllerRef.current = controller;
    let conversationId = state.conversationId;
    let replayed = false;
    setState(current => ({
      ...current,
      notice: null,
      running: true,
      activity: busyLabel,
      messages: [...current.messages, { id: `user-${requestId}`, role: 'user', text: userText }],
      approvals: action.type === 'message' ? current.approvals : current.approvals.filter(item => item.id !== action.approval_id),
    }));
    const outcome = await streamer(userId, { requestId, conversationId, mode, action }, event => {
      if (controller.signal.aborted) return;
      if (event.type === 'run_started') {
        conversationId = event.conversation_id;
        replayed = event.replayed;
      }
      setState(current => applyEvent(current, event, assistantId));
    }, controller.signal);
    if (controllerRef.current !== controller) return;
    controllerRef.current = null;
    runningRef.current = false;
    setState(current => settle(current, outcome, assistantId));
    if (conversationId === null) return;
    if (outcome.kind === 'interrupted' || replayed) void rehydrate(conversationId);
    else if (decided) void verifyDecision(conversationId, decided, outcome.kind === 'terminal' && outcome.event.type === 'run_completed');
  }, [mode, rehydrate, state.conversationId, streamer, userId, verifyDecision]);

  const send = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    void run({ type: 'message', text: trimmed }, trimmed);
  }, [run]);

  const decide = useCallback((approval: KaelApproval, approve: boolean) => {
    if (approval.kind === 'reconcile') {
      if (approve) void run({ type: 'reconcile', approval_id: approval.id, fingerprint: approval.fingerprint }, `Kiểm tra lại: ${approval.summary}`, approval);
      return;
    }
    void run(
      { type: approve ? 'approve' : 'reject', approval_id: approval.id, fingerprint: approval.fingerprint },
      approve ? `Xác nhận: ${approval.summary}` : `Không thực hiện: ${approval.summary}`,
      approval,
    );
  }, [run]);

  const dismissNotice = useCallback(() => setState(current => ({ ...current, notice: null })), []);

  return { ...state, available: userId !== null, send, decide, reset, dismissNotice };
}
