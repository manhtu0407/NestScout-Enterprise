import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { isAcceptable, type LegalDocument } from './legal-content';
import { settingsStrings } from './settings-strings';
import { TermsAcceptance } from './terms-acceptance';

const final: LegalDocument = { title: 'T', version: 'v', versionId: '2026-12-01-v2.0', notice: '', summary: [], sections: [{ heading: 'h', paragraphs: ['p'] }] };
const strings = settingsStrings('vi');
const formatDate = (iso: string) => iso.slice(0, 10);

test('a finished document is acceptable and a placeholder makes it unacceptable', () => {
  expect(isAcceptable(final)).toBe(true);
  expect(isAcceptable({ ...final, sections: [{ heading: 'h', paragraphs: ['[Chờ cung cấp: EMAIL]'] }] })).toBe(false);
});

test('accepting a finished document records its version and then shows the date', async () => {
  const api = { read: jest.fn().mockResolvedValue(null), accept: jest.fn().mockResolvedValue('2026-12-02T09:00:00Z') };
  await render(<TermsAcceptance document={final} api={api} strings={strings} formatDate={formatDate} />);
  await fireEvent.press(await screen.findByLabelText('Tôi đồng ý với phiên bản này'));
  await waitFor(() => expect(screen.getByText('Bạn đã đồng ý phiên bản này ngày 2026-12-02.')).toBeTruthy());
  expect(api.accept).toHaveBeenCalledWith('2026-12-01-v2.0');
});

test('a failed recording keeps the button and reports the error', async () => {
  const api = { read: jest.fn().mockResolvedValue(null), accept: jest.fn().mockRejectedValue(new Error('offline')) };
  await render(<TermsAcceptance document={final} api={api} strings={strings} formatDate={formatDate} />);
  await fireEvent.press(await screen.findByLabelText('Tôi đồng ý với phiên bản này'));
  await waitFor(() => expect(screen.getByText('Chưa ghi nhận được sự đồng ý. Kiểm tra kết nối rồi thử lại.')).toBeTruthy());
});
