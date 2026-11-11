export type KaelHandoff = { prompt: string; fresh: boolean } | { service: string };

let pending: KaelHandoff | null = null;

export function handOffToKael(prompt: string, options: { fresh?: boolean } = {}): void {
  const text = prompt.trim();
  pending = text === '' ? null : { prompt: text, fresh: options.fresh === true };
}

export function handOffServiceEntry(categoryId: string): void {
  pending = { service: categoryId };
}

export function takeKaelHandoff(): KaelHandoff | null {
  const handoff = pending;
  pending = null;
  return handoff;
}

export function consumeKaelHandoff(): string | null {
  const handoff = takeKaelHandoff();
  return handoff !== null && 'prompt' in handoff ? handoff.prompt : null;
}

export function requestPrompt(request: { title: string; status: string; nextAction: string }): string {
  return `Kael ơi, giúp mình với yêu cầu "${request.title}". Trạng thái hiện tại: ${request.status}. ${request.nextAction} Mình nên làm gì tiếp theo?`;
}

export function quotePrompt(quote: { requestTitle: string; version: number; expired: boolean }): string {
  return quote.expired
    ? `Báo giá phiên bản ${quote.version} cho "${quote.requestTitle}" đã hết hạn. Kael giải thích giúp mình cần làm gì để có báo giá mới?`
    : `Kael giải thích giúp mình báo giá phiên bản ${quote.version} cho "${quote.requestTitle}" trước khi mình quyết định.`;
}

export function workerJobPrompt(job: { title: string; stageLabel?: string }): string {
  return `Kael ơi, giúp mình với công việc "${job.title}"${job.stageLabel ? ` (đang ở bước: ${job.stageLabel})` : ''}. Bước tiếp theo của mình là gì?`;
}

export function savedWorkerPrompt(worker: { name: string; trade: string; area: string }): string {
  return `Kael ơi, mình muốn hỏi về thợ đã lưu ${worker.name} (${worker.trade}, ${worker.area}). Mình có thể làm gì với thợ này?`;
}
