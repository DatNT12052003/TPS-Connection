# Use case: Thông báo

MVP có thông báo trong app và email; không dùng SMS. Thông báo đẩy có khi ra Mobile (C12).

## UC-NOT-01: Nhận và đọc thông báo trong app

**Tác nhân:** Người dùng đã đăng nhập.

**Quy tắc:** BR-1101, BR-1102, NFR-R06, NFR-F07.

**Luồng chính:**

1. Một sự kiện nghiệp vụ xảy ra. Hệ thống lưu sự kiện cùng giao dịch với thay đổi đó.
2. Worker tạo thông báo và đẩy cho người nhận đang trực tuyến.
3. Người dùng thấy số chưa đọc, mở danh sách, bấm vào để đến đúng màn hình liên quan.
4. Người dùng đánh dấu đã đọc từng mục hoặc tất cả.

**Tiêu chí nghiệm thu:**

- [ ] **AC-NOT-01.1:** Mỗi loại ở BR-1102 đều tạo đúng thông báo cho đúng người.
- [ ] **AC-NOT-01.2:** Nếu giao dịch nghiệp vụ lỗi, không có thông báo nào được gửi.
- [ ] **AC-NOT-01.3:** Sự kiện chạy lại không tạo thông báo trùng.
- [ ] **AC-NOT-01.4:** Người dùng không đọc được thông báo của người khác.
- [ ] **AC-NOT-01.5:** Liên kết trong thông báo vẫn kiểm tra quyền khi mở.
- [ ] **AC-NOT-01.6:** Nội dung hiện theo ngôn ngữ của người nhận.

## UC-NOT-02: Nhận email

**Tác nhân:** Người dùng, Worker.

**Quy tắc:** BR-1101, BR-1106, BR-1107, NFR-R06.

**Luồng chính:**

1. Worker gửi email theo loại thông báo và cài đặt của người nhận.
2. Với tin nhắn mới, hệ thống chỉ gửi email khi người nhận ngoại tuyến quá 15 phút, và gộp các tin chưa đọc thành một email.
3. Email thử lại tối đa 5 lần nếu lỗi, sau đó ghi cảnh báo.

**Tiêu chí nghiệm thu:**

- [ ] **AC-NOT-02.1:** Email không chứa nội dung tin nhắn, số điện thoại, địa chỉ; về trẻ chỉ có tên gọi.
- [ ] **AC-NOT-02.2:** Mười tin nhắn liên tiếp chỉ tạo một email.
- [ ] **AC-NOT-02.3:** Email gửi theo ngôn ngữ của người nhận.
- [ ] **AC-NOT-02.4:** Tài khoản đã xóa hoặc bị khóa không nhận email thông thường.

## UC-NOT-03: Nhắc lịch học

**Tác nhân:** Hệ thống.

**Quy tắc:** BR-1105, BR-1102, NFR-R04.

**Luồng chính:**

1. Worker tìm buổi `SCHEDULED` sắp diễn ra.
2. Hệ thống nhắc gia sư và phụ huynh trước 24 giờ và trước 3 giờ.

Mốc 3 giờ nằm trước hạn hủy 2 tiếng, để người dùng còn kịp hủy đúng hạn.

**Tiêu chí nghiệm thu:**

- [ ] **AC-NOT-03.1:** Mỗi buổi chỉ gửi một lần cho mỗi mốc, kể cả khi job chạy lại.
- [ ] **AC-NOT-03.2:** Buổi đã hủy không gửi nhắc.
- [ ] **AC-NOT-03.3:** Đổi giờ buổi học thì mốc nhắc được tính lại.
- [ ] **AC-NOT-03.4:** Giờ trong nhắc lịch đúng giờ Việt Nam.

## UC-NOT-04: Cài đặt thông báo

**Tác nhân:** Người dùng đã đăng nhập.

**Quy tắc:** BR-1101.

**Luồng chính:**

1. Người dùng bật hoặc tắt email theo từng nhóm: kết nối, tin nhắn, lịch học, kết quả học tập, học phí.
2. Hệ thống áp dụng cho các thông báo sau đó.

**Tiêu chí nghiệm thu:**

- [ ] **AC-NOT-04.1:** Email về bảo mật và tài khoản không tắt được.
- [ ] **AC-NOT-04.2:** Thông báo trong app vẫn có khi đã tắt email.
- [ ] **AC-NOT-04.3:** Email có liên kết đến trang cài đặt.
