# Use case: Chat và chặn

Trong MVP, chat chỉ diễn ra giữa gia sư và phụ huynh (C7). Tin nhắn được gửi qua REST; socket chỉ đẩy sự kiện.

## UC-MSG-01: Mở hội thoại

**Tác nhân:** Hệ thống.

**Quy tắc:** BR-501, BR-502, BR-503, BR-511.

**Luồng chính:**

1. Khi yêu cầu chuyển sang `ACCEPTED` hoặc `DISCUSSING`, hệ thống tạo hội thoại cho yêu cầu đó.
2. Hội thoại hiện trong danh sách của hai bên.

**Tiêu chí nghiệm thu:**

- [ ] **AC-MSG-01.1:** Không có API để tự tạo hội thoại.
- [ ] **AC-MSG-01.2:** Mỗi yêu cầu có đúng một hội thoại, kể cả khi sự kiện chạy lại.
- [ ] **AC-MSG-01.3:** Hội thoại tiếp tục được dùng sau khi lớp được tạo.

## UC-MSG-02: Gửi và nhận tin nhắn

**Tác nhân:** Gia sư, Phụ huynh.

**Quy tắc:** BR-505, BR-510, NFR-F05, NFR-R07.

**Luồng chính:**

1. Người dùng gửi tin nhắn văn bản.
2. Hệ thống lưu tin và đẩy sự kiện cho người nhận đang trực tuyến.
3. Giao diện hiện thời gian gửi và số tin chưa đọc.

**Ngoại lệ:**

- Mất mạng: client giữ tin và gửi lại; hệ thống không tạo trùng.
- Hội thoại chỉ đọc: không gửi được và hiện rõ lý do.

**Tiêu chí nghiệm thu:**

- [ ] **AC-MSG-02.1:** Người ngoài hội thoại không đọc được tin và không kết nối được socket vào phòng đó.
- [ ] **AC-MSG-02.2:** Học sinh gọi API chat bị từ chối.
- [ ] **AC-MSG-02.3:** 95% tin đến người nhận đang trực tuyến trong dưới 1 giây.
- [ ] **AC-MSG-02.4:** Gửi lại cùng một mã tin không tạo tin thứ hai.
- [ ] **AC-MSG-02.5:** Client kết nối lại nhận đủ các tin đã lỡ, không mất và không trùng.
- [ ] **AC-MSG-02.6:** Nội dung tin nhắn không xuất hiện trong log.
- [ ] **AC-MSG-02.7:** Lịch sử tải dần bằng cursor, không tải toàn bộ một lần.

## UC-MSG-03: Gửi ảnh

**Tác nhân:** Gia sư, Phụ huynh.

**Quy tắc:** BR-510, NFR-S07, NFR-F08.

**Luồng chính:**

1. Người dùng chọn ảnh.
2. Hệ thống kiểm tra, lưu vào bucket riêng tư và gửi vào hội thoại.
3. Người nhận xem ảnh qua URL ký có thời hạn.

**Tiêu chí nghiệm thu:**

- [ ] **AC-MSG-03.1:** Tệp không phải ảnh bị từ chối, kể cả khi đổi đuôi tệp.
- [ ] **AC-MSG-03.2:** Ảnh quá 5 MB bị từ chối.
- [ ] **AC-MSG-03.3:** URL ảnh hết hạn sau 15 phút; người ngoài hội thoại không xin được URL mới.

## UC-MSG-04: Chặn người dùng

**Tác nhân:** Gia sư, Phụ huynh.

**Quy tắc:** BR-413, BR-512, PRD §3.7.

**Luồng chính:**

1. Người dùng chọn chặn bên kia.
2. Hệ thống tự hủy yêu cầu đang mở giữa hai bên và chuyển hội thoại sang chỉ đọc.
3. Hai bên không gửi được yêu cầu mới cho nhau.
4. Người dùng có thể bỏ chặn trong phần cài đặt.

**Ngoại lệ:**

- Đang có lớp giữa hai bên: phải kết thúc lớp trước khi chặn. Hệ thống dẫn tới thao tác kết thúc lớp và báo cáo vi phạm.

**Tiêu chí nghiệm thu:**

- [ ] **AC-MSG-04.1:** Sau khi chặn, người bị chặn không gửi được tin hay yêu cầu.
- [ ] **AC-MSG-04.2:** Người bị chặn không nhận được thông báo rằng mình bị chặn; họ chỉ thấy hội thoại chỉ đọc.
- [ ] **AC-MSG-04.3:** Khi đang có lớp, API chặn từ chối và trả về mã lỗi riêng.
- [ ] **AC-MSG-04.4:** Lịch sử tin nhắn vẫn còn để phục vụ báo cáo.

## UC-MSG-05: Hội thoại chỉ đọc

**Tác nhân:** Hệ thống.

**Quy tắc:** BR-508, BR-509, BR-511.

**Luồng chính:**

1. Khi yêu cầu bị hủy hoặc lớp kết thúc, hệ thống chuyển hội thoại sang chỉ đọc.
2. Khi lớp kết thúc, hệ thống cũng ngừng hiện số điện thoại, email của hai bên.

**Tiêu chí nghiệm thu:**

- [ ] **AC-MSG-05.1:** Hai bên đọc được lịch sử nhưng không gửi tin mới được.
- [ ] **AC-MSG-05.2:** Sau khi lớp kết thúc, API không còn trả số điện thoại, email của bên kia.
- [ ] **AC-MSG-05.3:** Hai bên kết nối lại bằng yêu cầu mới thì có hội thoại mới.
