import { acceptTerms, cancelAccountDeletion, decideJobChange, exportPersonalData, readConsent, readDeletionRequest, readJobChanges, readTermsAcceptance, recordConsent, registerPushToken, requestAccountDeletion, requestJobChange, unregisterPushToken } from './account-compliance-repository';

const mockRequest = jest.fn();
jest.mock('@/lib/authenticated-rest', () => ({ authenticatedRequest: (...args: unknown[]) => mockRequest(...args) }));

const signal = new AbortController().signal;
const json = (body: unknown, ok = true) => ({ ok, status: ok ? 200 : 400, json: async () => body });

beforeEach(() => mockRequest.mockReset());

test('reads the acceptance of one document version', async () => {
  mockRequest.mockResolvedValue(json([{ accepted_at: '2026-11-09T10:00:00Z' }]));
  expect(await readTermsAcceptance('u', 'terms', '2026-11-09-v1.0', signal)).toBe('2026-11-09T10:00:00Z');
  expect(mockRequest.mock.calls[0]?.[1]).toBe('terms_acceptances?select=accepted_at&document=eq.terms&version=eq.2026-11-09-v1.0');
  mockRequest.mockResolvedValue(json([]));
  expect(await readTermsAcceptance('u', 'terms', '2026-11-09-v1.0', signal)).toBeNull();
});

test('rejects malformed responses instead of inventing a state', async () => {
  mockRequest.mockResolvedValue(json([{ accepted_at: 'not a date' }]));
  await expect(readTermsAcceptance('u', 'terms', 'v', signal)).rejects.toThrow('Invalid');
  mockRequest.mockResolvedValue(json([{ requested_at: 1 }]));
  await expect(readDeletionRequest('u', signal)).rejects.toThrow('Invalid');
  mockRequest.mockResolvedValue(json({}, false));
  await expect(readTermsAcceptance('u', 'terms', 'v', signal)).rejects.toThrow('Could not read');
});

test('calls the RPCs with the expected arguments and validates their results', async () => {
  mockRequest.mockResolvedValue(json('2026-11-09T10:00:00Z'));
  expect(await acceptTerms('u', 'terms', '2026-11-09-v1.0', signal)).toBe('2026-11-09T10:00:00Z');
  expect(mockRequest.mock.calls[0]?.[1]).toBe('rpc/accept_terms');
  expect(JSON.parse(mockRequest.mock.calls[0]?.[2].body)).toEqual({ p_document: 'terms', p_version: '2026-11-09-v1.0' });
  expect(await requestAccountDeletion('u', signal)).toBe('2026-11-09T10:00:00Z');
  mockRequest.mockResolvedValue(json(true));
  await expect(cancelAccountDeletion('u', signal)).resolves.toBeUndefined();
  mockRequest.mockResolvedValue(json('x'));
  await expect(cancelAccountDeletion('u', signal)).rejects.toThrow('Invalid');
});

test('reads the latest consent decision and defaults to not granted', async () => {
  mockRequest.mockResolvedValue(json([]));
  expect(await readConsent('u', 'ai_sharing', signal)).toBe(false);
  expect(mockRequest.mock.calls[0]?.[1]).toBe('consent_events?select=granted&purpose=eq.ai_sharing&order=id.desc&limit=1');
  mockRequest.mockResolvedValue(json([{ granted: true }]));
  expect(await readConsent('u', 'ai_sharing', signal)).toBe(true);
  mockRequest.mockResolvedValue(json([{ granted: 'yes' }]));
  await expect(readConsent('u', 'ai_sharing', signal)).rejects.toThrow('Invalid');
});

test('records a consent decision with its policy version', async () => {
  mockRequest.mockResolvedValue(json('2026-11-09T10:00:00Z'));
  expect(await recordConsent('u', 'push_notifications', false, '2026-11-09-v1.0', signal)).toBe('2026-11-09T10:00:00Z');
  expect(JSON.parse(mockRequest.mock.calls[0]?.[2].body)).toEqual({ p_purpose: 'push_notifications', p_granted: false, p_version: '2026-11-09-v1.0' });
  mockRequest.mockResolvedValue(json(null));
  await expect(recordConsent('u', 'ai_sharing', true, 'v', signal)).rejects.toThrow('Invalid');
});

test('exports personal data as formatted JSON and rejects malformed output', async () => {
  mockRequest.mockResolvedValue(json({ exported_at: '2026-11-09T10:00:00Z', consents: [] }));
  const text = await exportPersonalData('u', signal);
  expect(JSON.parse(text)).toEqual({ exported_at: '2026-11-09T10:00:00Z', consents: [] });
  mockRequest.mockResolvedValue(json([]));
  await expect(exportPersonalData('u', signal)).rejects.toThrow('Invalid');
});

test('registers and unregisters push tokens through the RPCs', async () => {
  mockRequest.mockResolvedValue(json('2026-11-09T10:00:00Z'));
  await registerPushToken('u', 'ExponentPushToken[abcdefghij]', 'ios', signal);
  expect(JSON.parse(mockRequest.mock.calls[0]?.[2].body)).toEqual({ p_token: 'ExponentPushToken[abcdefghij]', p_platform: 'ios' });
  mockRequest.mockResolvedValue(json(true));
  await expect(unregisterPushToken('u', 'ExponentPushToken[abcdefghij]', signal)).resolves.toBeUndefined();
  mockRequest.mockResolvedValue(json('x'));
  await expect(unregisterPushToken('u', 't', signal)).rejects.toThrow('Invalid');
});

const change = { id: 'c1', job_id: 'j1', requested_by: 'u', kind: 'reschedule', proposed_for: '2026-12-01T09:00:00Z', reason: null, status: 'pending', created_at: '2026-11-09T10:00:00Z' };

test('reads job changes for one job and validates each row', async () => {
  mockRequest.mockResolvedValue(json([change]));
  expect(await readJobChanges('u', 'j1', signal)).toEqual([{ id: 'c1', jobId: 'j1', requestedBy: 'u', kind: 'reschedule', proposedFor: '2026-12-01T09:00:00Z', reason: null, status: 'pending', createdAt: '2026-11-09T10:00:00Z' }]);
  expect(mockRequest.mock.calls[0]?.[1]).toContain('job_id=eq.j1');
  mockRequest.mockResolvedValue(json([{ ...change, status: 'weird' }]));
  await expect(readJobChanges('u', 'j1', signal)).rejects.toThrow('Invalid');
});

test('files and decides job changes through the RPCs', async () => {
  mockRequest.mockResolvedValue(json('c1'));
  expect(await requestJobChange('u', 'j1', 'cancel', null, 'bận', signal)).toBe('c1');
  expect(JSON.parse(mockRequest.mock.calls[0]?.[2].body)).toEqual({ p_job_id: 'j1', p_kind: 'cancel', p_proposed_for: null, p_reason: 'bận' });
  mockRequest.mockResolvedValue(json('agreed'));
  await expect(decideJobChange('u', 'c1', 'agreed', signal)).resolves.toBeUndefined();
  mockRequest.mockResolvedValue(json('declined'));
  await expect(decideJobChange('u', 'c1', 'agreed', signal)).rejects.toThrow('Invalid');
});
