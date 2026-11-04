# Use case: Hồ sơ gia sư, bài đăng và tìm kiếm

Phân hệ này giúp phụ huynh và gia sư tìm thấy nhau. Trang công khai được render phía máy chủ để phục vụ SEO (D12).

## UC-MKT-01: Tạo và sửa hồ sơ gia sư

**Tác nhân:** Gia sư.

**Quy tắc:** BR-206, BR-209, BR-210, BR-309, BR-810, PRD §3.2.

**Luồng chính:**

1. Gia sư nhập họ tên, tên hiển thị, ảnh, giới thiệu, loại gia sư, trường hoặc đơn vị công tác.
2. Gia sư nhập môn, lớp, hình thức dạy, khu vực (tỉnh, xã), giá mỗi buổi, thời lượng, lịch rảnh, kinh nghiệm, phương pháp dạy.
3. Hệ thống lưu. Hồ sơ chỉ công khai khi gia sư ở `VERIFIED`.

**Luồng thay thế:**

- Gia sư bật tạm ngừng nhận học sinh: hồ sơ vẫn hiện kèm nhãn, nhưng không nhận yêu cầu mới.
- Đổi họ tên: thực hiện theo UC-VER-05.

**Tiêu chí nghiệm thu:**

- [ ] **AC-MKT-01.1:** Hồ sơ chưa `VERIFIED` không xuất hiện trong tìm kiếm, trang công khai hay sitemap.
- [ ] **AC-MKT-01.2:** Môn, lớp, khu vực chọn từ danh mục; không nhập tự do.
- [ ] **AC-MKT-01.3:** Chỉ nhập được giá mỗi buổi, số nguyên VND, kèm thời lượng.
- [ ] **AC-MKT-01.4:** Giới thiệu và kinh nghiệm hiện là tự khai; chỉ thông tin đã duyệt mới có dấu xác minh.
- [ ] **AC-MKT-01.5:** Gia sư A không sửa được hồ sơ của gia sư B.

## UC-MKT-02: Quản lý bài tuyển học sinh

**Tác nhân:** Gia sư.

**Quy tắc:** BR-206, BR-302, BR-307, PRD §3.3.

**Luồng chính:**

1. Gia sư tạo bài: tiêu đề, nội dung, môn, lớp, hình thức, khu vực, giá mỗi buổi, lịch, số học sinh có thể nhận, ngày bắt đầu.
2. Gia sư lưu nháp hoặc đăng.
3. Bài đăng hiển thị ngay ở trạng thái đang tuyển. Manager xử lý sau nếu có báo cáo.
4. Gia sư sửa, ẩn, xóa hoặc đổi trạng thái: đang tuyển, đã đủ học sinh, tạm dừng.

**Tiêu chí nghiệm thu:**

- [ ] **AC-MKT-02.1:** Gia sư chưa xác minh chỉ lưu được nháp; API đăng bài từ chối.
- [ ] **AC-MKT-02.2:** Khách xem được bài đang tuyển; không xem được bài nháp, đã ẩn hoặc bị Manager ẩn.
- [ ] **AC-MKT-02.3:** Bài đã đủ học sinh hoặc tạm dừng vẫn xem được nhưng không nhận yêu cầu mới.
- [ ] **AC-MKT-02.4:** Gia sư xem được lượt xem và số yêu cầu của bài mình.
- [ ] **AC-MKT-02.5:** Khi gia sư không còn `VERIFIED`, mọi bài đăng của họ bị ẩn khỏi công khai.

## UC-MKT-03: Quản lý bài tìm gia sư

**Tác nhân:** Phụ huynh.

**Quy tắc:** BR-303, BR-304, BR-308, BR-414, PRD §3.4.

**Luồng chính:**

1. Phụ huynh chọn một hồ sơ con và nhập môn, mục tiêu, hình thức, khu vực (tỉnh, xã), ngân sách, lịch mong muốn, ngày bắt đầu, yêu cầu với gia sư.
2. Hệ thống đăng bài, chỉ hiện cho gia sư đã xác minh và đã đăng nhập.
3. Phụ huynh sửa, ẩn, đóng bài và xem các đề nghị theo UC-CON-02.
4. Khi xác nhận hợp tác từ một đề nghị của bài, bài tự đóng.

**Tiêu chí nghiệm thu:**

