import { readKaelEdgeEnvironment } from '../../../services/kael-core/src/config.ts';
import { createKaelHandler } from '../../../services/kael-core/src/gateway.ts';

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Promise<Response>): unknown;
};

Deno.serve(createKaelHandler({ env: readKaelEdgeEnvironment(name => Deno.env.get(name)) }));
