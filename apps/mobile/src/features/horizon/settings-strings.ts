import type { Appearance, Language } from '@/lib/preferences';

export type SettingsStrings = {
  title: string;
  notifications: string;
  push: string;
  pushDetail: string;
  quotes: string;
  messages: string;
  promotions: string;
  general: string;
  language: string;
  appearance: string;
  reduceMotion: string;
  privacy: string;
  location: string;
  locationDetail: string;
  clearHistory: string;
  about: string;
  terms: string;
  privacyPolicy: string;
  version: string;
  editProfile: string;
  profileLabel: (name: string) => string;
  saveError: string;
  appearanceNames: Record<Appearance, string>;
  languageNames: Record<Language, string>;
  languageNote: string;
  appearanceNote: string;
  themeToDark: string;
  themeToLight: string;
  selected: string;
  clearTitle: string;
  clearBody: string;
  clearConfirm: string;
  clearCancel: string;
  clearBusy: string;
  clearDone: string;
  clearFailed: string;
  clearActive: string;
  clearSignedOut: string;
  holdPrompt: string;
  holdConfirm: string;
  holdCancel: string;
  holdRetry: string;
  locationOpenFailed: string;
  legalSummary: string;
  back: string;
  deleteAccount: string;
  deleteTitle: string;
  deleteBody: string;
  deleteConfirm: string;
  deleteCancel: string;
  deleteKeep: string;
  deleteBusy: string;
  deleteLoading: string;
  deleteFailed: string;
  deleteLoadFailed: string;
  deleteSignedOut: string;
  deleteRequestedOn: (date: string) => string;
  aiShare: string;
  aiShareDetail: string;
  consentCardLead: string;
  consentCardAction: string;
  aiShareFailed: string;
  aiShareLoading: string;
  exportData: string;
  exportTitle: string;
  exportBody: string;
  exportRun: string;
  exportBusy: string;
  exportDone: string;
  exportFailed: string;
  exportSignedOut: string;
  exportShare: string;
  consentTitle: string;
  consentBody: readonly string[];
  consentNeeded: string;
  consentFailed: string;
  consentChecking: string;
};

