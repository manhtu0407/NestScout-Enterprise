import type { KaelConfig } from './config.ts';
import { buildSystemPrompt, buildTranscript } from './context.ts';
import type { KaelEmitter, KaelFailureCode } from './events.ts';
import { executeApprovedEffect, executeDecision } from './executor.ts';
import type { ToolContext, ToolExecution } from './executor.ts';
import { completeWithFallback, ProviderError } from './model.ts';
import type { Fetcher, ModelProvider, ProviderId, ToolResult, TranscriptItem } from './model.ts';
import { evaluateCall, fingerprint, selectTools } from './policy.ts';
import type { Actor } from './policy.ts';
import type { KaelStore, Rest } from './store.ts';
import { toTaskView } from './tasks.ts';
import type { TaskRecord } from './tasks.ts';
import { findTool, toDefinition } from './tools.ts';

export type RunInput = {
  actor: Actor;
  config: KaelConfig;
  store: KaelStore;
  rest: Rest;
  providers: readonly ModelProvider[];
  fetcher: Fetcher;
  runId: string;
  conversationId: string;
  emit: KaelEmitter;
  signal: AbortSignal;
  today: string;
};

export type RunOutcome = {
  status: 'completed' | 'failed' | 'cancelled';
  text: string;
  complete: boolean;
  provider: ProviderId | null;
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  steps: number;
  error: KaelFailureCode | null;
};

const failureMessages: Record<KaelFailureCode, string> = {
  unauthenticated: 'Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.',
  invalid_request: 'Yêu cầu không hợp lệ.',
  rate_limited: 'Kael đang nhận quá nhiều yêu cầu từ tài khoản này. Vui lòng thử lại sau ít phút.',
  busy: 'Kael vẫn đang xử lý tin nhắn trước trong cuộc trò chuyện này.',
  provider_unavailable: 'Mô hình AI của Kael chưa được cấu hình hoặc chưa khả dụng. Tin nhắn của bạn đã được lưu nhưng chưa được trả lời.',
  provider_error: 'Mô hình AI tạm thời gặp lỗi. Chưa có thao tác nào được thực hiện thêm; bạn có thể thử lại.',
  incomplete_output: 'Phản hồi bị gián đoạn trước khi hoàn tất. Nội dung phía trên có thể chưa đầy đủ.',
  budget_exhausted: 'Kael đã dừng vì vượt giới hạn xử lý cho một lượt. Các bước đã ghi nhận vẫn được giữ.',
  approval_invalid: 'Xác nhận này không còn hợp lệ. Chưa có thao tác nào được thực hiện.',
  cancelled: 'Lượt xử lý đã bị dừng.',
  internal: 'Kael gặp lỗi nội bộ. Chưa có thao tác nào được báo là thành công.',
};

export function failureMessage(code: KaelFailureCode): string {
  return failureMessages[code];
}

export function isRetryable(code: KaelFailureCode): boolean {
  return ['rate_limited', 'busy', 'provider_error', 'incomplete_output', 'internal'].includes(code);
}

function providerFailure(error: ProviderError, deadlineHit: boolean): KaelFailureCode {
  if (error.kind === 'cancelled') return deadlineHit ? 'budget_exhausted' : 'cancelled';
  if (error.kind === 'incomplete') return 'incomplete_output';
  if (error.kind === 'unavailable' || error.kind === 'auth') return 'provider_unavailable';
  return 'provider_error';
}

function resultFor(callId: string, execution: ToolExecution): ToolResult {
  const isError = execution.outcome !== 'succeeded' && execution.outcome !== 'approval_required';
  return { callId, content: JSON.stringify({ outcome: execution.outcome, ...execution.content }), isError };
}

