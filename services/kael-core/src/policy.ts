import type { KaelConfig } from './config.ts';
import type { ToolCall } from './model.ts';
import { findTool, toolRegistry, validateArguments } from './tools.ts';
import type { Capability, KaelMode, ToolContract } from './tools.ts';

export type Autonomy = 'ask' | 'auto';

export type Actor = { userId: string; capabilities: ReadonlySet<Capability>; mode: KaelMode; autonomy?: Autonomy };

export type DenialReason = 'unknown_tool' | 'not_offered' | 'invalid_arguments' | 'forbidden' | 'effect_disabled' | 'tool_budget';

export type Decision =
  | { kind: 'execute'; tool: ToolContract; args: Record<string, unknown> }
  | { kind: 'approval'; tool: ToolContract; args: Record<string, unknown> }
  | { kind: 'deny'; reason: DenialReason; tool: ToolContract | null };

function permitted(tool: ToolContract, actor: Actor, config: KaelConfig): DenialReason | null {
  if (tool.resource === 'knowledge' && !config.knowledgeEnabled) return 'not_offered';
  if (!tool.modes.includes(actor.mode)) return 'not_offered';
  if (tool.requires !== null && !actor.capabilities.has(tool.requires)) return 'forbidden';
  if (tool.needsWebSearch && config.perplexity === null) return 'not_offered';
  if (tool.effect !== null && !config.enabledEffects.has(tool.effect)) return 'effect_disabled';
  return null;
}

export function selectTools(actor: Actor, config: KaelConfig): ToolContract[] {
  return toolRegistry.filter(tool => permitted(tool, actor, config) === null);
}

export function evaluateCall(call: ToolCall, offered: readonly ToolContract[], actor: Actor, config: KaelConfig, toolCallsUsed: number): Decision {
  const tool = findTool(call.name);
  if (!tool) return { kind: 'deny', reason: 'unknown_tool', tool: null };
  if (!offered.some(candidate => candidate.id === tool.id)) return { kind: 'deny', reason: 'not_offered', tool };
  const denial = permitted(tool, actor, config);
  if (denial) return { kind: 'deny', reason: denial, tool };
  if (toolCallsUsed >= config.limits.maxToolCalls) return { kind: 'deny', reason: 'tool_budget', tool };
  if (!validateArguments(tool, call.input)) return { kind: 'deny', reason: 'invalid_arguments', tool };
  return tool.executionClass === 'explicit_confirmation' ? { kind: 'approval', tool, args: call.input } : { kind: 'execute', tool, args: call.input };
}

export function confirmableTools(actor: Actor, config: KaelConfig): string[] {
  return toolRegistry.filter(tool => tool.executionClass === 'explicit_confirmation' && permitted(tool, actor, config) === null).map(tool => tool.id);
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

export async function fingerprint(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalJson(value)));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
