import { createSendSmsHook } from './handler.ts';

declare const Deno: {
  env: { toObject(): Record<string, string> };
  serve(handler: (request: Request) => Promise<Response>): unknown;
};

Deno.serve(createSendSmsHook({ env: Deno.env.toObject() }));
