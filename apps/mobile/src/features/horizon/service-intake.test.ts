import { serviceCategories, serviceCategoryFor, unknownChoice, type ServiceCategory } from './service-catalog';
import { activeSafetyNotice, composeSubmission, descriptionLimit, kaelIntakePrompt, summaryLines, validateIntake } from './service-intake';

const category = (id: string): ServiceCategory => serviceCategoryFor(id) as ServiceCategory;

test('the catalog has the six standard categories plus the open "other" entry, each with its own route id', () => {
  expect(serviceCategories.map(item => item.title)).toEqual(['Sửa điện', 'Sửa nước', 'Máy lạnh', 'Vệ sinh nhà', 'Vệ sinh sofa', 'Lắp đặt & sửa chữa nhỏ', 'Dịch vụ khác']);
  expect(new Set(serviceCategories.map(item => item.id)).size).toBe(7);
  expect(serviceCategoryFor('unknown')).toBeUndefined();
  expect(serviceCategoryFor(undefined)).toBeUndefined();
});

test('category fields follow the product questions and never force unknown details', () => {
  const ids = (id: string) => category(id).fields.map(field => field.id);
  expect(ids('electric')).toEqual(['device', 'symptom', 'danger']);
  expect(ids('plumbing')).toEqual(['area', 'issue', 'urgency']);
  expect(ids('aircon')).toEqual(['type', 'symptom', 'count']);
  expect(ids('house-cleaning')).toEqual(['size', 'kind', 'special']);
  expect(ids('sofa-cleaning')).toEqual(['seats', 'material', 'stain']);
  expect(ids('minor-repair')).toEqual(['item', 'materials']);
  expect(ids('other')).toEqual([]);
  expect(serviceCategories.flatMap(item => item.fields).filter(field => field.required)).toEqual([]);
  expect(category('aircon').fields.find(field => field.id === 'type')?.options).toContain(unknownChoice);
});

test.each(serviceCategories.map(item => [item.title, item] as const))('%s submits with only a description and a location', (_title, item) => {
  expect(validateIntake(item, { description: 'Cần hỗ trợ việc này', location: '12 Nguyễn Huệ, Quận 1' })).toEqual({});
});

test('missing essentials are reported per field with a clear correction', () => {
  const errors = validateIntake(category('electric'), { description: 'ab', location: '   ' });
  expect(errors.description).toMatch(/ít nhất 5 ký tự/);
  expect(errors.location).toMatch(/địa điểm/i);
  expect(Object.keys(errors).sort()).toEqual(['description', 'location']);
});

test('answers outside the offered options or bad counts are rejected', () => {
  const base = { description: 'Máy lạnh không mát', location: 'Quận 3' };
  expect(validateIntake(category('aircon'), { ...base, type: 'Treo trần' }).type).toMatch(/danh sách/);
  expect(validateIntake(category('aircon'), { ...base, count: '0' }).count).toMatch(/1 đến 99/);
  expect(validateIntake(category('aircon'), { ...base, count: '2' })).toEqual({});
  expect(validateIntake(category('aircon'), { ...base, preferred: 'Hôm qua' }).preferred).toBeDefined();
});

test('the submission carries the category, description, answered questions and an unconfirmed time wish', () => {
  const answers = { description: 'Vòi bồn rửa bị rò', location: ' 12 Nguyễn Huệ, Quận 1 ', area: 'Bếp', issue: 'Rò rỉ', urgency: '', preferred: 'Ngày mai' };
  expect(composeSubmission(category('plumbing'), answers)).toEqual({
    description: 'Sửa nước — Vòi bồn rửa bị rò\nKhu vực: Bếp\nSự cố: Rò rỉ\nThời gian mong muốn (chưa phải lịch hẹn đã xác nhận): Ngày mai',
    location: '12 Nguyễn Huệ, Quận 1',
  });
});

test('skipped optional questions are left out of the summary and the submission', () => {
  const answers = { description: 'Cần việc khác', location: 'Quận 7' };
  expect(summaryLines(category('other'), answers).map(line => line.id)).toEqual(['description', 'location']);
  expect(composeSubmission(category('other'), answers).description).toBe('Dịch vụ khác — Cần việc khác');
});

test('a full intake always fits the server description limit', () => {
  const item = category('house-cleaning');
  const answers = { description: 'x'.repeat(1500), location: 'y'.repeat(200), size: 'z'.repeat(120), kind: 'Tổng vệ sinh', special: 'w'.repeat(300), preferred: 'Linh hoạt' };
  expect(validateIntake(item, answers)).toEqual({});
  expect(composeSubmission(item, answers).description.length).toBeLessThanOrEqual(descriptionLimit);
});

test('safety guidance appears only for hazardous answers', () => {
  expect(activeSafetyNotice(category('electric'), { danger: 'Bị giật điện' })).toMatch(/114/);
  expect(activeSafetyNotice(category('electric'), { danger: 'Không có' })).toBeNull();
  expect(activeSafetyNotice(category('plumbing'), { urgency: 'Nước đang chảy mạnh' })).toMatch(/van tổng/);
  expect(activeSafetyNotice(category('sofa-cleaning'), {})).toBeNull();
});

test('the Kael prompt starts from the category and carries what the user already typed', () => {
  expect(kaelIntakePrompt(category('electric'), {})).toBe(category('electric').kaelOpening);
  const prompt = kaelIntakePrompt(category('sofa-cleaning'), { description: 'Sofa bị ố', location: 'Quận 2', seats: '3 chỗ' });
  expect(prompt).toContain('vệ sinh sofa');
  expect(prompt).toContain('- Số chỗ ngồi: 3 chỗ');
  expect(prompt).toContain('- Địa điểm thực hiện: Quận 2');
});

test('the open category does not promise unsupported work', () => {
  expect(category('other').intro).toMatch(/chưa đảm bảo/);
  expect(category('other').kaelOpening).toMatch(/chưa biết chọn dịch vụ nào/);
  for (const item of serviceCategories.filter(entry => entry.id !== 'other')) expect(category('other').kaelOpening.toLowerCase()).not.toContain(item.title.toLowerCase());
});
