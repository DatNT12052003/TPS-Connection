# Use case: Học phí

Nền tảng chỉ ghi nhận học phí và không thu hoặc giữ tiền (D6). Vòng đời khoản học phí nằm ở [máy trạng thái](../state-machines.md#4-khoản-học-phí).

## UC-TUI-01: Cộng dồn học phí trong tháng

**Tác nhân:** Hệ thống.

**Quy tắc:** BR-801, BR-803, BR-804.

**Luồng chính:**

1. Khi một buổi được chốt, hệ thống cộng giá của buổi vào khoản `ACCRUING` của lớp trong tháng hiện tại.
2. Nếu chưa có khoản, hệ thống tạo mới.

**Tiêu chí nghiệm thu:**

- [ ] **AC-TUI-01.1:** Chỉ buổi `CONFIRMED`, `AUTO_CONFIRMED`, `RESOLVED_CHARGEABLE` được cộng.
- [ ] **AC-TUI-01.2:** Buổi vắng, đã hủy, đang tranh chấp, chưa điểm danh đều không được cộng.
- [ ] **AC-TUI-01.3:** Số tiền dùng giá đã lưu của buổi, không dùng giá hiện hành của lớp.
- [ ] **AC-TUI-01.4:** Sự kiện chạy lại không cộng trùng.
- [ ] **AC-TUI-01.5:** Tiền là số nguyên VND.

## UC-TUI-02: Chốt khoản cuối tháng

**Tác nhân:** Hệ thống.

**Quy tắc:** BR-801, BR-805, NFR-R04, NFR-R05.

**Luồng chính:**

1. Lúc 00:00 ngày 1 hằng tháng, giờ Việt Nam, Worker chốt các khoản `ACCRUING` của tháng trước.
2. Khoản lớn hơn 0 chuyển sang `DUE`, và phụ huynh, gia sư được thông báo.
3. Khoản bằng 0 không được giữ lại.

**Tiêu chí nghiệm thu:**

- [ ] **AC-TUI-02.1:** Buổi chốt lúc 23:59 ngày cuối tháng thuộc tháng đó; chốt lúc 00:00 ngày 1 thuộc tháng mới.
- [ ] **AC-TUI-02.2:** Job chạy lại hoặc chạy muộn cho cùng một kết quả, không tạo khoản trùng.
- [ ] **AC-TUI-02.3:** Job lỗi tạo cảnh báo.
- [ ] **AC-TUI-02.4:** Số tiền của khoản `DUE` không đổi được bằng API sửa thông thường.

## UC-TUI-03: Xem học phí

**Tác nhân:** Phụ huynh, Gia sư.

**Quy tắc:** BR-805, BR-806, PRD §3.12.

**Luồng chính:**

1. Người dùng mở danh sách khoản theo tháng và trạng thái. Phụ huynh lọc theo con; gia sư lọc theo lớp.
2. Người dùng mở khoản và xem từng buổi: ngày, giá, trạng thái.

**Tiêu chí nghiệm thu:**

- [ ] **AC-TUI-03.1:** Khoản hiện ngày của từng buổi, để đối chiếu các buổi cuối tháng được chuyển sang tháng sau.
- [ ] **AC-TUI-03.2:** Mỗi bên chỉ thấy khoản trong phạm vi quyền; đổi ID bị từ chối.
- [ ] **AC-TUI-03.3:** Học sinh gọi API học phí bị từ chối.
- [ ] **AC-TUI-03.4:** Gia sư thấy tổng đã nhận và tổng chưa nhận theo tháng.
- [ ] **AC-TUI-03.5:** Giao diện nói rõ tiền được trả ngoài nền tảng.

## UC-TUI-04: Đánh dấu đã thanh toán

**Tác nhân:** Gia sư.

**Quy tắc:** BR-802, BR-806, BR-807.

**Luồng chính:**

1. Gia sư chọn đánh dấu một khoản `DUE` là đã thanh toán, kèm ngày nhận tiền.
2. Hệ thống tạo bản ghi thanh toán thủ công, chuyển sang `PAID` và thông báo cho phụ huynh.

**Luồng thay thế:**

- Đánh dấu nhầm: gia sư bỏ đánh dấu, nhập lý do; khoản trở về `DUE` và phụ huynh được thông báo.

**Tiêu chí nghiệm thu:**

- [ ] **AC-TUI-04.1:** Phụ huynh không tự đánh dấu được.
- [ ] **AC-TUI-04.2:** Gia sư đánh dấu được cả khi lớp đã kết thúc.
- [ ] **AC-TUI-04.3:** Không đánh dấu được một phần trong MVP.
- [ ] **AC-TUI-04.4:** Bỏ đánh dấu được ghi nhật ký và có lý do.

## UC-TUI-05: Điều chỉnh sau tranh chấp

**Tác nhân:** Hệ thống, sau quyết định ở UC-TCH-08.

**Quy tắc:** BR-703, BR-808.

**Luồng chính:**

1. Quyết định làm đổi số tiền của một khoản đã chốt.
2. Hệ thống không sửa khoản cũ. Hệ thống ghi một dòng điều chỉnh vào khoản `ACCRUING` của lớp trong tháng hiện tại.
3. Nếu lớp đã kết thúc, hệ thống ghi bản ghi điều chỉnh để tham khảo, và báo hai bên tự xử lý ngoài nền tảng.

**Tiêu chí nghiệm thu:**

- [ ] **AC-TUI-05.1:** Khoản đã chốt giữ nguyên số tiền.
- [ ] **AC-TUI-05.2:** Dòng điều chỉnh liên kết với buổi và quyết định gốc.
- [ ] **AC-TUI-05.3:** Điều chỉnh âm được hiển thị rõ; tổng khoản không xuống dưới 0, phần dư chuyển sang tháng sau.
- [ ] **AC-TUI-05.4:** Quyết định chạy lại không tạo điều chỉnh trùng.

## UC-TUI-06: Xuất bảng tổng hợp

**Tác nhân:** Gia sư, Phụ huynh.

**Quy tắc:** BR-809.

**Luồng chính:**

1. Người dùng chọn tháng và xuất tệp CSV (`ĐX`).
2. Hệ thống tạo tệp gồm các buổi, giá, tổng và trạng thái trong phạm vi quyền của người đó.

**Tiêu chí nghiệm thu:**

- [ ] **AC-TUI-06.1:** Tệp mở đúng tiếng Việt trong Excel.
- [ ] **AC-TUI-06.2:** Tệp không chứa dữ liệu của lớp hay học sinh ngoài phạm vi quyền.
- [ ] **AC-TUI-06.3:** Giá trị bắt đầu bằng `=`, `+`, `-`, `@` được xử lý để không chạy như công thức.
