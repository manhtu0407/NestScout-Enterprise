import type { Language } from '@/lib/preferences';

import { privacyVi } from './privacy-vi';
import { termsVi } from './terms-vi';

export type LegalDocumentId = 'terms' | 'privacy';
export type LegalSection = { heading: string; paragraphs: readonly string[] };
export type LegalDocument = { title: string; version: string; versionId: string; notice: string; summary: readonly string[]; sections: readonly LegalSection[] };

const termsEn: LegalDocument = {
  ...termsVi,
  title: 'Terms of Service',
  version: 'Draft 2026-11-09 (v1.0) · Effective date: not yet set',
  notice: 'The English translation is not available yet. The Vietnamese text below is the only version and is still a draft pending legal review.',
  summary: [],
};

const privacyEn: LegalDocument = {
  ...privacyVi,
  title: 'Privacy Policy',
  version: 'Draft 2026-11-09 (v1.0) · Effective date: not yet set',
  notice: 'The English translation is not available yet. The Vietnamese text below is the only version and is still a draft pending legal review.',
  summary: [],
};

const documents: Record<Language, Record<LegalDocumentId, LegalDocument>> = {
  vi: { terms: termsVi, privacy: privacyVi },
  en: { terms: termsEn, privacy: privacyEn },
};

export function legalDocument(language: Language, id: LegalDocumentId): LegalDocument {
  return documents[language][id];
}
