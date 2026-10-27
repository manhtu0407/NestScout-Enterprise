export type AppConfig = {
  target: 'local';
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

export function parseConfig(raw: RawConfig): AppConfig {
  if (raw.target !== 'local') {
    throw new ConfigError('EXPO_PUBLIC_NESTSCOUT_TARGET must be "local"; hosted targets are not supported.');
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
  if (!privateHost.test(url.hostname)) {
    throw new ConfigError('EXPO_PUBLIC_SUPABASE_URL must be a loopback or private-network host for the local target.');
  }
  const key = raw.supabaseKey?.trim();
  if (!key) throw new ConfigError('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required.');
  if (key.startsWith('sb_secret_') || decodeJwtRole(key) === 'service_role') {
    throw new ConfigError('A secret or service_role key must never be embedded in the mobile app.');
  }
  return { target: 'local', supabaseUrl: url.origin, supabasePublishableKey: key };
}

export function loadConfig(): AppConfig {
  return parseConfig({
    target: process.env.EXPO_PUBLIC_NESTSCOUT_TARGET,
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
}
