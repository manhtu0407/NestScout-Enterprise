import type { KaelConfig } from './config.ts';
import { buildSystemPrompt, buildTranscript, openingLanguage, replyLanguage } from './context.ts';
import type { KaelEmitter, KaelFailureCode } from './events.ts';
import { executeApprovedEffect, executeDecision } from './executor.ts';
import type { EffectOutcome, ToolContext, ToolExecution } from './executor.ts';
import { completeWithFallback, ProviderError } from './model.ts';
import type { Fetcher, ModelProvider, ProviderId, ToolResult, TranscriptItem } from './model.ts';
import { confirmableTools, evaluateCall, fingerprint, selectTools } from './policy.ts';
import type { Actor } from './policy.ts';
import type { ApprovalCompletion, KaelStore, Rest } from './store.ts';
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
  log?: (event: Record<string, string | number | null>) => void;
};

export type RunOutcome = {
  status: 'completed' | 'failed' | 'cancelled';
  text: string;
  complete: boolean;
  provider: ProviderId | null;
  model: string | null;
  requestedModel: string | null;
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
  provider_unavailable: 'Kael chưa thể kết nối với mô hình AI. Vui lòng thử lại sau.',
  provider_error: 'Mô hình AI tạm thời gặp lỗi. Chưa có thao tác nào được thực hiện thêm; bạn có thể thử lại.',
  incomplete_output: 'Phản hồi bị gián đoạn trước khi hoàn tất. Nội dung phía trên có thể chưa đầy đủ.',
  budget_exhausted: 'Kael đã dừng vì đạt giới hạn xử lý hoặc ngân sách. Các bước đã ghi nhận vẫn được giữ.',
  approval_invalid: 'Xác nhận này không còn hợp lệ. Chưa có thao tác nào được thực hiện.',
  consent_required: 'Bạn cần đồng ý chia sẻ dữ liệu với AI trong Kael trước khi tiếp tục. Tin nhắn chưa được gửi tới nhà cung cấp AI.',
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
  if (error.kind === 'budget') return 'budget_exhausted';
  if (error.kind === 'cancelled') return deadlineHit ? 'budget_exhausted' : 'cancelled';
  if (error.outputStarted || error.kind === 'incomplete') return 'incomplete_output';
  if (['unavailable', 'auth', 'billing', 'bad_request'].includes(error.kind)) return 'provider_unavailable';
  return 'provider_error';
}

const deniedNotice = 'Only this operation was refused. Keep helping with everything else the user asked, without this data or action.';

function resultFor(callId: string, execution: ToolExecution): ToolResult {
  const isError = execution.outcome !== 'succeeded' && execution.outcome !== 'approval_required';
  return { callId, content: JSON.stringify({ outcome: execution.outcome, ...execution.content }), isError };
}

