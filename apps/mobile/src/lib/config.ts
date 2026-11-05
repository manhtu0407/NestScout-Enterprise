import { Platform } from 'react-native';

const hostedPreviewTarget = 'kael-hosted-preview';
const hostedKaelOrigin = 'https://axpdymbusiwxfzurfclg.supabase.co';

export type AppConfig = {
  target: 'local' | typeof hostedPreviewTarget;
  supabaseUrl: string;
  supabasePublishableKey: string;
};

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

type RawConfig = {
  target: string | undefined;
  supabaseUrl: string | undefined;
  supabaseKey: string | undefined;
};

const privateHost =
  /^(?:localhost|127(?:\.\d{1,3}){3}|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})$/;

export function hostedKaelPreviewEnabled(): boolean {
  return __DEV__ && Platform.OS === 'web' && process.env.EXPO_PUBLIC_NESTSCOUT_TARGET === hostedPreviewTarget
    && typeof window !== 'undefined' && /^http:\/\/(?:localhost|127\.0\.0\.1):8085$/.test(window.location.origin);
}

function decodeJwtRole(token: string): string | undefined {
  const payload = token.split('.')[1];
  if (!payload) return undefined;
  try {
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const role = (JSON.parse(json) as { role?: unknown }).role;
    return typeof role === 'string' ? role : undefined;
  } catch {
    return undefined;
  }
}

export function parseConfig(raw: RawConfig, allowHostedPreview = false): AppConfig {
  if (raw.target !== 'local' && (raw.target !== hostedPreviewTarget || !allowHostedPreview)) {
    throw new ConfigError('Choose the local target or open the approved Kael Preview on development web port 8085.');
  }
  if (!raw.supabaseUrl) throw new ConfigError('EXPO_PUBLIC_SUPABASE_URL is required.');
  let url: URL;
  try {
    url = new URL(raw.supabaseUrl);
  } catch {
    throw new ConfigError('EXPO_PUBLIC_SUPABASE_URL is not a valid URL.');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new ConfigError('EXPO_PUBLIC_SUPABASE_URL must be a plain http(s) origin.');
  }
  if (raw.target === 'local' && !privateHost.test(url.hostname)) {
    throw new ConfigError('EXPO_PUBLIC_SUPABASE_URL must be a loopback or private-network host for the local target.');
  }
  if (raw.target === hostedPreviewTarget && url.origin !== hostedKaelOrigin) {
    throw new ConfigError('The Kael Preview requires the approved NestScout Supabase HTTPS origin.');
  }
  const key = raw.supabaseKey?.trim();
  if (!key) throw new ConfigError('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required.');
  if (key.startsWith('sb_secret_') || decodeJwtRole(key) === 'service_role') {
    throw new ConfigError('A secret or service_role key must never be embedded in the mobile app.');
  }
  if (raw.target === hostedPreviewTarget && !/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) {
    throw new ConfigError('The Kael Preview requires a Supabase publishable key.');
  }
  return { target: raw.target, supabaseUrl: url.origin, supabasePublishableKey: key };
}

export function loadConfig(): AppConfig {
  return parseConfig({
    target: process.env.EXPO_PUBLIC_NESTSCOUT_TARGET,
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  }, hostedKaelPreviewEnabled());
}
