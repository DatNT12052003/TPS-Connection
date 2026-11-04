# Vai trò và phân quyền

Tài liệu này quy định ai được xem và làm gì trong MVP. API phải kiểm tra các quyền này trên mọi yêu cầu riêng tư; ẩn nút trên giao diện không được coi là phân quyền. Mặc định là từ chối: quyền nào không có trong tài liệu thì không được cấp.

Mã `BR-xxx` trỏ tới [business-rules.md](business-rules.md). Những chỗ ghi `ĐX` là đề xuất, chưa được chủ sản phẩm xác nhận.

## Vai trò

| Vai trò | Mô tả | Cách có vai trò |
| --- | --- | --- |
| Khách | Chưa đăng nhập | Mặc định |
| Gia sư | Dạy học; chia hai mức: chưa xác minh và đã xác minh | Tự đăng ký; xác minh theo [state-machines.md](state-machines.md#2-hồ-sơ-xác-minh-gia-sư) |
| Phụ huynh | Quản lý hồ sơ con, tìm gia sư, theo dõi việc học | Tự đăng ký |
| Học sinh | Chỉ xem dữ liệu của chính mình; chưa bật cho đến khi có ngưỡng tuổi (BR-107) | Phụ huynh mời |
| Manager | Duyệt, kiểm duyệt, xử lý báo cáo và tranh chấp | Admin tạo |
| Admin | Tài khoản, phân quyền, danh mục, cấu hình, khiếu nại lại | Admin tạo |

## Điều kiện theo quan hệ

Vai trò chưa đủ để cấp quyền. Các quyền có ký hiệu trong bảng dưới đây còn phải thỏa điều kiện tương ứng, và backend phải tự kiểm tra từ cơ sở dữ liệu, không tin dữ liệu client gửi lên.

| Mã | Điều kiện |
| --- | --- |
| `SELF` | Người dùng là chủ của dữ liệu đó |
| `GUARDIAN` | Người dùng là phụ huynh đang quản lý học sinh đó |
| `STUDENT` | Người dùng là chính học sinh đó |
| `TEACHING` | Gia sư có quan hệ dạy học đang hiệu lực với học sinh đó |
| `TAUGHT` | Gia sư từng có quan hệ dạy học với học sinh đó và lớp đã kết thúc; chỉ đọc lịch sử (ĐX) |
| `PARTY` | Người dùng là một bên của yêu cầu kết nối hoặc hội thoại đó |
| `CONFIRMED` | Hai bên đã xác nhận hợp tác và lớp chưa kết thúc |
| `ASSIGNED` | Manager đang xử lý đúng hồ sơ hoặc báo cáo đó |

## Ma trận quyền

**Ký hiệu:** `✓` được phép; `✓ X` được phép khi thỏa điều kiện X; `–` không được phép.

Cột GS-C là gia sư chưa xác minh; GS-X là gia sư đã xác minh.

### Tài khoản và hồ sơ

| Hành động | Khách | GS-C | GS-X | Phụ huynh | Học sinh | Manager | Admin |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Tự đăng ký | ✓ | – | – | – | – | – | – |
| Sửa thông tin tài khoản của mình | – | ✓ SELF | ✓ SELF | ✓ SELF | ✓ SELF | ✓ SELF | ✓ SELF |
| Xóa tài khoản của mình | – | ✓ SELF | ✓ SELF | ✓ SELF | – | – | – |
| Tạo, sửa hồ sơ gia sư | – | ✓ SELF | ✓ SELF | – | – | – | – |
| Tạo, sửa hồ sơ học sinh | – | – | – | ✓ GUARDIAN | – | – | – |
| Mời học sinh tạo tài khoản | – | – | – | ✓ GUARDIAN | – | – | – |
| Đổi phụ huynh quản lý | – | – | – | – | – | – | ✓ |
| Tạo Manager, Admin; phân quyền | – | – | – | – | – | – | ✓ |
| Khóa tài khoản | – | – | – | – | – | Tạm khóa khi liên quan an toàn trẻ em (BR-1205) | ✓ |
| Quản lý danh mục, cấu hình | – | – | – | – | – | – | ✓ |

### Tìm kiếm và bài đăng

| Hành động | Khách | GS-C | GS-X | Phụ huynh | Học sinh | Manager | Admin |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Tìm và xem gia sư đã xác minh | ✓ | ✓ | ✓ | ✓ | – | ✓ | ✓ |
| Xem bài tuyển học sinh | ✓ | ✓ | ✓ | ✓ | – | ✓ | ✓ |
| Tạo bản nháp bài tuyển | – | ✓ SELF | ✓ SELF | – | – | – | – |
| Đăng, sửa, ẩn, đóng bài tuyển | – | – | ✓ SELF | – | – | – | – |
| Xem bài tìm gia sư | – | – | ✓ | ✓ SELF | – | ✓ | ✓ |
| Đăng, sửa, ẩn, đóng bài tìm gia sư | – | – | – | ✓ SELF | – | – | – |
| Ẩn bài đăng vi phạm | – | – | – | – | – | ✓ ASSIGNED | ✓ |

Học sinh không tìm gia sư trong MVP vì D3 và D4 giao việc này cho phụ huynh.

### Kết nối và trao đổi

| Hành động | Khách | GS-C | GS-X | Phụ huynh | Học sinh | Manager | Admin |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Gửi yêu cầu hoặc đề nghị | – | – | ✓ | ✓ GUARDIAN | – | – | – |
| Xử lý yêu cầu | – | – | ✓ PARTY | ✓ PARTY | – | – | – |
| Xác nhận hợp tác | – | – | ✓ PARTY | ✓ PARTY | – | – | – |
| Chat | – | – | ✓ PARTY | ✓ PARTY | – | – | – |
| Xem đoạn tin nhắn bị báo cáo | – | – | – | – | – | ✓ ASSIGNED (BR-1203) | Khi xử lý khiếu nại lại (ĐX) |
| Chặn, báo cáo người dùng | – | ✓ | ✓ | ✓ | – | – | – |

### Giảng dạy và học tập

| Hành động | Khách | GS-C | GS-X | Phụ huynh | Học sinh | Manager | Admin |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Xem lớp và lịch | – | – | ✓ TEACHING, TAUGHT | ✓ GUARDIAN | ✓ STUDENT | – | – |
| Sửa lớp, lịch | – | – | ✓ TEACHING | – | – | – | – |
| Tạm nghỉ, tiếp tục, kết thúc lớp (BR-611, chờ N4) | – | – | ✓ TEACHING | ✓ GUARDIAN | – | – | – |
| Đề nghị đổi học phí, đồng ý đổi | – | – | ✓ TEACHING | ✓ GUARDIAN | – | – | – |
| Hủy buổi học | – | – | ✓ TEACHING | ✓ GUARDIAN | – | – | – |
| Điểm danh, ghi nội dung, điểm, nhận xét | – | – | ✓ TEACHING | – | – | – | – |
| Xem điểm, nhận xét | – | – | ✓ TEACHING, TAUGHT | ✓ GUARDIAN | ✓ STUDENT | – | – |
| Xác nhận hoặc khiếu nại buổi học | – | – | – | ✓ GUARDIAN | – | – | – |
| Quyết định tranh chấp | – | – | – | – | – | ✓ ASSIGNED | Khi xử lý khiếu nại lại |

### Học phí

| Hành động | Khách | GS-C | GS-X | Phụ huynh | Học sinh | Manager | Admin |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Xem khoản học phí | – | – | ✓ TEACHING, TAUGHT | ✓ GUARDIAN | – | Khi xử lý tranh chấp | Khi xử lý khiếu nại lại |
| Đánh dấu đã thanh toán, bỏ đánh dấu | – | – | ✓ TEACHING, TAUGHT | – | – | – | – |
| Xuất bảng tổng hợp | – | – | ✓ TEACHING, TAUGHT | ✓ GUARDIAN | – | – | – |

Học sinh không xem học phí (ĐX), vì đây là việc giữa phụ huynh và gia sư.

### Xác minh và kiểm duyệt

| Hành động | Khách | GS-C | GS-X | Phụ huynh | Học sinh | Manager | Admin |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Nộp giấy tờ xác minh | – | ✓ SELF | ✓ SELF | – | – | – | – |
| Xem giấy tờ xác minh | – | ✓ SELF | ✓ SELF | – | – | ✓ ASSIGNED | Khi xử lý khiếu nại lại (ĐX) |
| Duyệt, từ chối hồ sơ xác minh | – | – | – | – | – | ✓ ASSIGNED | Khi xử lý khiếu nại lại |
| Thu hồi xác minh | – | – | – | – | – | – | ✓ |
| Xử lý báo cáo vi phạm | – | – | – | – | – | ✓ ASSIGNED | Khi xử lý khiếu nại lại |
| Xem nhật ký hoạt động | – | – | – | – | – | – | ✓ |

Manager và Admin không tự động xem được dữ liệu học tập, tin nhắn hay hồ sơ trẻ. Việc xem chỉ được phép khi đang xử lý một hồ sơ cụ thể và luôn được ghi nhật ký (BR-1206).

## Hiển thị theo trường dữ liệu

### Thông tin gia sư

| Trường | Khách, phụ huynh chưa kết nối | Đang kết nối (`PARTY`) | Đã xác nhận (`CONFIRMED`) |
| --- | --- | --- | --- |
| Tên hiển thị, môn, lớp, tỉnh, học phí | ✓ | ✓ | ✓ |
| Giới thiệu, kinh nghiệm, phương pháp, ảnh | ✓ | ✓ | ✓ |
| Trường, đơn vị công tác | – | ✓ (ĐX) | ✓ |
| Họ tên đầy đủ | – | – (ĐX) | ✓ |
| Số điện thoại, email | – | – | ✓ |
| Ảnh CCCD, thẻ sinh viên | – | – | – |

### Thông tin học sinh

| Trường | Gia sư xem bài tìm gia sư | Đang kết nối (`PARTY`) | Đang dạy (`TEACHING`) |
| --- | --- | --- | --- |
| Lớp, môn, mục tiêu, nhu cầu | ✓ | ✓ | ✓ |
| Tên gọi | – | ✓ (ĐX) | ✓ |
| Họ tên đầy đủ | – | – | ✓ (ĐX) |
| Trường học, địa chỉ nhà | – | – | Chỉ khi phụ huynh chủ động cung cấp (ĐX) |
| Ngày sinh | – | – | – (ĐX) |

### Thông tin phụ huynh

| Trường | Gia sư xem bài tìm gia sư | Đang kết nối (`PARTY`) | Đã xác nhận (`CONFIRMED`) |
| --- | --- | --- | --- |
| Tỉnh, xã | ✓ | ✓ | ✓ |
| Tên hiển thị | – | ✓ | ✓ |
| Số điện thoại, email | – | – | ✓ |

## Các trường hợp bắt buộc có test

Đây là các lỗi nghiêm trọng nhất của sản phẩm. Mỗi dòng phải có test tự động trả về từ chối, và CI phải chặn nếu test không đạt.

| # | Tình huống | Kết quả mong đợi |
| --- | --- | --- |
| 1 | Phụ huynh A đọc hồ sơ, lịch, điểm hoặc học phí của con phụ huynh B bằng cách đổi ID | Từ chối |
| 2 | Học sinh A đọc dữ liệu của học sinh B, kể cả anh chị em cùng phụ huynh | Từ chối |
| 3 | Gia sư đọc dữ liệu của học sinh mà mình không có quan hệ dạy học | Từ chối |
| 4 | Gia sư sửa điểm hoặc lớp sau khi lớp đã kết thúc; điểm danh ngoài các ngoại lệ ở BR-613 và tranh chấp | Từ chối |
| 5 | Gia sư chưa xác minh đăng bài, xem bài tìm gia sư, gửi yêu cầu | Từ chối |
| 6 | Xem số điện thoại, email của nhau trước khi xác nhận hợp tác | Trường không có trong phản hồi API |
| 7 | Khách gọi trực tiếp API bài tìm gia sư | Từ chối |
| 8 | Học sinh gọi API chat hoặc API tạo dữ liệu | Từ chối |
| 9 | Người ngoài hội thoại đọc tin nhắn hoặc kết nối socket vào phòng chat đó | Từ chối |
| 10 | Mở URL giấy tờ xác minh mà không có quyền, hoặc sau khi URL ký hết hạn | Từ chối |
| 11 | Manager xem giấy tờ, tin nhắn của hồ sơ không được giao | Từ chối |
| 12 | Manager, Admin xem dữ liệu nhạy cảm hợp lệ | Được phép và có bản ghi nhật ký |
| 13 | Tài khoản bị khóa dùng token còn hạn | Từ chối trong thời hạn nêu ở [nfr.md](nfr.md) |
