import { deviceStorage } from '@/lib/device-storage';

import { loadPendingRequest, savePendingRequest } from './pending-request-store';

jest.mock('@/lib/device-storage', () => ({ deviceStorage: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() } }));

const key = '00000000-0000-4000-8000-000000000456';

beforeEach(() => jest.clearAllMocks());

test('a draft saved before locations existed loads with an empty location', async () => {
  jest.mocked(deviceStorage.getItem).mockResolvedValue(JSON.stringify({ key, description: 'Repair' }));
  await expect(loadPendingRequest('u1')).resolves.toEqual({ key, description: 'Repair', location: '' });
});

test('a draft keeps its location through save and load', async () => {
  await savePendingRequest('u1', { key, description: 'Repair', location: '12 Nguyen Hue' });
  const stored = jest.mocked(deviceStorage.setItem).mock.calls[0]?.[1] as string;
  jest.mocked(deviceStorage.getItem).mockResolvedValue(stored);
  await expect(loadPendingRequest('u1')).resolves.toEqual({ key, description: 'Repair', location: '12 Nguyen Hue' });
});

test('a draft with an invalid location is rejected', async () => {
  jest.mocked(deviceStorage.getItem).mockResolvedValue(JSON.stringify({ key, description: 'Repair', location: 4 }));
  await expect(loadPendingRequest('u1')).rejects.toThrow('Invalid pending request');
  jest.mocked(deviceStorage.getItem).mockResolvedValue(JSON.stringify({ key, description: 'Repair', location: 'x'.repeat(201) }));
  await expect(loadPendingRequest('u1')).rejects.toThrow('Invalid pending request');
});

test('a missing draft loads as nothing', async () => {
  jest.mocked(deviceStorage.getItem).mockResolvedValue(null);
  await expect(loadPendingRequest('u1')).resolves.toBeNull();
});
