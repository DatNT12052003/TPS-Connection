# Quy tắc nghiệp vụ

Tài liệu này biến các quyết định trong [decision-log.md](../00-product/decision-log.md) thành quy tắc có mã số. Thiết kế, code và test đều tham chiếu theo mã `BR-xxx`.

**Cột Nguồn:**

- `D..`, `C..`, `Q..`, `N..`: đã chốt trong nhật ký quyết định.
- `PRD §..`: PRD gợi ý và không có quyết định nào trái lại.
- `ĐX`: đề xuất để lấp khoảng trống, chưa được chủ sản phẩm xác nhận.

## Phạm vi MVP

| Mã | Quy tắc | Nguồn |
| --- | --- | --- |
| BR-001 | Bản đầu gồm Web và API. Mobile là bản phát hành kế tiếp. | D2 |
| BR-002 | MVP chỉ phục vụ học sinh có phụ huynh. Dữ liệu phải cho phép mở cho người học trưởng thành sau này. | D3 |
| BR-003 | MVP chỉ mở lớp 1-1. Dữ liệu phải hỗ trợ lớp nhiều học sinh. | D7 |
| BR-004 | Ngoài MVP: thanh toán trực tuyến, bài tập, đánh giá, chat của học sinh. Bài tập và đánh giá làm ngay sau MVP. | D6, D10, C7 |
| BR-005 | Yêu thích gia sư chỉ làm nếu kịp tiến độ. | D10 |

## Tài khoản

| Mã | Quy tắc | Nguồn |
| --- | --- | --- |
| BR-101 | Đăng ký bằng email và phải xác thực email. Tạm bỏ đăng ký bằng số điện thoại. | C12 |
| BR-102 | Người dùng tự đăng ký chọn một vai trò: gia sư hoặc phụ huynh. | PRD §2, §3.1 |
| BR-103 | Admin tạo tài khoản Manager và Admin. Không tự đăng ký được hai vai trò này. | ĐX |
| BR-104 | Phụ huynh tạo hồ sơ học sinh. Mỗi học sinh chỉ có đúng một phụ huynh quản lý. | C9 |
| BR-105 | Chỉ Admin được đổi phụ huynh quản lý, theo yêu cầu và có ghi nhật ký. | C9 |
| BR-106 | Phụ huynh mời học sinh tạo tài khoản. Tài khoản học sinh chỉ được xem. | D4 |
| BR-107 | Tính năng tài khoản học sinh không được bật trên production cho đến khi có ngưỡng tuổi đã qua tư vấn pháp lý. Trước đó, phụ huynh xem thay. | D4, ĐX |
| BR-108 | Số điện thoại là thông tin tự khai và phải gắn nhãn tự khai khi hiển thị. | C12 |
| BR-109 | Học sinh không có email riêng thì không có tài khoản; phụ huynh xem thay. | Q2 |

## Xác minh gia sư

| Mã | Quy tắc | Nguồn |
| --- | --- | --- |
| BR-201 | Mọi gia sư nộp CCCD và ảnh chân dung cầm CCCD để xác minh danh tính. | C4, D5, N1 |
| BR-202 | Gia sư là sinh viên nộp thêm thẻ sinh viên. | C4 |
| BR-203 | Bằng cấp, chứng chỉ là tùy chọn và chỉ để nhận huy hiệu. | D5, C4 |
| BR-204 | Manager duyệt trong 2 ngày làm việc. Quá hạn không tự động duyệt. | C4, ĐX |
| BR-205 | Từ chối phải nêu lý do. Gia sư được nộp lại. | C4 |
| BR-206 | Gia sư chưa xác minh được tạo hồ sơ và bản nháp bài đăng. Họ không được hiển thị công khai, đăng bài, xem bài tìm gia sư, gửi hoặc nhận yêu cầu kết nối. | D5, C8, PRD §12 câu 9 |
| BR-207 | Ảnh giấy tờ bị xóa 30 ngày sau khi được duyệt. Hệ thống giữ kết quả xác minh. | C4 |
| BR-208 | Hồ sơ bị từ chối cũng xóa ảnh giấy tờ sau 30 ngày kể từ lần từ chối gần nhất, nếu gia sư không nộp lại. | ĐX |
| BR-209 | Đổi họ tên hoặc nộp CCCD khác thì phải xác minh lại. | ĐX |
| BR-210 | Giao diện phải tách rõ thông tin tự khai và thông tin đã xác minh. | PRD §3.14 |
| BR-211 | Xác minh danh tính không hết hạn. | Q5 |
| BR-212 | Nhãn sinh viên được xác nhận lại mỗi năm bằng thẻ sinh viên còn hiệu lực. | Q5 |
| BR-213 | Nếu không xác nhận lại, gia sư chỉ mất nhãn sinh viên và vẫn ở trạng thái đã xác minh. | ĐX |
| BR-214 | Thẻ sinh viên nộp lại và bằng cấp cũng bị xóa ảnh sau 30 ngày, tính từ lần duyệt hoặc từ chối gần nhất. | ĐX |
| BR-215 | Một CCCD chỉ dùng cho một tài khoản gia sư. Manager nhập số CCCD khi duyệt; hệ thống chỉ lưu giá trị băm có khóa, không lưu số gốc. | N2 |
| BR-216 | Nếu CCCD đã dùng cho tài khoản khác, Manager không duyệt được và chuyển Admin xem xét. | N2, ĐX (chuyển Admin) |
| BR-217 | Gia sư phải từ 18 tuổi. Manager kiểm tra trên CCCD và từ chối nếu chưa đủ tuổi. | N3 |
| BR-218 | Giá trị băm CCCD được xóa cùng tài khoản sau 6 tháng, trừ tài khoản bị khóa vì vi phạm thì giữ lại để chặn đăng ký lại. | ĐX, cần luật sư rà soát |

