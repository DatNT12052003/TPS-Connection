# Use case: Xác minh gia sư

Phân hệ này quyết định gia sư nào được hiển thị công khai và được kết nối. Vòng đời chi tiết nằm ở [máy trạng thái](../state-machines.md#2-hồ-sơ-xác-minh-gia-sư).

## UC-VER-01: Nộp hồ sơ xác minh

**Tác nhân:** Gia sư.

**Quy tắc:** BR-201, BR-202, BR-206, NFR-S07, NFR-F08.

**Điều kiện:** Đã xác thực email; hồ sơ gia sư ở `INCOMPLETE`.

**Luồng chính:**

1. Gia sư chọn loại: sinh viên, giáo viên hoặc gia sư tự do.
2. Gia sư tải lên ảnh CCCD hai mặt và ảnh chân dung cầm CCCD.
3. Nếu chọn sinh viên, gia sư tải thêm thẻ sinh viên.
4. Hệ thống lưu vào kho riêng cho giấy tờ, chuyển sang `PENDING_REVIEW` và báo thời hạn 2 ngày làm việc.

**Ngoại lệ:**

- Thiếu giấy tờ bắt buộc hoặc tệp không hợp lệ: không cho nộp và chỉ rõ tệp có vấn đề.

**Tiêu chí nghiệm thu:**

- [ ] **AC-VER-01.1:** Sinh viên không nộp được nếu thiếu thẻ sinh viên; loại khác không bị yêu cầu thẻ.
- [ ] **AC-VER-01.2:** Tệp lớn hơn 10 MB hoặc không phải ảnh thật bị từ chối, kể cả khi đổi đuôi tệp.
- [ ] **AC-VER-01.3:** Giấy tờ nằm ở bucket riêng; URL công khai trực tiếp không mở được.
- [ ] **AC-VER-01.4:** Gia sư thấy trạng thái hiện tại và thời hạn dự kiến.
- [ ] **AC-VER-01.5:** Khi chưa `VERIFIED`, gia sư lưu được bản nháp bài đăng; đăng bài, xem bài tìm gia sư, gửi hoặc nhận yêu cầu đều bị từ chối ở API.
- [ ] **AC-VER-01.6:** Mọi loại gia sư đều không nộp được nếu thiếu CCCD hai mặt hoặc ảnh chân dung cầm CCCD.

## UC-VER-02: Duyệt hồ sơ

**Tác nhân:** Manager.

**Quy tắc:** BR-204, BR-207, BR-215, BR-216, BR-217, BR-1206, NFR-O05.

**Luồng chính:**

1. Manager mở hàng chờ, sắp xếp theo hồ sơ nộp sớm nhất, và nhận một hồ sơ để xử lý.
2. Hệ thống hiện giấy tờ qua URL ký 5 phút và ghi nhật ký lần xem.
3. Manager đối chiếu CCCD với ảnh chân dung và thông tin hồ sơ.
4. Manager kiểm tra gia sư từ 18 tuổi trở lên.
5. Manager nhập số CCCD. Hệ thống kiểm tra trùng và không lưu số gốc.
6. Manager duyệt. Hệ thống chuyển sang `VERIFIED`, hiển thị hồ sơ công khai, hẹn xóa ảnh sau 30 ngày và thông báo cho gia sư.

**Ngoại lệ:**

- Manager khác đang xử lý hồ sơ đó: không nhận được.
- Quá 2 ngày làm việc: hồ sơ hiện trong danh sách quá hạn, không tự động duyệt.
- Chưa đủ 18 tuổi: Manager từ chối theo UC-VER-03, nêu lý do chưa đủ tuổi.
- CCCD đã dùng cho tài khoản khác: không duyệt được và chuyển Admin xem xét.

**Tiêu chí nghiệm thu:**

- [ ] **AC-VER-02.1:** Chỉ Manager đang xử lý hồ sơ mới mở được giấy tờ; Manager khác bị từ chối.
- [ ] **AC-VER-02.2:** Mỗi lần xem giấy tờ đều có bản ghi nhật ký.
- [ ] **AC-VER-02.3:** URL giấy tờ hết hiệu lực sau 5 phút.
- [ ] **AC-VER-02.4:** Sau khi duyệt, gia sư xuất hiện trong tìm kiếm và đăng được bài.
- [ ] **AC-VER-02.5:** Không có cơ chế tự duyệt khi quá hạn; hàng chờ hiện đúng số hồ sơ quá hạn.
- [ ] **AC-VER-02.6:** Hai Manager cùng nhận một hồ sơ thì chỉ một người thành công.
- [ ] **AC-VER-02.7:** Không duyệt được nếu chưa nhập số CCCD.
- [ ] **AC-VER-02.8:** Số CCCD gốc không có trong cơ sở dữ liệu, log hay phản hồi API; chỉ có giá trị băm có khóa, và khóa nằm ngoài cơ sở dữ liệu.
- [ ] **AC-VER-02.9:** CCCD đã dùng cho tài khoản khác thì không duyệt được; gia sư xác minh lại bằng đúng CCCD của mình thì không bị coi là trùng.
- [ ] **AC-VER-02.10:** Khi trùng CCCD, Manager chỉ biết là có trùng; chỉ Admin thấy tài khoản bị trùng, và lần xem được ghi nhật ký.

## UC-VER-03: Từ chối và nộp lại

**Tác nhân:** Manager, Gia sư.

**Quy tắc:** BR-205, BR-208.

**Luồng chính:**

1. Manager chọn từ chối và nhập lý do.
2. Hệ thống chuyển sang `REJECTED`, thông báo lý do và hẹn xóa ảnh sau 30 ngày.
3. Gia sư tải giấy tờ mới và nộp lại.
4. Hệ thống chuyển sang `PENDING_REVIEW` và tính lại thời hạn 2 ngày làm việc.

**Tiêu chí nghiệm thu:**

- [ ] **AC-VER-03.1:** Không từ chối được nếu thiếu lý do.
- [ ] **AC-VER-03.2:** Gia sư thấy lý do từ chối cả trong app và trong email.
- [ ] **AC-VER-03.3:** Không giới hạn số lần nộp lại.
- [ ] **AC-VER-03.4:** Ảnh của hồ sơ bị từ chối được xóa sau 30 ngày nếu gia sư không nộp lại.

## UC-VER-04: Khiếu nại kết quả xác minh

**Tác nhân:** Gia sư, Admin.

**Quy tắc:** BR-1202, C1.

**Luồng chính:**

1. Gia sư gửi khiếu nại kèm lý do khi hồ sơ bị từ chối.
2. Admin mở hồ sơ. Hệ thống ghi nhật ký lần xem.
3. Admin giữ quyết định từ chối hoặc chấp nhận khiếu nại, kèm lý do.
4. Nếu chấp nhận, hồ sơ chuyển sang `VERIFIED`.

**Ngoại lệ:**

- Ảnh đã bị xóa sau 30 ngày: Admin chỉ thấy kết quả và lý do cũ; gia sư phải nộp lại.

**Tiêu chí nghiệm thu:**

- [ ] **AC-VER-04.1:** Admin chỉ mở được giấy tờ khi có khiếu nại đang xử lý.
- [ ] **AC-VER-04.2:** Hệ thống không cho chuyển sang `VERIFIED` khi ảnh đã bị xóa.
- [ ] **AC-VER-04.3:** Quyết định được thông báo cho gia sư và lưu lịch sử.

## UC-VER-05: Xác minh lại khi đổi thông tin

**Tác nhân:** Gia sư, Hệ thống.

**Quy tắc:** BR-209.

**Luồng chính:**

1. Gia sư đổi họ tên hoặc nộp CCCD khác.
2. Hệ thống báo trước rằng hồ sơ sẽ tạm ẩn, và yêu cầu xác nhận.
3. Hệ thống chuyển sang `PENDING_REVIEW` và ẩn hồ sơ, bài đăng khỏi công khai.
4. Manager duyệt theo UC-VER-02.

**Tiêu chí nghiệm thu:**

- [ ] **AC-VER-05.1:** Đổi các trường khác như giới thiệu, học phí không kích hoạt xác minh lại.
- [ ] **AC-VER-05.2:** Khi chờ xác minh lại, hồ sơ không hiện trong tìm kiếm và không nhận được yêu cầu mới.
- [ ] **AC-VER-05.3:** Các lớp đang học vẫn hoạt động bình thường.
- [ ] **AC-VER-05.4:** Duyệt xong, hồ sơ và các bài đăng trước đó tự hiện lại.

## UC-VER-06: Nhận huy hiệu bằng cấp

**Tác nhân:** Gia sư, Manager.

**Quy tắc:** BR-203, BR-210.

**Luồng chính:**

1. Gia sư đã xác minh tải lên bằng cấp hoặc chứng chỉ.
2. Manager duyệt hoặc từ chối kèm lý do.
3. Nếu duyệt, hồ sơ công khai có huy hiệu.

**Tiêu chí nghiệm thu:**

- [ ] **AC-VER-06.1:** Không có huy hiệu vẫn được `VERIFIED` và hoạt động đầy đủ.
- [ ] **AC-VER-06.2:** Từ chối huy hiệu không ảnh hưởng đến trạng thái xác minh danh tính.
- [ ] **AC-VER-06.3:** Giao diện phân biệt được bằng cấp đã xác minh và bằng cấp gia sư tự khai.

## UC-VER-07: Xác nhận lại nhãn sinh viên

**Tác nhân:** Gia sư, Manager, Hệ thống.

**Quy tắc:** BR-211, BR-212, BR-213, BR-214.

**Luồng chính:**

1. Nhãn có hiệu lực 1 năm. Trước khi hết hạn 30 ngày, hệ thống nhắc gia sư (`ĐX`).
2. Gia sư tải thẻ sinh viên còn hiệu lực.
3. Manager duyệt. Nhãn được gia hạn thêm 1 năm và ảnh được hẹn xóa sau 30 ngày.

**Luồng thay thế:**

- Gia sư không còn là sinh viên, hoặc không nộp trước khi hết hạn: hệ thống gỡ nhãn sinh viên và gia sư vẫn ở `VERIFIED`.

**Tiêu chí nghiệm thu:**

- [ ] **AC-VER-07.1:** Hết hạn nhãn không làm đổi trạng thái xác minh và không ẩn hồ sơ.
- [ ] **AC-VER-07.2:** Khi nhãn đã gỡ, hồ sơ công khai không còn hiện là sinh viên.
- [ ] **AC-VER-07.3:** Job gỡ nhãn chạy lại không tạo kết quả trùng.

## UC-VER-08: Thu hồi xác minh

**Tác nhân:** Admin.

**Quy tắc:** BR-1204, state-machines mục 2.

**Luồng chính:**

1. Admin chọn thu hồi và nhập lý do, ví dụ phát hiện giấy tờ giả.
2. Hệ thống chuyển sang `REVOKED`, ẩn hồ sơ và bài đăng, thông báo cho gia sư.
3. Admin quyết định xử lý các lớp đang học theo từng trường hợp.

**Tiêu chí nghiệm thu:**

- [ ] **AC-VER-08.1:** Chỉ Admin thực hiện được; bắt buộc có lý do và ghi nhật ký.
- [ ] **AC-VER-08.2:** Hồ sơ biến mất khỏi tìm kiếm ngay; yêu cầu kết nối đang mở tự hủy và báo cho phụ huynh.
- [ ] **AC-VER-08.3:** Phụ huynh của các lớp đang học được thông báo.

## UC-VER-09: Xóa ảnh giấy tờ theo lịch

**Tác nhân:** Hệ thống.

**Quy tắc:** BR-207, BR-208, BR-214, NFR-P05.

**Luồng chính:**

1. Worker chạy mỗi ngày một lần, tìm ảnh đã quá 30 ngày kể từ lần duyệt hoặc từ chối gần nhất.
2. Worker xóa ảnh khỏi kho và giữ lại kết quả, người duyệt, thời điểm.

**Ngoại lệ:**

- Có khiếu nại hoặc báo cáo đang mở liên quan đến hồ sơ: chưa xóa cho đến khi xử lý xong (`ĐX`).

**Tiêu chí nghiệm thu:**

- [ ] **AC-VER-09.1:** Ảnh dưới 30 ngày không bị xóa; ảnh quá 30 ngày không còn trong kho.
- [ ] **AC-VER-09.2:** Sau khi xóa ảnh, gia sư vẫn `VERIFIED` và lịch sử duyệt vẫn còn.
- [ ] **AC-VER-09.3:** Job chạy lại không gây lỗi; lỗi được ghi cảnh báo.
- [ ] **AC-VER-09.4:** Thẻ sinh viên và bằng cấp cũng được xóa theo cùng quy tắc.
