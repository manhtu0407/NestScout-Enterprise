export type SseMessage = { event: string; data: string };

export async function* readSse(body: ReadableStream<Uint8Array>, signal: AbortSignal): AsyncGenerator<SseMessage> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let event = '';
  let data: string[] = [];
  const abort = () => { void reader.cancel(); };
  signal.addEventListener('abort', abort, { once: true });
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.search(/\r?\n/);
      while (newline >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(buffer[newline] === '\r' ? newline + 2 : newline + 1);
        if (line === '') {
          if (data.length > 0) yield { event: event || 'message', data: data.join('\n') };
          event = '';
          data = [];
        } else if (line.startsWith('data:')) {
          data.push(line.slice(5).replace(/^ /, ''));
        } else if (line.startsWith('event:')) {
          event = line.slice(6).trim();
        }
        newline = buffer.search(/\r?\n/);
      }
    }
    if (data.length > 0) yield { event: event || 'message', data: data.join('\n') };
  } finally {
    signal.removeEventListener('abort', abort);
    reader.releaseLock();
  }
}
