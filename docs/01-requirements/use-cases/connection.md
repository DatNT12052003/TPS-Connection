# Use case: Kết nối

Phân hệ này đưa gia sư và phụ huynh từ lúc gửi yêu cầu đến lúc hệ thống tạo lớp. Vòng đời chi tiết nằm ở [máy trạng thái](../state-machines.md#1-yêu-cầu-kết-nối).

**Tiền điều kiện chung:** gia sư ở `VERIFIED`, cả hai bên đã xác thực email, tài khoản không bị khóa và hai bên không chặn nhau.

## UC-CON-01: Phụ huynh gửi yêu cầu

**Tác nhân:** Phụ huynh.

**Quy tắc:** BR-401, BR-402, BR-406, BR-412, BR-413, NFR-S05.

**Luồng chính:**

1. Phụ huynh mở hồ sơ hoặc bài tuyển của gia sư và chọn gửi yêu cầu.
2. Khách được yêu cầu đăng nhập; phụ huynh chưa có hồ sơ con được yêu cầu tạo, rồi quay lại đúng trang đó.
3. Phụ huynh chọn con, môn, hình thức và viết lời nhắn.
4. Hệ thống tạo yêu cầu ở `PENDING` và thông báo cho gia sư.

**Ngoại lệ:**

- Đã có yêu cầu đang mở cho cùng gia sư, học sinh, môn: từ chối và dẫn tới yêu cầu đó.
- Đã có lớp đang học với cùng gia sư, học sinh, môn: từ chối.
- Gia sư đánh dấu tạm ngừng nhận học sinh, hoặc bài tuyển ở trạng thái đủ học sinh hay tạm dừng: không gửi được.

**Tiêu chí nghiệm thu:**

- [ ] **AC-CON-01.1:** Phụ huynh chỉ chọn được con do mình quản lý; gửi ID học sinh khác lên API bị từ chối.
- [ ] **AC-CON-01.2:** Gia sư thấy lớp, môn, mục tiêu, tên gọi và lời nhắn; không thấy họ tên đầy đủ, trường, địa chỉ, số điện thoại của trẻ.
- [ ] **AC-CON-01.3:** Yêu cầu trùng bị từ chối, kể cả khi hai yêu cầu được gửi cùng lúc.
- [ ] **AC-CON-01.4:** Quá 20 yêu cầu mỗi ngày bị giới hạn.
- [ ] **AC-CON-01.5:** Một học sinh có thể có yêu cầu với các gia sư khác nhau cho nhiều môn.

## UC-CON-02: Gia sư gửi đề nghị theo bài tìm gia sư

**Tác nhân:** Gia sư đã xác minh.

**Quy tắc:** BR-303, BR-304, BR-401, BR-406, BR-414.

**Điều kiện:** Bài tìm gia sư đang mở. Bài đăng gắn với một hồ sơ học sinh của phụ huynh.

**Luồng chính:**

1. Gia sư xem bài tìm gia sư và chọn gửi đề nghị.
2. Gia sư viết lời nhắn và học phí đề nghị.
3. Hệ thống tạo yêu cầu ở `PENDING`, phụ huynh là bên nhận, và thông báo.
4. Phụ huynh xem hồ sơ các gia sư đề nghị để so sánh.

**Tiêu chí nghiệm thu:**

- [ ] **AC-CON-02.1:** Gia sư chưa xác minh hoặc khách gọi API bài tìm gia sư bị từ chối.
- [ ] **AC-CON-02.2:** Bài tìm gia sư không chứa họ tên đầy đủ, trường, địa chỉ, số điện thoại trong phản hồi API.
- [ ] **AC-CON-02.3:** Bài đã đóng hoặc đã ẩn không nhận đề nghị mới.
- [ ] **AC-CON-02.4:** Phụ huynh thấy danh sách đề nghị trên bài của mình; gia sư khác không thấy.

## UC-CON-03: Xử lý yêu cầu đến

**Tác nhân:** Bên nhận.

**Quy tắc:** BR-501, BR-502, BR-503.

**Luồng chính:**

1. Bên nhận mở yêu cầu đang `PENDING`.
2. Bên nhận chấp nhận. Hệ thống chuyển sang `ACCEPTED`, mở chat và thông báo cho bên gửi.

**Luồng thay thế:**

- Gia sư là bên nhận chọn đề nghị trao đổi thêm: chuyển sang `DISCUSSING` và mở chat.
- Bên nhận từ chối, lý do là tùy chọn: chuyển sang `REJECTED` và thông báo.

**Tiêu chí nghiệm thu:**

- [ ] **AC-CON-03.1:** Chỉ bên nhận xử lý được; bên gửi gọi API chấp nhận bị từ chối.
- [ ] **AC-CON-03.2:** Trước khi chấp nhận hoặc đề nghị trao đổi, không tạo được hội thoại và không gửi được tin nhắn.
- [ ] **AC-CON-03.3:** Sau khi chấp nhận, hai bên chưa thấy số điện thoại và email của nhau.
- [ ] **AC-CON-03.4:** Yêu cầu đã xử lý hoặc đã hủy không xử lý lại được, kể cả khi hai thao tác xảy ra cùng lúc.

## UC-CON-04: Gửi và sửa bộ điều kiện

**Tác nhân:** Gia sư, Phụ huynh.

**Quy tắc:** BR-407, BR-408, BR-810, BR-003.

**Điều kiện:** Yêu cầu ở `ACCEPTED` hoặc `DISCUSSING`.

**Luồng chính:**

1. Một bên nhập bộ điều kiện: môn, lớp, hình thức, giá mỗi buổi, thời lượng, lịch, ngày bắt đầu.
2. Hệ thống lưu thành một phiên bản mới, chuyển yêu cầu sang `DISCUSSING` nếu đang `ACCEPTED`, và thông báo cho bên kia.
3. Bên kia đồng ý hoặc sửa lại.

**Ngoại lệ:**

- Một bên sửa sau khi bên kia đã xác nhận: xác nhận trước đó bị hủy và bên kia được thông báo.
- Lịch trùng với lớp khác của gia sư: cảnh báo nhưng vẫn cho lưu (`ĐX`).

**Tiêu chí nghiệm thu:**

- [ ] **AC-CON-04.1:** Thiếu bất kỳ trường bắt buộc nào thì không gửi được.
- [ ] **AC-CON-04.2:** Chỉ nhập được giá mỗi buổi, số nguyên VND; không có giá theo giờ.
- [ ] **AC-CON-04.3:** Sửa bộ điều kiện làm mất hiệu lực xác nhận của bên kia.
- [ ] **AC-CON-04.4:** Hai bên thấy được các phiên bản trước và ai đã sửa.
- [ ] **AC-CON-04.5:** Yêu cầu chỉ tạo được lớp 1-1 trong MVP.

## UC-CON-05: Xác nhận hợp tác

**Tác nhân:** Gia sư, Phụ huynh. Hệ thống tạo lớp.

**Quy tắc:** BR-407, BR-409, BR-410, BR-504, BR-810.

**Điều kiện:** Yêu cầu ở `DISCUSSING` và có bộ điều kiện.

**Luồng chính:**

1. Một bên bấm xác nhận phiên bản bộ điều kiện đang hiển thị.
2. Hệ thống ghi nhận và báo cho bên kia.
3. Bên kia bấm xác nhận đúng phiên bản đó.
4. Trong cùng một giao dịch, hệ thống chuyển sang `CONFIRMED`, tạo quan hệ dạy học, lớp và lịch học.
5. Hệ thống mở số điện thoại, email cho hai bên và thông báo lớp đã được tạo.

**Ngoại lệ:**

- Gia sư không còn `VERIFIED` ở thời điểm xác nhận: từ chối.
- Hai xác nhận trỏ tới hai phiên bản khác nhau: không tạo lớp, báo cần xem lại.
- Hết 30 ngày khi chỉ một bên đã xác nhận: yêu cầu vẫn tự hủy.

**Tiêu chí nghiệm thu:**

- [ ] **AC-CON-05.1:** Một bên xác nhận chưa tạo lớp và chưa mở liên hệ.
- [ ] **AC-CON-05.2:** Hai bên xác nhận cùng một phiên bản thì tạo đúng một lớp, kể cả khi bấm cùng lúc hoặc gửi lại.
- [ ] **AC-CON-05.3:** Lớp có đúng môn, giá, thời lượng, lịch, ngày bắt đầu từ bộ điều kiện.
- [ ] **AC-CON-05.4:** Nếu tạo lớp lỗi, trạng thái không đổi sang `CONFIRMED` và liên hệ không được mở.
- [ ] **AC-CON-05.5:** Sau khi xác nhận, hai bên mới thấy số điện thoại và email của nhau trong API.
- [ ] **AC-CON-05.6:** Gia sư thấy học sinh trong danh sách đang dạy; phụ huynh thấy lịch của con.
- [ ] **AC-CON-05.7:** Không có API để tạo lớp mà không qua kết nối.

## UC-CON-06: Hủy yêu cầu

**Tác nhân:** Gia sư, Phụ huynh.

**Quy tắc:** BR-405, BR-508.

**Luồng chính:**

1. Bên có quyền chọn hủy. Ở `PENDING`, chỉ bên gửi được hủy. Ở `ACCEPTED` và `DISCUSSING`, cả hai bên đều được hủy.
2. Hệ thống chuyển sang `CANCELLED`, chat chỉ đọc và thông báo cho bên kia.
3. Hai bên có thể gửi yêu cầu mới sau đó.

**Tiêu chí nghiệm thu:**

- [ ] **AC-CON-06.1:** Bên nhận không hủy được yêu cầu `PENDING`, mà phải từ chối.
- [ ] **AC-CON-06.2:** Yêu cầu `CONFIRMED` không hủy được; việc dừng học thực hiện ở lớp.
- [ ] **AC-CON-06.3:** Sau khi hủy, hai bên vẫn đọc được lịch sử chat nhưng không gửi tin mới được.
- [ ] **AC-CON-06.4:** Sau khi hủy, gửi yêu cầu mới không bị chặn bởi quy tắc trùng.

## UC-CON-07: Tự hủy theo thời hạn

**Tác nhân:** Hệ thống.

**Quy tắc:** BR-403, BR-404, BR-411, NFR-R04.

**Luồng chính:**

1. Worker quét các yêu cầu đang mở.
2. Yêu cầu `PENDING` quá 7 ngày được chuyển sang `CANCELLED`.
3. Vào ngày thứ 27 kể từ lúc rời `PENDING`, hệ thống nhắc hai bên.
4. Hết 30 ngày, yêu cầu ở `ACCEPTED` hoặc `DISCUSSING` được chuyển sang `CANCELLED`, và chat chỉ đọc.

**Tiêu chí nghiệm thu:**

- [ ] **AC-CON-07.1:** Yêu cầu `PENDING` chưa quá 7 ngày vẫn mở; quá 7 ngày thì bị hủy ở lần quét kế tiếp.
- [ ] **AC-CON-07.2:** Tin nhắn mới không làm gia hạn mốc 30 ngày.
- [ ] **AC-CON-07.3:** Mốc 30 ngày giống nhau cho cả hai đường: chấp nhận và đề nghị trao đổi thêm.
- [ ] **AC-CON-07.4:** Mỗi yêu cầu chỉ nhận một lần nhắc; job chạy lại không gửi trùng.
- [ ] **AC-CON-07.5:** Yêu cầu vừa được xác nhận trong lúc job đang chạy không bị hủy.

## UC-CON-08: Xem và quản lý yêu cầu

**Tác nhân:** Gia sư, Phụ huynh.

**Quy tắc:** PRD §2.2, NFR-F07.

**Luồng chính:**

1. Người dùng mở danh sách yêu cầu, chia theo đã gửi và đã nhận.
2. Người dùng lọc theo trạng thái và mở chi tiết.
3. Chi tiết hiện trạng thái, thời hạn còn lại, lịch sử chuyển trạng thái, lời nhắn và bộ điều kiện.

**Tiêu chí nghiệm thu:**

- [ ] **AC-CON-08.1:** Người dùng chỉ thấy yêu cầu mà mình là một bên; đổi ID sang yêu cầu khác bị từ chối.
- [ ] **AC-CON-08.2:** Danh sách phân trang, tối đa 50 bản ghi mỗi trang.
- [ ] **AC-CON-08.3:** Trạng thái rỗng có hướng dẫn bước tiếp theo.
- [ ] **AC-CON-08.4:** Hiển thị đúng tiếng Việt, tiếng Anh theo ngôn ngữ người dùng.