## Hiển thị công khai và tìm kiếm

| Mã | Quy tắc | Nguồn |
| --- | --- | --- |
| BR-301 | Khách xem được gia sư đã xác minh: tên hiển thị, môn, lớp, tỉnh, học phí, giới thiệu, kinh nghiệm, phương pháp dạy, ảnh đại diện. Không hiện trường, đơn vị công tác và thông tin liên hệ. | C8, Q1 |
| BR-302 | Khách xem được bài tuyển học sinh. | C8 |
| BR-303 | Bài tìm gia sư không công khai và không cho công cụ tìm kiếm đọc. Chỉ gia sư đã xác minh và đã đăng nhập mới thấy. | C8 |
| BR-304 | Bài tìm gia sư không hiển thị họ tên đầy đủ, trường học, địa chỉ nhà, số điện thoại của trẻ. | PRD §3.4 |
| BR-305 | Tìm kiếm lọc theo môn, lớp, học phí, hình thức và khu vực. Khu vực lọc theo tỉnh, xã; chưa lọc theo bán kính. | PRD §6.1, D11 |
| BR-306 | Trả phí không được làm sai lệch kết quả tìm kiếm mà không công khai. | PRD §5.8 |
| BR-307 | Bài đăng hiển thị ngay sau khi đăng. Manager xử lý khi có báo cáo. | ĐX, chờ N7 |
| BR-308 | Bài tìm gia sư tự đóng khi hai bên xác nhận hợp tác từ một đề nghị của bài đó. | ĐX |
| BR-309 | Gia sư tạm ngừng nhận học sinh vẫn có trang hồ sơ kèm nhãn, nhưng không nhận yêu cầu mới và không có trong kết quả tìm kiếm mặc định. | ĐX |

## Kết nối

