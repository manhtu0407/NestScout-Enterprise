import { ConfigError, parseConfig } from './config';

const valid = { target: 'local', supabaseUrl: 'http://127.0.0.1:54321', supabaseKey: 'sb_publishable_example' };

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
});
