import { normalizeKnowledge } from './knowledge-contract.ts';
import type { ScopeMaterial, ServiceCase, ServiceFamily } from './knowledge-contract.ts';

type FamilyInput = { family: ServiceFamily; scope: string; exclusions: string; questions: string; costs: string; rows: string };

const families: FamilyInput[] = [
  {
    family: 'electrical', scope: 'Khảo sát một thiết bị điện dân dụng, chưa thao tác điện', exclusions: 'Không can thiệp điện lưới, tủ điện chung hay kết cấu', questions: 'Thiết bị có đang được sử dụng không?', costs: 'Tình trạng dây và linh kiện;Khả năng cô lập nguồn an toàn',
    rows: `breaker-trip|Cầu dao nhảy khi bật bếp|aptomat cứ sập;bật bếp là mất điện|Quá tải hoặc rò điện|Cầu dao nhảy ở nhánh nào?|mains_electricity
socket-crackle|Ổ cắm phát tiếng lách tách|ổ điện kêu tách tách;phích cắm nổ lách cách|Tiếp điểm lỏng hoặc hư hỏng|Có mùi khét hay đổi màu không?|fire_risk
light-flicker|Đèn trần chớp tắt liên tục|bóng đèn nhấp nháy;đèn cứ chớp|Nguồn cấp hoặc bộ đèn không ổn định|Một bóng hay cả phòng cùng chớp?|mains_electricity
switch-hot|Công tắc nóng bất thường|nút bật đèn nóng ran;sờ công tắc thấy nóng|Tiếp xúc kém hoặc tải không phù hợp|Có thấy vết sẫm màu từ xa không?|fire_risk
fan-no-start|Quạt trần không quay|quạt trần bật không chạy;quạt trên trần đứng im|Bộ điều khiển hoặc động cơ có lỗi|Quạt có phát tiếng ù không?|electricity_and_height
fan-wobble|Quạt trần rung lắc|quạt trần đảo mạnh;quạt lắc như sắp rơi|Liên kết hoặc cân bằng cánh không ổn định|Rung xuất hiện ở tốc độ nào?|falling_object
lamp-dead|Đèn bàn không sáng|đèn học tối thui;đèn bàn bật hoài không lên|Bóng hoặc nguồn đèn hỏng|Đèn dùng pin hay cắm điện?|mains_electricity
led-strip|Dây đèn LED sáng không đều|led hắt tủ chỗ sáng chỗ tối;dải đèn bị đứt đoạn sáng|Bộ nguồn hoặc mối nối xuống cấp|Đèn lắp ở nơi khô hay ẩm?|mains_electricity
doorbell|Chuông cửa không kêu|bấm chuông không nghe;chuông cổng im re|Pin hoặc bộ chuông có lỗi|Chuông có dây hay dùng pin?|mains_electricity
outlet-dead|Ổ điện không có nguồn|ổ cắm không ăn điện;cắm đồ vào không chạy|Nhánh nguồn hoặc ổ cắm bị ngắt|Những ổ khác cùng khu vực còn điện không?|mains_electricity
burn-smell|Mùi khét gần tủ điện|tủ điện có mùi cháy;nghe mùi nhựa khét ở cầu dao|Dây hoặc thiết bị bảo vệ quá nhiệt|Có khói hay tiếng nổ từ xa không?|fire_risk
water-socket|Nước thấm vào ổ điện|ổ điện bị ướt;tường rỉ nước sát ổ cắm|Thấm nước vào hệ thống điện|Nước còn đang chảy không?|water_near_electricity
shock-appliance|Chạm vỏ máy thấy tê|sờ máy giặt bị giật;vỏ tủ lạnh tê tay|Rò điện hoặc thiếu bảo vệ|Có người đang bị điện giật không?|electric_shock
dim-whole-room|Điện cả phòng yếu đèn mờ|bóng nào cũng tối;điện chập chờn cả phòng|Nguồn chung hoặc mối nối không ổn định|Khu vực lân cận có cùng hiện tượng không?|mains_electricity
extension-hot|Ổ nối dài bị nóng|ổ chia điện nóng;dây nối bốc nóng|Tải hoặc tiếp điểm vượt khả năng|Đang cắm những thiết bị nào?|fire_risk
light-hum|Đèn tuýp kêu ù|bóng tuýp rè rè;đèn ống nghe tiếng ù|Bộ nguồn hoặc phụ kiện đèn lão hóa|Tiếng xuất hiện ngay khi bật hay sau một lúc?|mains_electricity
bathroom-light|Đèn nhà tắm không sáng|đèn toilet tắt ngóm;bóng phòng tắm không lên|Bóng hoặc nguồn trong vùng ẩm có lỗi|Có dấu ẩm trên thiết bị không?|water_near_electricity
exhaust-dead|Quạt hút nhà tắm ngừng chạy|quạt thông gió toilet không quay;quạt hút im ru|Động cơ hoặc nguồn quạt hỏng|Quạt có mùi khét không?|water_near_electricity
timer-fault|Bộ hẹn giờ đèn sai giờ|đèn hẹn giờ bật lung tung;timer đèn không đúng|Cài đặt hoặc bộ hẹn giờ lỗi|Bộ hẹn giờ dùng cho tải nào?|mains_electricity
dimmer-fault|Đèn dùng dimmer chớp|vặn núm giảm sáng đèn nháy;đèn dimmer rè|Bộ điều chỉnh không tương thích bóng|Bóng và dimmer đã thay gần đây chưa?|mains_electricity
loose-outlet|Mặt ổ cắm bị lỏng|ổ điện tuột khỏi tường;mặt ổ cắm lung lay|Liên kết hộp đế bị lỏng|Có lộ dây từ vị trí quan sát an toàn không?|electric_shock
broken-switch|Công tắc đèn bị kẹt|nút đèn bấm không xuống;công tắc cứng đơ|Cơ cấu công tắc hỏng|Công tắc đang ở vị trí nào?|mains_electricity
outdoor-light|Đèn ban công tắt sau mưa|mưa xong đèn ngoài trời không lên;đèn sân bị vô nước|Độ kín nước hoặc nguồn có lỗi|Có nước đọng quanh đèn không?|water_near_electricity
motion-sensor|Đèn cảm biến tự bật liên tục|đèn cầu thang tự sáng hoài;cảm biến đèn không chịu tắt|Cài đặt hoặc cảm biến bị ảnh hưởng|Có nguồn nhiệt hay vật chuyển động gần đó không?|electricity_and_height
remote-fan|Quạt không nhận điều khiển|remote quạt bấm không ăn;quạt trần không nhận remote|Pin hoặc bộ thu tín hiệu có lỗi|Điều khiển có báo sáng không?|electricity_and_height
breaker-buzz|Cầu dao phát tiếng rè|aptomat kêu rè;tủ cầu dao ù ù|Tiếp xúc hoặc tải bất thường|Tiếng có kèm mùi khét không?|fire_risk
power-after-drill|Mất điện sau khoan tường|khoan xong phòng mất điện;vừa khoan thì cầu dao sập|Dây âm tường có thể bị ảnh hưởng|Vị trí khoan có gần đường điện đã biết không?|electric_shock
bulb-break|Bóng đèn vỡ trên trần|bóng đèn bể;đui đèn còn miếng bóng vỡ|Bóng bị va chạm hoặc hư hỏng|Bóng loại gì và có mảnh rơi không?|glass_and_electricity
light-install|Muốn lắp đèn thả mới|treo đèn bàn ăn;gắn đèn thả trần|Điểm treo hoặc nguồn cần được khảo sát|Đã có điểm điện và điểm chịu lực chưa?|electricity_and_height
earthing-check|Muốn kiểm tra tiếp địa|nhà chưa biết có nối đất;kiểm tra dây tiếp đất|Hệ thống bảo vệ có thể chưa phù hợp|Có bản vẽ hoặc hồ sơ điện không?|mains_electricity`,
  },
  {
    family: 'plumbing', scope: 'Khảo sát một điểm cấp hoặc thoát nước trong căn hộ', exclusions: 'Không sửa trục chung, đục kết cấu hoặc hệ thống gas', questions: 'Hiện tượng xảy ra liên tục hay từng lúc?', costs: 'Loại van và phụ kiện;Đường ống âm hay nổi',
    rows: `tap-drip|Vòi bếp nhỏ giọt khi khóa|vòi rửa chén rỉ hoài;khóa vòi rồi vẫn tí tách|Gioăng hoặc lõi van mòn|Nước rỉ ở đầu hay chân vòi?|routine_caution
sink-slow|Bồn rửa bếp thoát chậm|bồn chén rút nước lâu;chậu rửa bị ứ|Cặn tích trong xi phông hoặc nhánh thoát|Chỉ bồn bếp hay nhiều điểm cùng chậm?|contaminated_water
toilet-block|Bồn cầu dâng nước không rút|toilet nghẹt;giật nước trào lên|Vật cản hoặc nhánh thoát có vấn đề|Có trào nước bẩn ra sàn không?|contaminated_water
floor-drain-smell|Phễu sàn có mùi hôi|cống toilet hôi;mùi cống từ lỗ sàn|Bẫy nước khô hoặc đường thoát không kín|Mùi xuất hiện sau bao lâu không dùng?|contaminated_water
under-sink-leak|Rò nước dưới chậu rửa|gầm bồn rửa ướt;xi phông rỉ nước|Mối nối hoặc gioăng thoát nước lỏng|Nước xuất hiện khi xả hay cả lúc ngưng?|routine_caution
shower-weak|Vòi sen chảy yếu|sen tắm nước li ti;vòi tắm không mạnh|Cặn đầu sen hoặc áp cấp nước thấp|Các vòi khác có cùng yếu không?|routine_caution
toilet-running|Két bồn cầu chảy nước liên tục|bồn cầu tự bơm hoài;két toilet không ngừng chảy|Van xả hoặc phao không kín|Nước chảy vào bồn hay tràn khỏi két?|routine_caution
pipe-wall|Tường ẩm nghi rò ống âm|tường phòng tắm cứ ướt;nghi ống nước trong tường bể|Ống âm hoặc chống thấm có vấn đề|Vết ẩm thay đổi khi dùng nước không?|hidden_damage
ceiling-leak|Trần nhỏ nước từ tầng trên|nước dột trần chung cư;trần toilet nhỏ giọt|Nguồn nước phía trên hoặc đường ống chung|Đã báo quản lý tòa nhà chưa?|water_near_electricity
valve-stuck|Van khóa nước bị kẹt|van nước vặn không nổi;khóa tổng cứng|Cặn hoặc cơ cấu van xuống cấp|Van phục vụ riêng căn hộ hay trục chung?|pressure_risk
hose-burst|Dây cấp nước mềm bị nứt|dây vòi xịt phồng;ống mềm cấp nước rách|Dây hoặc đầu nối lão hóa|Nước có đang phun ra không?|pressure_risk
tap-loose|Vòi chậu rửa lung lay|vòi bếp lắc;chân vòi không chắc|Liên kết chân vòi lỏng|Mặt chậu có nứt không?|routine_caution
basin-crack|Chậu lavabo bị nứt|bồn rửa mặt rạn;lavabo bể mép|Vật liệu hoặc liên kết bị hỏng|Vết nứt có rỉ nước không?|sharp_edges
shower-temp|Nước sen nóng lạnh thất thường|đang tắm nước đổi nóng lạnh;sen nhiệt không ổn định|Bộ trộn hoặc nguồn nước nóng có lỗi|Có nguy cơ bỏng hay tiếng bất thường không?|scald_risk
heater-leak|Bình nước nóng rò nước|máy nước nóng chảy nước;bình nóng lạnh bị ướt|Thiết bị hoặc đường nối có hỏng|Nước chảy từ thân hay đầu nối nhìn thấy?|pressure_and_electricity
drain-gurgle|Ống thoát kêu ọc ọc|xả nước nghe ục ục;cống kêu khi dùng lavabo|Thông khí hoặc đường thoát bị cản|Có mùi và thoát chậm kèm theo không?|contaminated_water
washer-drain|Ống xả máy giặt tràn|máy giặt xả nước ra sàn;đường thoát giặt bị trào|Ống xả hoặc điểm tiếp nhận bị cản|Nước trào ở đầu ống hay phễu sàn?|water_near_electricity
meter-moving|Đồng hồ nước chạy khi không dùng|không xài mà số nước tăng;đồng hồ nước quay hoài|Rò nước hoặc thiết bị đang lấy nước|Đã xác nhận mọi điểm dùng đều ngưng chưa?|hidden_damage
water-brown|Nước vòi có màu vàng|nước máy đục nâu;vòi ra nước gỉ|Cặn đường cấp hoặc nguồn chung bị ảnh hưởng|Nhiều vòi hay chỉ một vòi có màu?|water_quality
no-water|Căn hộ mất nước toàn bộ|mở vòi không có giọt nào;nhà không có nước|Nguồn cấp hoặc van chung bị ngắt|Các căn lân cận có mất nước không?|routine_caution
pipe-hammer|Ống nước gõ khi đóng vòi|khóa vòi nghe cộc;ống đập trong tường|Áp lực hoặc liên kết ống gây rung|Tiếng xảy ra ở vòi nào?|pressure_risk
bidet-leak|Vòi xịt vệ sinh rò|vòi xịt toilet nhỏ nước;đầu xịt chảy hoài|Gioăng hoặc cơ cấu đầu xịt không kín|Rỉ tại đầu xịt hay dây?|routine_caution
sink-seal|Mép chậu bếp thấm nước|viền bồn rửa bị hở;nước lọt quanh mép chậu|Keo kín mép xuống cấp|Mặt bàn quanh chậu có mục không?|routine_caution
balcony-drain|Ban công ngập khi mưa|nước mưa không rút ban công;lỗ thoát sân phơi nghẹt|Rác hoặc đường thoát mưa bị cản|Có nguy cơ nước vào ổ điện không?|water_near_electricity
toilet-base|Chân bồn cầu rỉ nước|sàn quanh toilet ướt;nước thấm chân bồn cầu|Liên kết thoát hoặc lớp kín chân hỏng|Nước xuất hiện sau xả hay liên tục?|contaminated_water
odor-basin|Lavabo bốc mùi dù vẫn thoát|bồn rửa mặt hôi;ống lavabo có mùi|Bẫy nước hoặc chất bám có vấn đề|Mùi từ lỗ thoát hay quanh mép chậu?|contaminated_water
filter-leak|Cốc lọc nước rò|máy lọc chảy nước dưới tủ;cốc lọc rịn nước|Vỏ hoặc mối nối lọc không kín|Loại lọc và vị trí rò nhìn thấy là gì?|water_near_electricity
drain-insects|Côn trùng từ miệng cống|ruồi nhỏ quanh lỗ thoát;con nhỏ bò từ phễu sàn|Chất hữu cơ hoặc khe hở tại điểm thoát|Côn trùng xuất hiện tại điểm nào?|contamination
tap-replace|Thay vòi chậu cùng chuẩn|đổi vòi lavabo cũ;lắp vòi bếp mới có sẵn|Thiết bị cũ không còn phù hợp|Vòi mới có đúng kích thước chậu không?|routine_caution
hidden-drain|Nghi nghẹt đường thoát âm|nhiều chậu cùng trào;đường thoát trong sàn nghẹt|Nhánh thoát chung hoặc ống âm bị cản|Những điểm nào cùng bị ảnh hưởng?|hidden_damage`,
  },
  {
    family: 'air_conditioning', scope: 'Khảo sát một máy lạnh dân dụng và điều kiện tiếp cận', exclusions: 'Không nạp môi chất, thay máy nén hay làm ngoài mặt đứng chưa khảo sát', questions: 'Máy loại gì và hiện tượng bắt đầu lúc nào?', costs: 'Vị trí dàn nóng;Tình trạng linh kiện và đường ống',
    rows: `indoor-water|Máy lạnh nhỏ nước trong phòng|máy lạnh chảy nước;điều hòa rớt nước|Đường nước ngưng tắc hoặc độ dốc chưa phù hợp|Nước rơi ở mặt trước hay đường ống?|water_near_electricity
weak-cooling|Máy lạnh gió có nhưng không mát|máy lạnh hết lạnh;điều hòa chạy nóng|Lưu lượng gió hoặc hệ thống lạnh có lỗi|Phòng có kín và máy chạy bao lâu rồi?|refrigerant_and_electricity
cycling|Máy lạnh lúc lạnh lúc không|điều hòa ngắt liên tục;máy lạnh lạnh chập chờn|Cảm biến hoặc điều kiện vận hành bất thường|Chu kỳ ngắt kéo dài khoảng bao lâu?|refrigerant_and_electricity
musty-smell|Máy lạnh có mùi ẩm mốc|bật điều hòa nghe hôi;mùi mốc từ máy lạnh|Bề mặt ẩm hoặc đường thoát bám bẩn|Mùi chỉ lúc khởi động hay suốt buổi?|respiratory_caution
indoor-noise|Dàn lạnh kêu lạch cạch|máy lạnh trong phòng kêu;điều hòa lạch cạch|Cánh đảo hoặc bộ phận quay bị cản|Tiếng thay đổi theo tốc độ gió không?|electricity_and_height
outdoor-noise|Dàn nóng rung ồn|cục nóng kêu to;máy ngoài ban công rung|Liên kết đỡ hoặc bộ phận quay bất thường|Dàn nóng có thể quan sát từ nơi an toàn không?|height_risk
ice-coil|Dàn lạnh đóng tuyết|máy lạnh bám đá;ống đồng bị đông đá|Lưu lượng gió hoặc hệ thống lạnh bất thường|Đá xuất hiện ở vị trí nào nhìn thấy?|refrigerant_and_electricity
remote-no-response|Máy lạnh không nhận remote|bấm điều khiển điều hòa không ăn;remote máy lạnh im|Pin hoặc bộ thu tín hiệu có lỗi|Remote có hiển thị bình thường không?|routine_caution
not-start|Máy lạnh bật không lên|điều hòa không chạy;máy lạnh không có tín hiệu|Nguồn cấp hoặc bộ điều khiển có lỗi|Có đèn báo hay mã lỗi nào không?|mains_electricity
error-display|Máy lạnh báo mã lỗi|điều hòa nháy đèn;máy lạnh hiện chữ lỗi|Hệ thống đang phát hiện bất thường|Mã và nhãn máy đọc được là gì?|refrigerant_and_electricity
drain-smell|Ống nước ngưng máy lạnh có mùi|mùi cống từ điều hòa;máy lạnh hôi nước thoát|Đường thoát có thể nối vào vùng có mùi|Mùi xuất hiện khi máy nghỉ không?|contamination
poor-airflow|Gió máy lạnh thổi yếu|điều hòa gió nhỏ;máy lạnh thổi không ra hơi|Lưới lọc hoặc đường gió bị cản|Gió yếu ở mọi mức quạt không?|electricity_and_height
high-bill|Tiền điện tăng khi dùng máy lạnh|điều hòa ăn điện hơn trước;máy lạnh tốn điện bất thường|Điều kiện phòng hoặc hiệu suất thay đổi|Thời gian dùng và cài đặt có thay đổi không?|routine_caution
short-circuit|Bật máy lạnh là nhảy cầu dao|điều hòa làm sập aptomat;máy lạnh gây mất điện|Nguồn hoặc thiết bị có thể rò điện|Có mùi khét kèm theo không?|fire_risk
burning|Máy lạnh có mùi khét|điều hòa bốc mùi cháy;máy lạnh nghe mùi dây điện|Thiết bị hoặc dây quá nhiệt|Có khói từ nơi quan sát không?|fire_risk
hissing|Máy lạnh xì hơi bất thường|điều hòa nghe xì xì;ống máy lạnh có tiếng thoát khí|Áp lực hoặc rò môi chất cần kiểm tra|Âm xuất hiện lúc chạy hay cả khi nghỉ?|refrigerant_risk
gas-claim|Đề nghị nạp gas khi chưa kiểm tra|thợ nói hết gas máy lạnh;muốn bơm gas điều hòa|Hiệu suất giảm có nhiều nguyên nhân|Đã có kết quả kiểm tra rò rỉ chưa?|refrigerant_risk
filter-clean|Muốn vệ sinh lưới lọc máy lạnh|lưới lọc bám bụi;lọc gió điều hòa bẩn|Bụi tích tụ làm giảm lưu lượng|Lưới có tiếp cận được từ sàn không?|electricity_and_height
deep-clean|Vệ sinh máy lạnh lâu chưa làm|máy lạnh bẩn lâu ngày;muốn rửa dàn lạnh|Bụi và ẩm tích trong bộ trao đổi nhiệt|Lần vệ sinh gần nhất khi nào?|water_near_electricity
outdoor-access|Dàn nóng ở vị trí khó tiếp cận|cục nóng treo ngoài cao;máy ngoài không có chỗ đứng|Điều kiện tiếp cận đòi hỏi phương án riêng|Có sàn thao tác hợp lệ không?|height_risk
louver-stuck|Cánh đảo gió không mở|lá gió điều hòa đứng;máy lạnh không đảo cánh|Cơ cấu cánh hoặc điều khiển hỏng|Cánh có bị va chạm trước đó không?|electricity_and_height
condensation-pipe|Ống máy lạnh đọng sương|ống đồng chảy mồ hôi;ống điều hòa rịn nước|Cách nhiệt hoặc điều kiện ẩm chưa phù hợp|Nước ở vỏ bảo ôn hay mối nối?|water_near_electricity
wall-damp|Tường quanh ống máy lạnh bị ẩm|lỗ ống điều hòa thấm;vệt nước dưới ống lạnh|Đường thoát hoặc cách nhiệt gây đọng nước|Vệt ẩm có tăng khi máy chạy không?|hidden_damage
stale-air|Phòng dùng điều hòa bị bí|phòng máy lạnh ngột ngạt;ở phòng lạnh thấy bí hơi|Thông khí hoặc nguồn ô nhiễm trong phòng|Phòng có cửa lấy gió phù hợp không?|respiratory_caution
portable-water|Máy lạnh di động báo đầy nước|máy điều hòa di động ngưng;máy lạnh đứng báo nước đầy|Bình chứa hoặc đường thoát chưa phù hợp|Đọc được hướng dẫn đúng model không?|water_near_electricity
window-noise|Máy lạnh cửa sổ rung khung|máy lạnh cửa sổ rè;khung cửa rung khi chạy máy|Liên kết khung hoặc bộ phận quay bất thường|Khung có dấu nứt hay lỏng không?|falling_object
new-install|Khảo sát lắp máy lạnh mới|muốn gắn điều hòa;chuẩn bị lắp máy lạnh phòng ngủ|Công suất và vị trí cần khảo sát|Diện tích và điều kiện dàn nóng là gì?|electricity_and_height
relocate|Muốn di dời máy lạnh|chuyển điều hòa qua phòng khác;tháo lắp lại máy lạnh|Đường ống và khả năng thu hồi môi chất cần kiểm tra|Vị trí mới có điểm đặt dàn nóng không?|refrigerant_and_electricity
heat-mode|Máy lạnh thổi nóng do chế độ|điều hòa tự ra hơi nóng;máy lạnh đang chế độ heat|Cài đặt chế độ có thể chưa phù hợp|Màn hình điều khiển đang hiện ký hiệu gì?|routine_caution
timer-unexpected|Máy lạnh tự tắt theo giờ|điều hòa tắt ban đêm;máy lạnh tự hẹn giờ|Hẹn giờ hoặc lỗi điều khiển có thể tác động|Có ký hiệu timer trên điều khiển không?|routine_caution
sensor-temp|Nhiệt độ máy lạnh khác nhiệt kế|điều hòa báo lạnh nhưng phòng nóng;máy lạnh đo nhiệt sai|Vị trí cảm biến hoặc phân bố gió ảnh hưởng|Nhiệt kế đặt ở vị trí nào?|routine_caution
vibration-pipe|Ống điều hòa rung vào tường|ống đồng rè tường;đường ống máy lạnh rung|Liên kết hoặc khoảng hở chưa phù hợp|Rung xuất hiện khi máy nén hoạt động không?|refrigerant_and_electricity
water-pump|Bơm nước ngưng máy lạnh kêu|bơm thoát điều hòa kêu hoài;bơm nước máy lạnh không ngừng|Bơm hoặc cảm biến mức nước có lỗi|Có nước tràn kèm theo không?|water_near_electricity
ceiling-cassette|Máy lạnh âm trần rò nước|điều hòa cassette nhỏ nước;trần dưới máy lạnh ướt|Máng hoặc đường thoát nước ngưng có vấn đề|Có khả năng khoanh vùng từ dưới sàn không?|height_and_electricity
vent-dust|Miệng gió thông gió bám bụi|cửa gió đen bụi;lưới thông gió dơ|Bụi tích tại miệng gió|Miệng gió thuộc hệ riêng hay hệ chung?|electricity_and_height`,
  },
  {
    family: 'cleaning', scope: 'Vệ sinh một khu vực nhỏ đã xác nhận vật liệu và diện tích', exclusions: 'Không xử lý chất nguy hại, làm ngoài cao hay phục hồi hư hỏng', questions: 'Diện tích và loại bề mặt là gì?', costs: 'Diện tích thực tế;Mức bám bẩn và đồ đạc cần di chuyển',
    rows: `weekly-floor|Lau sàn căn hộ định kỳ|dọn sàn cuối tuần;lau nhà thường kỳ|Bụi sinh hoạt tích trên sàn|Sàn gạch hay gỗ và rộng bao nhiêu?|routine_caution
kitchen-grease|Vệ sinh dầu mỡ mặt bếp|bếp bám mỡ;lau khu nấu ăn|Dầu bám trên bề mặt khi nấu|Mặt bếp có lớp phủ dễ xước không?|routine_caution
bathroom-scale|Vệ sinh cặn nước phòng tắm|gạch toilet ố cặn;nhà tắm đóng vệt nước|Khoáng hoặc xà phòng tích tụ|Bề mặt là gạch men hay đá tự nhiên?|chemical_caution
after-renovation|Dọn bụi nhà sau sửa|nhà sửa xong đầy bụi;vệ sinh sau thi công|Bụi xây dựng còn trên bề mặt|Còn vật sắc hoặc hóa chất thi công không?|construction_dust
move-in|Dọn căn hộ trước chuyển vào|nhà mới nhận cần lau;dọn phòng trống trước ở|Bụi và bẩn tồn lưu từ thời gian trống|Nhà trống hay đã có đồ?|routine_caution
move-out|Dọn nhà sau chuyển đi|căn hộ trả lại cần dọn;lau nhà trống sau chuyển|Bụi dưới đồ và dấu sinh hoạt còn lại|Có yêu cầu riêng bằng văn bản không?|routine_caution
window-inside|Lau mặt trong cửa kính thấp|kính trong nhà đầy dấu tay;lau cửa kính ngang tầm|Bụi và vết tay trên kính|Có tiếp cận hoàn toàn từ sàn không?|routine_caution
window-outside|Lau kính ngoài ban công cao|kính mặt ngoài khó với;lau cửa kính ngoài cao|Mặt ngoài bám bụi và cần tiếp cận chuyên dụng|Có phương án tiếp cận được phép không?|height_risk
balcony-floor|Dọn sàn ban công|ban công đầy lá;lau nền sân phơi|Bụi và lá tích trên nền|Có vật rơi hoặc ổ điện gần nước không?|routine_caution
fridge-inside|Vệ sinh khoang tủ lạnh trống|tủ lạnh có vết đồ ăn;lau ngăn tủ lạnh|Thức ăn hoặc chất lỏng bám khoang|Tủ đã trống và sẵn sàng vệ sinh chưa?|food_hygiene
oven-inside|Vệ sinh khoang lò nướng|lò nướng bám cháy;lau lò bị mỡ|Dầu và cặn thực phẩm bị nung|Lớp phủ bên trong theo hướng dẫn nào?|chemical_and_electricity
hood-filter|Vệ sinh lưới hút mùi bếp|máy hút mùi bết mỡ;lưới hút bếp dơ|Dầu bám lưới lọc|Lưới thuộc loại tháo vệ sinh được không?|electricity_and_height
cabinet-empty|Lau tủ bếp rỗng|tủ bếp mới lấy đồ ra;lau ngăn kéo trống|Bụi và vụn thức ăn trong ngăn|Tủ có dấu mốc hay bong phủ không?|routine_caution
wardrobe-empty|Lau tủ quần áo rỗng|dọn lòng tủ áo;lau tủ trước xếp đồ|Bụi tích trong ngăn tủ|Tủ gỗ công nghiệp hay vật liệu khác?|routine_caution
wall-mold|Tường có mảng mốc lớn|tường đen mốc;phòng ẩm mốc lan rộng|Nguồn ẩm hoặc thấm nước chưa xử lý|Mảng mốc rộng và có người nhạy cảm không?|mold_risk
grout-dirty|Ron gạch sàn bị đen|khe gạch bẩn;đường ron tối màu|Cặn hoặc ẩm tích trong ron|Ron có mục hay chỉ đổi màu?|chemical_caution
marble-stain|Đá tự nhiên bị ố|sàn đá hoa cương loang;đá marble có vệt|Chất thấm hoặc phản ứng bề mặt|Biết chính xác loại đá và chất gây vết không?|material_damage
wood-floor|Lau sàn gỗ cần ít ẩm|sàn laminate dính bụi;vệ sinh sàn gỗ|Bụi bám mặt phủ|Có cạnh phồng hoặc hở mạch không?|routine_caution
pet-floor|Dọn vết thú cưng trên sàn|sàn có nước tiểu mèo;chó làm bẩn nền|Chất hữu cơ còn bám|Vật liệu sàn và thời gian vết tồn tại là gì?|contamination
chemical-mix|Lỡ trộn nước tẩy và chất tẩy bồn cầu|trộn javen nghe mùi hắc;nước tẩy trộn nhau khó thở|Có thể sinh hơi độc từ hóa chất không tương thích|Có ai khó thở hay cay mắt không?|toxic_fumes
unknown-powder|Bột lạ sau thi công|bụi vật liệu không rõ;chất bột lạ trong nhà|Vật liệu chưa xác định có thể cần chuyên môn|Có nhãn vật liệu hoặc hồ sơ thi công không?|unknown_hazard
high-ceiling|Dọn bụi trần cao|trần cao có mạng nhện;lau quạt đèn trên cao|Bụi tích nơi khó tiếp cận|Độ cao và lối tiếp cận là gì?|height_risk
desk-surface|Lau bàn làm việc trống|bàn học bụi;lau bàn trước kê máy|Bụi sinh hoạt trên mặt bàn|Mặt bàn có phủ nhạy nước không?|routine_caution
door-surface|Lau mặt cửa trong nhà|cửa phòng bám dấu tay;lau cánh cửa bẩn|Vết tay và bụi trên lớp phủ|Cửa sơn hay phủ laminate?|routine_caution
mirror|Lau gương phòng tắm thấp|gương mờ vệt;gương soi dính kem|Vệt nước và mỹ phẩm bám mặt|Có lớp phủ chống mờ đặc biệt không?|routine_caution
shower-glass|Kính vách tắm bám cặn|vách tắm trắng mờ;cặn trên kính toilet|Khoáng và xà phòng bám|Kính có nứt hoặc phụ kiện lỏng không?|chemical_caution
trash-odor|Khu thùng rác có mùi|tủ rác bếp hôi;góc để rác ám mùi|Chất hữu cơ lưu cữu|Đã bỏ hết rác và vật sắc chưa?|contamination
flood-clean|Dọn nhà sau ngập nước bẩn|nhà bị nước cống tràn;lau sau ngập|Nước có thể mang chất ô nhiễm|Nguồn nước đã hết và điện được kiểm tra chưa?|contaminated_water
child-area|Vệ sinh góc chơi trẻ em|dọn khu chơi em bé;lau đồ chơi bề mặt|Bụi và vết sinh hoạt|Vật liệu và hướng dẫn vệ sinh của đồ là gì?|chemical_caution
allergy-dust|Dọn bụi nhà có người nhạy cảm|nhà có người dị ứng bụi;dọn phòng dễ hắt hơi|Bụi sinh hoạt có thể gây kích ứng|Có yêu cầu tránh sản phẩm nào không?|respiratory_caution`,
  },
  {
    family: 'upholstery', scope: 'Khảo sát hoặc vệ sinh một món đồ với nhãn vật liệu rõ', exclusions: 'Không cam kết hết vết, diệt khuẩn tuyệt đối hay phục hồi vật liệu', questions: 'Có nhãn vật liệu và hướng dẫn vệ sinh không?', costs: 'Kích thước và vật liệu;Độ thấm sâu và thời gian khô',
    rows: `sofa-dust|Sofa vải bám bụi nhẹ|ghế nỉ bụi;vệ sinh ghế vải định kỳ|Bụi sinh hoạt bám bề mặt|Sofa mấy chỗ và nhãn giặt ghi gì?|routine_caution
sofa-musty|Sofa có mùi ẩm|ghế nỉ hôi ẩm;sofa ám mùi mốc|Đệm ẩm hoặc bẩn sâu|Mùi có kèm vệt mốc không?|mold_risk
sofa-coffee|Cà phê đổ lên sofa|ghế vải dính cà phê;sofa loang nước nâu|Chất màu thấm vào sợi|Vết mới hay đã khô lâu?|routine_caution
sofa-pet|Sofa dính nước tiểu thú cưng|mèo tè ghế;ghế nỉ khai|Chất hữu cơ thấm xuống đệm|Vết ở vỏ hay đã thấm sâu?|contamination
sofa-leather|Ghế da có vết bẩn|sofa da bám dơ;lau ghế da|Lớp phủ da hoặc vết bám cần xác định|Da thật hay vật liệu phủ tổng hợp?|material_damage
sofa-peeling|Ghế giả da bị bong|sofa tróc da;bọc ghế nổ lớp phủ|Vật liệu phủ đã xuống cấp|Mục tiêu là làm sạch hay phục hồi vật liệu?|material_damage
mattress-dust|Nệm bám bụi sinh hoạt|đệm ngủ bụi;vệ sinh nệm định kỳ|Bụi tích trên lớp vải nệm|Nệm có thể tháo vỏ theo nhãn không?|routine_caution
mattress-urine|Nệm dính nước tiểu|bé tè đệm;nệm bị khai|Chất hữu cơ thấm vào ruột nệm|Nệm loại gì và đã thấm bao lâu?|contamination
mattress-mold|Nệm có chấm mốc|đệm đen li ti;nệm ngủ mốc|Độ ẩm còn trong vật liệu|Mốc ở mặt hay xuyên vào ruột?|mold_risk
mattress-blood|Nệm dính vết máu|đệm có máu khô;vết máu trên nệm|Chất sinh học bám sợi|Có vật sắc hoặc nguy cơ tiếp xúc không?|biological_risk
curtain-dust|Rèm cửa bám bụi|rèm vải bụi;vệ sinh rèm định kỳ|Bụi tích theo thời gian|Rèm tháo được và nhãn giặt là gì?|height_risk
curtain-shrink|Rèm bị co sau giặt|rèm ngắn lại;giặt xong rèm co|Vải hoặc xử lý giặt không phù hợp|Nhãn vật liệu và cách giặt trước đó là gì?|material_damage
carpet-dust|Thảm nhỏ bám bụi|thảm phòng khách bụi;vệ sinh thảm rời|Bụi tích trong sợi|Thảm vật liệu gì và kích thước bao nhiêu?|routine_caution
carpet-wine|Thảm dính rượu màu|đổ vang lên thảm;thảm loang màu đỏ|Chất màu thấm sợi|Biết vật liệu và thời gian vết tồn tại không?|material_damage
chair-seat|Đệm ghế ăn bị bẩn|ghế bàn ăn dính đồ;vệ sinh nệm ghế ăn|Thức ăn bám lớp vải|Đệm có tháo rời được không?|routine_caution
office-chair|Ghế văn phòng bám mồ hôi|ghế làm việc có mùi;đệm ghế máy tính bẩn|Mồ hôi và bụi tích tụ|Ghế lưới hay bọc đệm?|routine_caution
fabric-color|Vải sofa nghi phai màu|lau ghế ra màu;sofa dễ lem|Thuốc nhuộm hoặc lớp phủ không bền|Có nhãn yêu cầu giặt chuyên dụng không?|material_damage
silk-fabric|Đồ bọc lụa cần vệ sinh|ghế bọc lụa bẩn;vải lụa trang trí có vết|Vật liệu nhạy nước và ma sát|Có nhãn hoặc nhà sản xuất xác định không?|material_damage
velvet-sofa|Sofa nhung có vệt|ghế nhung loang;nhung bị bết lông|Hướng sợi hoặc vết bẩn gây thay đổi mặt|Nhãn nhung yêu cầu cách làm sạch nào?|material_damage
sofa-smoke|Sofa ám khói thuốc|ghế hôi thuốc;sofa mùi khói|Hạt và mùi bám sâu|Môi trường còn nguồn khói không?|respiratory_caution
pet-hair|Lông thú bám ghế vải|ghế nỉ đầy lông mèo;sofa bám lông chó|Lông giữ trong cấu trúc sợi|Chỉ lông bề mặt hay có chất bẩn khác?|routine_caution
headboard|Đầu giường bọc vải có vết|vách giường nỉ bẩn;đầu giường ám mùi|Bụi và mồ hôi bám|Có tiếp cận được mà không tháo kết cấu không?|routine_caution
cushion-cover|Vỏ gối trang trí bám bụi|gối sofa bẩn;vỏ gối tựa cần giặt|Bụi bám vỏ tháo rời|Nhãn vải cho phép giặt nước không?|routine_caution
surface-adhesive|Keo dính trên mặt bàn phủ|bàn dính keo nhãn;vết băng dính trên tủ|Keo bám lớp phủ|Lớp phủ và loại keo đã biết chưa?|chemical_caution
surface-scratch|Mặt bàn gỗ bị trầy|bàn gỗ xước;lau không hết vết xước|Lớp phủ hoặc gỗ đã hư hại|Vết ở lớp phủ hay sâu vào gỗ?|material_damage`,
  },
  {
    family: 'minor_repairs', scope: 'Khảo sát hoặc sửa một phụ kiện nội thất không chịu lực', exclusions: 'Không sửa kết cấu chịu lực, hệ gas, kính nguy hiểm hoặc bảo đảm tải treo', questions: 'Vật liệu, kích thước và vị trí phụ kiện là gì?', costs: 'Loại phụ kiện thay thế;Tình trạng nền và khả năng tiếp cận',
    rows: `cabinet-hinge|Cánh tủ bếp bị xệ|cửa tủ lệch;đóng tủ bị cạ|Bản lề hoặc vít liên kết lỏng|Tấm tủ quanh bản lề còn nguyên không?|routine_caution
drawer-rail|Ngăn kéo bị kẹt|hộc tủ kéo không ra;ray ngăn kéo rít|Ray lệch hoặc vật cản|Ray có cong hay rơi bi không?|routine_caution
door-handle|Tay nắm cửa trong nhà bị lỏng|nắm cửa lung lay;tay gạt phòng lỏng|Vít hoặc cơ cấu tay nắm lỏng|Cửa còn mở đóng bình thường không?|routine_caution
door-squeak|Cửa phòng kêu cót két|bản lề cửa rít;mở cửa nghe két|Bản lề khô hoặc lệch|Cửa gỗ hay kim loại?|routine_caution
sliding-track|Cửa lùa chạy nặng|cửa trượt rít;cửa kéo bị vướng ray|Bánh xe hoặc ray có vật cản|Cánh kính có dấu nứt không?|heavy_panel
shelf-mount|Muốn treo kệ lên tường|lắp kệ sách;gắn kệ treo|Nền và tải dự kiến cần kiểm tra|Có bản đồ điện nước âm và tải kệ không?|hidden_utilities
curtain-rod|Thanh rèm bị tuột|rèm rớt một đầu;giá đỡ rèm lỏng|Neo hoặc nền tường không ổn định|Có thể khoanh vùng khỏi vật rơi không?|falling_object
picture-hang|Muốn treo tranh nhỏ|gắn khung ảnh;tìm chỗ treo tranh|Nền tường và vị trí đường âm cần xác định|Khối lượng khung và loại tường là gì?|hidden_utilities
furniture-assemble|Lắp bàn rời theo bộ|ráp bàn mới;bàn giao dạng tháo rời|Phụ kiện cần lắp đúng hướng dẫn|Có đủ hướng dẫn và phụ kiện nguyên bộ không?|routine_caution
chair-loose|Ghế gỗ bị lung lay|ghế ăn lắc;ghế ngồi lỏng chân|Mộng hoặc liên kết xuống cấp|Có nứt ở vị trí chịu lực không?|load_bearing_furniture
table-wobble|Bàn nhỏ bị cập kênh|bàn lắc;chân bàn không đều|Liên kết hoặc nền không phẳng|Bàn có vết nứt hoặc mang tải nặng không?|routine_caution
cabinet-knob|Núm tủ bị rơi|tay nắm tủ tuột;ốc núm ngăn kéo lỏng|Ren hoặc vít không còn giữ chắc|Lỗ bắt có bị vỡ không?|routine_caution
door-stop|Chặn cửa bị bong|cục hít cửa rơi;chặn cửa lỏng|Đế liên kết không còn chắc|Đế gắn trên sàn hay tường?|routine_caution
seal-door|Gioăng cửa bị hở|cửa gió lùa;khe cửa lọt bụi|Gioăng lão hóa hoặc khe sai|Cửa chống cháy hay cửa thường?|fire_door_caution
screen-mesh|Lưới chống muỗi bị rách|lưới cửa thủng;khung lưới muỗi rách|Vật liệu lưới xuống cấp|Khung nằm ở vị trí có thể tiếp cận từ sàn không?|routine_caution
tile-loose|Gạch sàn bị bộp|viên gạch kêu rỗng;gạch nền lỏng|Liên kết lớp nền có thể suy giảm|Có nứt hay phồng diện rộng không?|hidden_damage
paint-peel|Sơn tường bong mảng nhỏ|tường tróc sơn;sơn phòng bị rộp|Ẩm hoặc lớp nền không ổn định|Nguồn ẩm đã được xác định chưa?|unknown_coating
wall-crack|Tường xuất hiện vết nứt|tường rạn dài;khe nứt tường tăng|Lớp hoàn thiện hoặc kết cấu có thể biến dạng|Vết có lan hoặc kèm kẹt cửa không?|structural_risk
ceiling-panel|Tấm trần bị xệ|trần thạch cao võng;miếng trần sắp rơi|Liên kết hoặc thấm nước ảnh hưởng trần|Có thể tránh khu vực bên dưới không?|falling_object
glass-crack|Kính cửa bị nứt|cửa kính rạn;kính phòng tắm nứt|Va đập hoặc ứng suất làm hỏng kính|Có người đi qua khu vực kính không?|sharp_edges
lock-stuck|Khóa cửa phòng bị kẹt|chìa vặn không được;khóa trong nhà cứng|Cơ cấu khóa hoặc cánh lệch|Có người mắc kẹt hay tình huống khẩn không?|access_verification
silicone-edge|Keo mép bồn tắm bị hở|keo viền toilet bong;đường silicone bồn hở|Keo lão hóa hoặc nền ẩm|Nền còn ẩm hoặc có mốc sâu không?|chemical_caution
towel-rack|Giá khăn phòng tắm lung lay|thanh treo khăn lỏng;giá khăn sắp rơi|Neo hoặc nền ốp không chắc|Có biết đường nước điện sau vị trí neo không?|hidden_utilities
tv-bracket|Muốn lắp giá tivi|treo tivi tường;lắp khung tivi|Nền và khối lượng cần được kiểm tra|Có thông số khung và loại tường không?|heavy_load_and_utilities
bed-squeak|Giường kêu khi trở mình|giường ọp ẹp;khung giường rít|Liên kết khung hoặc vạt giường lỏng|Có nứt phần chịu lực không?|load_bearing_furniture
mirror-loose|Gương treo bị lỏng|gương tường lung lay;gương sắp tuột|Liên kết giữ gương không chắc|Có thể tránh khu vực gương rơi không?|falling_glass
floor-trim|Nẹp chân tường bị bong|len tường tuột;nẹp sàn hở|Liên kết hoặc nền ẩm|Có dấu thấm hay phồng sàn kèm theo không?|routine_caution
cabinet-shelf|Đợt tủ bị võng|ván ngăn tủ cong;kệ trong tủ xệ|Tải hoặc vật liệu không phù hợp|Có tải nặng và dấu nứt không?|load_bearing_furniture
gas-hose|Nghi ống gas bếp bị rò|bếp có mùi gas;dây gas nứt|Hệ gas có thể mất kín|Có người đang ở vùng mùi gas không?|gas_emergency
pressure-valve|Van bình áp kêu bất thường|van bình nước nóng xì;van an toàn bình áp rò|Áp lực hoặc thiết bị bảo vệ có vấn đề|Đây có phải bình chịu áp đang vận hành không?|pressure_risk`,
  },
];

