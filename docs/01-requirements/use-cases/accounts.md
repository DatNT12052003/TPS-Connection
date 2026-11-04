# Use case: Tài khoản

Phân hệ này gồm đăng ký, đăng nhập, hồ sơ học sinh, xóa tài khoản và các thao tác tài khoản của Admin.

Các thời hạn của liên kết trong tài liệu này là đề xuất (`ĐX`).

## UC-ACC-01: Đăng ký

**Tác nhân:** Khách.

**Quy tắc:** BR-101, BR-102, NFR-S02, NFR-P04, NFR-U04.

**Luồng chính:**

1. Khách chọn vai trò gia sư hoặc phụ huynh.
2. Khách nhập email, mật khẩu, tên hiển thị.
3. Khách đồng ý điều khoản sử dụng và chính sách quyền riêng tư.
4. Hệ thống tạo tài khoản ở trạng thái chưa xác thực và gửi liên kết xác thực.

**Ngoại lệ:**

- Email đã tồn tại: hệ thống hiện cùng thông báo như khi đăng ký thành công và gửi email báo cho chủ email, để không lộ email nào đã có tài khoản.
- Mật khẩu không đạt yêu cầu: báo lỗi ngay tại trường mật khẩu.

**Tiêu chí nghiệm thu:**

- [ ] **AC-ACC-01.1:** Chỉ chọn được vai trò gia sư hoặc phụ huynh; gửi trực tiếp vai trò khác lên API bị từ chối.
- [ ] **AC-ACC-01.2:** Không thể đăng ký nếu chưa đồng ý điều khoản; hệ thống lưu phiên bản điều khoản và thời điểm đồng ý.
- [ ] **AC-ACC-01.3:** Mật khẩu được lưu dạng băm Argon2id, không bao giờ xuất hiện trong log hay phản hồi API.
- [ ] **AC-ACC-01.4:** Phản hồi khi đăng ký bằng email đã tồn tại và email mới là giống nhau.
- [ ] **AC-ACC-01.5:** Giao diện và email đăng ký có cả tiếng Việt và tiếng Anh.

## UC-ACC-02: Xác thực email

**Tác nhân:** Người vừa đăng ký.

**Quy tắc:** BR-101.

**Luồng chính:**

1. Người dùng mở liên kết trong email.
2. Hệ thống đánh dấu email đã xác thực.
3. Người dùng được chuyển tới bước tiếp theo theo vai trò.

**Ngoại lệ:**

- Liên kết hết hạn (24 giờ, `ĐX`) hoặc đã dùng: hệ thống báo lỗi và cho gửi lại.

**Tiêu chí nghiệm thu:**

- [ ] **AC-ACC-02.1:** Liên kết chỉ dùng được một lần và hết hạn sau 24 giờ.
- [ ] **AC-ACC-02.2:** Khi chưa xác thực, người dùng đăng nhập được nhưng không thực hiện được thao tác nghiệp vụ nào, và luôn thấy nhắc xác thực.
- [ ] **AC-ACC-02.3:** Gửi lại liên kết làm liên kết cũ mất hiệu lực và bị giới hạn tần suất.

## UC-ACC-03: Đăng nhập và đăng xuất

**Tác nhân:** Người dùng đã có tài khoản.

**Quy tắc:** NFR-S03, NFR-S04, NFR-S05.

**Luồng chính:**

1. Người dùng nhập email và mật khẩu.
2. Hệ thống cấp phiên đăng nhập.
3. Người dùng được chuyển tới trang chính theo vai trò.
4. Khi đăng xuất, hệ thống thu hồi phiên hiện tại.

**Ngoại lệ:**

- Sai thông tin: thông báo chung, không nói rõ sai email hay sai mật khẩu.
- Sai quá 5 lần trong 15 phút: tạm chặn đăng nhập của tài khoản đó.
- Tài khoản bị khóa: báo tài khoản bị khóa và cách liên hệ.

**Tiêu chí nghiệm thu:**

- [ ] **AC-ACC-03.1:** Thông báo khi sai email và sai mật khẩu là giống nhau.
- [ ] **AC-ACC-03.2:** Lần thử thứ 6 trong 15 phút bị từ chối kể cả khi mật khẩu đúng.
- [ ] **AC-ACC-03.3:** Trên Web, token nằm trong cookie `httpOnly`, JavaScript không đọc được.
- [ ] **AC-ACC-03.4:** Refresh token xoay vòng; dùng lại token cũ sẽ thu hồi cả chuỗi phiên.
- [ ] **AC-ACC-03.5:** Sau khi đăng xuất, refresh token của phiên đó không dùng được nữa.
- [ ] **AC-ACC-03.6:** Tài khoản bị khóa mất quyền REST trong tối đa 15 phút và bị ngắt socket ngay.

