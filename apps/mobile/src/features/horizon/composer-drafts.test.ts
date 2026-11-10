import { createComposerDrafts, emptyComposerDraft } from './composer-drafts';

const image = { uri: 'file:///a.jpg', mimeType: 'image/jpeg', fileSize: 10 } as never;

test('a parked draft returns only to its own session with its attachments', () => {
  const drafts = createComposerDrafts();
  drafts.park('user-a:client', 'session-a', { text: 'Nháp của A', images: [image] });
  expect(drafts.recall('user-a:client', 'session-a')).toEqual({ text: 'Nháp của A', images: [image] });
  expect(drafts.recall('user-a:client', 'session-b')).toBe(emptyComposerDraft);
});

test('another account or mode never sees a parked draft', () => {
  const drafts = createComposerDrafts();
  drafts.park('user-a:client', 'session-a', { text: 'Riêng tư', images: [image] });
  expect(drafts.recall('user-b:client', 'session-a')).toBe(emptyComposerDraft);
  expect(drafts.recall('user-a:worker', 'session-a')).toBe(emptyComposerDraft);
});

test('an emptied draft, a discarded session and a cleared store leave nothing behind', () => {
  const drafts = createComposerDrafts();
  drafts.park('u', 's1', { text: 'x', images: [] });
  drafts.park('u', 's1', { text: '   ', images: [] });
  expect(drafts.recall('u', 's1')).toBe(emptyComposerDraft);
  drafts.park('u', 's2', { text: 'y', images: [] });
  drafts.discard('u', 's2');
  expect(drafts.recall('u', 's2')).toBe(emptyComposerDraft);
  drafts.park('u', 's3', { text: 'z', images: [image] });
  drafts.clear();
  expect(drafts.recall('u', 's3')).toBe(emptyComposerDraft);
});