export async function runAgentTurn(input: RunInput): Promise<RunOutcome> {
  const { actor, config, store, emit } = input;
  const deadline = AbortSignal.timeout(config.limits.runDeadlineMs);
  const signal = AbortSignal.any([input.signal, deadline]);
  const outcome: RunOutcome = { status: 'failed', text: '', complete: false, provider: null, model: null, requestedModel: null, inputTokens: 0, outputTokens: 0, steps: 0, error: null };
  let overflow = false;
  const say = (delta: string) => {
    if (overflow) return;
    const remaining = 32_000 - outcome.text.length;
    const text = delta.length > remaining ? delta.slice(0, remaining).replace(/[\uD800-\uDBFF]$/, '') : delta;
    overflow = text !== delta;
    outcome.text += text;
    if (text) emit({ type: 'message_delta', text });
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
    const personal = await store.loadPersonalContext?.(input.conversationId, actor.mode, context.history, config.limits.historyChars,
      AbortSignal.any([signal, AbortSignal.timeout(1600)]), part => input.log?.({ event: 'kael_context_degraded', run_id: input.runId, part }));
    const message = context.history.at(-1)?.content ?? '';
    const reply = replyLanguage(message, personal);
    const translationRequest = /^\s*(?:please\s+)?(?:translate\b|(?:hãy\s+)?dịch(?!\p{L}|\s+vụ(?!\p{L})))/iu.test(message);
    const system = buildSystemPrompt(actor, config, offered, context.tasks, input.conversationId, input.today, personal, message);
    input.log?.({ event: 'kael_reply_language', run_id: input.runId, source: reply.source, language: reply.language });
    const transcript: TranscriptItem[] = buildTranscript(context.history, config.limits.historyChars, personal);
    if (transcript.length === 0) return fail('invalid_request');
    if (input.providers.length === 0) return fail('provider_unavailable');
    const toolContext: ToolContext = {
      actor, config, store, rest: input.rest, runId: input.runId, conversationId: input.conversationId, tasks, emit, fetcher: input.fetcher, signal,
    };
    const executed = new Map<string, ToolExecution>();
    let toolCallsUsed = 0;
    let providers = input.providers;
    let retryLanguageAt = 0;

    while (outcome.steps < config.limits.maxModelCalls) {
      outcome.steps += 1;
      let separated = outcome.text.length === 0;
      let pending = '';
      let mismatch = false;
      let checked = !reply.language || translationRequest;
      const publish = (delta: string) => {
        if (!separated) { say('\n\n'); separated = true; }
        say(delta);
      };
      const checkOpening = (final = false) => {
        const segments = pending.trimStart().split(/\r?\n|[.!?](?=\s)/u);
        const language = (final ? segments : segments.slice(0, -1)).map(openingLanguage).find(value => value !== null) ?? null;
        if (!language && !final) return;
        mismatch = language !== null && language !== reply.language;
        checked = true;
        if (!mismatch) publish(pending);
        pending = '';
      };
      const retryTranscript: TranscriptItem[] = retryLanguageAt === outcome.steps && reply.language
        ? [...transcript, { role: 'user', text: `Answer my latest request in ${reply.language === 'en' ? 'English' : 'Vietnamese'}, starting with the first line. Keep my requested content and format.` }]
        : transcript;
      const modelStarted = performance.now();
      const turn = await completeWithFallback(providers, {
        system, transcript: retryTranscript, tools: offered.map(toDefinition), maxOutputTokens: config.limits.maxOutputTokens, signal,
      }, delta => {
        if (mismatch) return;
        if (checked) { publish(delta); return; }
        pending += delta;
        if (pending.length >= 240) checkOpening(true);
        else if (/\S.*(?:\r?\n|[.!?]\s)/u.test(pending)) checkOpening();
      }, undefined, (failure, requestedModel, fallback) => input.log?.({
        event: 'kael_provider_failure', run_id: input.runId, provider: failure.provider, requested_model: requestedModel,
        kind: failure.kind, http_status: failure.httpStatus ?? null, output_started: Number(failure.outputStarted), fallback: Number(fallback),
      }));
      input.log?.({ event: 'kael_provider_terminal', run_id: input.runId, provider: turn.provider,
        requested_model: turn.requestedModel, served_model: turn.model, reason: turn.stopReason, http_status: turn.httpStatus ?? null,
        latency_ms: Math.round(performance.now() - modelStarted) });
      providers = providers.filter(provider => provider.id === turn.provider);
      outcome.provider = turn.provider;
      outcome.model = turn.model;
      outcome.requestedModel = turn.requestedModel;
      outcome.inputTokens += turn.usage.inputTokens;
      outcome.outputTokens += turn.usage.outputTokens;
      if (!checked && pending.trim()) checkOpening(true);
      if (mismatch) {
        input.log?.({ event: 'kael_reply_language_mismatch', run_id: input.runId, provider: turn.provider, language: reply.language });
        if (retryLanguageAt || outcome.text || turn.toolCalls.length || outcome.steps >= config.limits.maxModelCalls) return fail('provider_error');
        retryLanguageAt = outcome.steps + 1;
        continue;
      }

      if (overflow) return fail('incomplete_output');
      if (turn.stopReason === 'refusal' || turn.stopReason === 'content_filter') {
        if (turn.text.trim() === '') say(`${outcome.text ? '\n\n' : ''}Kael không thể hỗ trợ yêu cầu này.`);
        outcome.status = 'completed';
        outcome.complete = true;
        return outcome;
      }
      if (turn.stopReason === 'max_tokens' || turn.stopReason === 'other') return fail('incomplete_output');
      if (turn.toolCalls.length === 0) {
        if (outcome.text.trim() === '') return fail('incomplete_output');
        outcome.status = 'completed';
        outcome.complete = true;
        return outcome;
      }

      transcript.push({ role: 'assistant', text: turn.text, toolCalls: turn.toolCalls, providerState: turn.providerState });
      const results: ToolResult[] = [];
      for (const call of turn.toolCalls) {
        const toolStarted = performance.now();
        const decision = evaluateCall(call, offered, actor, config, toolCallsUsed);
        const tool = decision.tool ?? findTool(call.name) ?? null;
        const label = tool?.label ?? 'Đang kiểm tra yêu cầu';
        emit({ type: 'tool_started', call_id: call.id, tool: call.name.slice(0, 64), label });
        let execution: ToolExecution;
        const key = await fingerprint({ tool: call.name, args: call.input });
        if (decision.kind === 'deny') {
          execution = { outcome: 'denied', content: { error: decision.reason, operation: call.name.slice(0, 64), notice: deniedNotice }, taskId: null };
        } else {
          const previous = tool?.resource === 'knowledge' ? undefined : executed.get(key);
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
        if (tool?.resource === 'knowledge') {
          const items = Array.isArray(execution.content.items) ? execution.content.items as Record<string, unknown>[] : [];
          const refs = items.map(item => String(item.citation_ref));
          const evidenceRefs = Array.isArray(execution.content.evidence_refs) ? execution.content.evidence_refs as string[] : [];
          input.log?.({ event: 'kael_knowledge', run_id: input.runId, tool: tool.id, source_refs: JSON.stringify([...refs, ...evidenceRefs]),
            method: execution.content.kind === 'disabled' ? 'not_run' : 'lexical-v1', latency_ms: Math.round((performance.now() - toolStarted) * 1000) / 1000,
            outcome: execution.outcome, validation_status: String(execution.content.status ?? execution.content.kind ?? execution.content.error ?? 'unknown') });
        }
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

export type ApprovalDecision = 'approve' | 'reject' | 'reconcile';

export type ApprovalInput = {
  approvalId: string;
  fingerprint: string;
  decision: ApprovalDecision;
  actor: Actor;
  config: KaelConfig;
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
  consumed: 'Bước này đã được xác nhận trước đó nên không thể hủy nữa.',
  unconfirmed: 'Bước này chưa được bạn xác nhận nên không có gì để kiểm tra lại. Chưa có thao tác nào được thực hiện.',
  unresolved: 'Một yêu cầu bạn đã xác nhận trước đó vẫn chưa rõ kết quả. Hãy bấm "Kiểm tra lại" trên yêu cầu đó trước; xác nhận này chưa gửi gì và vẫn được giữ đến khi hết hạn.',
  busy: 'Yêu cầu này đang được kiểm tra ở một lượt khác. Chưa có thao tác nào được thực hiện thêm; vui lòng thử lại sau ít phút.',
  unavailable: 'Thao tác này hiện không khả dụng cho tài khoản hoặc chế độ đang dùng. Chưa có thao tác nào được thực hiện; bạn vẫn có thể tiếp tục trò chuyện với Kael.',
  invalid: 'Không tìm thấy xác nhận hợp lệ cho tài khoản này. Chưa có thao tác nào được thực hiện.',
};

type EffectCopy = { label: string; kind: string; done: (resourceId: string) => string; refused: string; uncertain: string };

const workflowRefused = 'Hệ thống chưa thực hiện thao tác này vì dữ liệu đã thay đổi hoặc không còn hợp lệ. Chưa có gì thay đổi; hãy xem lại trạng thái mới nhất.';
const workflowUncertain = 'Chưa xác định được thao tác đã được ghi nhận hay chưa, nên Kael chưa báo là đã xong. Bạn có thể bấm "Kiểm tra lại": Kael dùng lại đúng thao tác bạn đã xác nhận. Nếu hệ thống đã ghi nhận, Kael chỉ báo lại kết quả; nếu chưa, chính thao tác đó được hoàn tất. Không có thao tác thứ hai và không cần xác nhận lại.';

function effectCopy(tool: string, args: Record<string, unknown>): EffectCopy {
  if (tool === 'service_quote_decision') {
    return args.decision === 'accepted'
      ? { label: 'Đang chấp nhận báo giá', kind: 'service_quote', refused: workflowRefused, uncertain: workflowUncertain,
        done: () => 'Đã chấp nhận báo giá. Đây mới là thỏa thuận về phạm vi và giá: chưa có thợ nhận việc, chưa có lịch hẹn và chưa có thanh toán nào được xác nhận.' }
      : { label: 'Đang từ chối báo giá', kind: 'service_quote', refused: workflowRefused, uncertain: workflowUncertain,
        done: () => 'Đã từ chối báo giá này. Yêu cầu của bạn vẫn được giữ.' };
  }
  if (tool === 'work_submission_decision') {
    return args.decision === 'accepted'
      ? { label: 'Đang nghiệm thu công việc', kind: 'service_submission', refused: workflowRefused, uncertain: workflowUncertain,
        done: () => 'Đã nghiệm thu công việc. Việc thanh toán chưa được xác nhận trong ứng dụng.' }
      : { label: 'Đang gửi yêu cầu sửa lại', kind: 'service_submission', refused: workflowRefused, uncertain: workflowUncertain,
        done: () => 'Đã gửi yêu cầu thợ sửa lại kèm lý do của bạn. Công việc chưa được nghiệm thu.' };
  }
  if (tool === 'worker_offer_decision') {
    return args.decision === 'accept'
      ? { label: 'Đang nhận việc', kind: 'service_job', refused: 'Hệ thống chưa giao việc này cho bạn: lời mời đã hết hạn, đã thay đổi hoặc đã có thợ khác nhận trước. Chưa có gì thay đổi.', uncertain: workflowUncertain,
        done: () => 'Bạn đã nhận việc; công việc đã được giao cho bạn. Lịch đến nhà khách chưa được hệ thống xác nhận, hãy cập nhật tiến độ khi bắt đầu đi.' }
      : { label: 'Đang từ chối lời mời', kind: 'service_invitation', refused: workflowRefused, uncertain: workflowUncertain,
        done: () => 'Đã từ chối lời mời này.' };
  }
  if (tool === 'worker_job_advance') {
    const done: Record<string, string> = { en_route: 'Đã cập nhật: bạn đang trên đường tới nhà khách.', arrived: 'Đã cập nhật: bạn đã đến nơi.', working: 'Đã cập nhật: bạn đã bắt đầu làm việc.' };
    return { label: 'Đang cập nhật tiến độ', kind: 'service_job', refused: workflowRefused, uncertain: workflowUncertain, done: () => done[String(args.next)] ?? 'Đã cập nhật tiến độ.' };
  }
  return {
    label: 'Đang gửi yêu cầu dịch vụ', kind: 'service_request',
    refused: 'Hệ thống chưa nhận yêu cầu này. Bản nháp vẫn được giữ; chưa có yêu cầu nào được gửi.',
    uncertain: 'Chưa xác định được yêu cầu đã được ghi nhận hay chưa, nên Kael chưa báo là đã gửi. Bạn có thể bấm "Kiểm tra lại": Kael dùng lại đúng lần gửi bạn đã xác nhận với cùng mã gửi. Nếu yêu cầu đã được ghi nhận, Kael chỉ báo lại kết quả; nếu chưa, lần gửi đó được hoàn tất. Không có yêu cầu thứ hai và không cần xác nhận lại.',
    done: resourceId => `Đã gửi yêu cầu dịch vụ (mã ${resourceId.slice(0, 8)}). Chưa có thợ hay lịch hẹn nào được xác nhận. Khi có báo giá, bạn xem và chấp nhận trong mục Báo giá; Kael chỉ tìm thợ sau khi bạn chấp nhận.`,
  };
}

const closedTaskStatuses: readonly string[] = ['cancelled', 'failed'];
const reconcilableStatuses: readonly string[] = ['running', 'paused', 'waiting_for_input', ...closedTaskStatuses];

export async function resolveApproval(input: ApprovalInput): Promise<RunOutcome> {
  const outcome: RunOutcome = { status: 'completed', text: '', complete: true, provider: null, model: null, requestedModel: null, inputTokens: 0, outputTokens: 0, steps: 0, error: null };
  const say = (text: string) => {
    outcome.text += text;
    input.emit({ type: 'message_delta', text });
  };
  const publish = (task: TaskRecord | null) => { if (task) input.emit({ type: 'task_updated', task: toTaskView(task) }); };
  const refuse = (status: string): RunOutcome => {
    say(invalidApproval[status] ?? failureMessages.approval_invalid);
    return { ...outcome, status: 'failed', complete: true, error: 'approval_invalid' };
  };

  if (input.decision === 'reject') {
    const rejection = await input.store.rejectApproval(input.runId, input.approvalId, input.fingerprint);
    if (rejection.status !== 'ok') return refuse(rejection.status);
    publish(rejection.task);
    say('Đã dừng bước gửi theo ý bạn. Bản nháp vẫn được giữ để bạn chỉnh sửa hoặc gửi sau.');
    return outcome;
  }

  const consumed = await input.store.consumeApproval(input.runId, input.approvalId, input.fingerprint, confirmableTools(input.actor, input.config), input.decision);
  if (consumed.status === 'consumed') {
    const resource = typeof consumed.result?.resource_id === 'string' ? consumed.result.resource_id : null;
    const submitted = consumed.result?.resource_kind === 'service_request';
    say(consumed.outcome === 'succeeded' && resource && submitted
      ? `Yêu cầu này đã được gửi trước đó (mã ${resource.slice(0, 8)}). Kael không gửi lại lần nữa.`
      : 'Xác nhận này đã được xử lý trước đó. Kael không thực hiện lại.');
    return outcome;
  }
  if (consumed.status !== 'ok' && consumed.status !== 'reconcile') return refuse(consumed.status);

  const callId = `approval:${input.approvalId}`;
  const copy = effectCopy(consumed.tool, consumed.args);
  const submit = consumed.tool === 'service_request_submit';
  const label = consumed.status === 'reconcile'
    ? (submit ? 'Đang kiểm tra lại yêu cầu đã xác nhận' : 'Đang kiểm tra lại thao tác đã xác nhận')
    : copy.label;
  input.emit({ type: 'tool_started', call_id: callId, tool: consumed.tool, label });
  const effect = await executeApprovedEffect(input.approvalId, consumed, input.rest, input.signal);
  let completion: ApprovalCompletion;
  try {
    completion = await input.store.completeApproval(
      input.runId,
      input.approvalId,
      effect.status,
      effect.status === 'succeeded' ? { resource_kind: copy.kind, resource_id: effect.resourceId } : { reason: effect.reason },
    );
  } catch {
    completion = { status: 'invalid' };
  }
  const verdict = verifiedOutcome(effect, completion, copy.kind);
  await input.store.recordTool({
    runId: input.runId, callId, taskId: consumed.task_id, tool: consumed.tool, sideEffect: 'consequential', outcome: verdict.outcome,
    fingerprint: input.fingerprint, error: verdict.outcome === 'succeeded' ? null : effect.status === 'succeeded' ? 'unverified_result' : effect.reason,
  });
  input.emit({ type: 'tool_completed', call_id: callId, tool: consumed.tool, outcome: verdict.outcome, label });
  if (completion.status !== 'invalid' && (verdict.outcome === 'succeeded' || completion.task.status !== 'completed')) publish(completion.task);
  const closed = completion.status !== 'invalid' && closedTaskStatuses.includes(completion.task.status);
  if (verdict.outcome === 'succeeded') {
    say(closed && submit
      ? `Yêu cầu dịch vụ bạn đã xác nhận trước đó đã được hệ thống ghi nhận (mã ${verdict.resourceId.slice(0, 8)}). Việc Kael theo dõi yêu cầu này đã được đóng, nhưng điều đó không hủy yêu cầu dịch vụ; Kael không có thao tác hủy yêu cầu đã gửi.`
      : closed ? `${copy.done(verdict.resourceId)} Việc Kael theo dõi thao tác này đã được đóng trước đó.` : copy.done(verdict.resourceId));
    return outcome;
  }
  if (verdict.outcome === 'failed') {
    say(closed && submit
      ? 'Hệ thống chưa nhận yêu cầu này nên chưa có yêu cầu nào được gửi. Việc Kael theo dõi yêu cầu này đã được đóng trước đó.'
      : copy.refused);
    outcome.status = 'failed';
    outcome.error = 'internal';
    return outcome;
  }
  const reconcilable = completion.status === 'invalid' || (completion.outcome === 'uncertain' && reconcilableStatuses.includes(completion.task.status));
  if (!reconcilable) {
    say(submit
      ? 'Chưa xác định được yêu cầu đã được ghi nhận hay chưa, và việc này đã thay đổi trong lúc gửi nên Kael không thử lại. Bạn có thể xem danh sách yêu cầu của mình để kiểm tra.'
      : 'Chưa xác định được thao tác đã được ghi nhận hay chưa, và việc này đã thay đổi trong lúc xử lý nên Kael không thử lại. Hãy mở màn hình liên quan để xem trạng thái mới nhất.');
    return outcome;
  }
  input.emit({
    type: 'approval_required',
    approval: {
      id: input.approvalId, task_id: consumed.task_id, tool: consumed.tool, summary: consumed.summary, details: consumed.details,
      fingerprint: input.fingerprint, kind: 'reconcile', expires_at: null,
    },
  });
  say(copy.uncertain);
  return outcome;
}

type Verdict = { outcome: 'succeeded'; resourceId: string } | { outcome: 'failed' | 'uncertain' };

function verifiedOutcome(effect: EffectOutcome, completion: ApprovalCompletion, kind: string): Verdict {
  if (completion.status !== 'ok' && completion.status !== 'final') return { outcome: 'uncertain' };
  if (completion.outcome === 'failed') return { outcome: effect.status === 'failed' ? 'failed' : 'uncertain' };
  if (completion.outcome !== 'succeeded') return { outcome: 'uncertain' };
  const resource = completion.result?.resource_id;
  if (typeof resource !== 'string' || completion.result?.resource_kind !== kind) return { outcome: 'uncertain' };
  const recorded = completion.task.status === 'completed'
    || (closedTaskStatuses.includes(completion.task.status) && completion.task.artifact?.effect_result?.resource_id === resource);
  if (!recorded) return { outcome: 'uncertain' };
  if (effect.status === 'succeeded' && effect.resourceId !== resource) return { outcome: 'uncertain' };
  return { outcome: 'succeeded', resourceId: resource };
}
