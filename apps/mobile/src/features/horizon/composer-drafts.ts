import type { ComposerImage } from './composer-media';

export type ComposerDraft = { text: string; images: readonly ComposerImage[] };

export const emptyComposerDraft: ComposerDraft = { text: '', images: [] };

export const isEmptyDraft = (draft: ComposerDraft) => draft.text.trim() === '' && draft.images.length === 0;

const slot = (owner: string, conversationId: string) => `${owner}|${conversationId}`;

export function createComposerDrafts() {
  const parked = new Map<string, ComposerDraft>();
  return {
    park(owner: string, conversationId: string, draft: ComposerDraft) {
      if (isEmptyDraft(draft)) parked.delete(slot(owner, conversationId));
      else parked.set(slot(owner, conversationId), draft);
    },
    recall(owner: string, conversationId: string): ComposerDraft {
      return parked.get(slot(owner, conversationId)) ?? emptyComposerDraft;
    },
    discard(owner: string, conversationId: string) {
      parked.delete(slot(owner, conversationId));
    },
    clear() {
      parked.clear();
    },
  };
}
