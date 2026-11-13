import { fetchKaelKnowledgeSources } from './kael-knowledge-repository';

const hash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const row = (extra: Record<string, unknown> = {}) => ({ source_id: 'case.ac-leak', revision: 2, content_hash: hash, source_kind: 'synthetic_case', title: 'Máy lạnh chảy nước', content: 'Nội dung '.repeat(200), ...extra });
const reply = (body: unknown, status = 200) => jest.fn(async () => ({ ok: status < 300, status, json: async () => body }) as unknown as Response);
const signal = new AbortController().signal;

test('queries the readable sources by id and keeps only rows matching revision and hash', async () => {
  const request = reply([row(), row({ revision: 1 }), row({ content_hash: 'b'.repeat(64) })]);
  const sources = await fetchKaelKnowledgeSources('user-a', [{ sourceId: 'case.ac-leak', revision: 2, contentHash: hash }], signal, request);
  expect(sources).toHaveLength(1);
  expect(sources[0]).toMatchObject({ sourceId: 'case.ac-leak', revision: 2, title: 'Máy lạnh chảy nước', kind: 'synthetic_case' });
  expect(sources[0]!.excerpt).toHaveLength(600);
  const [userId, path] = request.mock.calls[0] as unknown as [string, string];
  expect(userId).toBe('user-a');
  expect(path).toContain('kael_knowledge_sources?select=');
  expect(path).toContain('source_id=in.(case.ac-leak)');
});

test('makes no request without valid lookups', async () => {
  const request = reply([]);
  expect(await fetchKaelKnowledgeSources('user-a', [{ sourceId: 'Bad Id', revision: 1, contentHash: hash }], signal, request)).toEqual([]);
  expect(request).not.toHaveBeenCalled();
});

test('rejects a failed or malformed response', async () => {
  await expect(fetchKaelKnowledgeSources('user-a', [{ sourceId: 'case.ac-leak', revision: 2, contentHash: hash }], signal, reply({}, 500))).rejects.toThrow('failed');
  await expect(fetchKaelKnowledgeSources('user-a', [{ sourceId: 'case.ac-leak', revision: 2, contentHash: hash }], signal, reply({}))).rejects.toThrow('unexpected');
});
