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
  provider_unavailable: 'Đăng nhập bằng tin nhắn chưa khả dụng trong môi trường này.',
  network: 'Không thể kết nối dịch vụ đăng nhập. Kiểm tra mạng rồi thử lại.',
  unknown: 'Đăng nhập chưa thành công. Vui lòng thử lại.',
};

export const signInCopy = {
  roles: {
    client: { label: 'Khách hàng', title: 'Chào mừng trở lại', subtitle: 'Đăng nhập để gửi yêu cầu và nhận báo giá từ thợ gần bạn.' },
    worker: { label: 'Thợ', title: 'Sẵn sàng nhận việc', subtitle: 'Đăng nhập để xem việc mới và gửi báo giá cho khách.' },
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
