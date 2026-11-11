import * as Crypto from 'expo-crypto';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { loadKaelConversation, openKaelConversation, setKaelFeedback, streamKaelTurn, type KaelApproval, type KaelConversationSnapshot, type KaelEvent, type KaelFeedbackRating, type KaelFeedbackReason, type KaelMode, type KaelQuestion, type KaelTask, type KaelTaskStatus, type KaelTurnAction, type KaelTurnOutcome } from '@/features/shared';

export type KaelChatMessage = { id: string; role: 'user' | 'assistant'; text: string; incomplete?: boolean; runId?: string; storedId?: string };

export type KaelConversationState = {
  messages: KaelChatMessage[];
  activity: string | null;
  tasks: KaelTask[];
  approvals: KaelApproval[];
  notice: string | null;
  running: boolean;
  conversationId: string | null;
  processingTaskId: string | null;
  receipt: string | null;
  question: KaelQuestion | null;
  consentRequired: boolean;
};

type Streamer = typeof streamKaelTurn;
type FeedbackWriter = typeof setKaelFeedback;
type Loader = (userId: string, mode: KaelMode, signal: AbortSignal) => Promise<KaelConversationSnapshot>;
type Opener = (userId: string, mode: KaelMode, conversationId: string, signal: AbortSignal) => Promise<KaelConversationSnapshot>;

export type KaelOpening = { id: string; failed: boolean };

const idleState: KaelConversationState = { messages: [], activity: null, tasks: [], approvals: [], notice: null, running: false, conversationId: null, processingTaskId: null, receipt: null, question: null, consentRequired: false };
const interruptedNotice = 'Kết nối bị gián đoạn trước khi Kael trả lời xong. Nội dung phía trên có thể chưa đầy đủ.';
const unverifiedNotice = 'Kết nối bị gián đoạn và chưa tải lại được cuộc trò chuyện để xác minh. Nội dung phía trên có thể chưa đầy đủ.';
const unconfirmedNotice = 'Đã tải lại cuộc trò chuyện nhưng chưa xác nhận được Kael đã trả lời xong tin nhắn bị gián đoạn. Nội dung phía trên có thể chưa đầy đủ.';
const restoreFailedNotice = 'Chưa tải lại được cuộc trò chuyện trước đó. Bạn vẫn có thể tiếp tục trò chuyện với Kael.';
const stillRunningNotice = 'Kael vẫn đang xử lý tin nhắn trước trong cuộc trò chuyện này. Vui lòng mở lại sau ít phút.';
const busyLabel = 'Kael đang xử lý';

type Interrupted = { afterMessageId: string | null; userOrdinal: number; text: string | null };

function stillOpen(approval: KaelApproval, status: KaelTaskStatus): boolean {
  return approval.kind === 'reconcile' || status === 'waiting_for_approval';
}

function accountChecks(approvals: readonly KaelApproval[]): KaelApproval[] {
  return approvals.filter(approval => approval.kind === 'reconcile');
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
        : [...state.messages, { id: assistantId, role: 'assistant' as const, text: event.text, runId: event.run_id }];
      return { ...state, messages, activity: busyLabel };
    }
    case 'tool_started':
      return { ...state, activity: event.label };
    case 'tool_completed':
      return { ...state, activity: busyLabel, receipt: event.tool === 'service_request_submit' && event.outcome === 'succeeded' ? event.call_id : state.receipt };
    case 'task_updated': {
      const others = state.tasks.filter(task => task.id !== event.task.id);
      return { ...state, tasks: [...others, event.task], approvals: state.approvals.filter(item => item.task_id !== event.task.id || stillOpen(item, event.task.status)) };
    }
    case 'approval_required':
      return { ...state, approvals: [...state.approvals.filter(item => item.task_id !== event.approval.task_id), event.approval] };
    case 'question':
      return { ...state, question: event.question };
    case 'run_completed': {
      const existing = state.messages.some(message => message.id === assistantId);
      const messages = existing
        ? state.messages.map(message => (message.id === assistantId ? { ...message, text: event.text, incomplete: false, runId: event.run_id } : message))
        : event.text ? [...state.messages, { id: assistantId, role: 'assistant' as const, text: event.text, runId: event.run_id }] : state.messages;
      return { ...state, messages, activity: null, running: false, processingTaskId: null };
    }
    case 'run_failed':
      return {
        ...state,
        messages: event.code === 'approval_invalid' ? state.messages : state.messages.map(message => (message.id === assistantId ? { ...message, incomplete: true } : message)),
        activity: null,
        running: false,
        processingTaskId: null,
        notice: event.message,
      };
  }
}

function settle(state: KaelConversationState, outcome: KaelTurnOutcome, assistantId: string): KaelConversationState {
  if (outcome.kind === 'terminal') return state;
  const base = { ...state, activity: null, running: false, processingTaskId: null };
  if (outcome.kind === 'refused') return { ...base, notice: outcome.message, consentRequired: outcome.code === 'consent_required' };
  if (outcome.kind === 'cancelled') return base;
  return { ...base, notice: interruptedNotice, messages: state.messages.map(message => (message.id === assistantId ? { ...message, incomplete: true } : message)) };
}

