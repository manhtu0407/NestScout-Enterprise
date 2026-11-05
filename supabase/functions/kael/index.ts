import { createKaelHandler } from '../../../services/kael-core/src/gateway.ts';

declare const Deno: {
  env: { toObject(): Record<string, string> };
  serve(handler: (request: Request) => Promise<Response>): unknown;
};

const env = Object.fromEntries(Object.entries(Deno.env.toObject())
  .filter(([name, value]) => value !== `env(NESTSCOUT_LOCAL_${name})`));

Deno.serve(createKaelHandler({ env }));
