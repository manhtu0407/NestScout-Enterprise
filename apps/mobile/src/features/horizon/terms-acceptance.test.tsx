import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { legalDocument } from './legal-content';
import { settingsStrings } from './settings-strings';
import { TermsAcceptance, type TermsAcceptanceApi } from './terms-acceptance';

const strings = settingsStrings('vi');
const document = { ...legalDocument('vi', 'terms'), sections: [], summary: [], version: '2026-11-10' };

function api(overrides: Partial<TermsAcceptanceApi> = {}): TermsAcceptanceApi {
  return { read: jest.fn().mockResolvedValue(null), accept: jest.fn().mockResolvedValue('2026-11-10T01:00:00.000Z'), ...overrides };
}

test('the AI data-sharing disclosure sits beside the agreement button', async () => {
  await render(<TermsAcceptance document={document} api={api()} strings={strings} formatDate={iso => iso} />);
  expect(await screen.findByText(strings.consentTitle)).toBeTruthy();
  expect(screen.getByText(/Anthropic và DeepSeek/)).toBeTruthy();
  expect(screen.getByLabelText(strings.termsAccept)).toBeTruthy();
});

test('agreeing records the acceptance and hides the disclosure', async () => {
  const termsApi = api();
  await render(<TermsAcceptance document={document} api={termsApi} strings={strings} formatDate={() => '10/11/2026'} />);
  await fireEvent.press(await screen.findByLabelText(strings.termsAccept));
  await waitFor(() => expect(termsApi.accept).toHaveBeenCalledWith(document.versionId));
  expect(await screen.findByText(strings.termsAcceptedOn('10/11/2026'))).toBeTruthy();
  expect(screen.queryByText(strings.consentTitle)).toBeNull();
});