## UC-ACC-04: Quên và đặt lại mật khẩu

**Tác nhân:** Người dùng không đăng nhập được.

**Quy tắc:** NFR-S05.

**Luồng chính:**

1. Người dùng nhập email.
2. Hệ thống luôn báo đã gửi hướng dẫn nếu email tồn tại.
3. Người dùng mở liên kết và đặt mật khẩu mới.
4. Hệ thống thu hồi mọi phiên đăng nhập của tài khoản và gửi email thông báo đã đổi mật khẩu.

**Ngoại lệ:**

- Liên kết hết hạn (30 phút, `ĐX`) hoặc đã dùng: hệ thống báo lỗi và cho yêu cầu lại.

**Tiêu chí nghiệm thu:**

- [ ] **AC-ACC-04.1:** Phản hồi giống nhau dù email có tồn tại hay không.
- [ ] **AC-ACC-04.2:** Liên kết dùng một lần, hết hạn sau 30 phút, tối đa 3 yêu cầu mỗi giờ.
- [ ] **AC-ACC-04.3:** Sau khi đặt lại, mọi phiên cũ đều bị thu hồi.

## UC-ACC-05: Quản lý thông tin cá nhân

**Tác nhân:** Người dùng đã đăng nhập.

**Quy tắc:** BR-108, BR-209, NFR-F08, NFR-U04.

**Luồng chính:**

1. Người dùng sửa tên hiển thị, ảnh đại diện, số điện thoại, ngôn ngữ.
2. Hệ thống lưu và áp dụng ngay.

**Luồng thay thế:**

- Đổi mật khẩu: phải nhập mật khẩu hiện tại; các phiên khác bị thu hồi.
- Đổi email: phải nhập mật khẩu và xác thực email mới; email cũ được báo tin (`ĐX`).

**Tiêu chí nghiệm thu:**

- [ ] **AC-ACC-05.1:** Vai trò không đổi được qua màn hình này hay qua API.
- [ ] **AC-ACC-05.2:** Email cũ vẫn dùng để đăng nhập cho đến khi email mới được xác thực.
- [ ] **AC-ACC-05.3:** Ảnh đại diện quá 5 MB hoặc không phải ảnh thật bị từ chối, kể cả khi đổi đuôi tệp.
- [ ] **AC-ACC-05.4:** Số điện thoại luôn có nhãn tự khai khi hiển thị.
- [ ] **AC-ACC-05.5:** Email thông báo được gửi theo ngôn ngữ người dùng đã chọn.

## UC-ACC-06: Tạo và sửa hồ sơ học sinh

**Tác nhân:** Phụ huynh.

**Quy tắc:** BR-104, BR-402, NFR-P01.

**Luồng chính:**

1. Phụ huynh nhập tên gọi và lớp của con; các trường khác là tùy chọn.
2. Hệ thống tạo hồ sơ, gắn với đúng một phụ huynh là người đang đăng nhập.
3. Phụ huynh có thể thêm nhiều hồ sơ cho nhiều con.

**Ngoại lệ:**

- Học sinh đang có lớp: không xóa được hồ sơ cho đến khi lớp kết thúc (`ĐX`).

**Tiêu chí nghiệm thu:**

- [ ] **AC-ACC-06.1:** Tìm kiếm gia sư không yêu cầu có hồ sơ học sinh; gửi yêu cầu kết nối thì có.
- [ ] **AC-ACC-06.2:** Chỉ tên gọi và lớp là bắt buộc; không có trường địa chỉ nhà chính xác.
- [ ] **AC-ACC-06.3:** Phụ huynh A đọc hoặc sửa hồ sơ con của phụ huynh B bằng cách đổi ID đều bị từ chối.
- [ ] **AC-ACC-06.4:** Không có API nào gán thêm phụ huynh thứ hai cho một học sinh.

## UC-ACC-07: Mời học sinh tạo tài khoản

**Tác nhân:** Phụ huynh, Học sinh.

**Quy tắc:** BR-106, BR-107, BR-109.

**Điều kiện:** Chỉ khả dụng khi tính năng được bật. Tính năng tắt trên production cho đến khi có ngưỡng tuổi đã qua tư vấn pháp lý.

**Luồng chính:**

1. Phụ huynh nhập email của con.
2. Hệ thống gửi lời mời, có hiệu lực 7 ngày (`ĐX`).
3. Học sinh mở lời mời, đặt mật khẩu.
4. Hệ thống tạo tài khoản học sinh, liên kết với hồ sơ đó và báo cho phụ huynh.

**Luồng thay thế:**

