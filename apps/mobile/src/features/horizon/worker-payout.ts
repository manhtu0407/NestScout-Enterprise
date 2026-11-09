import type { MediaFile, WorkerPayoutInput, WorkerPayoutRecord, WorkerPayoutStatus } from '@/features/shared';

export type PayoutBank = { code: string; name: string };

export const payoutBanks: readonly PayoutBank[] = [
  { code: 'VCB', name: 'Vietcombank' },
  { code: 'TCB', name: 'Techcombank' },
  { code: 'MBB', name: 'MB Bank' },
  { code: 'ACB', name: 'ACB' },
  { code: 'BIDV', name: 'BIDV' },
  { code: 'CTG', name: 'VietinBank' },
  { code: 'AGRI', name: 'Agribank' },
  { code: 'VPB', name: 'VPBank' },
  { code: 'TPB', name: 'TPBank' },
  { code: 'STB', name: 'Sacombank' },
  { code: 'VIB', name: 'VIB' },
  { code: 'HDB', name: 'HDBank' },
  { code: 'SHB', name: 'SHB' },
  { code: 'OCB', name: 'OCB' },
  { code: 'MSB', name: 'MSB' },
  { code: 'SEAB', name: 'SeABank' },
  { code: 'LPB', name: 'LPBank' },
  { code: 'EIB', name: 'Eximbank' },
  { code: 'NAB', name: 'Nam A Bank' },
  { code: 'BAB', name: 'Bac A Bank' },
  { code: 'ABB', name: 'ABBank' },
  { code: 'VAB', name: 'VietABank' },
  { code: 'NCB', name: 'NCB' },
  { code: 'SCB', name: 'SCB' },
  { code: 'CAKE', name: 'Cake by VPBank' },
  { code: 'TIMO', name: 'Timo' },
];

export const payoutStatusLabels: Readonly<Record<WorkerPayoutStatus, string>> = {
  pending: 'Chờ xác minh',
  verified: 'Đã xác minh',
  rejected: 'Bị từ chối',
};

export type WorkerPayoutView = {
  bankCode: string;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  qrPath: string;
  status: WorkerPayoutStatus;
  statusLabel: string;
  updatedAt: string;
};

export function toWorkerPayoutView(record: WorkerPayoutRecord | null): WorkerPayoutView | null {
  if (record === null) return null;
  return {
    bankCode: record.bank_code,
    bankName: record.bank_name,
    accountNumber: record.account_number,
    accountHolder: record.account_holder,
    qrPath: record.qr_path,
    status: record.status,
    statusLabel: payoutStatusLabels[record.status],
    updatedAt: record.updated_at,
  };
}

export type WorkerPayoutFields = { bankCode: string; accountNumber: string; accountHolder: string; confirmed: boolean };

export type WorkerPayoutDraft = { input: WorkerPayoutInput; qr: MediaFile | null };

export type WorkerPayoutCommand = { type: 'save'; draft: WorkerPayoutDraft; existingQrPath: string | null } | { type: 'remove' };

export type WorkerPayoutPerform = (command: WorkerPayoutCommand) => Promise<string>;

export function emptyPayoutFields(view: WorkerPayoutView | null): WorkerPayoutFields {
  return { bankCode: view?.bankCode ?? '', accountNumber: view?.accountNumber ?? '', accountHolder: view?.accountHolder ?? '', confirmed: false };
}

export function normalizeAccountHolder(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function maskAccountNumber(value: string): string {
  return value.length <= 4 ? value : `${'•'.repeat(Math.min(value.length - 4, 6))} ${value.slice(-4)}`;
}

export type PayoutValidation = { draft: WorkerPayoutDraft; error: null } | { draft: null; error: string };

export function validatePayoutFields(fields: WorkerPayoutFields, qr: MediaFile | null, existingQrPath: string | null): PayoutValidation {
  const bank = payoutBanks.find(item => item.code === fields.bankCode);
  if (bank === undefined) return { draft: null, error: 'Chọn ngân hàng nhận tiền.' };
  const number = fields.accountNumber.replace(/\s+/g, '');
  if (!/^[0-9]{6,19}$/.test(number)) return { draft: null, error: 'Số tài khoản gồm 6 đến 19 chữ số, không có chữ hoặc ký tự khác.' };
  const holder = normalizeAccountHolder(fields.accountHolder);
  if (!/^[A-Z]+( [A-Z]+)*$/.test(holder) || holder.length < 2 || holder.length > 60) {
    return { draft: null, error: 'Tên chủ tài khoản chỉ gồm chữ cái, viết hoa không dấu, đúng như trong ứng dụng ngân hàng.' };
  }
  if (qr === null && existingQrPath === null) return { draft: null, error: 'Tải ảnh mã QR nhận tiền do chính bạn xuất từ ứng dụng ngân hàng.' };
  if (!fields.confirmed) return { draft: null, error: 'Hãy xác nhận đây là tài khoản chính chủ của bạn.' };
  return { draft: { input: { bank_code: bank.code, bank_name: bank.name, account_number: number, account_holder: holder }, qr }, error: null };
}
