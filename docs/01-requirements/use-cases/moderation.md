# Use case: Báo cáo, kiểm duyệt và quản trị

Manager xử lý báo cáo; Admin xử lý khiếu nại lại và cấu hình. Các thao tác tài khoản của Admin nằm ở [UC-ACC-09](accounts.md#uc-acc-09-thao-tác-tài-khoản-của-admin).

## UC-MOD-01: Gửi báo cáo vi phạm

**Tác nhân:** Gia sư, Phụ huynh.

**Quy tắc:** BR-1201, BR-1207, BR-1208.

**Luồng chính:**

1. Người dùng báo cáo một tài khoản, bài đăng hoặc tin nhắn, chọn lý do và mô tả thêm.
2. Lý do có mục riêng cho an toàn trẻ em.
3. Hệ thống tạo báo cáo, đưa vào hàng chờ và xác nhận đã nhận.

**Tiêu chí nghiệm thu:**

- [ ] **AC-MOD-01.1:** Người bị báo cáo không biết ai đã báo cáo.
- [ ] **AC-MOD-01.2:** Báo cáo an toàn trẻ em được đưa lên đầu hàng chờ và tạo cảnh báo ngay.
- [ ] **AC-MOD-01.3:** Báo cáo tin nhắn lưu lại bản sao đoạn tin tại thời điểm báo cáo.
- [ ] **AC-MOD-01.4:** Người báo cáo xem được trạng thái báo cáo của mình.
- [ ] **AC-MOD-01.5:** Có giới hạn tần suất gửi báo cáo.

## UC-MOD-02: Xử lý báo cáo

**Tác nhân:** Manager.

**Quy tắc:** BR-1202, BR-1203, BR-1204, BR-1206, BR-1207.

**Luồng chính:**

1. Manager nhận một báo cáo từ hàng chờ.
2. Hệ thống mở đúng nội dung bị báo cáo và ghi nhật ký. Với tin nhắn, chỉ mở tin bị báo cáo cùng 10 tin trước và 10 tin sau.
3. Manager kết luận không vi phạm, hoặc ẩn nội dung, hoặc đề nghị Admin khóa tài khoản, kèm lý do.
4. Hệ thống lưu kết luận, thông báo cho người báo cáo và cho người bị xử lý.

**Tiêu chí nghiệm thu:**

- [ ] **AC-MOD-02.1:** Manager không đọc được phần còn lại của hội thoại.
- [ ] **AC-MOD-02.2:** Mọi lần xem và mọi kết luận đều có bản ghi nhật ký.
- [ ] **AC-MOD-02.3:** Không đóng được báo cáo nếu thiếu lý do.
- [ ] **AC-MOD-02.4:** Báo cáo an toàn trẻ em quá 24 giờ chưa xử lý thì tạo cảnh báo cho Admin.
- [ ] **AC-MOD-02.5:** Lịch sử xử lý không sửa hoặc xóa được.

## UC-MOD-03: Ẩn nội dung vi phạm

**Tác nhân:** Manager, Admin.

**Quy tắc:** BR-1204, BR-307.

**Luồng chính:**

1. Manager ẩn bài đăng hoặc tin nhắn trong một báo cáo đang xử lý.
2. Nội dung biến mất khỏi nơi hiển thị. Chủ nội dung được báo lý do.
3. Khi có lý do hợp lệ, Admin hoặc Manager đang xử lý khôi phục lại.

**Tiêu chí nghiệm thu:**

- [ ] **AC-MOD-03.1:** Nội dung bị ẩn không còn trên trang công khai và tìm kiếm.
- [ ] **AC-MOD-03.2:** Nội dung bị ẩn không bị xóa, để phục vụ khiếu nại.
- [ ] **AC-MOD-03.3:** Chủ bài đăng không tự bỏ ẩn được.

## UC-MOD-04: Khiếu nại lại

**Tác nhân:** Người bị xử lý hoặc người báo cáo, Admin.

**Quy tắc:** BR-704, BR-1202.

**Luồng chính:**

1. Người dùng gửi khiếu nại lại về kết luận của Manager, kèm lý do.
2. Admin xem hồ sơ và quyết định giữ hoặc đổi kết luận.
3. Hệ thống thông báo kết quả. Quyết định của Admin là cuối cùng trên nền tảng.

**Tiêu chí nghiệm thu:**

- [ ] **AC-MOD-04.1:** Mỗi kết luận chỉ khiếu nại lại được một lần.
- [ ] **AC-MOD-04.2:** Admin chỉ xem dữ liệu nhạy cảm khi có khiếu nại đang xử lý.
- [ ] **AC-MOD-04.3:** Kết luận cũ vẫn còn trong lịch sử.

## UC-MOD-05: Quản lý danh mục

**Tác nhân:** Admin.

**Quy tắc:** BR-1103, C1, PRD §2.4.

**Luồng chính:**

1. Admin thêm, sửa, tắt môn, khối lớp, khu vực.
2. Mỗi mục có tên tiếng Việt và tiếng Anh.

**Tiêu chí nghiệm thu:**

- [ ] **AC-MOD-05.1:** Không lưu được nếu thiếu một trong hai tên.
- [ ] **AC-MOD-05.2:** Mục đã dùng không xóa được, chỉ tắt; tắt rồi không chọn mới được nhưng dữ liệu cũ vẫn hiển thị.
- [ ] **AC-MOD-05.3:** Danh mục khu vực nhập từ nguồn đơn vị hành chính còn hiệu lực.

## UC-MOD-06: Theo dõi vận hành

**Tác nhân:** Admin, Manager.

**Quy tắc:** NFR-O04, NFR-O05, C13.

**Luồng chính:**

1. Admin xem thống kê: gia sư đã xác minh, phụ huynh đăng ký, lớp tạo từ kết nối, tỷ lệ lớp còn học sau 4 tuần.
2. Manager xem hàng chờ: hồ sơ xác minh, báo cáo, tranh chấp, số việc quá hạn.

**Tiêu chí nghiệm thu:**

- [ ] **AC-MOD-06.1:** Bốn chỉ số ở C13 đều xem được theo khoảng thời gian.
- [ ] **AC-MOD-06.2:** Thống kê chỉ có số tổng, không có dữ liệu nhận dạng trẻ.
- [ ] **AC-MOD-06.3:** Số liệu hàng chờ khớp với số việc thực tế.

## UC-MOD-07: Xem nhật ký hoạt động

**Tác nhân:** Admin.

**Quy tắc:** BR-1206, NFR-S08.

**Luồng chính:**

1. Admin lọc nhật ký theo người thực hiện, đối tượng, loại hành động, thời gian.
2. Hệ thống hiện kết quả phân trang.

**Tiêu chí nghiệm thu:**

- [ ] **AC-MOD-07.1:** Manager gọi API nhật ký bị từ chối.
- [ ] **AC-MOD-07.2:** Nhật ký không sửa hoặc xóa được qua bất kỳ API nào.
- [ ] **AC-MOD-07.3:** Nhật ký không chứa nội dung giấy tờ, số CCCD hoặc nội dung tin nhắn.
