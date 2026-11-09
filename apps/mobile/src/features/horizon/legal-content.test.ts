import { legalDocument } from './legal-content';

const flatten = (language: 'vi' | 'en', id: 'terms' | 'privacy') => legalDocument(language, id).sections.flatMap(section => section.paragraphs);

test('the Vietnamese terms keep all 21 sections and mark every unconfirmed operator field as pending', () => {
  const document = legalDocument('vi', 'terms');
  expect(document.sections).toHaveLength(21);
  const text = flatten('vi', 'terms').join('\n');
  expect(text).toContain('[Chờ cung cấp: TÊN PHÁP LÝ ĐẦY ĐỦ]');
  expect(text).toContain('[Chờ cung cấp: EMAIL CHÍNH THỨC]');
  expect(document.version).toContain('[Chờ cung cấp:');
});

test('the terms describe only what the app does today', () => {
  const text = flatten('vi', 'terms').join('\n');
  expect(text).toContain('gửi yêu cầu xóa tài khoản trong Cài đặt');
  expect(text).toContain('chưa kết nối thanh toán');
  expect(text).toContain('chưa có chức năng hủy hoặc đổi lịch tự động');
  expect(text).not.toContain('Việc chấp nhận được ghi nhận bằng thao tác rõ ràng trên giao diện, không mặc nhiên');
});

test('the English terms point to the Vietnamese text instead of a second, divergent version', () => {
  const english = legalDocument('en', 'terms');
  expect(english.notice).toContain('Vietnamese text below is the only version');
  expect(english.sections).toBe(legalDocument('vi', 'terms').sections);
});

test('the Vietnamese privacy policy keeps all 15 sections and marks unverified operator and provider fields as pending', () => {
  const document = legalDocument('vi', 'privacy');
  expect(document.sections).toHaveLength(15);
  const text = flatten('vi', 'privacy').join('\n');
  expect(text).toContain('[Chờ cung cấp: EMAIL]');
  expect(text).toContain('[Chờ cung cấp: DANH MỤC NHÀ CUNG CẤP AI ĐÃ KIỂM CHỨNG + LINK CHI TIẾT]');
  expect(text).toContain('[Chờ cung cấp: ĐỘ TUỔI TỐI THIỂU ĐƯỢC PHÊ DUYỆT]');
  expect(document.version).toContain('[Chờ cung cấp:');
});

test('the privacy policy describes only what the app does today', () => {
  const text = flatten('vi', 'privacy').join('\n');
  expect(text).toContain('Ứng dụng hiện không tích hợp SDK phân tích, quảng cáo hoặc báo lỗi bên thứ ba riêng.');
  expect(text).toContain('Hiện ứng dụng chưa yêu cầu quyền vị trí của thiết bị');
  expect(text).toContain('Cài đặt › Xoá tài khoản');
  expect(text).not.toContain('bằng luồng trong ứng dụng nếu đã được triển khai');
});

test('the privacy policy and the terms stay unacceptable and in the Vietnamese text for English readers', () => {
  const english = legalDocument('en', 'privacy');
  expect(english.sections).toBe(legalDocument('vi', 'privacy').sections);
  expect(english.notice).toContain('Vietnamese text below is the only version');
});