const vi: SettingsStrings = {
  title: 'Cài đặt',
  notifications: 'Thông báo',
  push: 'Thông báo đẩy',
  pushDetail: 'Nhận cập nhật ngay trên thiết bị',
  quotes: 'Báo giá mới',
  messages: 'Tin nhắn từ thợ và Kael',
  promotions: 'Ưu đãi và tin tức',
  general: 'Chung',
  language: 'Ngôn ngữ',
  appearance: 'Giao diện',
  reduceMotion: 'Giảm chuyển động',
  privacy: 'Quyền riêng tư',
  location: 'Vị trí',
  locationDetail: 'Quản lý trong cài đặt thiết bị',
  clearHistory: 'Xoá lịch sử trò chuyện',
  about: 'Giới thiệu',
  terms: 'Điều khoản dịch vụ',
  privacyPolicy: 'Chính sách quyền riêng tư',
  version: 'Phiên bản',
  editProfile: 'Chỉnh sửa',
  profileLabel: name => `Thông tin cá nhân, ${name}`,
  saveError: 'Chưa lưu được cài đặt. Kiểm tra kết nối rồi thử lại.',
  appearanceNames: { system: 'Theo hệ thống', light: 'Sáng', dark: 'Tối' },
  languageNames: { vi: 'Tiếng Việt', en: 'English' },
  languageNote: 'Áp dụng cho màn Cài đặt và các văn bản pháp lý. Các màn khác sẽ được chuyển ngữ dần.',
  appearanceNote: 'Chế độ Tối áp dụng cho các thành phần dùng bảng màu chung. Các màn Horizon sẽ được bổ sung dần.',
  themeToDark: 'Chuyển sang giao diện tối',
  themeToLight: 'Chuyển sang giao diện sáng',
  selected: 'Đang chọn',
  clearTitle: 'Xoá lịch sử trò chuyện?',
  clearBody: 'Toàn bộ tin nhắn của bạn với Kael ở chế độ này sẽ bị xoá và không thể khôi phục. Một số bản ghi vận hành phục vụ an toàn có thể được giữ lại.',
  clearConfirm: 'Xoá lịch sử',
  clearCancel: 'Huỷ',
  clearBusy: 'Đang xoá…',
  clearDone: 'Đã xoá lịch sử trò chuyện.',
  clearFailed: 'Chưa xoá được lịch sử. Kiểm tra kết nối rồi thử lại.',
  clearActive: 'Kael đang trả lời. Hãy thử lại sau khi hoàn tất.',
  clearSignedOut: 'Đăng nhập để xoá lịch sử trò chuyện.',
  holdPrompt: 'Giữ nút để xác nhận',
  holdConfirm: 'Giữ để xác nhận',
  holdCancel: 'Huỷ',
  holdRetry: 'Thử lại',
  locationOpenFailed: 'Không mở được cài đặt thiết bị.',
  legalSummary: 'Tóm tắt',
  back: 'Quay về',
  deleteAccount: 'Xoá tài khoản',
  deleteTitle: 'Xoá tài khoản?',
  deleteBody: 'Gửi yêu cầu xoá tài khoản và dữ liệu cá nhân của bạn. Yêu cầu được xử lý theo pháp luật; dữ liệu phải lưu giữ vì nghĩa vụ pháp lý hoặc tranh chấp sẽ được giữ theo Chính sách quyền riêng tư. Bạn có thể huỷ yêu cầu trước khi nó được xử lý.',
  deleteConfirm: 'Gửi yêu cầu xoá',
  deleteCancel: 'Huỷ yêu cầu xoá',
  deleteKeep: 'Giữ tài khoản',
  deleteBusy: 'Đang xử lý…',
  deleteLoading: 'Đang kiểm tra trạng thái…',
  deleteFailed: 'Chưa gửi được yêu cầu. Kiểm tra kết nối rồi thử lại.',
  deleteLoadFailed: 'Chưa kiểm tra được trạng thái yêu cầu xoá. Kiểm tra kết nối rồi thử lại.',
  deleteSignedOut: 'Đăng nhập để gửi yêu cầu xoá tài khoản.',
  deleteRequestedOn: date => `Đã gửi yêu cầu xoá tài khoản ngày ${date}. Chúng tôi sẽ xử lý theo pháp luật và bạn có thể huỷ yêu cầu bất cứ lúc nào trước đó.`,
  aiShare: 'Chia sẻ dữ liệu với AI',
  aiShareDetail: 'Cho phép Kael gửi nội dung trò chuyện tới nhà cung cấp mô hình AI',
  consentCardLead: 'Để trả lời, Kael gửi tin nhắn và thông tin yêu cầu liên quan của bạn tới nhà cung cấp AI. Đừng gửi số thẻ hay mật khẩu. Bạn có thể tắt bất cứ lúc nào trong Cài đặt › Quyền riêng tư.',
  consentCardAction: 'Cho phép và bắt đầu',
  aiShareFailed: 'Chưa lưu được lựa chọn. Kiểm tra kết nối rồi thử lại.',
  aiShareLoading: 'Đang kiểm tra…',
  exportData: 'Tải dữ liệu của tôi',
  exportTitle: 'Tải dữ liệu của tôi',
  exportBody: 'Tạo một bản sao dữ liệu cá nhân NestScout đang lưu về bạn: hồ sơ, yêu cầu, thông báo, lịch sử Kael, các lựa chọn đồng ý và bản ghi liên quan. Bản sao ở dạng JSON.',
  exportRun: 'Tạo bản sao dữ liệu',
  exportBusy: 'Đang tạo…',
  exportDone: 'Bản sao đã sẵn sàng.',
  exportFailed: 'Chưa tạo được bản sao dữ liệu. Kiểm tra kết nối rồi thử lại.',
  exportSignedOut: 'Đăng nhập để tải dữ liệu của bạn.',
  exportShare: 'Lưu hoặc chia sẻ',
  consentTitle: 'Kael gửi dữ liệu cho nhà cung cấp AI',
  consentBody: [
    'Khi bạn nhắn với Kael, NestScout gửi nội dung tin nhắn của bạn, các tin nhắn trước trong cuộc trò chuyện, thông tin yêu cầu và công việc liên quan, cùng tuỳ chọn trả lời bạn đã bật, tới nhà cung cấp mô hình AI để tạo câu trả lời.',
    'Bản beta hỗ trợ nhà cung cấp mô hình Anthropic và DeepSeek. Nếu tìm kiếm web được bật, Kael cũng gửi truy vấn tìm kiếm tới Perplexity. Cấu hình có thể khác theo bản triển khai.',
    'Đừng gửi thông tin nhạy cảm như số thẻ hoặc mật khẩu trong tin nhắn. Bạn có thể rút lại đồng ý bất cứ lúc nào trong Cài đặt › Quyền riêng tư; khi đó Kael sẽ dừng trả lời.',
    'Chi tiết xem tại Cài đặt › Chính sách quyền riêng tư.',
  ],
  consentNeeded: 'Tin nhắn chưa được gửi. Bật “Chia sẻ dữ liệu với AI” trong Cài đặt › Quyền riêng tư nếu bạn muốn gửi dữ liệu đã mô tả tới nhà cung cấp AI.',
  consentFailed: 'Chưa kiểm tra được trạng thái đồng ý. Kiểm tra kết nối rồi thử lại.',
  consentChecking: 'Đang kiểm tra lựa chọn chia sẻ dữ liệu. Hãy thử gửi lại trong giây lát.',
};