const numericBands: Record<string, readonly [number, number, number, ScopeMaterial[]]> = {
  'cleaning.weekly-floor': [150000, 300000, 40, ['tile']],
  'cleaning.kitchen-grease': [150000, 300000, 4, ['tile', 'metal']],
  'cleaning.move-in': [200000, 400000, 30, ['tile']],
  'cleaning.move-out': [200000, 400000, 30, ['tile']],
  'cleaning.window-inside': [100000, 200000, 4, ['glass']],
  'cleaning.balcony-floor': [100000, 200000, 6, ['tile']],
  'cleaning.cabinet-empty': [100000, 200000, 4, ['coated_wood']],
  'cleaning.wardrobe-empty': [100000, 200000, 4, ['coated_wood']],
  'cleaning.desk-surface': [50000, 100000, 2, ['coated_wood']],
  'cleaning.door-surface': [50000, 150000, 2, ['coated_wood']],
  'cleaning.mirror': [50000, 100000, 2, ['glass']],
  'upholstery.sofa-dust': [200000, 400000, 3, ['fabric']],
  'upholstery.carpet-dust': [150000, 300000, 2, ['fabric']],
  'upholstery.chair-seat': [100000, 200000, 1, ['fabric']],
  'minor_repairs.cabinet-hinge': [100000, 200000, 1, ['coated_wood']],
  'minor_repairs.drawer-rail': [100000, 250000, 1, ['coated_wood']],
  'minor_repairs.cabinet-knob': [50000, 150000, 1, ['coated_wood']],
  'minor_repairs.door-stop': [50000, 150000, 1, ['metal']],
};

