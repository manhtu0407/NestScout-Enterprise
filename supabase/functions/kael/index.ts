import { createKaelHandler } from '../../../services/kael-core/src/gateway.ts';

declare const Deno: {
  env: { toObject(): Record<string, string> };
  serve(handler: (request: Request) => Promise<Response>): unknown;
};

Deno.serve(createKaelHandler({ env: Deno.env.toObject() }));
