import { descriptionField, locationField, maxDescriptionLength, maxLocationLength, minDescriptionLength, preferredField, preferredOptions, type IntakeField, type ServiceCategory } from './service-catalog';

export type IntakeAnswers = Readonly<Record<string, string>>;

export type IntakeErrors = Readonly<Record<string, string>>;

export type IntakeSummaryLine = { id: string; label: string; value: string };

export type IntakeSubmission = { description: string; location: string };

export const descriptionLimit = 4000;
export const preferredLabel = 'Thời gian mong muốn (chưa phải lịch hẹn đã xác nhận)';

function answer(answers: IntakeAnswers, id: string): string {
  return (answers[id] ?? '').trim();
}

export function categoryFields(category: ServiceCategory): readonly IntakeField[] {
  return category.fields;
}

export function validateIntake(category: ServiceCategory, answers: IntakeAnswers): IntakeErrors {
  const errors: Record<string, string> = {};
  const description = answer(answers, descriptionField);
  if (description.length < minDescriptionLength) errors[descriptionField] = `Hãy mô tả việc cần làm (ít nhất ${minDescriptionLength} ký tự).`;
  else if (description.length > maxDescriptionLength) errors[descriptionField] = `Mô tả tối đa ${maxDescriptionLength} ký tự.`;
  const location = answer(answers, locationField);
  if (location === '') errors[locationField] = 'Hãy nhập địa điểm thực hiện để thợ biết nơi cần đến.';
  else if (location.length > maxLocationLength) errors[locationField] = `Địa điểm tối đa ${maxLocationLength} ký tự.`;
  const preferred = answer(answers, preferredField);
  if (preferred !== '' && !preferredOptions.includes(preferred)) errors[preferredField] = 'Hãy chọn một thời gian mong muốn trong danh sách hoặc bỏ trống.';
  for (const field of category.fields) {
    const value = answer(answers, field.id);
    if (value === '') {
      if (field.required) errors[field.id] = `Hãy điền ${field.label.toLocaleLowerCase('vi')}.`;
      continue;
    }
    if (field.kind === 'choice' && !field.options?.includes(value)) errors[field.id] = 'Hãy chọn một đáp án trong danh sách hoặc bỏ trống.';
    else if (field.kind === 'count' && !/^[1-9][0-9]?$/.test(value)) errors[field.id] = 'Nhập số máy từ 1 đến 99 hoặc bỏ trống nếu chưa biết.';
    else if (value.length > field.maxLength) errors[field.id] = `Tối đa ${field.maxLength} ký tự.`;
  }
  return errors;
}

export function summaryLines(category: ServiceCategory, answers: IntakeAnswers): IntakeSummaryLine[] {
  const lines: IntakeSummaryLine[] = [
    { id: descriptionField, label: category.descriptionLabel, value: answer(answers, descriptionField) },
    { id: locationField, label: 'Địa điểm thực hiện', value: answer(answers, locationField) },
  ];
  for (const field of category.fields) {
    const value = answer(answers, field.id);
    if (value !== '') lines.push({ id: field.id, label: field.label, value });
  }
  const preferred = answer(answers, preferredField);
  if (preferred !== '') lines.push({ id: preferredField, label: preferredLabel, value: preferred });
  return lines;
}

export function composeSubmission(category: ServiceCategory, answers: IntakeAnswers): IntakeSubmission {
  const [main, place, ...rest] = summaryLines(category, answers);
  const lines = [`${category.title} — ${main?.value ?? ''}`, ...rest.map(line => `${line.label}: ${line.value}`)];
  return { description: lines.join('\n'), location: place?.value ?? '' };
}

export function activeSafetyNotice(category: ServiceCategory, answers: IntakeAnswers): string | null {
  const rule = category.safety;
  if (!rule) return null;
  return rule.when.values.includes(answer(answers, rule.when.field)) ? rule.text : null;
}

export function kaelIntakePrompt(category: ServiceCategory, answers: IntakeAnswers): string {
  const known = summaryLines(category, answers).filter(line => line.value !== '');
  if (known.length === 0) return category.kaelOpening;
  return `${category.kaelOpening}\nMình đã nhập sẵn:\n${known.map(line => `- ${line.label}: ${line.value}`).join('\n')}`;
}