const interruptionNotices: readonly (string | null)[] = [interruptedNotice, unverifiedNotice, unconfirmedNotice, stillRunningNotice];

function replyTo(snapshot: KaelConversationSnapshot, interrupted: Interrupted): 'complete' | 'partial' | 'missing' | 'unmatched' {
  const anchor = interrupted.afterMessageId === null ? -1 : snapshot.messages.findIndex(message => message.id === interrupted.afterMessageId);
  if (interrupted.afterMessageId !== null && anchor < 0) return 'unmatched';
  let seen = -1;
  const index = snapshot.messages.findIndex((message, position) => position > anchor && message.role === 'user' && ++seen === interrupted.userOrdinal);
  if (index < 0) return 'unmatched';
  if (interrupted.text !== null && snapshot.messages[index]!.text !== interrupted.text) return 'unmatched';
  const reply = snapshot.messages[index + 1];
  if (!reply || reply.role !== 'assistant') return 'missing';
  return reply.incomplete ? 'partial' : 'complete';
}

function restoredNotice(state: KaelConversationState, snapshot: KaelConversationSnapshot, interrupted: Interrupted | null): string | null {
  if (snapshot.busy) return stillRunningNotice;
  if (!interruptionNotices.includes(state.notice)) return state.notice;
  if (interrupted === null) return unconfirmedNotice;
  const verdict = replyTo(snapshot, interrupted);
  if (verdict === 'complete') return null;
  return verdict === 'unmatched' ? unconfirmedNotice : interruptedNotice;
}

function restored(state: KaelConversationState, snapshot: KaelConversationSnapshot, interrupted: Interrupted | null): KaelConversationState {
  return {
    ...state,
    conversationId: snapshot.conversationId,
    messages: snapshot.messages.map(message => ({ id: `stored-${message.id}`, storedId: message.id, role: message.role, text: message.text, incomplete: message.incomplete })),
    tasks: snapshot.tasks,
    approvals: snapshot.approvals,
    notice: restoredNotice(state, snapshot, interrupted),
  };
}

