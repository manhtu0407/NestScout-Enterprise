let pending: string | null = null;

export function handOffToKael(prompt: string): void {
  pending = prompt.trim() || null;
}

export function consumeKaelHandoff(): string | null {
  const prompt = pending;
  pending = null;
  return prompt;
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
