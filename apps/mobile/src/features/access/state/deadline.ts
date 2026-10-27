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
