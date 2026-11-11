import { serviceCategories, serviceCategoryFor } from './service-catalog';

export type ServiceEntryComposer = {
  text: string;
  hasConversation: boolean;
  canParkDraft: boolean;
};

export type ServiceEntryPlan =
  | { kind: 'prefill'; text: string; fresh: boolean }
  | { kind: 'keep'; notice: string };

export const guestSendNotice = 'Đăng nhập để trò chuyện với Kael. Tin nhắn của bạn chưa được gửi.';

export const serviceEntryKeptNotice = 'Bạn đang có tin nhắn chưa gửi nên Kael giữ nguyên nội dung đó. Gửi hoặc xoá tin nhắn rồi chọn lại dịch vụ.';

export function isServiceOpening(text: string): boolean {
  const trimmed = text.trim();
  return serviceCategories.some(category => category.kaelOpening === trimmed);
}

function replaceable(text: string): boolean {
  return text.trim() === '' || isServiceOpening(text);
}

export function planServiceEntry(categoryId: string, composer: ServiceEntryComposer): ServiceEntryPlan | null {
  const category = serviceCategoryFor(categoryId);
  if (category === undefined) return null;
  const text = category.kaelOpening;
  if (composer.hasConversation) {
    return replaceable(composer.text) || composer.canParkDraft ? { kind: 'prefill', text, fresh: true } : { kind: 'keep', notice: serviceEntryKeptNotice };
  }
  return replaceable(composer.text) ? { kind: 'prefill', text, fresh: false } : { kind: 'keep', notice: serviceEntryKeptNotice };
}
