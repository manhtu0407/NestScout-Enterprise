import { Platform, Share } from 'react-native';

export type ShareableMessage = { role: 'user' | 'assistant'; text: string };
export type ShareOutcome = 'shared' | 'copied' | 'empty' | 'failed';

export const shareNotices: Readonly<Record<Exclude<ShareOutcome, 'shared'>, string>> = {
  copied: 'Đã sao chép nội dung cuộc trò chuyện.',
  empty: 'Chưa có nội dung để chia sẻ.',
  failed: 'Thiết bị này chưa mở được chia sẻ.',
};

const heading = 'Cuộc trò chuyện với Kael';

export function transcriptOf(messages: readonly ShareableMessage[]): string {
  const lines = messages.filter(message => message.text.trim() !== '').map(message => `${message.role === 'user' ? 'Bạn' : 'Kael'}: ${message.text.trim()}`);
  return lines.length === 0 ? '' : `${heading}\n\n${lines.join('\n\n')}`;
}

async function copyToClipboard(text: string): Promise<boolean> {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined' || !navigator.clipboard) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export async function shareConversation(messages: readonly ShareableMessage[]): Promise<ShareOutcome> {
  const transcript = transcriptOf(messages);
  if (transcript === '') return 'empty';
  try {
    await Share.share({ message: transcript });
    return 'shared';
  } catch {
    return await copyToClipboard(transcript) ? 'copied' : 'failed';
  }
}
