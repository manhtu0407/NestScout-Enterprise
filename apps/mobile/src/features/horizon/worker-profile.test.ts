import { parseSkills, sampleWorkerProfileView, toWorkerProfileFields, validateWorkerProfileFields, type WorkerProfileFields } from './worker-profile';

const valid: WorkerProfileFields = { name: ' Minh Anh ', trade: ' Thợ điện ', area: ' Quận 7 ', experience: '6', about: ' Giới thiệu ', skills: 'Thay vòi, Lắp đèn' };

test('skills split on commas and new lines, trimmed and without repeats', () => {
  expect(parseSkills(' Thay vòi,Lắp đèn\n\nThay vòi , ')).toEqual(['Thay vòi', 'Lắp đèn']);
  expect(parseSkills('')).toEqual([]);
});

test('valid fields become a trimmed draft', () => {
  expect(validateWorkerProfileFields(valid)).toEqual({
    error: null,
    draft: { name: 'Minh Anh', trade: 'Thợ điện', area: 'Quận 7', experienceYears: 6, about: 'Giới thiệu', skills: ['Thay vòi', 'Lắp đèn'] },
  });
});

test.each([
  [{ name: ' ' }, 'Nhập tên hiển thị, nghề và khu vực chính.'],
  [{ trade: '' }, 'Nhập tên hiển thị, nghề và khu vực chính.'],
  [{ area: '' }, 'Nhập tên hiển thị, nghề và khu vực chính.'],
  [{ name: 'a'.repeat(81) }, 'Tên, nghề và khu vực tối đa 80 ký tự.'],
  [{ experience: '' }, 'Số năm kinh nghiệm là số từ 0 đến 80.'],
  [{ experience: '-1' }, 'Số năm kinh nghiệm là số từ 0 đến 80.'],
  [{ experience: '81' }, 'Số năm kinh nghiệm là số từ 0 đến 80.'],
  [{ experience: '1.5' }, 'Số năm kinh nghiệm là số từ 0 đến 80.'],
  [{ about: 'a'.repeat(601) }, 'Phần giới thiệu tối đa 600 ký tự.'],
  [{ skills: Array.from({ length: 13 }, (_, index) => `k${index}`).join(',') }, 'Tối đa 12 kỹ năng, mỗi kỹ năng không quá 40 ký tự.'],
  [{ skills: 'a'.repeat(41) }, 'Tối đa 12 kỹ năng, mỗi kỹ năng không quá 40 ký tự.'],
])('invalid fields %j are refused with a reason', (change, error) => {
  expect(validateWorkerProfileFields({ ...valid, ...change })).toEqual({ draft: null, error });
});

test('zero years of experience is allowed', () => {
  expect(validateWorkerProfileFields({ ...valid, experience: '0' }).draft?.experienceYears).toBe(0);
});

test('the form starts from the saved profile or from the fallback name', () => {
  expect(toWorkerProfileFields(null, 'Tên mặc định')).toEqual({ name: 'Tên mặc định', trade: '', area: '', experience: '', about: '', skills: '' });
  expect(toWorkerProfileFields(sampleWorkerProfileView, 'x')).toMatchObject({ name: 'Minh Anh', trade: 'Thợ điện nước', area: 'Quận 7', experience: '6' });
});
