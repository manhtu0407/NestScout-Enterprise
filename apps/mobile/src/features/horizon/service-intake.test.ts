import { serviceCatalog, serviceKeys } from './service-catalog';
import { composeIntake, emptyDraft, hasErrors, kaelIntakePrompt, validateIntake } from './service-intake';

test('catalog exposes the six standard categories plus Dịch vụ khác', () => {
  expect(serviceKeys).toHaveLength(7);
  expect(serviceCatalog.map(category => category.title)).toEqual(['Sửa điện', 'Sửa nước', 'Máy lạnh', 'Vệ sinh nhà', 'Vệ sinh sofa', 'Lắp đặt & sửa chữa nhỏ', 'Dịch vụ khác']);
  expect(serviceCatalog.find(category => category.key === 'other')?.questions).toEqual([]);
});

test.each(serviceCatalog.map(category => [category.key] as const))('%s requires description and location and gives actionable errors', key => {
  const errors = validateIntake(emptyDraft(key));
  expect(Object.keys(errors).sort()).toEqual(['description', 'location']);
  const ok = { ...emptyDraft(key), description: 'Cần xử lý trong tuần này', location: '12 Nguyễn Huệ, Quận 1' };
  expect(hasErrors(validateIntake(ok))).toBe(false);
});

test('composed text starts with a request-list friendly title and keeps answers, skipping blanks', () => {
  const draft = { ...emptyDraft('aircon'), description: 'Máy chạy nhưng không lạnh', location: ' 5 Lê Lợi ', answers: { type: 'Treo tường', symptom: '', count: '2' }, preferredTime: 'chiều thứ Bảy' };
  const { description, location } = composeIntake(draft);
  expect(description.split('\n')[0]).toBe('Máy lạnh: Máy chạy nhưng không lạnh');
  expect(description).toContain('Loại máy: Treo tường');
  expect(description).toContain('Số máy (nếu biết): 2');
  expect(description).not.toContain('Hiện tượng');
  expect(description).toContain('Thời gian mong muốn (chưa phải lịch hẹn): chiều thứ Bảy');
  expect(location).toBe('5 Lê Lợi');
});

test('content beyond the server limit is refused before submission', () => {
  const draft = { ...emptyDraft('other'), description: 'a'.repeat(4001), location: '5 Lê Lợi' };
  expect(validateIntake(draft).description).toMatch(/4000/);
});

test('Kael prompt asks Kael to prepare a draft for user confirmation', () => {
  const prompt = kaelIntakePrompt({ ...emptyDraft('electric'), description: 'Ổ cắm không có điện', location: 'Quận 3' });
  expect(prompt).toContain('Ổ cắm không có điện');
  expect(prompt).toContain('Địa điểm: Quận 3');
  expect(prompt).toMatch(/xác nhận trước khi gửi/);
});