- [ ] **AC-MKT-03.1:** Khách và gia sư chưa xác minh gọi API đều bị từ chối.
- [ ] **AC-MKT-03.2:** Trang bài tìm gia sư có thẻ chặn lập chỉ mục và không có trong sitemap.
- [ ] **AC-MKT-03.3:** Phản hồi API không có họ tên đầy đủ, trường, địa chỉ, số điện thoại của trẻ hay phụ huynh.
- [ ] **AC-MKT-03.4:** Phụ huynh chỉ chọn được hồ sơ con của mình.
- [ ] **AC-MKT-03.5:** Hệ thống cảnh báo khi phụ huynh viết số điện thoại hoặc email vào nội dung bài (`ĐX`).

## UC-MKT-04: Tìm và lọc gia sư

**Tác nhân:** Khách, Phụ huynh, Gia sư.

**Quy tắc:** BR-301, BR-305, BR-306, BR-309, NFR-F03, NFR-F07.

**Luồng chính:**

1. Người dùng mở danh sách gia sư, không cần đăng nhập.
2. Người dùng lọc theo môn, lớp, học phí, hình thức, khu vực.
3. Người dùng sắp xếp theo hồ sơ mới cập nhật (mặc định) hoặc học phí thấp đến cao (`ĐX`).
4. Hệ thống trả danh sách phân trang gồm các gia sư đang nhận học sinh.

**Luồng thay thế:**

- Không có kết quả: hệ thống gợi ý nới bộ lọc và đăng bài tìm gia sư.
- Lọc hình thức trực tuyến: bỏ qua điều kiện khu vực.

**Tiêu chí nghiệm thu:**

- [ ] **AC-MKT-04.1:** Chỉ gia sư `VERIFIED` xuất hiện trong kết quả.
- [ ] **AC-MKT-04.2:** Tìm theo tên môn hoặc khu vực không phân biệt dấu tiếng Việt.
- [ ] **AC-MKT-04.3:** 95% yêu cầu dưới 500 ms với 10.000 hồ sơ thử.
- [ ] **AC-MKT-04.4:** Bộ lọc được giữ trên URL để chia sẻ và quay lại được.
- [ ] **AC-MKT-04.5:** Phản hồi không chứa trường, đơn vị công tác, họ tên đầy đủ, số điện thoại, email.

## UC-MKT-05: Xem chi tiết gia sư

**Tác nhân:** Khách, Phụ huynh, Gia sư.

**Quy tắc:** BR-301, BR-210, BR-504, NFR-P03, NFR-F04.

**Luồng chính:**

1. Người dùng mở trang gia sư.
2. Hệ thống hiện tên hiển thị, ảnh, môn, lớp, tỉnh, giá mỗi buổi, giới thiệu, kinh nghiệm, phương pháp, huy hiệu.
3. Người dùng chọn gửi yêu cầu theo UC-CON-01.

**Tiêu chí nghiệm thu:**

- [ ] **AC-MKT-05.1:** Trang được render từ máy chủ, có tiêu đề và mô tả riêng, có liên kết hai ngôn ngữ.
- [ ] **AC-MKT-05.2:** Mã nguồn trang và dữ liệu nhúng không chứa trường, đơn vị công tác, họ tên đầy đủ, số điện thoại, email.
- [ ] **AC-MKT-05.3:** Gia sư bị thu hồi xác minh hoặc đã xóa tài khoản trả về 404.
- [ ] **AC-MKT-05.4:** LCP dưới 2,5 giây trên mạng di động 4G.

## UC-MKT-06: Gia sư tìm bài tìm gia sư

**Tác nhân:** Gia sư đã xác minh.

**Quy tắc:** BR-303, BR-305, NFR-F07.

**Luồng chính:**

1. Gia sư mở danh sách, lọc theo môn, lớp, hình thức, khu vực, ngân sách.
2. Gia sư mở một bài và gửi đề nghị theo UC-CON-02.

**Tiêu chí nghiệm thu:**

- [ ] **AC-MKT-06.1:** Danh sách chỉ có bài đang mở.
- [ ] **AC-MKT-06.2:** Bài đã gửi đề nghị có nhãn để gia sư nhận biết.
- [ ] **AC-MKT-06.3:** Danh sách phân trang, tối đa 50 bản ghi mỗi trang.

## UC-MKT-07: Yêu thích gia sư (làm nếu kịp)

**Tác nhân:** Phụ huynh.

**Quy tắc:** BR-005.

**Luồng chính:**

1. Phụ huynh bấm lưu trên hồ sơ gia sư.
2. Phụ huynh xem và bỏ lưu trong danh sách yêu thích.

**Tiêu chí nghiệm thu:**

- [ ] **AC-MKT-07.1:** Danh sách chỉ chủ tài khoản xem được; gia sư không biết ai đã lưu mình.
- [ ] **AC-MKT-07.2:** Gia sư không còn `VERIFIED` tự biến mất khỏi danh sách.