- Học sinh không có email riêng: không tạo tài khoản, phụ huynh xem thay.
- Phụ huynh thu hồi tài khoản của con: tài khoản bị khóa, hồ sơ và dữ liệu học tập vẫn còn (`ĐX`).

**Tiêu chí nghiệm thu:**

- [ ] **AC-ACC-07.1:** Khi tính năng tắt, cả giao diện và API đều không cho mời.
- [ ] **AC-ACC-07.2:** Học sinh không tự đăng ký được nếu không có lời mời.
- [ ] **AC-ACC-07.3:** Tài khoản học sinh chỉ đọc được dữ liệu của chính mình; mọi API ghi nghiệp vụ và API chat đều từ chối.
- [ ] **AC-ACC-07.4:** Học sinh không đọc được dữ liệu của anh chị em cùng phụ huynh.
- [ ] **AC-ACC-07.5:** Lời mời hết hạn hoặc đã dùng không dùng lại được.

## UC-ACC-08: Xóa tài khoản

**Tác nhân:** Gia sư, Phụ huynh. Worker xử lý xóa hẳn.

**Quy tắc:** BR-1301 đến BR-1306, NFR-P05, NFR-P06.

**Luồng chính:**

1. Người dùng yêu cầu xóa và nhập mật khẩu.
2. Hệ thống kiểm tra không còn lớp đang học, rồi hiện rõ dữ liệu nào sẽ bị xóa và thời hạn 6 tháng.
3. Hệ thống ghi `deleted_at`, ẩn tài khoản ngay và thu hồi mọi phiên.
4. Sau 6 tháng, Worker xóa hẳn dữ liệu cá nhân và ẩn danh bản ghi lớp, đánh giá.

**Luồng thay thế:**

- Phụ huynh xóa tài khoản: hồ sơ và tài khoản học sinh được xử lý cùng lúc.
- Khôi phục trong 6 tháng: chủ tài khoản yêu cầu, Admin thực hiện, có ghi nhật ký.

**Ngoại lệ:**

- Còn lớp đang học: từ chối và liệt kê các lớp cần kết thúc.
- Có báo cáo hoặc tranh chấp đang mở: tài khoản vẫn ẩn, nhưng chưa xóa hẳn dữ liệu liên quan.

**Tiêu chí nghiệm thu:**

- [ ] **AC-ACC-08.1:** Tài khoản đã xóa không đăng nhập được và biến mất khỏi tìm kiếm ngay.
- [ ] **AC-ACC-08.2:** Không xóa được khi còn lớp đang học.
- [ ] **AC-ACC-08.3:** Worker không xử lý tài khoản dưới 6 tháng, và chạy lại không gây lỗi hoặc xử lý trùng.
- [ ] **AC-ACC-08.4:** Sau khi xử lý, không còn email, số điện thoại, họ tên trong các bảng dữ liệu đang chạy; bản ghi lớp không còn nhận dạng được người đó.
- [ ] **AC-ACC-08.5:** Các yêu cầu kết nối đang mở của tài khoản bị xóa được tự hủy và thông báo cho bên kia.

## UC-ACC-09: Thao tác tài khoản của Admin

**Tác nhân:** Admin. Manager chỉ tham gia ở tạm khóa khẩn cấp.

**Quy tắc:** BR-103, BR-105, BR-1204, BR-1205, BR-1206.

**Luồng chính:**

1. Admin tìm người dùng.
2. Admin thực hiện một trong các thao tác: tạo Manager hoặc Admin, khóa hoặc mở khóa tài khoản, đổi phụ huynh quản lý, khôi phục tài khoản.
3. Hệ thống yêu cầu lý do, thực hiện và ghi nhật ký.

**Luồng thay thế:**

- Manager tạm khóa khẩn cấp: chỉ khi đang xử lý báo cáo liên quan an toàn trẻ em. Hệ thống tạo việc cho Admin quyết định.

**Tiêu chí nghiệm thu:**

- [ ] **AC-ACC-09.1:** Mọi thao tác đều bắt buộc có lý do và có bản ghi nhật ký gồm người làm, đối tượng, thời điểm.
- [ ] **AC-ACC-09.2:** Manager gọi API tạo tài khoản, phân quyền hoặc khóa thường đều bị từ chối.
- [ ] **AC-ACC-09.3:** Manager chỉ tạm khóa được khi đang xử lý đúng báo cáo an toàn trẻ em được giao.
- [ ] **AC-ACC-09.4:** Admin không tự khóa hoặc tự hạ quyền chính mình, và hệ thống luôn còn ít nhất một Admin.
- [ ] **AC-ACC-09.5:** Sau khi đổi phụ huynh quản lý, phụ huynh cũ mất quyền xem ngay và phụ huynh mới có quyền xem.
