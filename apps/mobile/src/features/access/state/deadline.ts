// Resolves with `fallback` when `run` throws, rejects or does not settle within `ms`.
// A deadline only stops WAITING: it cancels the underlying request solely through
// `onTimeout` (for example an AbortController), and callers without one are
// abandoning an operation that may still complete. Late results must be discarded
// by the caller's own request identity.
export function withDeadline<T>(run: () => Promise<T>, ms: number, fallback: T, onTimeout?: () => void): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      onTimeout?.();
      resolve(fallback);
    }, ms);
    new Promise<T>((done) => done(run())).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}
