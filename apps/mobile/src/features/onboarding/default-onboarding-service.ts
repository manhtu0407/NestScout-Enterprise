import { hostedKaelPreviewEnabled } from '@/lib/config';
import { deviceStorage } from '@/lib/device-storage';
import { getSupabaseClient } from '@/lib/supabase-client';

import { createOnboardingLocalStore } from './onboarding-local-store';
import { createSupabaseOnboardingRemote } from './onboarding-remote';
import { createOnboardingService, type OnboardingService } from './onboarding-service';

let service: OnboardingService | undefined;

export function getDefaultOnboardingService(): OnboardingService {
  if (!service) {
    const local = createOnboardingLocalStore(deviceStorage, hostedKaelPreviewEnabled() ? 'nestscout.kael-hosted-preview.onboarding' : undefined);
    service = createOnboardingService(local, createSupabaseOnboardingRemote(getSupabaseClient()));
  }
  return service;
}
