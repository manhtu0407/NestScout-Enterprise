import { markFromUser, metadataFor, parseEntry, parseMark } from './onboarding-record';

const at = '2026-11-14T08:00:00.000Z';

describe('onboarding record', () => {
  test('round-trips a mark through the metadata it writes', () => {
    const mark = { outcome: 'completed', at } as const;
    expect(markFromUser({ user_metadata: metadataFor(mark) })).toEqual(mark);
    expect(markFromUser({ user_metadata: metadataFor({ outcome: 'skipped', at }) })).toEqual({ outcome: 'skipped', at });
  });

  test('writes only the versioned onboarding key', () => {
    expect(metadataFor({ outcome: 'skipped', at })).toEqual({ onboarding: { v: 1, outcome: 'skipped', at } });
  });

  test.each([
    ['a missing value', undefined],
    ['null', null],
    ['a string', 'completed'],
    ['an unknown version', { v: 2, outcome: 'completed', at }],
    ['an unversioned record', { outcome: 'completed', at }],
    ['an unknown outcome', { v: 1, outcome: 'abandoned', at }],
    ['a missing outcome', { v: 1, at }],
    ['an unparseable timestamp', { v: 1, outcome: 'completed', at: 'yesterday' }],
    ['a non-string timestamp', { v: 1, outcome: 'completed', at: 1731571200000 }],
  ])('rejects a mark with %s', (_name, value) => {
    expect(parseMark(value)).toBeNull();
  });

  test.each([
    ['no user', null],
    ['a non-object user', 'user'],
    ['no metadata', {}],
    ['null metadata', { user_metadata: null }],
    ['metadata without the key', { user_metadata: { display_name: 'An' } }],
    ['a malformed value', { user_metadata: { onboarding: { v: 1, outcome: 'completed' } } }],
  ])('finds no mark for %s', (_name, user) => {
    expect(markFromUser(user)).toBeNull();
  });

  test('ignores unrelated metadata beside a valid mark', () => {
    expect(markFromUser({ user_metadata: { display_name: 'An', onboarding: { v: 1, outcome: 'skipped', at } } })).toEqual({ outcome: 'skipped', at });
  });

  test.each([
    [{ state: 'existing' }, { state: 'existing' }],
    [{ state: 'progress', step: 2 }, { state: 'progress', step: 2 }],
    [{ state: 'progress', step: 0 }, { state: 'progress', step: 0 }],
    [{ state: 'done', outcome: 'completed', at }, { state: 'done', outcome: 'completed', at }],
  ])('parses entry %j', (value, expected) => {
    expect(parseEntry(value)).toEqual(expected);
  });

  test.each([
    ['null', null],
    ['an unknown state', { state: 'seen' }],
    ['a negative step', { state: 'progress', step: -1 }],
    ['a fractional step', { state: 'progress', step: 1.5 }],
    ['a textual step', { state: 'progress', step: '1' }],
    ['a done entry without a timestamp', { state: 'done', outcome: 'completed' }],
    ['a done entry with an unknown outcome', { state: 'done', outcome: 'abandoned', at }],
  ])('rejects an entry with %s', (_name, value) => {
    expect(parseEntry(value)).toBeNull();
  });
});
