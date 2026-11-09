import { createPushDispatch } from './handler.ts';

declare const Deno: {
  env: { toObject(): Record<string, string> };
  serve(handler: (request: Request) => Promise<Response>): unknown;
};

Deno.serve(createPushDispatch({ env: Deno.env.toObject() }));
