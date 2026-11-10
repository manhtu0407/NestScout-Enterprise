import { randomUUID } from 'expo-crypto';

import { authenticatedStorageRequest, storageSource, type StorageSource } from '@/lib/authenticated-rest';

import { callRpc } from './customer-data-repository';
import { acceptedImageTypes, type MediaFile } from './customer-media-repository';

export type WorkerPayoutStatus = 'pending' | 'verified' | 'rejected';

export type WorkerPayoutRecord = {
  bank_code: string;
  bank_name: string;
  account_number: string;
  account_holder: string;
  qr_path: string;
  status: WorkerPayoutStatus;
  updated_at: string;
};

export type WorkerPayoutInput = { bank_code: string; bank_name: string; account_number: string; account_holder: string };

const bucket = 'worker-payout-qr';
const statuses: readonly string[] = ['pending', 'verified', 'rejected'];
const extensions: Readonly<Record<string, string>> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

function isPayout(value: unknown): value is WorkerPayoutRecord {
  if (typeof value !== 'object' || value === null) return false;
  const row = value as Record<string, unknown>;
  return typeof row.bank_code === 'string' && typeof row.bank_name === 'string' && typeof row.account_number === 'string'
    && typeof row.account_holder === 'string' && typeof row.qr_path === 'string' && statuses.includes(String(row.status))
    && typeof row.updated_at === 'string';
}

export async function readWorkerPayout(userId: string, signal: AbortSignal): Promise<WorkerPayoutRecord | null> {
  const result = await callRpc(userId, 'my_worker_payout_account', {}, signal);
  if (!Array.isArray(result) || result.length > 1 || !result.every(isPayout)) throw new Error('Invalid payout account response');
  return result[0] ?? null;
}

export function readPayoutQrSource(userId: string, path: string, version: string, signal: AbortSignal): Promise<StorageSource> {
  return storageSource(userId, bucket, path, version, signal);
}

async function deleteQr(userId: string, path: string, signal: AbortSignal): Promise<void> {
  const response = await authenticatedStorageRequest(userId, `${bucket}/${path}`, { method: 'DELETE', signal });
  if (!response.ok && response.status !== 404) throw new Error('Could not remove the stored QR');
}

export async function saveWorkerPayout(userId: string, input: WorkerPayoutInput, qr: MediaFile | null, existingPath: string | null, signal: AbortSignal): Promise<void> {
  if (qr === null) {
    if (existingPath === null) throw new Error('A QR image is required');
    const kept = await callRpc(userId, 'set_worker_payout_account', {
      p_bank_code: input.bank_code, p_bank_name: input.bank_name, p_account_number: input.account_number, p_account_holder: input.account_holder, p_qr_path: existingPath,
    }, signal);
    if (kept !== null) throw new Error('Invalid payout account response');
    return;
  }
  if (!acceptedImageTypes.includes(qr.mimeType)) throw new Error('Unsupported image type');
  const source = await fetch(qr.uri, { signal });
  if (!source.ok) throw new Error('Could not read the selected image');
  const body = await source.blob();
  const path = `${userId}/${randomUUID()}.${extensions[qr.mimeType]}`;
  const stored = await authenticatedStorageRequest(userId, `${bucket}/${path}`, { method: 'POST', signal, body, contentType: qr.mimeType });
  if (!stored.ok) throw new Error('Could not upload the QR image');
  let previous: unknown;
  try {
    previous = await callRpc(userId, 'set_worker_payout_account', {
      p_bank_code: input.bank_code, p_bank_name: input.bank_name, p_account_number: input.account_number, p_account_holder: input.account_holder, p_qr_path: path,
    }, signal);
  } catch (failure) {
    await deleteQr(userId, path, new AbortController().signal);
    throw failure;
  }
  if (typeof previous === 'string' && previous !== '') await deleteQr(userId, previous, signal);
}

export async function removeWorkerPayout(userId: string, signal: AbortSignal): Promise<void> {
  const path = await callRpc(userId, 'remove_worker_payout_account', {}, signal);
  if (typeof path === 'string' && path !== '') await deleteQr(userId, path, signal);
}
