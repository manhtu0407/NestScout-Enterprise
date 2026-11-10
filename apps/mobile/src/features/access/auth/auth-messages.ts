import type { PhoneRejection } from '../phone/vietnam-phone';
import type { AuthFailure } from './auth-gateway';

export const phoneMessages: Record<PhoneRejection, string> = {
  empty: 'Nhập số điện thoại di động của bạn.',
  invalid_characters: 'Chỉ dùng chữ số, có thể bắt đầu bằng dấu +.',
  unsupported_country: 'Hiện chỉ hỗ trợ số di động Việt Nam (+84).',
  invalid_number: 'Đây không phải số di động Việt Nam hợp lệ.',
};

export const authMessages: Record<AuthFailure, string> = {
  invalid_code: 'Mã chưa đúng. Kiểm tra lại và thử lần nữa.',
  expired_code: 'Mã không đúng hoặc đã hết hạn. Kiểm tra lại hoặc yêu cầu mã mới.',
  rate_limited: 'Bạn thử quá nhiều lần. Vui lòng chờ một lát.',
  signup_disabled: 'Môi trường này chưa cho phép tạo tài khoản mới.',
  provider_unavailable: 'Cách đăng nhập này chưa khả dụng trong môi trường này.',
  network: 'Không thể kết nối dịch vụ đăng nhập. Kiểm tra mạng rồi thử lại.',
  cancelled: 'Bạn đã hủy đăng nhập. Chọn lại một cách đăng nhập để tiếp tục.',
  invalid_credentials: 'Email hoặc mật khẩu chưa đúng.',
  email_not_confirmed: 'Email này chưa được xác nhận. Mở liên kết xác nhận trong hộp thư rồi đăng nhập lại.',
  email_taken: 'Email này đã được dùng. Hãy đăng nhập hoặc dùng Email khác.',
  weak_password: 'Mật khẩu quá dễ đoán. Hãy chọn mật khẩu dài và khó đoán hơn.',
  unknown: 'Đăng nhập chưa thành công. Vui lòng thử lại.',
};

export const signInCopy = {
  roles: {
    client: { label: 'Khách hàng', title: 'Chào mừng trở lại' },
    worker: { label: 'Thợ', title: 'Sẵn sàng nhận việc' },
  },
  switchLabel: 'Đăng nhập với vai trò',
  phoneLabel: 'Số điện thoại di động',
  phonePlaceholder: '912 345 678',
  phonePrefix: '+84',
  sendCode: 'Gửi mã xác thực',
  codeTitle: 'Nhập mã xác thực',
  codeLabel: 'Mã xác thực 6 chữ số',
  verify: 'Xác nhận',
  verified: 'Đã xác thực',
  resend: 'Gửi lại mã',
  resendIn: (seconds: number) => `Gửi lại mã sau ${seconds}s`,
  changeNumber: 'Dùng số khác',
  back: 'Quay lại',
  codeSent: (masked: string) => `Mã gồm 6 chữ số đã được gửi tới ${masked}.`,
  enterAllDigits: 'Nhập đủ 6 chữ số.',
  footnote: 'Bằng việc tiếp tục, bạn đồng ý để NestScout gửi một tin nhắn xác thực tới số này.',
  previewNote: 'Bản xem trước: chưa gửi tin nhắn thật. Dùng mã 123456 để thử.',
} as const;

export const emailMessages = {
  email_empty: 'Nhập địa chỉ Email của bạn.',
  email_invalid: 'Địa chỉ Email chưa hợp lệ.',
  password_empty: 'Nhập mật khẩu.',
  password_too_short: (min: number) => `Mật khẩu cần ít nhất ${min} ký tự.`,
  password_weak: 'Mật khẩu chưa đủ mạnh. Thêm chữ hoa, chữ số hoặc ký tự đặc biệt.',
  confirm_empty: 'Nhập lại mật khẩu để xác nhận.',
  confirm_mismatch: 'Mật khẩu nhập lại chưa khớp.',
} as const;

export const emailCopy = {
  signUpTitle: 'Tạo tài khoản',
  signInTitle: 'Đăng nhập bằng Email',
  signUpSubtitle: 'Dùng Email và mật khẩu nếu bạn không muốn dùng số điện thoại, Google hay Apple.',
  signInSubtitle: 'Nhập Email và mật khẩu bạn đã dùng để tạo tài khoản.',
  emailLabel: 'Email',
  emailPlaceholder: 'ten@gmail.com',
  passwordLabel: 'Mật khẩu',
  passwordPlaceholder: 'Ít nhất 8 ký tự',
  confirmLabel: 'Nhập lại mật khẩu',
  confirmPlaceholder: 'Nhập lại mật khẩu',
  showPassword: 'Hiện mật khẩu',
  hidePassword: 'Ẩn mật khẩu',
  signUp: 'Tạo tài khoản',
  signIn: 'Đăng nhập',
  haveAccount: 'Đã có tài khoản? Đăng nhập',
  needAccount: 'Chưa có tài khoản? Tạo tài khoản',
  sentTitle: 'Kiểm tra Email của bạn',
  sentBody: (email: string) => `Chúng tôi đã gửi liên kết xác nhận tới ${email}. Sau khi xác nhận, quay lại đây và đăng nhập bằng Email và mật khẩu.`,
  footnote: 'Bằng việc tiếp tục, bạn đồng ý để NestScout tạo tài khoản bằng Email này.',
} as const;