export function useKaelConversation(userId: string | null, mode: KaelMode, streamer: Streamer = streamKaelTurn, loader: Loader = loadKaelConversation, feedback: FeedbackWriter = setKaelFeedback, opener: Opener = openKaelConversation) {
  const scope = `${userId ?? 'guest'}:${mode}`;
  const [state, setState] = useState<KaelConversationState>(idleState);
  const [seenScope, setSeenScope] = useState(scope);
  const [opening, setOpeningState] = useState<KaelOpening | null>(null);
  const openingRef = useRef<KaelOpening | null>(null);
  const openController = useRef<AbortController | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const restoreRef = useRef<AbortController | null>(null);
  const runningRef = useRef(false);
  const usersAfterAnchorRef = useRef(0);
  const restoredTailRef = useRef<string | null>(null);
  const interruptedRef = useRef<Interrupted | null>(null);
  const ordinalUnknownRef = useRef(true);

  const setOpening = useCallback((next: KaelOpening | null) => {
    openingRef.current = next;
    setOpeningState(next);
  }, []);

  if (seenScope !== scope) {
    setSeenScope(scope);
    setState(idleState);
    setOpeningState(null);
  }

  const rehydrate = useCallback(async (expected: string | null, firstTurn = false) => {
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
      if (failed || !snapshot) {
        ordinalUnknownRef.current = true;
        return { ...current, notice: current.notice === interruptedNotice ? unverifiedNotice : restoreFailedNotice };
      }
      if (firstTurn) {
        const evidence = interruptedRef.current;
        if (snapshot.conversationId === null || evidence === null || replyTo(snapshot, evidence) === 'unmatched') {
          ordinalUnknownRef.current = true;
          return { ...current, notice: snapshot.busy ? stillRunningNotice : interruptionNotices.includes(current.notice) ? unconfirmedNotice : current.notice };
        }
      } else if (expected === null ? current.messages.length > 0 : snapshot.conversationId !== expected) return current;
      usersAfterAnchorRef.current = 0;
      restoredTailRef.current = snapshot.messages.at(-1)?.id ?? null;
      ordinalUnknownRef.current = false;
      const next = restored(current, snapshot, interruptedRef.current);
      if (next.notice === null || !interruptionNotices.includes(next.notice)) interruptedRef.current = null;
      return next;
    });
  }, [loader, mode, userId]);

  useEffect(() => {
    ordinalUnknownRef.current = true;
    void rehydrate(null);
    return () => {
      usersAfterAnchorRef.current = 0;
      restoredTailRef.current = null;
      interruptedRef.current = null;
      openController.current?.abort();
      openController.current = null;
      openingRef.current = null;
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
    openController.current?.abort();
    openController.current = null;
    setOpening(null);
    restoreRef.current?.abort();
    restoreRef.current = null;
    controllerRef.current?.abort();
    controllerRef.current = null;
    runningRef.current = false;
    usersAfterAnchorRef.current = 0;
    restoredTailRef.current = null;
    interruptedRef.current = null;
    setState(current => ({ ...idleState, approvals: accountChecks(current.approvals) }));
  }, [setOpening]);

  const run = useCallback(async (action: KaelTurnAction, userText: string, decided: KaelApproval | null = null) => {
    if (userId === null || runningRef.current || openingRef.current !== null) return;
    runningRef.current = true;
    restoreRef.current?.abort();
    restoreRef.current = null;
    interruptedRef.current = { afterMessageId: restoredTailRef.current, userOrdinal: ordinalUnknownRef.current ? -1 : usersAfterAnchorRef.current, text: action.type === 'message' ? userText : null };
    const requestId = Crypto.randomUUID();
    const assistantId = `assistant-${requestId}`;
    const controller = new AbortController();
    controllerRef.current = controller;
    let conversationId = state.conversationId;
    let replayed = false;
    let started = false;
    setState(current => ({
      ...current,
      notice: null,
      consentRequired: false,
      running: true,
      activity: busyLabel,
      processingTaskId: decided !== null && action.type !== 'reject' ? decided.task_id : null,
      receipt: null,
      question: null,
      messages: [...current.messages, { id: `user-${requestId}`, role: 'user', text: userText }],
      approvals: action.type === 'message' ? current.approvals : current.approvals.filter(item => item.id !== action.approval_id),
    }));
    let outcome: KaelTurnOutcome;
    try {
      outcome = await streamer(userId, { requestId, conversationId, mode, action }, event => {
        if (controller.signal.aborted) return;
        if (event.type === 'run_started') {
          conversationId = event.conversation_id;
          replayed = event.replayed;
          started = true;
          if (event.replayed) interruptedRef.current = null;
          else usersAfterAnchorRef.current += 1;
        }
        setState(current => applyEvent(current, event, assistantId));
      }, controller.signal);
    } catch {
      outcome = controller.signal.aborted
        ? { kind: 'cancelled' }
        : { kind: 'interrupted' };
    }
    if (controllerRef.current !== controller) return;
    controllerRef.current = null;
    runningRef.current = false;
    setState(current => settle(current, outcome, assistantId));
    if (outcome.kind === 'terminal' || outcome.kind === 'refused') interruptedRef.current = null;
    if (outcome.kind === 'interrupted' && !started) ordinalUnknownRef.current = true;
    if (conversationId === null) {
      if (outcome.kind === 'interrupted') void rehydrate(null, true);
      return;
    }
    if (outcome.kind === 'interrupted' || replayed) void rehydrate(conversationId);
    else if (decided) void verifyDecision(conversationId, decided, outcome.kind === 'terminal' && outcome.event.type === 'run_completed');
  }, [mode, rehydrate, state.conversationId, streamer, userId, verifyDecision]);

  const open = useCallback(async (conversationId: string) => {
    if (userId === null) return;
    openController.current?.abort();
    restoreRef.current?.abort();
    restoreRef.current = null;
    controllerRef.current?.abort();
    controllerRef.current = null;
    runningRef.current = false;
    usersAfterAnchorRef.current = 0;
    restoredTailRef.current = null;
    interruptedRef.current = null;
    const controller = new AbortController();
    openController.current = controller;
    setOpening({ id: conversationId, failed: false });
    setState(current => ({ ...idleState, approvals: accountChecks(current.approvals) }));
    let snapshot: KaelConversationSnapshot | null = null;
    try {
      snapshot = await opener(userId, mode, conversationId, controller.signal);
    } catch {
      snapshot = null;
    }
    if (controller.signal.aborted || openController.current !== controller) return;
    openController.current = null;
    if (snapshot === null) {
      setOpening({ id: conversationId, failed: true });
      return;
    }
    ordinalUnknownRef.current = false;
    restoredTailRef.current = snapshot.messages.at(-1)?.id ?? null;
    setOpening(null);
    setState(restored(idleState, snapshot, null));
  }, [mode, opener, setOpening, userId]);

  const retryOpen = useCallback(() => {
    const target = openingRef.current;
    if (target !== null && target.failed) void open(target.id);
  }, [open]);

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

  const refresh = useCallback(() => { void rehydrate(state.conversationId, state.conversationId === null && interruptedRef.current !== null); }, [rehydrate, state.conversationId]);

  const dismissNotice = useCallback(() => setState(current => ({ ...current, notice: null })), []);

  const rate = useCallback(async (message: KaelChatMessage, rating: KaelFeedbackRating | null, reason: KaelFeedbackReason | null): Promise<boolean> => {
    if (userId === null || message.role !== 'assistant') return false;
    const target = message.storedId !== undefined ? { messageId: message.storedId } : message.runId !== undefined ? { runId: message.runId } : null;
    if (target === null) return false;
    try {
      await feedback(userId, target, rating, reason, new AbortController().signal);
      return true;
    } catch {
      return false;
    }
  }, [feedback, userId]);

  return { ...state, available: userId !== null, opening, send, decide, reset, open, retryOpen, dismissNotice, refresh, rate };
}