Chi tiết chuyển trạng thái nằm ở [state-machines.md](state-machines.md#1-yêu-cầu-kết-nối).

| Mã | Quy tắc | Nguồn |
| --- | --- | --- |
| BR-401 | Hỗ trợ hai chiều: phụ huynh gửi yêu cầu cho gia sư, gia sư gửi đề nghị theo bài tìm gia sư. | PRD §3.6 |
| BR-402 | Phụ huynh chỉ cần tạo hồ sơ con khi gửi yêu cầu, không cần khi tìm kiếm. | C8 |
| BR-403 | Yêu cầu ở Chờ phản hồi quá 7 ngày thì tự hủy. | C3 |
| BR-404 | Yêu cầu ở Đang trao đổi quá 30 ngày thì tự hủy. Mốc này tính từ lúc yêu cầu được chấp nhận và không gia hạn khi có tin nhắn mới. Hệ thống nhắc trước 3 ngày. | C3, Q4, ĐX (số ngày nhắc) |
| BR-411 | Nếu gia sư đề nghị trao đổi thêm thay vì chấp nhận, mốc 30 ngày tính từ lúc đề nghị. | ĐX |
| BR-412 | Không gửi được yêu cầu nếu đã có lớp đang học với cùng gia sư, học sinh và môn. | ĐX |
| BR-413 | Hai bên đã chặn nhau thì không gửi được yêu cầu. Yêu cầu đang mở giữa họ tự hủy khi một bên chặn. | ĐX |
| BR-414 | Phụ huynh chọn một hồ sơ con khi đăng bài tìm gia sư. | ĐX |
| BR-405 | Yêu cầu đã hủy vẫn được gửi lại bằng một yêu cầu mới. | C3 |
| BR-406 | Không có hai yêu cầu đang mở cho cùng gia sư, học sinh và môn. | ĐX |
| BR-407 | Hợp tác chỉ được xác nhận khi cả hai bên cùng bấm xác nhận một bộ điều kiện: môn, lớp, hình thức, học phí mỗi buổi, lịch, ngày bắt đầu. | C3, D9, ĐX (nội dung bộ điều kiện) |
| BR-408 | Nếu một bên sửa bộ điều kiện, xác nhận của bên còn lại bị hủy và phải xác nhận lại. | ĐX |
| BR-409 | Khi xác nhận hợp tác, hệ thống tự tạo quan hệ dạy học và lớp từ bộ điều kiện đó. | D9 |
| BR-410 | Trong MVP, lớp chỉ được tạo từ kết nối trên nền tảng. | Giả định khi D9 còn mở |

## Trao đổi và liên hệ

| Mã | Quy tắc | Nguồn |
| --- | --- | --- |
| BR-501 | Chat mở khi gia sư chấp nhận yêu cầu. | D8 |
| BR-502 | Ở chiều ngược lại, chat mở khi phụ huynh chấp nhận đề nghị của gia sư. | ĐX |
| BR-503 | Chat cũng mở khi gia sư chọn đề nghị trao đổi thêm. | ĐX |
| BR-504 | Số điện thoại và email chỉ mở cho nhau khi hai bên đã xác nhận hợp tác. | D8, PRD §12 câu 8 |
| BR-505 | Chat trong MVP chỉ giữa gia sư và phụ huynh. Học sinh chưa chat. | C7 |
| BR-506 | Khi mở chat cho học sinh sau MVP: dưới 18 tuổi, phụ huynh phải bật và cùng ở trong hội thoại. | C7 |
| BR-507 | Người dùng có thể chặn và báo cáo người khác trong chat. | PRD §3.7 |
| BR-508 | Khi yêu cầu bị hủy, chat chuyển sang chỉ đọc. | ĐX |
| BR-509 | Sau khi lớp kết thúc, hai bên không còn thấy số điện thoại và email của nhau. | ĐX |
| BR-510 | Chat trong MVP gửi được văn bản và ảnh, chưa gửi được tệp khác. | Q6 |
| BR-511 | Mỗi yêu cầu kết nối có một hội thoại. Sau khi lớp kết thúc, hội thoại chuyển sang chỉ đọc. | ĐX |
| BR-512 | Không chặn được người đang có lớp với mình; phải kết thúc lớp trước. Việc báo cáo không bị ảnh hưởng. | ĐX, chờ N6 |

## Lớp, buổi học và điểm danh

Chi tiết chuyển trạng thái nằm ở [state-machines.md](state-machines.md#3-buổi-học).

| Mã | Quy tắc | Nguồn |
| --- | --- | --- |
| BR-601 | Lớp có trạng thái đang học, tạm nghỉ, đã kết thúc. Lịch sử vẫn được lưu sau khi lớp kết thúc. | PRD §3.8 |
| BR-602 | Gia sư được sửa lịch của từng buổi. Đổi học phí cần cả hai bên đồng ý và chỉ áp dụng cho các buổi sau đó. | ĐX |
| BR-603 | Gia sư hoặc phụ huynh báo hủy từ 2 tiếng trở lên trước giờ học được tính là hủy đúng hạn. Dưới 2 tiếng là hủy muộn. | C5 |
| BR-604 | Mọi trường hợp vắng và hủy đều không tính tiền trong MVP, kể cả hủy muộn và vắng không báo. | C5 |
| BR-605 | Hệ thống ghi rõ hủy muộn và vắng không báo để xem lại sau thử nghiệm. | C5 |
| BR-606 | Gia sư điểm danh sau buổi học. Trạng thái: đã học, học sinh vắng, gia sư vắng. | PRD §3.9 |
| BR-607 | Buổi học bù là một buổi mới, liên kết với buổi gốc, tính tiền như buổi thường khi đã học. | ĐX |
| BR-608 | Chỉ buổi đã học mới cần phụ huynh xác nhận. Sau 48 giờ không phản hồi, hệ thống tự chốt theo điểm danh của gia sư. | C5, ĐX (phạm vi) |
| BR-609 | Hệ thống nhắc phụ huynh một lần trước khi hết hạn 48 giờ. | C5 |
| BR-610 | Quá 7 ngày gia sư chưa điểm danh thì buổi được gắn cờ và không tính tiền cho đến khi điểm danh. | ĐX |
| BR-611 | Gia sư hoặc phụ huynh đều tự tạm nghỉ hoặc kết thúc được lớp, không cần bên kia đồng ý. Tiếp tục lớp tạm nghỉ cần cả hai bên đồng ý. | ĐX, chờ N4 |
| BR-612 | Gia sư sửa được điểm danh trong 48 giờ khi buổi chưa chốt. Hệ thống lưu lịch sử, báo phụ huynh và tính lại 48 giờ. | ĐX |
| BR-613 | Sau khi lớp kết thúc, gia sư có 7 ngày để điểm danh các buổi đã qua. | ĐX |
| BR-614 | Hệ thống sinh sẵn các buổi cho 8 tuần tới từ lịch định kỳ. | ĐX |
| BR-615 | Khi lớp tạm nghỉ hoặc kết thúc, các buổi tương lai bị hủy và không tính là hủy muộn. | ĐX |

## Tranh chấp buổi học

| Mã | Quy tắc | Nguồn |
| --- | --- | --- |
| BR-701 | Phụ huynh khiếu nại trong 48 giờ sau khi gia sư điểm danh. Buổi đó tạm chưa tính tiền. | C5 |
| BR-702 | Hai bên có 3 ngày tự thống nhất. Nếu không, Manager quyết định. | C5 |
| BR-703 | Manager chỉ sửa bản ghi, không hoàn tiền. | C5, D6 |
| BR-704 | Bên không đồng ý với Manager có thể khiếu nại lại lên Admin. Quyết định của Admin là cuối cùng trên nền tảng. | C1, ĐX (tính cuối cùng) |

## Học phí

Chi tiết chuyển trạng thái nằm ở [state-machines.md](state-machines.md#4-khoản-học-phí).

| Mã | Quy tắc | Nguồn |
| --- | --- | --- |
| BR-801 | Học phí tính theo buổi và thu một lần vào cuối tháng. | C6 |
| BR-802 | Nền tảng chỉ ghi nhận, không thu hoặc giữ tiền. | D6 |
| BR-803 | Mỗi học sinh có một khoản cho mỗi lớp mỗi tháng. Số tiền bằng tổng giá của các buổi đã chốt. | C6, ĐX (cách gộp) |
| BR-804 | Mỗi buổi lưu lại giá tại thời điểm dạy. Đổi học phí không làm thay đổi các buổi đã qua. | ĐX |
| BR-805 | Hệ thống chốt khoản lúc 00:00 ngày 1 hằng tháng, giờ Việt Nam, gồm các buổi đã chốt tính đến thời điểm đó. Buổi chưa chốt hoặc đang tranh chấp được chuyển sang tháng sau. | ĐX |
| BR-806 | Gia sư đánh dấu đã thanh toán. Phụ huynh được thông báo và xem được lịch sử. | PRD §3.12, ĐX (người đánh dấu) |
| BR-807 | Gia sư có thể bỏ đánh dấu nhầm. Thao tác này được ghi nhật ký. | ĐX |
| BR-808 | Khi quyết định tranh chấp làm đổi số tiền của khoản đã chốt, phần chênh lệch được ghi vào khoản tháng sau. Nếu lớp đã kết thúc, gia sư và phụ huynh tự xử lý ngoài nền tảng và bản ghi vẫn thể hiện đúng số buổi. | ĐX |
| BR-809 | Xuất được bảng tổng hợp học phí theo tháng. | PRD §3.12 |
| BR-810 | Hồ sơ gia sư và bộ điều kiện chỉ nhập giá mỗi buổi, kèm thời lượng buổi học. Không có giá theo giờ trong MVP. | Q3 |

## Theo dõi học tập

| Mã | Quy tắc | Nguồn |
| --- | --- | --- |
| BR-901 | Gia sư ghi nội dung sau buổi học, điểm và nhận xét cơ bản. | PRD §6.1 |
| BR-902 | Phụ huynh xem được lịch học và kết quả của con mình. Học sinh xem được của chính mình. | PRD §6.1, D4 |
| BR-903 | Biểu đồ điểm phải đi kèm phần giải thích bối cảnh của gia sư. | PRD §3.11 |
| BR-904 | Mỗi điểm lưu kèm thang điểm, mặc định là 10. Được nhập nhận xét mà không có điểm. | ĐX |
| BR-905 | Mọi ghi chú của gia sư về học sinh đều hiện cho phụ huynh; không có ghi chú riêng của gia sư. | ĐX |
| BR-906 | Sửa điểm hoặc nhận xét được lưu lịch sử và thông báo cho phụ huynh. | ĐX |

## Đánh giá (sau MVP)

| Mã | Quy tắc | Nguồn |
| --- | --- | --- |
| BR-1001 | Phụ huynh có quan hệ dạy học đã xác nhận từ 1 tháng trở lên mới được đánh giá. | C10 |
| BR-1002 | Mỗi quan hệ dạy học có một đánh giá và có thể cập nhật. | C10 |
| BR-1003 | Học sinh vị thành niên không đánh giá công khai. | C10 |
| BR-1004 | Gia sư có thể phản hồi đánh giá. Đánh giá có thể bị báo cáo. | PRD §3.13 |

## Thông báo và ngôn ngữ

| Mã | Quy tắc | Nguồn |
| --- | --- | --- |
| BR-1101 | Kênh trong MVP: trong app và email. Không dùng SMS. Thông báo đẩy có khi ra Mobile. | C12, D10 |
| BR-1102 | MVP có các thông báo: yêu cầu mới, yêu cầu được chấp nhận hoặc từ chối, tin nhắn mới, lịch sắp diễn ra, lịch đổi hoặc hủy, điểm và nhận xét mới, khoản học phí đến hạn. | PRD §3.7, D10 |
| BR-1103 | Giao diện, danh mục và email có tiếng Việt và tiếng Anh, do đội dự án dịch. | C11, PRD §12 câu 14 |
| BR-1104 | Nội dung người dùng viết giữ nguyên, không dịch. | C11 |
| BR-1105 | Nhắc lịch trước 24 giờ và trước 3 giờ, để người dùng còn kịp hủy đúng hạn. | ĐX |
| BR-1106 | Email tin nhắn chỉ gửi khi người nhận ngoại tuyến quá 15 phút, và gộp các tin chưa đọc thành một email. | ĐX |
| BR-1107 | Email không chứa nội dung tin nhắn, số điện thoại, địa chỉ; về trẻ chỉ có tên gọi. | ĐX |

## Kiểm duyệt và vi phạm

Quyền của từng vai trò nằm ở [roles-permissions.md](roles-permissions.md).

| Mã | Quy tắc | Nguồn |
| --- | --- | --- |
| BR-1201 | Người dùng báo cáo được tài khoản, bài đăng và tin nhắn. | PRD §3.14 |
| BR-1202 | Manager xử lý báo cáo. Admin xử lý khiếu nại lại. Lịch sử xử lý được lưu. | C1, PRD §3.14 |
| BR-1203 | Manager chỉ xem đoạn tin nhắn bị báo cáo: tin bị báo cáo cùng 10 tin liền trước và 10 tin liền sau. | C1, ĐX (số tin) |
| BR-1204 | Manager ẩn được nội dung vi phạm. Khóa tài khoản do Admin thực hiện. | C1, ĐX (ẩn nội dung) |
| BR-1205 | Khi báo cáo liên quan đến an toàn trẻ em, Manager được tạm khóa tài khoản ngay, rồi chuyển Admin quyết định. | ĐX |
| BR-1206 | Mỗi lần xem giấy tờ, tin nhắn bị báo cáo hoặc hồ sơ trẻ của Manager, Admin đều được ghi nhật ký. | C1 |
| BR-1207 | Báo cáo an toàn trẻ em được ưu tiên đầu hàng chờ và cảnh báo ngay. Quá 24 giờ chưa xử lý thì cảnh báo Admin. | ĐX |
| BR-1208 | Người bị báo cáo không biết ai đã báo cáo. | ĐX |

## Xóa dữ liệu

| Mã | Quy tắc | Nguồn |
| --- | --- | --- |
| BR-1301 | Khi xóa tài khoản: ghi thời điểm vào `deleted_at` và ẩn ngay. | C2 |
| BR-1302 | Sau 6 tháng: xóa hẳn dữ liệu cá nhân, ẩn danh bản ghi lớp và đánh giá. | C2 |
| BR-1303 | Phải kết thúc các lớp đang học trước khi xóa tài khoản. | ĐX |
| BR-1304 | Xóa tài khoản phụ huynh thì xóa luôn hồ sơ và tài khoản học sinh mà họ quản lý. | ĐX |
| BR-1305 | Trong 6 tháng, Admin có thể khôi phục tài khoản theo yêu cầu của chủ tài khoản. | ĐX |
| BR-1306 | Chưa xóa hẳn dữ liệu liên quan đến báo cáo hoặc tranh chấp đang mở. | ĐX |
