import { deviceStorage } from '@/lib/device-storage';
import { hostedKaelPreviewEnabled } from '@/lib/config';
import { getSupabaseClient } from '@/lib/supabase-client';

import { createSupabaseAuthGateway } from './auth/supabase-auth-gateway';
import { createSupabaseCapabilityRepository } from './capability/capability-repository';
import { createPreferredModeStore } from './mode/preferred-mode-store';
import type { AccessServices } from './state/access-provider';

let services: AccessServices | undefined;

export function getDefaultAccessServices(): AccessServices {
  if (!services) {
    const client = getSupabaseClient();
    services = {
      auth: createSupabaseAuthGateway(client),
      capabilities: createSupabaseCapabilityRepository(client),
      preferredMode: createPreferredModeStore(deviceStorage, hostedKaelPreviewEnabled() ? 'nestscout.kael-hosted-preview.preferred-mode' : undefined),
    };
  }
  return services;
}
