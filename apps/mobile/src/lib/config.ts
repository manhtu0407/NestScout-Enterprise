import { Platform } from 'react-native';

const hostedPreviewTarget = 'kael-hosted-preview';
const testFlightTarget = 'testflight';
const appStoreTarget = 'app-store';
const hostedKaelOrigin = 'https://axpdymbusiwxfzurfclg.supabase.co';

export type AppConfig = {
  target: 'local' | typeof hostedPreviewTarget | typeof testFlightTarget | typeof appStoreTarget;
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

const hostedNativeVariables = {
  [testFlightTarget]: { url: 'EXPO_PUBLIC_TESTFLIGHT_SUPABASE_URL', key: 'EXPO_PUBLIC_TESTFLIGHT_SUPABASE_PUBLISHABLE_KEY' },
  [appStoreTarget]: { url: 'EXPO_PUBLIC_APP_STORE_SUPABASE_URL', key: 'EXPO_PUBLIC_APP_STORE_SUPABASE_PUBLISHABLE_KEY' },
} as const;

function isHostedNative(target: string | undefined): target is keyof typeof hostedNativeVariables {
  return target === testFlightTarget || target === appStoreTarget;
}

export function hostedKaelPreviewEnabled(): boolean {
  return Platform.OS === 'web' && process.env.EXPO_PUBLIC_NESTSCOUT_TARGET === hostedPreviewTarget;
}

export function hostedTestFlightEnabled(): boolean {
  return !__DEV__ && Platform.OS === 'ios' && process.env.EXPO_PUBLIC_NESTSCOUT_TARGET === testFlightTarget;
}

export function hostedAppStoreEnabled(): boolean {
  return !__DEV__ && Platform.OS === 'ios' && process.env.EXPO_PUBLIC_NESTSCOUT_TARGET === appStoreTarget;
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

export function parseConfig(raw: RawConfig, allowHostedPreview = false, allowTestFlight = false, allowAppStore = false): AppConfig {
  if (raw.target !== 'local' && !(raw.target === hostedPreviewTarget && allowHostedPreview) && !(raw.target === testFlightTarget && allowTestFlight)
    && !(raw.target === appStoreTarget && allowAppStore)) {
    throw new ConfigError('The selected backend target is not available in this application environment.');
  }
  if (!raw.supabaseUrl) throw new ConfigError(isHostedNative(raw.target) ? `${hostedNativeVariables[raw.target].url} is required.` : 'EXPO_PUBLIC_SUPABASE_URL is required.');
  let url: URL;
  try {
    url = new URL(raw.supabaseUrl);
  } catch {
    throw new ConfigError('The configured Supabase URL is not valid.');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new ConfigError('The configured Supabase URL must be a plain http(s) origin.');
  }
  if (raw.target === 'local' && !privateHost.test(url.hostname)) {
    throw new ConfigError('EXPO_PUBLIC_SUPABASE_URL must be a loopback or private-network host for the local target.');
  }
  const hostedTarget = raw.target === hostedPreviewTarget || isHostedNative(raw.target);
  if (hostedTarget && url.origin !== hostedKaelOrigin) {
    throw new ConfigError('The hosted target requires the approved NestScout Supabase HTTPS origin.');
  }
  const key = raw.supabaseKey?.trim();
  if (!key) throw new ConfigError(isHostedNative(raw.target) ? `${hostedNativeVariables[raw.target].key} is required.` : 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required.');
  if (key.startsWith('sb_secret_') || decodeJwtRole(key) === 'service_role') {
    throw new ConfigError('A secret or service_role key must never be embedded in the mobile app.');
  }
  if (hostedTarget && !/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) {
    throw new ConfigError('The hosted target requires a Supabase publishable key.');
  }
  return { target: raw.target, supabaseUrl: url.origin, supabasePublishableKey: key };
}

export function loadConfig(): AppConfig {
  const target = process.env.EXPO_PUBLIC_NESTSCOUT_TARGET;
  const environments = {
    [testFlightTarget]: { url: process.env.EXPO_PUBLIC_TESTFLIGHT_SUPABASE_URL, key: process.env.EXPO_PUBLIC_TESTFLIGHT_SUPABASE_PUBLISHABLE_KEY },
    [appStoreTarget]: { url: process.env.EXPO_PUBLIC_APP_STORE_SUPABASE_URL, key: process.env.EXPO_PUBLIC_APP_STORE_SUPABASE_PUBLISHABLE_KEY },
  };
  const native = isHostedNative(target) ? environments[target] : null;
  return parseConfig({
    target,
    supabaseUrl: native ? native.url : process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseKey: native ? native.key : process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  }, hostedKaelPreviewEnabled(), hostedTestFlightEnabled(), hostedAppStoreEnabled());
}
