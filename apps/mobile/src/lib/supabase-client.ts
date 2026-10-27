import 'react-native-url-polyfill/auto';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { loadConfig } from './config';
import { deviceStorage } from './device-storage';

let client: SupabaseClient | undefined;

// The only Supabase client: publishable key, session kept in the keychain.
export function getSupabaseClient(): SupabaseClient {
  if (!client) {
    const config = loadConfig();
    client = createClient(config.supabaseUrl, config.supabasePublishableKey, {
      auth: {
        storage: deviceStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}