export async function runAgentTurn(input: RunInput): Promise<RunOutcome> {
  const { actor, config, store, emit } = input;
  const deadline = AbortSignal.timeout(config.limits.runDeadlineMs);
  const signal = AbortSignal.any([input.signal, deadline]);
  const outcome: RunOutcome = { status: 'failed', text: '', complete: false, provider: null, model: null, inputTokens: 0, outputTokens: 0, steps: 0, error: null };
  const say = (delta: string) => {
    outcome.text += delta;
    emit({ type: 'message_delta', text: delta });
  };
  const fail = (code: KaelFailureCode): RunOutcome => {
    outcome.status = code === 'cancelled' ? 'cancelled' : 'failed';
    outcome.error = code;
    return outcome;
  };

  try {
    const context = await store.loadContext(input.conversationId, actor.mode, config.limits.historyMessages, signal);
    const tasks = new Map<string, TaskRecord>(context.tasks.map(task => [task.id, task]));
    const offered = selectTools(actor, config);
    const system = buildSystemPrompt(actor, config, offered, context.tasks, input.conversationId, input.today);
    const transcript: TranscriptItem[] = buildTranscript(context.history, config.limits.historyChars);
    if (transcript.length === 0) return fail('invalid_request');
    if (input.providers.length === 0) return fail('provider_unavailable');
    const toolContext: ToolContext = {
      actor, config, store, rest: input.rest, runId: input.runId, conversationId: input.conversationId, tasks, emit, fetcher: input.fetcher, signal,
    };
    const executed = new Map<string, ToolExecution>();
    let toolCallsUsed = 0;

    while (outcome.steps < config.limits.maxModelCalls) {
      outcome.steps += 1;
      let separated = outcome.text.length === 0;
      const turn = await completeWithFallback(input.providers, {
        system, transcript, tools: offered.map(toDefinition), maxOutputTokens: config.limits.maxOutputTokens, signal,
      }, delta => {
        if (!separated) { say('\n\n'); separated = true; }
        say(delta);
      });
      outcome.provider = turn.provider;
      outcome.model = turn.model;
      outcome.inputTokens += turn.usage.inputTokens;
      outcome.outputTokens += turn.usage.outputTokens;

      if (turn.stopReason === 'refusal' || turn.stopReason === 'content_filter') {
        if (turn.text.trim() === '') say(`${outcome.text ? '\n\n' : ''}Kael không thể hỗ trợ yêu cầu này.`);
        outcome.status = 'completed';
        outcome.complete = true;
        return outcome;
      }
      if (turn.stopReason === 'max_tokens') return fail('incomplete_output');
      if (turn.toolCalls.length === 0) {
        if (outcome.text.trim() === '') return fail('incomplete_output');
        outcome.status = 'completed';
        outcome.complete = true;
        return outcome;
      }

      transcript.push({ role: 'assistant', text: turn.text, toolCalls: turn.toolCalls, providerState: turn.providerState });
      const results: ToolResult[] = [];
      for (const call of turn.toolCalls) {
        const decision = evaluateCall(call, offered, actor, config, toolCallsUsed);
        const tool = decision.tool ?? findTool(call.name) ?? null;
        const label = tool?.label ?? 'Đang kiểm tra yêu cầu';
        emit({ type: 'tool_started', call_id: call.id, tool: call.name.slice(0, 64), label });
        let execution: ToolExecution;
        const key = await fingerprint({ tool: call.name, args: call.input });
        if (decision.kind === 'deny') {
          execution = { outcome: 'denied', content: { error: decision.reason }, taskId: null };
        } else {
          const previous = executed.get(key);
          if (previous) {
            execution = { ...previous, content: { ...previous.content, duplicate_call: true } };
          } else {
            toolCallsUsed += 1;
            execution = await executeDecision(decision, toolContext);
            executed.set(key, execution);
          }
        }
        await store.recordTool({
          runId: input.runId, callId: call.id.slice(0, 128), taskId: execution.taskId, tool: call.name.slice(0, 64),
          sideEffect: tool?.sideEffect ?? 'unknown', outcome: execution.outcome, fingerprint: key,
          error: typeof execution.content.error === 'string' ? execution.content.error.slice(0, 120) : null,
        });
        emit({ type: 'tool_completed', call_id: call.id, tool: call.name.slice(0, 64), outcome: execution.outcome, label });
        results.push(resultFor(call.id, execution));
      }
      transcript.push({ role: 'tool', results });
    }
    return fail('budget_exhausted');
  } catch (error) {
    if (error instanceof ProviderError) return fail(providerFailure(error, deadline.aborted && !input.signal.aborted));
    if (input.signal.aborted) return fail('cancelled');
    if (deadline.aborted) return fail('budget_exhausted');
    return fail('internal');
  }
}

export type ApprovalInput = {
  approvalId: string;
  fingerprint: string;
  approve: boolean;
  store: KaelStore;
  rest: Rest;
  runId: string;
  emit: KaelEmitter;
  signal: AbortSignal;
};

