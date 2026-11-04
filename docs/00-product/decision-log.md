# Nhật ký quyết định sản phẩm

Xác nhận ngày 2026-11-04 bởi chủ sản phẩm, trên [báo cáo phân tích Giai đoạn 1](https://claude.ai/artifact/4STSytBWU2wL9rvCKT4zod).

PRD gốc không bị sửa. Khi hai tài liệu khác nhau, nhật ký này được ưu tiên vì mới hơn.

## Quyết định về phạm vi và kỹ thuật

| Mã | Chủ đề | Quyết định | Giải quyết mâu thuẫn |
| --- | --- | --- | --- |
| D1 | Tên sản phẩm | TPS-Connection. Thay cho TutorConnect (PRD) và TutorDesk. | M1 |
| D2 | Mobile | Web và API ra trước. Mobile là bản phát hành kế tiếp, tập trung vào lịch, điểm danh, chat, thông báo. | M2 |
| D3 | Người học trưởng thành | Dữ liệu hỗ trợ từ đầu. MVP chỉ mở cho học sinh có phụ huynh. Thu hẹp PRD §12 câu 3 trong phạm vi MVP. | M3 |
| D4 | Tài khoản học sinh | Phụ huynh tạo và mời. Học sinh chỉ xem trong MVP. | M4 |
| D5 | Xác minh gia sư | Bắt buộc xác minh danh tính trước khi hiển thị công khai. Bằng cấp là huy hiệu tùy chọn. | M5 |
| D6 | Học phí | MVP ghi nhận học phí ngoài nền tảng. Thanh toán trực tuyến để sau, không giữ tiền hộ. | M6 |
| D7 | Lớp nhóm | Dữ liệu hỗ trợ nhóm từ đầu. MVP mở 1-1 trước. | M7 |
| D8 | Chat và liên hệ | Mở chat khi gia sư chấp nhận. Mở số điện thoại, email khi hai bên xác nhận hợp tác. | M8 |
| D9 | Tạo lớp | Hệ thống tạo lớp từ điều kiện đã xác nhận. | M9 |
| D10 | Phạm vi MVP bổ sung | Thông báo trong app: có. Bài tập, đánh giá: ngay sau MVP. Yêu thích: có nếu kịp. | Khoảng trống §6.1, §6.2 |
| D11 | Địa lý | Sản phẩm hỗ trợ toàn quốc, thử nghiệm ở một vài khu vực. Lọc theo tỉnh, xã trước, bán kính để sau. | |
| D12 | Stack | Có SEO: dùng React Router framework mode với SSR cho trang công khai. Backend dùng Express. | |

### Hệ quả của D12

Dùng Express nên các phần sau phải tự xây và giữ kỷ luật bằng quy ước:

- Ranh giới giữa các module backend.
- Lớp phân quyền theo quan hệ, mặc định từ chối.
- Đặc tả OpenAPI: cần chọn công cụ sinh đặc tả từ mã nguồn.

## Quy tắc nghiệp vụ

| Mã | Chủ đề | Quyết định |
| --- | --- | --- |
| C1 (M10) | Vai trò quản trị | **Manager:** duyệt hồ sơ, bài đăng; xử lý báo cáo và tranh chấp; xem giấy tờ khi duyệt; chỉ xem đoạn tin nhắn bị báo cáo. **Admin:** tài khoản, phân quyền, danh mục, cấu hình, xử lý khiếu nại lại. Mọi lần xem đều ghi nhật ký. |
| C2 (M11) | Xóa dữ liệu | Khi xóa: ghi thời điểm vào `deleted_at` và ẩn ngay. Sau 6 tháng: xóa hẳn dữ liệu cá nhân, ẩn danh bản ghi lớp và đánh giá. Giấy tờ xác minh theo mốc riêng ở C4. |
| C3 | Vòng đời kết nối | Chờ phản hồi, Đã chấp nhận, Đang trao đổi, Đã xác nhận hợp tác. Cả hai bên phải bấm xác nhận. Chờ phản hồi quá 7 ngày thì tự hủy. Đang trao đổi quá 30 ngày thì tự hủy, có nhắc trước. Sau đó vẫn gửi lại được. |
| C4 | Xác minh | Mọi gia sư nộp CCCD. Sinh viên nộp thêm thẻ sinh viên. Bằng cấp tùy chọn để lấy huy hiệu. Manager duyệt trong 2 ngày làm việc. Từ chối phải nêu lý do, gia sư được nộp lại. Sau khi duyệt, giữ kết quả và xóa ảnh giấy tờ sau 30 ngày; luật sư cần rà soát mốc này. |
| C5 | Vắng và hủy buổi | Báo hủy trước 2 tiếng. Không tính tiền mọi trường hợp vắng trong MVP, nhưng ghi rõ hủy muộn và vắng không báo. Xem lại sau thử nghiệm dựa trên phản hồi của gia sư. |
| C5 | Xác nhận buổi học | Sau 48 giờ không phản hồi, hệ thống tự chốt theo điểm danh của gia sư. Phụ huynh được nhắc một lần trước khi hết hạn. |
| C5 | Tranh chấp buổi học | Phụ huynh khiếu nại trong 48 giờ; buổi tạm chưa tính tiền. Hai bên có 3 ngày tự thống nhất, nếu không thì Manager quyết định. Manager chỉ sửa bản ghi, không hoàn tiền. |
| C6 | Học phí | Tính theo buổi, thu một lần vào cuối tháng. |
| C7 | Chat của học sinh | MVP: học sinh chưa chat, gia sư trao đổi với phụ huynh. Khi mở sau MVP: dưới 18 tuổi, phụ huynh phải bật và cùng ở trong hội thoại. |
| C8 | Quyền của khách | Khách xem được gia sư đã xác minh (tên hiển thị, môn, lớp, tỉnh, học phí, đánh giá) và bài tuyển học sinh. Chỉ cần tạo hồ sơ con khi gửi yêu cầu. Bài tìm gia sư không công khai, Google không đọc được; chỉ gia sư đã xác minh và đã đăng nhập mới thấy. |
| C9 | Quản lý học sinh | Một trẻ chỉ có một phụ huynh quản lý. Admin xử lý đổi người quản lý theo yêu cầu. Quyền tự quản lý khi đủ 18 tuổi để sau MVP, cùng lúc với D3. |
| C10 | Đánh giá | Phụ huynh có quan hệ dạy học đã xác nhận từ 1 tháng trở lên. Mỗi quan hệ một đánh giá, có thể cập nhật. Học sinh vị thành niên không đánh giá công khai. |
| C11 | Hai ngôn ngữ | Đội dự án dịch giao diện, danh mục, email. Không dịch nội dung người dùng viết. |
| C12 | Đăng ký và thông báo | Tạm bỏ đăng ký bằng số điện thoại, không dùng SMS. Thông báo trong app và email; thông báo đẩy khi có Mobile. Số điện thoại gắn nhãn tự khai. |
| C13 | Chỉ số thành công | Sau 12 tuần thử nghiệm: 30 gia sư đã xác minh, 100 phụ huynh đăng ký, 20 lớp được tạo từ kết nối, ít nhất 60% số lớp vẫn học sau 4 tuần. Đây là mốc khởi đầu, không dựa trên số liệu thị trường. |
| Q1 | Trang chi tiết gia sư | Khách xem được thêm giới thiệu, kinh nghiệm, phương pháp dạy, ảnh đại diện. Không hiện trường, đơn vị công tác và thông tin liên hệ. |
| Q2 | Học sinh không có email | Không có email riêng thì không có tài khoản; phụ huynh xem thay. |
| Q3 | Giá gia sư | Trong MVP chỉ nhập giá mỗi buổi, kèm thời lượng buổi học. Bỏ giá theo giờ. |
| Q4 | Mốc 30 ngày của Đang trao đổi | Tính từ lúc yêu cầu được chấp nhận, không gia hạn khi có tin nhắn mới. |
| Q5 | Thời hạn xác minh | Xác minh danh tính không hết hạn. Nhãn sinh viên được xác nhận lại mỗi năm. |
| Q6 | Nội dung chat | MVP gửi văn bản và ảnh, chưa gửi tệp khác. |
| N1 | Giấy tờ xác minh | Gia sư nộp thêm ảnh chân dung cầm CCCD. |
| N2 | Trùng CCCD | Chặn một CCCD dùng cho nhiều tài khoản gia sư. Manager nhập số CCCD khi duyệt; hệ thống chỉ lưu giá trị băm có khóa, không lưu số gốc. Luật sư rà soát cùng các mốc lưu trữ. |
| N3 | Tuổi gia sư | Từ 18 tuổi, Manager kiểm tra trên CCCD. |
| N4 | Kết thúc lớp | Gia sư và phụ huynh đều tự kết thúc được lớp, không cần bên kia đồng ý. |
| N5 | Báo cáo dấu hiệu xâm hại trẻ em | Luật sư tư vấn và viết thành quy trình vận hành trước khi thử nghiệm với người dùng thật. |
| N6 | Chặn khi đang có lớp | Không chặn được người đang có lớp với mình; phải kết thúc lớp trước. Vẫn báo cáo được ngay. |
| N7 | Kiểm duyệt bài đăng | Bài đăng hiện ngay, Manager xử lý khi có báo cáo. Đây là cách hiểu cụm "duyệt bài đăng" ở C1. |
| DM1 | Đăng ký lại bằng email cũ | Người đã xóa tài khoản đăng ký lại được bằng email cũ trong 6 tháng. Khi email đã có người dùng thì tài khoản cũ không khôi phục được nữa. |
| DM2 | Dữ liệu đã ẩn danh | Sau 6 tháng, lớp và điểm số đã ẩn danh được giữ để thống kê, không còn liên kết với cá nhân. Luật sư rà soát. |
| DM3 | Lịch sử lớp khi phụ huynh xóa tài khoản | Trong 6 tháng đầu, gia sư xem được lịch sử ở chế độ chỉ đọc nhưng ẩn tên; sau đó chỉ còn bản ẩn danh. |

## Đề xuất kỹ thuật được ghi nhận

Chủ sản phẩm không phản đối các đề xuất ở mục 5 đến mục 8 của báo cáo sau khi được hỏi, nên tạm xem là đồng ý, gồm: Expo cho Mobile, modular monolith, OpenAPI làm hợp đồng giữa các ứng dụng, cấu trúc thư mục `docs/`.

## Còn mở

| Mã | Câu hỏi | Ảnh hưởng |
| --- | --- | --- |
| C13 | Đã có: một người, toàn thời gian; tạm thời chưa có ngân sách. Chưa có: nguồn chi cho hạ tầng và luật sư trước thử nghiệm, mốc ra mắt. | Kế hoạch, nơi triển khai, pháp lý |
| D4 | Ngưỡng tuổi để học sinh có tài khoản; cần tư vấn pháp lý. | Đăng ký, đồng ý dữ liệu |
| D9 | Gia sư có được tạo lớp cho học sinh ngoài nền tảng không? | Teaching, chiến lược sản phẩm |
| D11 | Thử nghiệm ở những khu vực nào? | Kế hoạch ra mắt |
| N5 | Quy trình xử lý báo cáo dấu hiệu xâm hại trẻ em. Chưa có thì chưa thử nghiệm với người dùng thật. | Vận hành, an toàn trẻ em |
| Pháp lý | Dữ liệu trẻ em và giấy tờ tùy thân, gồm mốc lưu ở C2 và C4, giá trị băm CCCD ở N2 và dữ liệu ẩn danh ở DM2; điều kiện khi thu hộ tiền; danh mục đơn vị hành chính hiện hành. | Cần luật sư rà soát trước khi vận hành |