const en: SettingsStrings = {
  title: 'Settings',
  notifications: 'Notifications',
  push: 'Push notifications',
  pushDetail: 'Get updates right on your device',
  quotes: 'New quotes',
  messages: 'Messages from workers and Kael',
  promotions: 'Offers and news',
  general: 'General',
  language: 'Language',
  appearance: 'Appearance',
  reduceMotion: 'Reduce motion',
  privacy: 'Privacy',
  location: 'Location',
  locationDetail: 'Manage in device settings',
  clearHistory: 'Clear chat history',
  about: 'About',
  terms: 'Terms of Service',
  privacyPolicy: 'Privacy Policy',
  version: 'Version',
  editProfile: 'Edit',
  profileLabel: name => `Personal information, ${name}`,
  saveError: 'Could not save settings. Check your connection and try again.',
  appearanceNames: { system: 'System', light: 'Light', dark: 'Dark' },
  languageNames: { vi: 'Tiếng Việt', en: 'English' },
  languageNote: 'Applies to Settings and the legal documents. Other screens will be translated over time.',
  appearanceNote: 'Dark mode applies to components that use the shared palette. Horizon screens will follow.',
  themeToDark: 'Switch to dark appearance',
  themeToLight: 'Switch to light appearance',
  selected: 'Selected',
  clearTitle: 'Clear chat history?',
  clearBody: 'All your messages with Kael in this mode will be deleted and cannot be restored. Some operational records kept for safety may remain.',
  clearConfirm: 'Clear history',
  clearCancel: 'Cancel',
  clearBusy: 'Clearing…',
  clearDone: 'Chat history cleared.',
  clearFailed: 'Could not clear history. Check your connection and try again.',
  clearActive: 'Kael is replying. Try again once it finishes.',
  clearSignedOut: 'Sign in to clear chat history.',
  holdPrompt: 'Press and hold to confirm',
  holdConfirm: 'Hold to confirm',
  holdCancel: 'Cancel',
  holdRetry: 'Retry',
  locationOpenFailed: 'Could not open device settings.',
  legalSummary: 'Summary',
  back: 'Back',
  deleteAccount: 'Delete account',
  deleteTitle: 'Delete account?',
  deleteBody: 'Send a request to delete your account and personal data. It is handled in line with the law; data we must keep for legal duties or disputes is retained under the Privacy Policy. You can cancel the request before it is processed.',
  deleteConfirm: 'Send deletion request',
  deleteCancel: 'Cancel deletion request',
  deleteKeep: 'Keep account',
  deleteBusy: 'Working…',
  deleteLoading: 'Checking status…',
  deleteFailed: 'Could not send the request. Check your connection and try again.',
  deleteLoadFailed: 'Could not check the deletion request status. Check your connection and try again.',
  deleteSignedOut: 'Sign in to request account deletion.',
  deleteRequestedOn: date => `Account deletion requested on ${date}. We will handle it in line with the law and you can cancel before then.`,
  aiShare: 'Share data with AI',
  aiShareDetail: 'Let Kael send conversation content to AI model providers',
  consentCardLead: 'To reply, Kael sends your messages and related request details to an AI provider. Do not send card numbers or passwords. You can turn this off any time in Settings › Privacy.',
  consentCardAction: 'Allow and start',
  aiShareFailed: 'Could not save your choice. Check your connection and try again.',
  aiShareLoading: 'Checking…',
  exportData: 'Download my data',
  exportTitle: 'Download my data',
  exportBody: 'Create a copy of the personal data NestScout holds about you: profile, requests, notifications, Kael history, consent choices and related records. The copy is a JSON file.',
  exportRun: 'Create data copy',
  exportBusy: 'Creating…',
  exportDone: 'Your copy is ready.',
  exportFailed: 'Could not create the data copy. Check your connection and try again.',
  exportSignedOut: 'Sign in to download your data.',
  exportShare: 'Save or share',
  consentTitle: 'Kael sends data to AI providers',
  consentBody: [
    'When you message Kael, NestScout sends your message, earlier messages in the conversation, related request and job details, and the reply preferences you turned on to an AI model provider to produce the answer.',
    'The beta supports Anthropic and DeepSeek model providers. If web search is enabled, Kael also sends its search query to Perplexity. Provider configuration can vary by deployment.',
    'Do not send sensitive details such as card numbers or passwords in messages. You can withdraw consent at any time in Settings › Privacy; Kael will then stop replying.',
    'See Settings › Privacy Policy for details.',
  ],
  consentNeeded: 'Your message was not sent. Turn on “Share data with AI” in Settings › Privacy if you want the described data sent to an AI provider.',
  consentFailed: 'Could not check your agreement. Check your connection and try again.',
  consentChecking: 'Checking your data-sharing choice. Try sending again in a moment.',
};

export function settingsStrings(language: Language): SettingsStrings {
  return language === 'en' ? en : vi;
}
