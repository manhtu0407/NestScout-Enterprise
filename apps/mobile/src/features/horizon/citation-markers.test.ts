import { citationKey, citationRefsIn, stripCitationMarkers } from './citation-markers';

const hash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const marker = `kael:case.ac-leak@2#${hash}`;

test('finds each distinct marker once, bracketed or bare', () => {
  const refs = citationRefsIn(`Kiểm tra gas [${marker}]. Sau đó vệ sinh ${marker} và thử lại kael:fact.pricing@1#${hash}.`);
  expect(refs.map(citationKey)).toEqual([`case.ac-leak@2#${hash}`, `fact.pricing@1#${hash}`]);
  expect(refs[0]).toEqual({ sourceId: 'case.ac-leak', revision: 2, contentHash: hash });
});

test('ignores malformed markers', () => {
  expect(citationRefsIn('kael:case.ac-leak@x#abc kael:Case@1#' + hash)).toEqual([]);
});

test('removes complete markers with their leading space and a trailing partial marker', () => {
  expect(stripCitationMarkers(`Nên vệ sinh máy [${marker}].`)).toBe('Nên vệ sinh máy.');
  expect(stripCitationMarkers('Nên vệ sinh máy [kael:case.ac-le')).toBe('Nên vệ sinh máy');
  expect(stripCitationMarkers('Không có nguồn')).toBe('Không có nguồn');
});
