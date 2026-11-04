# Use case: Lớp, lịch và điểm danh

Lớp do hệ thống tạo khi hai bên xác nhận hợp tác (UC-CON-05). Vòng đời buổi học nằm ở [máy trạng thái](../state-machines.md#3-buổi-học).

## UC-TCH-01: Xem lớp và học sinh

**Tác nhân:** Gia sư, Phụ huynh, Học sinh.

**Quy tắc:** BR-601, BR-902, BR-509.

**Luồng chính:**

1. Gia sư xem danh sách học sinh đang dạy và đã dạy. Phụ huynh xem các gia sư đang dạy từng con.
2. Người dùng mở chi tiết lớp: môn, lớp, mục tiêu, lịch, giá mỗi buổi, trạng thái.

**Tiêu chí nghiệm thu:**

- [ ] **AC-TCH-01.1:** Gia sư không thấy học sinh mà mình không có quan hệ dạy học.
- [ ] **AC-TCH-01.2:** Phụ huynh có nhiều con lọc được theo từng con.
- [ ] **AC-TCH-01.3:** Lớp đã kết thúc vẫn xem được, ở chế độ chỉ đọc.
- [ ] **AC-TCH-01.4:** Học sinh không thấy giá mỗi buổi.
- [ ] **AC-TCH-01.5:** Có trạng thái rỗng khi chưa có lớp.

## UC-TCH-02: Sửa lịch học

**Tác nhân:** Gia sư. Hệ thống sinh buổi.

**Quy tắc:** BR-602, BR-614, NFR-U05.

**Luồng chính:**

1. Hệ thống sinh sẵn các buổi cho 8 tuần tới từ lịch định kỳ, và mỗi ngày sinh tiếp.
2. Gia sư sửa một buổi, hoặc sửa từ buổi này trở đi.
3. Hệ thống cập nhật các buổi chưa diễn ra và thông báo cho phụ huynh.

**Ngoại lệ:**

- Giờ mới trùng buổi khác của gia sư: cảnh báo nhưng vẫn cho lưu.
- Buổi đã diễn ra hoặc đã điểm danh: không sửa được lịch.

**Tiêu chí nghiệm thu:**

- [ ] **AC-TCH-02.1:** Job sinh buổi chạy lại không tạo buổi trùng.
- [ ] **AC-TCH-02.2:** Sửa lịch không ảnh hưởng các buổi đã qua.
- [ ] **AC-TCH-02.3:** Buổi mới dùng giá hiện hành của lớp, và lưu lại giá đó.
- [ ] **AC-TCH-02.4:** Phụ huynh nhận thông báo khi lịch đổi.
- [ ] **AC-TCH-02.5:** Lớp tạm nghỉ hoặc đã kết thúc không sinh buổi mới.

## UC-TCH-03: Xem lịch

**Tác nhân:** Gia sư, Phụ huynh, Học sinh.

**Quy tắc:** PRD §3.9, BR-902.

**Luồng chính:**

1. Người dùng mở lịch theo ngày, tuần hoặc tháng.
2. Phụ huynh lọc theo từng con. Gia sư xem toàn bộ các lớp.
3. Người dùng mở chi tiết buổi: giờ, hình thức, trạng thái, nội dung đã dạy.

**Tiêu chí nghiệm thu:**

- [ ] **AC-TCH-03.1:** Mỗi người chỉ thấy buổi trong phạm vi quyền của mình.
- [ ] **AC-TCH-03.2:** Giờ hiển thị đúng giờ Việt Nam.
- [ ] **AC-TCH-03.3:** Dùng tốt ở chiều rộng 360 px.

## UC-TCH-04: Tạo buổi lẻ và buổi học bù

**Tác nhân:** Gia sư.

**Quy tắc:** BR-607, BR-804.

**Luồng chính:**

1. Gia sư tạo một buổi ngoài lịch định kỳ.
2. Nếu là học bù, gia sư chọn buổi gốc đã hủy hoặc đã vắng.
3. Hệ thống tạo buổi `SCHEDULED` và thông báo cho phụ huynh.

**Tiêu chí nghiệm thu:**

- [ ] **AC-TCH-04.1:** Buổi gốc phải thuộc cùng lớp và chưa có buổi bù khác.
- [ ] **AC-TCH-04.2:** Buổi bù tính tiền như buổi thường khi đã học; buổi gốc vẫn không tính tiền.
- [ ] **AC-TCH-04.3:** Chi tiết buổi hiện liên kết tới buổi gốc.

## UC-TCH-05: Hủy buổi học

**Tác nhân:** Gia sư, Phụ huynh.

**Quy tắc:** BR-603, BR-604, BR-605.

**Luồng chính:**

1. Người dùng chọn hủy một buổi `SCHEDULED` và nhập lý do.
2. Hệ thống ghi đúng hạn nếu còn từ 2 tiếng trở lên trước giờ học, ngược lại ghi hủy muộn.
3. Hệ thống thông báo cho bên kia. Buổi không tính tiền.

**Tiêu chí nghiệm thu:**

- [ ] **AC-TCH-05.1:** Đúng 2 tiếng trước giờ học được tính là đúng hạn; ít hơn 2 tiếng là hủy muộn.
- [ ] **AC-TCH-05.2:** Thời điểm hủy lấy từ máy chủ, không tin giá trị client gửi.
- [ ] **AC-TCH-05.3:** Hủy muộn có nhãn cho hai bên xem nhưng không phát sinh tiền.
- [ ] **AC-TCH-05.4:** Sau giờ bắt đầu không hủy được; phải điểm danh.
- [ ] **AC-TCH-05.5:** Phụ huynh chỉ hủy được buổi của con mình; học sinh không hủy được.

## UC-TCH-06: Điểm danh

**Tác nhân:** Gia sư.

**Quy tắc:** BR-606, BR-608, BR-610, BR-612, BR-613, BR-901.

**Luồng chính:**

1. Sau giờ bắt đầu, gia sư chọn đã học, học sinh vắng hoặc gia sư vắng.
2. Nếu đã học, gia sư nhập thời lượng thực tế và nội dung đã dạy.
3. Nếu học sinh vắng, gia sư có thể đánh dấu vắng không báo.
4. Với buổi đã học, hệ thống mở hạn xác nhận 48 giờ và thông báo cho phụ huynh.

**Luồng thay thế:**

- Gia sư sửa điểm danh trong 48 giờ khi buổi chưa chốt: hệ thống lưu lịch sử, báo cho phụ huynh và tính lại 48 giờ.
- Quá 7 ngày chưa điểm danh: buổi được gắn cờ, gia sư được nhắc, buổi chưa tính tiền.
- Lớp đã kết thúc: gia sư có thêm 7 ngày để điểm danh các buổi đã qua.

**Tiêu chí nghiệm thu:**

- [ ] **AC-TCH-06.1:** Không điểm danh được trước giờ bắt đầu.
- [ ] **AC-TCH-06.2:** Chỉ gia sư đang dạy lớp đó mới điểm danh được.
- [ ] **AC-TCH-06.3:** Giá của buổi không đổi theo thời lượng thực tế.
- [ ] **AC-TCH-06.4:** Mọi lần sửa đều lưu giá trị cũ, người sửa, thời điểm.
- [ ] **AC-TCH-06.5:** Buổi đã chốt hoặc đang tranh chấp không sửa được theo luồng này.

## UC-TCH-07: Xác nhận buổi đã học

**Tác nhân:** Phụ huynh, Hệ thống.

**Quy tắc:** BR-608, BR-609.

**Luồng chính:**

1. Phụ huynh nhận thông báo và bấm xác nhận trong 48 giờ.
2. Hệ thống chuyển sang `CONFIRMED`, buổi được tính tiền.

**Luồng thay thế:**

- Phụ huynh không phản hồi: hệ thống nhắc một lần trước khi hết hạn, rồi tự chuyển sang `AUTO_CONFIRMED`.

**Tiêu chí nghiệm thu:**

- [ ] **AC-TCH-07.1:** Buổi chưa đủ 48 giờ không bị tự chốt; quá 48 giờ thì chốt ở lần quét kế tiếp.
- [ ] **AC-TCH-07.2:** Chỉ có một lần nhắc, kể cả khi job chạy lại.
- [ ] **AC-TCH-07.3:** Phụ huynh của học sinh khác không xác nhận được.
- [ ] **AC-TCH-07.4:** Buổi vắng và buổi đã hủy không yêu cầu xác nhận.

## UC-TCH-08: Tranh chấp buổi học

**Tác nhân:** Phụ huynh, Gia sư, Manager, Admin.

**Quy tắc:** BR-701, BR-702, BR-703, BR-704.

**Luồng chính:**

1. Phụ huynh khiếu nại trong 48 giờ và nêu lý do. Buổi chuyển sang `DISPUTED`, tạm chưa tính tiền.
2. Hai bên có 3 ngày để thống nhất: phụ huynh rút khiếu nại, hoặc gia sư sửa điểm danh.
3. Quá 3 ngày, buổi chuyển sang `ESCALATED` và vào hàng chờ của Manager.
4. Manager xem lịch sử buổi học, quyết định có tính tiền hay không, kèm lý do.

**Luồng thay thế:**

- Một bên không đồng ý với Manager: khiếu nại lại lên Admin. Quyết định của Admin là cuối cùng trên nền tảng.

**Tiêu chí nghiệm thu:**

- [ ] **AC-TCH-08.1:** Quá 48 giờ không khiếu nại được.
- [ ] **AC-TCH-08.2:** Buổi đang tranh chấp không vào khoản học phí khi chốt tháng.
- [ ] **AC-TCH-08.3:** Manager chỉ xem được bản ghi của tranh chấp được giao; mỗi lần xem được ghi nhật ký.
- [ ] **AC-TCH-08.4:** Không có thao tác hoàn tiền; giao diện nói rõ tiền do hai bên tự xử lý.
- [ ] **AC-TCH-08.5:** Quyết định thay đổi số tiền đã chốt thì tạo điều chỉnh theo UC-TUI-05.

## UC-TCH-09: Tạm nghỉ, tiếp tục và kết thúc lớp

**Tác nhân:** Gia sư, Phụ huynh.

**Quy tắc:** BR-601, BR-611, BR-615, BR-509, BR-511, BR-613.

**Luồng chính:**

1. Một bên chọn tạm nghỉ hoặc kết thúc lớp, kèm lý do. Bên kia được thông báo.
2. Hệ thống hủy các buổi tương lai; các buổi này không tính là hủy muộn.
3. Khi kết thúc: hội thoại chuyển sang chỉ đọc và liên hệ không còn hiển thị.
4. Lớp tạm nghỉ có thể tiếp tục khi một bên chọn tiếp tục và bên kia đồng ý; hệ thống sinh lại buổi.

**Tiêu chí nghiệm thu:**

- [ ] **AC-TCH-09.1:** Phụ huynh tự kết thúc được lớp của con mà không cần gia sư đồng ý, và ngược lại.
- [ ] **AC-TCH-09.2:** Lớp đã kết thúc không mở lại được; hai bên phải kết nối lại.
- [ ] **AC-TCH-09.3:** Lịch sử học tập vẫn còn sau khi kết thúc.
- [ ] **AC-TCH-09.4:** Buổi đã diễn ra và khoản học phí vẫn được xử lý bình thường.
- [ ] **AC-TCH-09.5:** Học sinh không thực hiện được các thao tác này.

## UC-TCH-10: Đổi học phí

**Tác nhân:** Gia sư, Phụ huynh.

**Quy tắc:** BR-602, BR-804, BR-810.

**Luồng chính:**

1. Một bên đề nghị giá mới và ngày áp dụng.
2. Bên kia đồng ý hoặc từ chối.
3. Nếu đồng ý, các buổi chưa diễn ra từ ngày áp dụng dùng giá mới.

**Tiêu chí nghiệm thu:**

- [ ] **AC-TCH-10.1:** Một bên không tự đổi được giá.
- [ ] **AC-TCH-10.2:** Buổi đã qua giữ nguyên giá.
- [ ] **AC-TCH-10.3:** Lịch sử giá được lưu, gồm người đề nghị và người đồng ý.
