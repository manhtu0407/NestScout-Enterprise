import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { CitedReply } from './cited-reply';
import type { CitationResolver } from './citation-resolver';

const hash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const key = `case.ac-leak@2#${hash}`;
const text = `Nên vệ sinh dàn lạnh và đo gas [kael:${key}].`;
const resolver: CitationResolver = jest.fn(async () => new Map([[key, { id: key, kind: 'source' as const, label: '', title: 'Máy lạnh chảy nước', detail: 'Kiểm tra gas và vệ sinh dàn lạnh.' }]]));

test('hides the raw marker and shows a source chip that opens the real source', async () => {
  await render(<CitedReply text={text} style={undefined} streaming={false} resolve={resolver}/>);
  expect(screen.queryByText(/kael:/)).toBeNull();
  await waitFor(() => expect(screen.getByLabelText('Nguồn: 1')).toBeTruthy());
  await fireEvent.press(screen.getByLabelText('Nguồn: 1'));
  expect(screen.getByText('Máy lạnh chảy nước')).toBeTruthy();
  expect(screen.getByText('Kiểm tra gas và vệ sinh dàn lạnh.')).toBeTruthy();
});

test('shows no chip while streaming or when the source cannot be resolved', async () => {
  const unresolved: CitationResolver = jest.fn(async () => new Map());
  await render(<CitedReply text={text} style={undefined} streaming={false} resolve={unresolved}/>);
  await waitFor(() => expect(unresolved).toHaveBeenCalled());
  expect(screen.queryByLabelText('Nguồn: 1')).toBeNull();
  expect(screen.queryByText(/kael:/)).toBeNull();
});

test('a reply without markers needs no lookup', async () => {
  const none: CitationResolver = jest.fn(async () => new Map());
  await render(<CitedReply text="Chào bạn" style={undefined} streaming={false} resolve={none}/>);
  expect(none).not.toHaveBeenCalled();
});
