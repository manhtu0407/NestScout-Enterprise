import { Platform } from 'react-native';

import { ConfigError, hostedKaelPreviewEnabled, parseConfig } from './config';

const valid = { target: 'local', supabaseUrl: 'http://127.0.0.1:54321', supabaseKey: 'sb_publishable_example' };
const hosted = { ...valid, target: 'kael-hosted-preview', supabaseUrl: 'https://axpdymbusiwxfzurfclg.supabase.co' };

function jwt(role: string): string {
  const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${encode({ alg: 'HS256' })}.${encode({ role })}.signature`;
}

describe('parseConfig', () => {
  test('accepts a loopback or private-network origin with a publishable key', () => {
    expect(parseConfig(valid)).toEqual({ target: 'local', supabaseUrl: 'http://127.0.0.1:54321', supabasePublishableKey: 'sb_publishable_example' });
    expect(parseConfig({ ...valid, supabaseUrl: 'http://192.168.1.20:54321/' }).supabaseUrl).toBe('http://192.168.1.20:54321');
    expect(parseConfig({ ...valid, supabaseKey: jwt('anon') }).supabasePublishableKey).toBe(jwt('anon'));
  });

  test.each([
    ['missing target', { ...valid, target: undefined }],
    ['hosted target', { ...valid, target: 'production' }],
    ['missing url', { ...valid, supabaseUrl: undefined }],
    ['malformed url', { ...valid, supabaseUrl: 'not a url' }],
    ['hosted host', { ...valid, supabaseUrl: 'https://abcdefgh.supabase.co' }],
    ['public ip', { ...valid, supabaseUrl: 'http://8.8.8.8:54321' }],
    ['lookalike host', { ...valid, supabaseUrl: 'http://127.0.0.1.example.com' }],
    ['credentials in url', { ...valid, supabaseUrl: 'http://user:pass@127.0.0.1:54321' }],
    ['path in url', { ...valid, supabaseUrl: 'http://127.0.0.1:54321/rest/v1' }],
    ['unsupported scheme', { ...valid, supabaseUrl: 'ftp://127.0.0.1' }],
    ['missing key', { ...valid, supabaseKey: undefined }],
    ['blank key', { ...valid, supabaseKey: '   ' }],
    ['secret key', { ...valid, supabaseKey: 'sb_secret_example' }],
    ['service_role jwt', { ...valid, supabaseKey: jwt('service_role') }],
  ])('rejects %s', (_name, raw) => {
    expect(() => parseConfig(raw)).toThrow(ConfigError);
  });

  test('error messages never repeat the key', () => {
    expect(() => parseConfig({ ...valid, supabaseKey: 'sb_secret_leaky' })).toThrow(/never be embedded/);
    try {
      parseConfig({ ...valid, supabaseKey: 'sb_secret_leaky' });
    } catch (error) {
      expect(String(error)).not.toContain('leaky');
    }
  });

  test('requires explicit Preview permission, the exact approved HTTPS origin and a publishable key', () => {
    expect(() => parseConfig(hosted)).toThrow(ConfigError);
    expect(parseConfig(hosted, true)).toEqual({ target: hosted.target, supabaseUrl: hosted.supabaseUrl, supabasePublishableKey: hosted.supabaseKey });
    for (const supabaseUrl of ['http://axpdymbusiwxfzurfclg.supabase.co', 'https://axpdymbusiwxfzurfclg.supabase.co:8085',
      'https://axpdymbusiwxfzurfclg.supabase.co.example.org', 'https://another-project.supabase.co', 'http://localhost:54321']) {
      expect(() => parseConfig({ ...hosted, supabaseUrl }, true)).toThrow(ConfigError);
    }
    for (const supabaseKey of [jwt('anon'), jwt('service_role'), 'sb_secret_example', 'sb_publishable_']) {
      expect(() => parseConfig({ ...hosted, supabaseKey }, true)).toThrow(ConfigError);
    }
    expect(() => parseConfig({ ...valid, supabaseUrl: hosted.supabaseUrl }, true)).toThrow(ConfigError);
  });
});

test('admits the hosted Preview only on development web loopback port 8085 with its explicit target', () => {
  const dev = Object.getOwnPropertyDescriptor(globalThis, '__DEV__');
  const savedWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const target = process.env.EXPO_PUBLIC_NESTSCOUT_TARGET;
  const os = jest.replaceProperty(Platform, 'OS', 'web');
  try {
    process.env.EXPO_PUBLIC_NESTSCOUT_TARGET = hosted.target;
    Object.defineProperty(globalThis, '__DEV__', { configurable: true, value: true });
    for (const [origin, enabled] of [['http://localhost:8085', true], ['http://127.0.0.1:8085', true],
      ['http://localhost:8086', false], ['https://localhost:8085', false], ['http://localhost:8085.example.org', false]] as const) {
      Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { origin } } });
      expect(hostedKaelPreviewEnabled()).toBe(enabled);
    }
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { origin: 'http://localhost:8085' } } });
    Object.defineProperty(globalThis, '__DEV__', { configurable: true, value: false });
    expect(hostedKaelPreviewEnabled()).toBe(false);
    Object.defineProperty(globalThis, '__DEV__', { configurable: true, value: true });
    os.replaceValue('ios');
    expect(hostedKaelPreviewEnabled()).toBe(false);
    os.replaceValue('web');
    process.env.EXPO_PUBLIC_NESTSCOUT_TARGET = 'local';
    expect(hostedKaelPreviewEnabled()).toBe(false);
  } finally {
    os.restore();
    if (dev) Object.defineProperty(globalThis, '__DEV__', dev);
    if (savedWindow) Object.defineProperty(globalThis, 'window', savedWindow);
    else Reflect.deleteProperty(globalThis, 'window');
    if (target === undefined) delete process.env.EXPO_PUBLIC_NESTSCOUT_TARGET;
    else process.env.EXPO_PUBLIC_NESTSCOUT_TARGET = target;
  }
});
