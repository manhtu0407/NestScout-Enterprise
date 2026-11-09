import { callRpc } from './customer-data-repository';

export const reviewReactionIds = ['helpful', 'thanks', 'accurate', 'detailed'] as const;

export type ReviewReactionId = (typeof reviewReactionIds)[number];

export type ReviewReactionCount = { id: ReviewReactionId; count: number; reacted: boolean };

export type ReviewReactionMap = Readonly<Record<string, readonly ReviewReactionCount[]>>;

const uuidShape = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isReactionId(value: unknown): value is ReviewReactionId {
  return typeof value === 'string' && (reviewReactionIds as readonly string[]).includes(value);
}

export async function readReviewReactions(userId: string, reviewIds: readonly string[], signal: AbortSignal): Promise<ReviewReactionMap> {
  const ids = reviewIds.filter(id => uuidShape.test(id));
  if (ids.length === 0) return {};
  const result = await callRpc(userId, 'review_reactions', { p_review_ids: ids }, signal);
  if (!Array.isArray(result)) throw new Error('Invalid reactions response');
  const grouped: Record<string, ReviewReactionCount[]> = {};
  for (const row of result) {
    if (typeof row !== 'object' || row === null) throw new Error('Invalid reactions response');
    const entry = row as Record<string, unknown>;
    if (typeof entry.review_id !== 'string' || !isReactionId(entry.reaction) || typeof entry.total !== 'number' || !Number.isSafeInteger(entry.total) || typeof entry.reacted !== 'boolean') {
      throw new Error('Invalid reactions response');
    }
    (grouped[entry.review_id] ??= []).push({ id: entry.reaction, count: entry.total, reacted: entry.reacted });
  }
  return grouped;
}

export async function toggleReviewReaction(userId: string, reviewId: string, reaction: ReviewReactionId, signal: AbortSignal): Promise<boolean> {
  const result = await callRpc(userId, 'toggle_review_reaction', { p_review_id: reviewId, p_reaction: reaction }, signal);
  if (typeof result !== 'boolean') throw new Error('Invalid reactions response');
  return result;
}