const invalidApproval: Record<string, string> = {
  expired: 'Xác nhận đã hết hạn. Chưa có thao tác nào được thực hiện; hãy yêu cầu Kael chuẩn bị lại.',
  mismatch: 'Nội dung xác nhận không khớp với bản nháp hiện tại. Chưa có thao tác nào được thực hiện.',
  stale: 'Bản nháp đã thay đổi sau khi tạo xác nhận. Chưa có thao tác nào được thực hiện.',
  rejected: 'Bước này đã được hủy trước đó. Chưa có thao tác nào được thực hiện.',
  invalid: 'Không tìm thấy xác nhận hợp lệ cho tài khoản này. Chưa có thao tác nào được thực hiện.',
};

export async function resolveApproval(input: ApprovalInput): Promise<RunOutcome> {
  const outcome: RunOutcome = { status: 'completed', text: '', complete: true, provider: null, model: null, inputTokens: 0, outputTokens: 0, steps: 0, error: null };
  const say = (text: string) => {
    outcome.text += text;
    input.emit({ type: 'message_delta', text });
  };
  const publish = (task: TaskRecord | null) => { if (task) input.emit({ type: 'task_updated', task: toTaskView(task) }); };

  if (!input.approve) {
    const task = await input.store.rejectApproval(input.approvalId);
    if (!task) return { ...outcome, status: 'failed', complete: false, error: 'approval_invalid' };
    publish(task);
    say('Đã dừng bước gửi theo ý bạn. Bản nháp vẫn được giữ để bạn chỉnh sửa hoặc gửi sau.');
    return outcome;
  }

  const consumed = await input.store.consumeApproval(input.approvalId, input.fingerprint);
  if (consumed.status === 'consumed') {
    const resource = typeof consumed.result?.resource_id === 'string' ? consumed.result.resource_id : null;
    say(consumed.outcome === 'succeeded' && resource
      ? `Yêu cầu này đã được gửi trước đó (mã ${resource.slice(0, 8)}). Kael không gửi lại lần nữa.`
      : 'Xác nhận này đã được xử lý trước đó. Kael không thực hiện lại.');
    return outcome;
  }
  if (consumed.status !== 'ok' && consumed.status !== 'reconcile') {
    say(invalidApproval[consumed.status] ?? failureMessages.approval_invalid);
    return { ...outcome, status: 'failed', complete: true, error: 'approval_invalid' };
  }

  const callId = `approval:${input.approvalId}`;
  const label = 'Đang gửi yêu cầu dịch vụ';
  input.emit({ type: 'tool_started', call_id: callId, tool: consumed.tool, label });
  const effect = await executeApprovedEffect(input.approvalId, consumed, input.rest, input.signal);
  const task = await input.store.completeApproval(
    input.approvalId,
    effect.status,
    effect.status === 'succeeded' ? { resource_kind: 'service_request', resource_id: effect.resourceId } : { reason: effect.reason },
  );
  await input.store.recordTool({
    runId: input.runId, callId, taskId: consumed.task_id, tool: consumed.tool, sideEffect: 'consequential',
    outcome: effect.status === 'succeeded' ? 'succeeded' : effect.status === 'uncertain' ? 'uncertain' : 'failed',
    fingerprint: input.fingerprint, error: effect.status === 'succeeded' ? null : effect.reason,
  });
  input.emit({ type: 'tool_completed', call_id: callId, tool: consumed.tool, outcome: effect.status === 'succeeded' ? 'succeeded' : 'failed', label });
  publish(task);
  if (effect.status === 'succeeded') {
    say(`Đã gửi yêu cầu dịch vụ (mã ${effect.resourceId.slice(0, 8)}). Đây mới là bước gửi yêu cầu: chưa có thợ, báo giá hay lịch hẹn nào được xác nhận.`);
  } else if (effect.status === 'uncertain') {
    say('Chưa xác định được yêu cầu đã được gửi hay chưa do lỗi kết nối. Bạn có thể xác nhận lại: Kael dùng cùng mã gửi nên sẽ không tạo yêu cầu trùng.');
  } else {
    say('Hệ thống chưa nhận yêu cầu này. Bản nháp vẫn được giữ; chưa có yêu cầu nào được gửi.');
    outcome.status = 'failed';
    outcome.error = 'internal';
  }
  return outcome;
}