export const serviceCases: readonly ServiceCase[] = families.flatMap(group => group.rows.split('\n').map((row, index): ServiceCase => {
  const [slug, problem, phrases, cause, question, safety] = row.split('|');
  if (!slug || !problem || !phrases || !cause || !question || !safety) throw new Error('incomplete curated case row');
  const caseId = `${group.family}.${slug}`;
  const band = numericBands[caseId];
  const routine = safety === 'routine_caution';
  return {
    case_id: caseId, revision: 1, locale: 'vi-VN', family: group.family, canonical_problem: problem,
    user_phrases: phrases.split(';'), aliases: [normalizeKnowledge(problem), ...phrases.split(';').map(normalizeKnowledge)],
    hypotheses: [`Có thể ${cause.toLocaleLowerCase('vi-VN')}; chưa phải kết luận kiểm tra.`],
    questions: [question, group.questions],
    signals: [`Ghi nhận vị trí và thời điểm của hiện tượng: ${problem.toLocaleLowerCase('vi-VN')}; chỉ quan sát từ vị trí an toàn.`, 'Nhãn vật liệu hoặc model nếu có thể đọc mà không tháo mở.'],
    safety_tags: [safety],
    safe_response: routine ? 'Tránh tiếp xúc với phần hỏng; cần kiểm tra vật liệu và điều kiện tại chỗ trước khi xử lý.' : 'Tránh xa khu vực nguy hiểm, không tháo mở hay tự sửa. Nhờ người có chuyên môn; nếu có nguy hiểm tức thời hãy liên hệ hỗ trợ khẩn cấp tại địa phương từ nơi an toàn.',
    assumptions: ['Tình huống tổng hợp giả định, chưa có kiểm tra tại chỗ.', band ? `Một hạng mục, tối đa ${band[2]} m², vật liệu ${band[3].join('/')}, mặt bằng trống, tiếp cận từ sàn, chưa thấy hư hỏng; số tiền chỉ giả định tiền công, chưa xác minh giao dịch.` : 'Chưa đủ phạm vi an toàn để đưa ra khoảng tiền.'],
    scope_inclusions: [group.scope, `Làm rõ nhu cầu: ${problem.toLocaleLowerCase('vi-VN')}`],
    scope_exclusions: [group.exclusions, 'Không gồm vật tư, linh kiện, vận chuyển đồ nặng và xử lý hư hỏng ẩn.'],
    cost_drivers: [...group.costs.split(';'), 'Phạm vi được kiểm tra và thống nhất sau khảo sát'],
    uncertainty: 'Nguyên nhân, khối lượng và chi phí có thể thay đổi sau khảo sát; không cam kết kết quả hay thời gian.',
    service_taxonomy_ref: null, provenance_type: 'synthetic_seed', review_state: 'agent_validated_provisional', exemplar: index < 3,
    price_prior: band ? { evidence_class: 'synthetic_prior', region: 'Ho Chi Minh City', currency: 'VND', min_vnd: band[0], max_vnd: band[1], basis: 'labor_only', unit: 'one_bounded_task', valid_as_of: '2026-11-04', review_state: 'provisional', display_policy: 'disabled_by_default', evidence_uri: null, verified_business_event_id: null, scope: { max_area_m2: band[2], max_units: 1, materials: band[3], floor_access: true, clear_surface: true, no_visible_damage: true } } : null,
    updated_at: '2026-11-04',
  };
})).sort((a, b) => a.case_id.localeCompare(b.case_id, 'en'));
