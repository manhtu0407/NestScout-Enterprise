import assert from 'node:assert/strict';
import test from 'node:test';
import { previewEnvironment, previews } from './preview-web.mjs';

const stack = () => ({ origin: 'http://127.0.0.1:54321', key: 'sb_publishable_local' });

test('the two previews keep their documented ports', () => {
  assert.deepEqual(previews, { local: { port: 8085 }, design: { port: 8086 } });
});

test('the local preview targets the local stack with its publishable key only', () => {
  const env = previewEnvironment('local', { PATH: 'x' }, stack);
  assert.equal(env.EXPO_PUBLIC_NESTSCOUT_TARGET, 'local');
  assert.equal(env.EXPO_PUBLIC_SUPABASE_URL, 'http://127.0.0.1:54321');
  assert.equal(env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, 'sb_publishable_local');
  assert.equal(env.EXPO_PUBLIC_DESIGN_SHOWCASE, undefined);
  assert.equal(env.PATH, 'x');
  assert.equal(env.BROWSER, 'none');
  assert.equal(env.CI, '1');
});

test('the local preview refuses a key that is not publishable', () => {
  for (const key of [undefined, '', 'sb_secret_x', 'eyJhbGciOi']) {
    assert.throws(() => previewEnvironment('local', {}, () => ({ origin: 'http://127.0.0.1:54321', key })), /publishable key is unavailable/);
  }
});

test('the design preview needs no backend and never reads the local stack', () => {
  const env = previewEnvironment('design', {}, () => { throw new Error('stack must not be read'); });
  assert.equal(env.EXPO_PUBLIC_DESIGN_SHOWCASE, '1');
  assert.equal(env.EXPO_PUBLIC_HORIZON_PREVIEW, '1');
  assert.equal(env.EXPO_PUBLIC_SUPABASE_URL, undefined);
  assert.equal(env.EXPO_PUBLIC_NESTSCOUT_TARGET, undefined);
});

test('an unknown preview is rejected', () => {
  assert.throws(() => previewEnvironment('hosted', {}, stack), /Unknown preview "hosted"/);
  assert.throws(() => previewEnvironment('toString', {}, stack), /Unknown preview "toString"/);
});
