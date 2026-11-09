import type { LegalDocument } from './legal-content';

export const privacyVi: LegalDocument = {
  title: "Chính sách quyền riêng tư",
  versionId: "2026-11-09-v1.0",
  version: "Phiên bản dự thảo 2026-11-09 (v1.0) · Ngày có hiệu lực: [Chờ cung cấp: chưa xác định]",
  notice: "Bản dự thảo, chưa phải chính sách phát hành chính thức. Đang chờ kiểm kê dữ liệu thực tế, rà soát pháp lý và bổ sung thông tin đơn vị vận hành.",
  summary: [
    "NestScout là nền tảng hỗ trợ khách hàng kết nối với thợ cung cấp dịch vụ nhà ở và sử dụng trợ lý AI Kael. Để hoạt động, NestScout có thể cần thông tin liên hệ, thông tin yêu cầu dịch vụ, ảnh, nội dung trò chuyện và một số dữ liệu kỹ thuật.",
    "Chỉ sử dụng dữ liệu cho mục đích được công bố và có căn cứ hợp pháp. Chúng tôi không mặc nhiên dùng tin nhắn, ảnh hoặc địa chỉ nhà của bạn để quảng cáo hay huấn luyện mô hình AI.",
    "Chia sẻ có giới hạn. Thợ chỉ được cung cấp những thông tin cần thiết cho yêu cầu dịch vụ theo giai đoạn và quyền truy cập phù hợp. Một phần nội dung sử dụng Kael có thể được chuyển đến nhà cung cấp AI bên thứ ba sau khi được thông báo và có sự cho phép hợp lệ khi cần.",
    "Bạn có quyền kiểm soát dữ liệu. Bạn có thể đề nghị xem, sửa, rút lại sự đồng ý trong trường hợp áp dụng, hạn chế xử lý hoặc xóa dữ liệu theo quy định pháp luật. Một số bản ghi giao dịch có thể cần được giữ lại hợp pháp ngay cả khi tài khoản hoặc hội thoại đã được xóa.",
    "Hãy bảo vệ thông tin trong ảnh và tin nhắn. Tránh gửi giấy tờ tùy thân, mật khẩu, dữ liệu tài chính hay hình ảnh người khác nếu không thực sự cần thiết.",
    "Tóm tắt hỗ trợ đọc nhanh; các mục dưới đây giải thích chi tiết. Đây không phải sự đồng ý chung cho mọi hoạt động xử lý dữ liệu. Khi pháp luật hoặc quy định nền tảng yêu cầu, NestScout phải có thông báo và thao tác đồng ý riêng."
  ],
  sections: [
    {
      heading: "1. Chủ thể vận hành và phạm vi áp dụng",
      paragraphs: [
        "1.1. NestScout là tên ứng dụng. Chủ thể chịu trách nhiệm vận hành và xác định mục đích, phương tiện xử lý dữ liệu cá nhân (trong phạm vi vai trò thực tế) là [Chờ cung cấp: TÊN PHÁP LÝ], mã số đăng ký [Chờ cung cấp: MÃ SỐ], địa chỉ [Chờ cung cấp: ĐỊA CHỈ] (gọi là “NestScout”, “chúng tôi”). Kênh liên hệ về dữ liệu cá nhân được nêu tại Mục 15.",
        "1.2. Chính sách áp dụng cho những người sử dụng ứng dụng NestScout với tư cách Khách hàng, Thợ hoặc các vai trò được cung cấp hợp pháp trong ứng dụng; áp dụng với các kênh web, trợ giúp và tính năng liên kết do NestScout quản lý trong phạm vi được công bố.",
        "1.3. “Dữ liệu cá nhân” là thông tin có thể xác định trực tiếp hoặc gián tiếp một người theo pháp luật. “Xử lý” bao gồm thu thập, lưu trữ, sử dụng, truy cập, chia sẻ, truyền, chỉnh sửa, xóa hoặc hoạt động xử lý khác. Các bên cung cấp hạ tầng, phân tích hoặc AI có thể có tư cách pháp lý về dữ liệu khác nhau tùy thỏa thuận và cách hoạt động thực tế.",
        "1.4. Chính sách này được đọc cùng Điều khoản dịch vụ trong mục Cài đặt của ứng dụng. Điều khoản dịch vụ quy định giao dịch, vai trò và trách nhiệm cung cấp dịch vụ; Chính sách này tập trung vào dữ liệu cá nhân. Khi một hoạt động cần sự đồng ý cụ thể, việc chấp nhận Điều khoản dịch vụ không tự động thay thế sự đồng ý đó."
      ]
    },
    {
      heading: "2. Những loại dữ liệu có thể được xử lý",
      paragraphs: [
        "2.1. Thông tin tài khoản, xác thực: số điện thoại, tên hiển thị, email, ảnh đại diện, mã định danh tài khoản, thông tin xác thực qua OTP hoặc nhà cung cấp đăng nhập đang được kích hoạt. Mã OTP và thông tin đăng nhập được xử lý nhằm xác thực và bảo vệ tài khoản; NestScout không yêu cầu người dùng gửi OTP cho thợ hoặc người hỗ trợ qua tin nhắn.",
        "2.2. Thông tin yêu cầu dịch vụ của Khách hàng: địa chỉ hoặc khu vực cần phục vụ, mô tả vấn đề, ảnh/video/tệp do người dùng chủ động gửi (nếu tính năng hỗ trợ), lịch hẹn, thông tin về loại công việc, báo giá, thay đổi phát sinh, xác nhận, phản ánh và đánh giá.",
        "2.3. Thông tin của Thợ: thông tin nhận diện và liên hệ, khu vực và loại dịch vụ cung cấp, hồ sơ năng lực hoặc giấy phép/chứng chỉ khi cần; thông tin công việc đã nhận, trạng thái thực hiện, phản ánh và đánh giá. Giấy tờ định danh, dữ liệu thanh toán, tài khoản ngân hàng hoặc tài liệu nhạy cảm chỉ được thu thập khi chức năng thực tế và căn cứ pháp lý cho phép, với thông báo riêng khi cần.",
        "2.4. Dữ liệu trao đổi và tương tác: tin nhắn với Thợ, lịch sử tương tác với Kael, nội dung người dùng yêu cầu Kael xử lý, thông tin xác nhận hoặc từ chối một hành động, mã tham chiếu giao dịch và các bản ghi cần để đối soát trạng thái.",
        "2.5. Dữ liệu thiết bị và vận hành: phiên đăng nhập, phiên bản ứng dụng, hệ điều hành, địa chỉ IP, thời điểm sử dụng, nhật ký hoạt động, thông báo lỗi, sự kiện bảo mật hoặc dữ liệu kỹ thuật khác nếu được hệ thống/SDK thực tế thu thập. Dữ liệu này không mặc nhiên được dùng cho theo dõi quảng cáo. Ứng dụng hiện không tích hợp SDK phân tích, quảng cáo hoặc báo lỗi bên thứ ba riêng.",
        "2.6. Vị trí: khi người dùng tự nhập địa chỉ/khu vực hoặc cấp quyền vị trí cho một tính năng cần thiết. NestScout chỉ yêu cầu quyền vị trí thiết bị trong phạm vi và thời điểm liên quan đến chức năng đang sử dụng; nếu có thể, người dùng được chọn cách nhập địa điểm thủ công. Hiện ứng dụng chưa yêu cầu quyền vị trí của thiết bị; địa điểm do người dùng tự nhập.",
        "2.7. Dữ liệu người khác trong nội dung do người dùng cung cấp: ảnh căn nhà, hình ảnh người thân, thông tin liên hệ của người khác hoặc dữ liệu bên thứ ba có thể vô tình xuất hiện trong nội dung gửi lên. Người dùng được đề nghị không chia sẻ dữ liệu không cần thiết và chỉ cung cấp thông tin của người khác khi có căn cứ hợp pháp.",
        "2.8. Dữ liệu thực tế phải được đối chiếu với ứng dụng, cơ sở dữ liệu, SDK, logs và đối tác đang hoạt động. Không được công bố mục này như một danh sách hoàn chỉnh trước khi có kết quả kiểm kê dữ liệu."
      ]
    },
    {
      heading: "3. Mục đích và căn cứ xử lý",
      paragraphs: [
        "3.1. Chúng tôi xử lý dữ liệu cho các mục đích được thông báo tương ứng, có thể bao gồm:",
        "• Tạo, xác thực và bảo vệ tài khoản; hỗ trợ khôi phục quyền truy cập.",
        "• Tiếp nhận, phân loại, kết nối và quản lý yêu cầu dịch vụ; cho phép Khách hàng và Thợ trao đổi thông tin, báo giá, xác nhận và theo dõi giao dịch.",
        "• Vận hành Kael để trả lời yêu cầu hoặc hỗ trợ các tác vụ do người dùng chủ động thực hiện.",
        "• Gửi thông báo giao dịch, thông tin hỗ trợ và cảnh báo an toàn cần thiết.",
        "• Tiếp nhận yêu cầu thực hiện quyền dữ liệu cá nhân, hỗ trợ khiếu nại, đối soát giao dịch và giải quyết tranh chấp.",
        "• Phát hiện, ngăn chặn hành vi gian lận, truy cập trái phép hoặc sự cố; thực hiện nghĩa vụ hợp pháp với cơ quan có thẩm quyền.",
        "• Cải thiện chất lượng, độ ổn định hoặc an toàn hệ thống trong phạm vi được công bố và có căn cứ xử lý hợp pháp.",
        "3.2. Tùy hoạt động, căn cứ xử lý có thể là sự đồng ý hợp lệ của chủ thể dữ liệu hoặc trường hợp xử lý không cần sự đồng ý do pháp luật quy định. NestScout không tự động coi “thực hiện hợp đồng” hoặc “tiếp tục sử dụng ứng dụng” là sự cho phép vô hạn đối với mọi dữ liệu và mục đích.",
        "3.3. Các hoạt động tùy chọn như quảng cáo, ưu đãi, phân tích ngoài phạm vi cần thiết hoặc sử dụng dữ liệu cá nhân để huấn luyện/cải thiện mô hình AI — nếu được đề xuất triển khai — phải được đánh giá căn cứ pháp lý, thông báo rõ và xin phép riêng khi cần trước khi triển khai. Việc người dùng từ chối mục đích không thiết yếu không được bị sử dụng làm lý do mặc nhiên ngăn họ truy cập chức năng cốt lõi không phụ thuộc vào mục đích đó."
      ]
    },
    {
      heading: "4. Thông báo, sự đồng ý và quyền truy cập thiết bị",
      paragraphs: [
        "4.1. Khi pháp luật yêu cầu đồng ý, NestScout cung cấp thông tin phù hợp về loại dữ liệu, mục đích xử lý, bên nhận liên quan, quyền của người dùng và cách rút lại sự đồng ý; có hành động thể hiện lựa chọn rõ ràng. Không coi im lặng hoặc ô chọn đã bật sẵn là sự đồng ý hợp lệ.",
        "4.2. Những mục đích xử lý có thể lựa chọn độc lập phải được thể hiện riêng khi cần. Bằng chứng đồng ý, phiên bản thông báo và thời điểm thao tác có thể được lưu trong phạm vi cần thiết để xác minh và tuân thủ pháp luật.",
        "4.3. Quyền truy cập ảnh, camera, vị trí, thông báo hoặc tính năng hệ điều hành chỉ được yêu cầu khi có chức năng liên quan. Từ chối cấp quyền không mặc nhiên làm mất khả năng sử dụng các chức năng không cần quyền đó.",
        "4.4. Người dùng có thể rút lại sự đồng ý khi pháp luật cho phép thông qua chức năng đang được cung cấp hoặc kênh tiếp nhận tại Mục 15. Rút lại đồng ý không mặc nhiên làm cho hoạt động xử lý hợp pháp trước thời điểm rút lại trở thành trái pháp luật, cũng không loại trừ trường hợp luật cho phép xử lý mà không cần đồng ý."
      ]
    },
    {
      heading: "5. Chia sẻ dữ liệu giữa Khách hàng và Thợ",
      paragraphs: [
        "5.1. Khi Khách hàng gửi yêu cầu, NestScout có thể cung cấp cho Thợ phù hợp thông tin tối thiểu cần thiết tại giai đoạn liên quan, chẳng hạn khu vực, loại công việc, mô tả và hình ảnh được phép chia sẻ; quyền xem địa chỉ chính xác, số điện thoại hoặc thông tin nhận diện phải được giới hạn theo quy trình thực tế và nhu cầu cần biết.",
        "5.2. Khi giao dịch tiến triển, thông tin cần thiết để xác nhận lịch, đến địa điểm và thực hiện công việc có thể được cung cấp cho Thợ liên quan theo thông báo, lựa chọn và căn cứ hợp pháp tương ứng. Việc gửi yêu cầu không mặc nhiên có nghĩa mọi Thợ trên nền tảng được xem toàn bộ dữ liệu của Khách hàng.",
        "5.3. Khách hàng có thể thấy thông tin nghề nghiệp và hồ sơ công khai phù hợp của Thợ để đưa ra quyết định. Thợ không được sử dụng thông tin nhận từ NestScout để quấy rối, tiếp thị không được phép hoặc cho mục đích khác ngoài yêu cầu dịch vụ hợp pháp.",
        "5.4. Khi phát sinh khiếu nại, dữ liệu, bằng chứng và nội dung liên quan chỉ được chia sẻ với các bên thực sự cần thiết để xác minh và giải quyết vụ việc, theo phạm vi luật cho phép. NestScout có thể hạn chế hoặc che thông tin không liên quan trước khi chia sẻ."
      ]
    },
    {
      heading: "6. Kael, nhà cung cấp mô hình AI và bộ nhớ",
      paragraphs: [
        "6.1. Kael là trợ lý AI. Khi sử dụng Kael, một phần nội dung người dùng nhập, thông tin ngữ cảnh phù hợp và dữ liệu liên quan đến yêu cầu có thể cần được xử lý để tạo phản hồi hoặc thực hiện tác vụ theo yêu cầu.",
        "6.2. Nếu Kael dùng dịch vụ mô hình AI của bên thứ ba, NestScout phải giải thích đối tượng nhận, loại dữ liệu, mục đích, vị trí/địa điểm xử lý nếu có liên quan và cơ chế đồng ý/cho phép phù hợp trước khi gửi dữ liệu cá nhân. Danh mục nhà cung cấp đang hoạt động và thông tin xử lý phải được công khai hoặc liên kết từ chính sách: [Chờ cung cấp: DANH MỤC NHÀ CUNG CẤP AI ĐÃ KIỂM CHỨNG + LINK CHI TIẾT].",
        "6.3. NestScout chỉ nên chuyển lượng ngữ cảnh cần thiết cho từng tác vụ, hạn chế truyền thông tin định danh không liên quan và không mặc nhiên gửi toàn bộ lịch sử hội thoại hoặc tệp đính kèm cho mỗi lần gọi mô hình. Người dùng được khuyến nghị tránh gửi thông tin nhạy cảm không cần thiết qua Kael.",
        "6.4. Hội thoại, bộ nhớ cá nhân hóa và nhật ký xác nhận giao dịch là ba loại dữ liệu khác nhau. Nếu ứng dụng có chức năng bộ nhớ, NestScout phải giải thích bộ nhớ ghi nhận gì, có thể bật/tắt hoặc xóa ra sao, và hệ quả với các chức năng của Kael. Không khẳng định nút bật/tắt bộ nhớ hoặc xóa lịch sử đã hoạt động khi chưa kiểm chứng trên thiết bị và backend.",
        "6.5. Việc xóa hội thoại hoặc tắt bộ nhớ không mặc nhiên xóa các chứng cứ về thao tác xác nhận, báo giá hay tranh chấp cần lưu giữ hợp pháp. NestScout phải giải thích rõ phạm vi xóa, dữ liệu còn lưu và lý do.",
        "6.6. Không được mặc định sử dụng dữ liệu cá nhân để huấn luyện, tinh chỉnh hoặc chia sẻ cho mục đích huấn luyện mô hình ngoài mục đích đã được công bố và có căn cứ pháp lý tương ứng. NestScout phải kiểm tra thỏa thuận/cài đặt thực tế của từng nhà cung cấp trước khi tuyên bố rằng dữ liệu có hoặc không được nhà cung cấp lưu giữ hay dùng cho huấn luyện."
      ]
    },
    {
      heading: "7. Các bên nhận dữ liệu khác",
      paragraphs: [
        "7.1. Trong phạm vi cần thiết và hợp pháp, dữ liệu có thể được xử lý bởi đơn vị cung cấp hạ tầng đám mây, xác thực/OTP, lưu trữ, thông báo, hỗ trợ khách hàng, phân tích lỗi, bảo mật và những nhà cung cấp công nghệ khác đang thực sự phục vụ NestScout. Danh mục liên quan được công bố tại [Chờ cung cấp: DANH SÁCH ĐỐI TÁC/ĐƠN VỊ XỬ LÝ ĐÃ KIỂM CHỨNG + LINK].",
        "7.2. NestScout phải đánh giá quyền truy cập, giới hạn mục đích, biện pháp bảo vệ, yêu cầu xóa/trả dữ liệu và các trách nhiệm có liên quan của bên nhận. Việc dùng dịch vụ bên ngoài không làm NestScout mất đi nghĩa vụ pháp lý thuộc trách nhiệm của mình.",
        "7.3. Dữ liệu có thể được cung cấp cho cơ quan có thẩm quyền hoặc bên liên quan khi có căn cứ pháp luật hợp lệ, yêu cầu hợp pháp hoặc trong trường hợp cần thiết để bảo vệ quyền, lợi ích hợp pháp theo pháp luật. NestScout không công khai nội dung riêng tư của Người dùng chỉ vì có yêu cầu không được xác minh.",
        "7.4. Chủ trương của NestScout là không kinh doanh dữ liệu cá nhân của người dùng. Trước khi công bố câu này như một cam kết chính thức, cần kiểm tra mọi luồng dữ liệu, SDK quảng cáo/đo lường và hợp đồng đối tác để bảo đảm không tồn tại hoạt động trái với tuyên bố."
      ]
    },
    {
      heading: "8. Xử lý và chuyển dữ liệu ra ngoài Việt Nam",
      paragraphs: [
        "8.1. Tùy cấu hình hạ tầng và nhà cung cấp công nghệ, dữ liệu cá nhân có thể được lưu trữ, truy cập hoặc xử lý từ ngoài Việt Nam. Địa điểm xử lý cụ thể không được suy đoán từ tên thương hiệu của nhà cung cấp hoặc khu vực database mà phải xác minh theo từng dịch vụ, logs, hỗ trợ, sao lưu và luồng API đang hoạt động.",
        "8.2. Khi có hoạt động chuyển dữ liệu cá nhân xuyên biên giới, NestScout sẽ thực hiện nghĩa vụ thông báo, bảo vệ, đánh giá tác động, hồ sơ và các thủ tục áp dụng theo pháp luật Việt Nam, có tính đến các trường hợp ngoại lệ hợp pháp khi có.",
        "8.3. Thông tin tóm tắt về bên nhận và quốc gia/vùng xử lý khi xác định được: [Chờ cung cấp: BẢNG LUỒNG DỮ LIỆU XUYÊN BIÊN GIỚI ĐÃ KIỂM CHỨNG + LINK]. Mục này phải được hoàn thiện trước khi công bố nếu thực tế có luồng dữ liệu xuyên biên giới cần công khai."
      ]
    },
    {
      heading: "9. Bảo vệ dữ liệu và kiểm soát truy cập",
      paragraphs: [
        "9.1. NestScout áp dụng những biện pháp kỹ thuật, tổ chức và quản trị phù hợp với tính chất, quy mô và rủi ro xử lý dữ liệu cá nhân, bao gồm phân quyền truy cập, bảo vệ tài khoản, quản lý khóa/bí mật, ghi nhận sự kiện an ninh và kiểm tra quyền truy cập ở phạm vi cần thiết.",
        "9.2. Những tuyên bố cụ thể như mã hóa dữ liệu ở trạng thái lưu trữ, mã hóa khi truyền tải, tách biệt dữ liệu giữa tài khoản, tự động xóa logs hay kiểm toán bảo mật chỉ được công bố khi đã có bằng chứng triển khai thực tế; không coi việc dùng một nhà cung cấp có tính năng bảo mật là bằng chứng cấu hình đúng của NestScout.",
        "9.3. Người dùng cần giữ bí mật mã OTP và phương thức đăng nhập, cảnh giác với yêu cầu gửi giấy tờ hoặc mật khẩu trái quy trình; báo sự cố qua Mục 15. Không hệ thống nào có thể được bảo đảm an toàn tuyệt đối."
      ]
    },
    {
      heading: "10. Thời gian lưu giữ, sao lưu và xóa dữ liệu",
      paragraphs: [
        "10.1. Dữ liệu được lưu trong thời hạn phù hợp với mục đích xử lý, căn cứ pháp lý và nghĩa vụ lưu trữ áp dụng. NestScout phải công bố thời hạn cụ thể hoặc tiêu chí xác định thời hạn cho từng nhóm dữ liệu quan trọng tại [Chờ cung cấp: BẢNG THỜI HẠN LƯU GIỮ ĐÃ ĐƯỢC PHÊ DUYỆT + LINK]. Không được dùng tuyên bố “chỉ giữ khi cần” để thay thế việc xác định thời hạn/tiêu chí thực tế.",
        "10.2. Nhóm dữ liệu cần có chính sách lưu giữ riêng gồm: dữ liệu tài khoản và xác thực; lịch sử giao dịch và bằng chứng xác nhận; tin nhắn/ảnh; bộ nhớ Kael; nhật ký lỗi, bảo mật và đồng ý; dữ liệu từ bên xử lý; bản sao lưu. Việc lưu trữ bằng chứng giao dịch phải tuân thủ nghĩa vụ pháp luật tương ứng và không có nghĩa toàn bộ lịch sử trò chuyện được lưu vô thời hạn.",
        "10.3. Khi nhận yêu cầu xóa hợp lệ, NestScout sẽ xác định loại dữ liệu, quyền chủ thể, nghĩa vụ giữ lại và phạm vi liên quan đến bên xử lý; tiến hành xóa/ẩn danh hoặc xử lý tương ứng trong thời hạn pháp luật quy định. Dữ liệu cần tiếp tục lưu giữ hợp pháp được tách biệt, giới hạn quyền truy cập và không dùng cho mục đích mới không phù hợp.",
        "10.4. Việc xóa dữ liệu khỏi giao diện chưa chắc đồng nghĩa bản sao lưu, logs hoặc bản dữ liệu đã chuyển cho bên xử lý được xóa tức thời. NestScout phải công bố quy trình xử lý các bản sao này theo chính sách lưu giữ đã được xác minh, thay vì tuyên bố “xóa hoàn toàn ngay lập tức”."
      ]
    },
    {
      heading: "11. Quyền của người có dữ liệu và cách gửi yêu cầu",
      paragraphs: [
        "11.1. Trong phạm vi pháp luật áp dụng, người có dữ liệu cá nhân có quyền được biết; đồng ý hoặc không đồng ý; truy cập, xem, chỉnh sửa; rút lại sự đồng ý; yêu cầu xóa, hạn chế hoặc phản đối xử lý; yêu cầu cung cấp dữ liệu; khiếu nại và thực hiện các quyền khác được pháp luật quy định.",
        "11.2. Yêu cầu có thể được gửi qua [Chờ cung cấp: EMAIL BẢO VỆ DỮ LIỆU], kênh Trợ giúp trong ứng dụng hoặc [Chờ cung cấp: ĐƯỜNG DẪN BIỂU MẪU QUYỀN DỮ LIỆU NẾU CÓ]. NestScout có thể yêu cầu xác minh hợp lý nhằm tránh tiết lộ dữ liệu cho người không có quyền, nhưng không được thu thập giấy tờ dư thừa không cần thiết.",
        "11.3. Đối với yêu cầu hợp lệ và không thuộc ngoại lệ, thời hạn thông thường theo quy định hiện hành bao gồm: phản hồi về thủ tục trong 02 ngày làm việc; thực hiện yêu cầu xem/chỉnh sửa/cung cấp dữ liệu trong 10 ngày; rút đồng ý/hạn chế/phản đối trong 15 ngày; xóa dữ liệu trong 20 ngày. Trường hợp cần phối hợp bên thứ ba, gia hạn hợp lệ hoặc thuộc ngoại lệ pháp lý, thời hạn thực hiện có thể khác; NestScout sẽ thông báo theo quy định áp dụng.",
        "11.4. Nếu không thể thực hiện toàn bộ hoặc một phần yêu cầu do có căn cứ pháp luật, NestScout thông báo lý do và hướng xử lý theo phạm vi phải cung cấp. Người dùng có quyền khiếu nại, kiến nghị hoặc sử dụng biện pháp bảo vệ quyền theo pháp luật."
      ]
    },
    {
      heading: "12. Xóa tài khoản, lịch sử trò chuyện và rút đồng ý",
      paragraphs: [
        "12.1. Người dùng có thể gửi yêu cầu xóa tài khoản trong Cài đặt › Xoá tài khoản và huỷ yêu cầu trước khi nó được xử lý. Yêu cầu được ghi nhận trong ứng dụng; việc xóa dữ liệu do NestScout xử lý theo pháp luật, chưa tự động. Trường hợp ứng dụng không truy cập được, người dùng có thể liên hệ qua Mục 15.",
        "12.2. Xóa tài khoản, xóa lịch sử Kael, xóa bộ nhớ cá nhân hóa và rút lại đồng ý xử lý một mục đích cụ thể là những thao tác khác nhau. NestScout phải trình bày rõ hậu quả của từng thao tác, dữ liệu nào sẽ bị xóa hoặc giữ lại theo pháp luật và khả năng khôi phục (nếu có).",
        "12.3. Nếu xóa tài khoản khi đang có giao dịch, khiếu nại hoặc nghĩa vụ hợp pháp chưa hoàn tất, NestScout xử lý các bản ghi liên quan theo pháp luật, đồng thời giới hạn việc tiếp tục sử dụng dữ liệu. Xóa tài khoản không tự động làm mất quyền khiếu nại hoặc nghĩa vụ hợp pháp của các bên.",
        "12.4. Việc rút đồng ý đối với hoạt động không thiết yếu được tách khỏi các mục đích xử lý có căn cứ pháp luật độc lập. NestScout giải thích rõ những tính năng nào không thể vận hành nếu thiếu dữ liệu thiết yếu, không dùng cách thiết kế gây hiểu lầm để buộc người dùng đồng ý những mục đích khác."
      ]
    },
    {
      heading: "13. Dữ liệu liên quan đến trẻ em và người chưa đủ điều kiện",
      paragraphs: [
        "13.1. NestScout được thiết kế để người dùng thực hiện yêu cầu và giao dịch dịch vụ tại nhà theo năng lực pháp luật và năng lực hành vi phù hợp. Người chưa đủ điều kiện tự mình tham gia giao dịch chỉ được sử dụng tính năng phù hợp trong phạm vi được pháp luật cho phép và có sự tham gia hoặc đồng ý hợp pháp của người đại diện khi cần.",
        "13.2. Nếu thực tế NestScout lựa chọn chỉ phục vụ người từ một độ tuổi nhất định, [Chờ cung cấp: ĐỘ TUỔI TỐI THIỂU ĐƯỢC PHÊ DUYỆT] phải được công bố thống nhất với Điều khoản dịch vụ, đánh giá phân loại độ tuổi trên App Store và kiểm soát đăng ký thực tế; không tự đặt ngưỡng tuổi chỉ trong tài liệu.",
        "13.3. Nếu phát hiện dữ liệu của trẻ em đã được xử lý không phù hợp, NestScout tiếp nhận và giải quyết yêu cầu của người có quyền đại diện hoặc chủ thể dữ liệu theo pháp luật, áp dụng biện pháp bảo vệ phù hợp với dữ liệu và hoàn cảnh."
      ]
    },
    {
      heading: "14. Sự cố bảo vệ dữ liệu và cập nhật Chính sách",
      paragraphs: [
        "14.1. Khi phát hiện sự cố liên quan đến dữ liệu cá nhân, NestScout thực hiện biện pháp đánh giá, ngăn chặn, khắc phục, lưu chứng cứ và thông báo theo những nghĩa vụ luật định áp dụng. Việc thông báo cho cơ quan có thẩm quyền hoặc người bị ảnh hưởng được quyết định theo điều kiện pháp lý và mức độ rủi ro của sự cố.",
        "14.2. NestScout có thể sửa đổi Chính sách để phản ánh thay đổi chức năng, đối tác, mục đích xử lý hoặc pháp luật. Phiên bản và ngày có hiệu lực được công bố rõ. Đối với thay đổi quan trọng, người dùng được thông báo phù hợp; nếu cần sự đồng ý mới, NestScout phải xin lại trước khi xử lý theo mục đích mới.",
        "14.3. Việc tiếp tục sử dụng ứng dụng không tự động thay thế sự đồng ý dữ liệu cá nhân trong trường hợp pháp luật yêu cầu thao tác thể hiện ý chí riêng và rõ ràng."
      ]
    },
    {
      heading: "15. Liên hệ và yêu cầu về dữ liệu cá nhân",
      paragraphs: [
        "Tên chủ thể vận hành: [Chờ cung cấp: TÊN PHÁP LÝ ĐẦY ĐỦ]",
        "Mã số đăng ký: [Chờ cung cấp: MÃ SỐ]",
        "Địa chỉ liên hệ: [Chờ cung cấp: ĐỊA CHỈ]",
        "Email tiếp nhận yêu cầu dữ liệu cá nhân: [Chờ cung cấp: EMAIL]",
        "Kênh hỗ trợ khác: [Chờ cung cấp: ĐƯỜNG DẪN TRỢ GIÚP/PHƯƠNG THỨC LIÊN HỆ DỰ PHÒNG]",
        "Bộ phận hoặc người phụ trách (nếu có và cần công bố): [Chờ cung cấp: THÔNG TIN ĐÃ XÁC MINH]",
        "Người dùng có thể liên hệ qua những kênh trên để hỏi về việc xử lý dữ liệu cá nhân, thực hiện các quyền hợp pháp hoặc báo cáo nghi vấn lộ lọt dữ liệu. NestScout sẽ hướng dẫn và xử lý yêu cầu theo pháp luật Việt Nam."
      ]
    }
  ]
};
