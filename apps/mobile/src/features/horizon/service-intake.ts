import { categoryFor, type ServiceKey } from './service-catalog';

export const maxDescriptionLength = 4000;
export const maxLocationLength = 200;
export const minDescriptionLength = 10;
export const minLocationLength = 5;
export const maxAnswerLength = 200;
export const maxTitleSummaryLength = 60;

export type IntakeDraft = {
  key: ServiceKey;
  description: string;
  location: string;
  answers: Readonly<Record<string, string>>;
  preferredTime: string;
};

export type IntakeField = 'description' | 'location' | 'preferredTime' | `answer:${string}`;

export type IntakeErrors = Partial<Record<IntakeField, string>>;

export const emptyDraft = (key: ServiceKey): IntakeDraft => ({ key, description: '', location: '', answers: {}, preferredTime: '' });

const collapse = (value: string): string => value.replace(/[^\S\n]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
const oneLine = (value: string): string => value.replace(/\s+/g, ' ').trim();

export function validateIntake(draft: IntakeDraft): IntakeErrors {
  const errors: IntakeErrors = {};
  const description = collapse(draft.description);
  const location = oneLine(draft.location);
  if (description.length < minDescriptionLength) errors.description = `Hãy mô tả ít nhất ${minDescriptionLength} ký tự để thợ hiểu việc cần làm.`;
  if (location.length < minLocationLength) errors.location = 'Nhập địa chỉ hoặc khu vực thực hiện (ít nhất vài từ).';
  else if (location.length > maxLocationLength) errors.location = `Địa chỉ tối đa ${maxLocationLength} ký tự.`;
  if (oneLine(draft.preferredTime).length > maxAnswerLength) errors.preferredTime = `Tối đa ${maxAnswerLength} ký tự.`;
  for (const question of categoryFor(draft.key).questions) {
    const answer = oneLine(draft.answers[question.id] ?? '');
    if (answer.length > maxAnswerLength) errors[`answer:${question.id}`] = `Tối đa ${maxAnswerLength} ký tự.`;
  }
  if (!errors.description && composeIntake(draft).description.length > maxDescriptionLength) errors.description = `Nội dung quá dài. Hãy rút gọn còn ${maxDescriptionLength} ký tự.`;
  return errors;
}

export function hasErrors(errors: IntakeErrors): boolean {
  return Object.keys(errors).length > 0;
}

export function answeredLines(draft: IntakeDraft): { label: string; value: string }[] {
  return categoryFor(draft.key).questions.flatMap(question => {
    const value = oneLine(draft.answers[question.id] ?? '');
    return value === '' ? [] : [{ label: question.label, value }];
  });
}

function titleLine(draft: IntakeDraft): string {
  const category = categoryFor(draft.key);
  const first = oneLine(collapse(draft.description).split('\n')[0] ?? '');
  const summary = first.length > maxTitleSummaryLength ? `${first.slice(0, maxTitleSummaryLength - 1).trimEnd()}…` : first;
  return `${category.title}: ${summary}`;
}

export function composeIntake(draft: IntakeDraft): { description: string; location: string } {
  const lines = [titleLine(draft)];
  const body = collapse(draft.description);
  if (body.includes('\n') || body.length > maxTitleSummaryLength) lines.push('', body);
  const answers = answeredLines(draft);
  if (answers.length > 0) lines.push('', ...answers.map(line => `${line.label}: ${line.value}`));
  const preferred = oneLine(draft.preferredTime);
  if (preferred !== '') lines.push('', `Thời gian mong muốn (chưa phải lịch hẹn): ${preferred}`);
  return { description: lines.join('\n'), location: oneLine(draft.location) };
}

export function kaelIntakePrompt(draft: IntakeDraft): string {
  const category = categoryFor(draft.key);
  const description = collapse(draft.description);
  const lines = [category.kaelOpening];
  if (description !== '') lines.push(description);
  for (const line of answeredLines(draft)) lines.push(`${line.label}: ${line.value}`);
  const location = oneLine(draft.location);
  if (location !== '') lines.push(`Địa điểm: ${location}`);
  lines.push('Hãy hỏi thêm những gì còn thiếu, rồi chuẩn bị yêu cầu để tôi xác nhận trước khi gửi.');
  return lines.join('\n');
}

export type SubmitOutcome =
  | { kind: 'received'; requestId: string }
  | { kind: 'rejected'; message: string }
  | { kind: 'unknown'; message: string };
