# Yêu cầu phi chức năng

Tài liệu này đặt mục tiêu đo được cho PRD §10. **Mọi con số ở đây là đề xuất (`ĐX`), chưa được chủ sản phẩm xác nhận.** Chúng được chọn cho quy mô thử nghiệm ở C13 (khoảng 130 người dùng trong 12 tuần), chưa dựa trên dữ liệu đo thực tế, và cần xem lại khi biết ngân sách, nơi triển khai.

Mục tiêu được kiểm chứng trên môi trường staging trước khi ra mắt thử nghiệm.

## Bảo mật

| Mã | Yêu cầu | Mục tiêu | Nguồn |
| --- | --- | --- | --- |
| NFR-S01 | Phân quyền | Mọi API riêng tư đi qua lớp phân quyền theo quan hệ, mặc định từ chối. Các test ở [roles-permissions.md](roles-permissions.md#các-trường-hợp-bắt-buộc-có-test) phải đạt trong CI. | PRD §10.1, D12 |
| NFR-S02 | Mật khẩu | Băm bằng Argon2id. Dài tối thiểu 10 ký tự và bị từ chối nếu nằm trong danh sách mật khẩu phổ biến. | PRD §10.1 |
| NFR-S03 | Phiên đăng nhập | Access token sống 15 phút. Refresh token xoay vòng, sống 30 ngày, lưu dạng băm trong cơ sở dữ liệu. Web dùng cookie `httpOnly`, `Secure`, `SameSite`. | Báo cáo mục 5 |
| NFR-S04 | Thu hồi quyền | Tài khoản bị khóa mất quyền trong tối đa 15 phút với REST; kết nối socket bị ngắt ngay. | PRD §3.14 |
| NFR-S05 | Giới hạn tần suất | Đăng nhập: 5 lần sai trong 15 phút cho mỗi tài khoản. Đặt lại mật khẩu: 3 lần mỗi giờ. Gửi yêu cầu kết nối: 20 lần mỗi ngày. | PRD §10.1 |
| NFR-S06 | Mã hóa | TLS 1.2 trở lên cho mọi kết nối. Cơ sở dữ liệu, bản sao lưu và kho tệp được mã hóa khi lưu. | PRD §10.1 |
| NFR-S07 | Tệp | Mọi bucket đều riêng tư. URL ký sống tối đa 5 phút với giấy tờ xác minh, 15 phút với tệp khác. Giấy tờ xác minh nằm ở bucket riêng. Kiểm tra loại tệp theo nội dung, không theo đuôi tệp. | PRD §10.1, Báo cáo mục 5 |
| NFR-S08 | Nhật ký | Ghi lại đăng nhập, đổi quyền, khóa tài khoản, duyệt hồ sơ, quyết định tranh chấp, xem dữ liệu nhạy cảm. Nhật ký chỉ được ghi thêm và lưu 12 tháng. | PRD §10.1, C1 |
| NFR-S09 | Log ứng dụng | Không chứa mật khẩu, token, số CCCD, nội dung tin nhắn hoặc thông tin trẻ em. | PRD §10.1 |
| NFR-S10 | Lỗ hổng | CI quét dependency và chặn lỗi mức nghiêm trọng. Rà soát theo OWASP Top 10 trước khi ra mắt thử nghiệm. | PRD §11 |

## Quyền riêng tư và dữ liệu trẻ em

| Mã | Yêu cầu | Mục tiêu | Nguồn |
| --- | --- | --- | --- |
| NFR-P01 | Thu thập tối thiểu | Hồ sơ học sinh chỉ bắt buộc tên gọi và lớp. Không lưu địa chỉ nhà chính xác hoặc ngày sinh nếu chưa cần cho ngưỡng tuổi. | PRD §10.4 |
| NFR-P02 | API công khai | API công khai và SSR dùng DTO riêng, không có trường nhạy cảm. Có test kiểm tra danh sách trường trả về. | PRD §10.4 |
| NFR-P03 | Công cụ tìm kiếm | Chỉ các trang gia sư đã xác minh và bài tuyển được lập chỉ mục. Khu vực đăng nhập và bài tìm gia sư bị chặn lập chỉ mục. | C8 |
| NFR-P04 | Đồng ý | Lưu phiên bản điều khoản và thời điểm đồng ý của người dùng. Phụ huynh đồng ý thay cho con. | PRD §10.4 |
| NFR-P05 | Xóa dữ liệu | Worker xử lý tài khoản quá 6 tháng và ảnh giấy tờ quá 30 ngày mỗi ngày một lần. Có test tự động cho cả hai. | C2, C4 |
| NFR-P06 | Bản sao lưu | Dữ liệu đã xóa còn trong bản sao lưu tối đa 30 ngày rồi hết hạn theo vòng quay. Chính sách quyền riêng tư phải nêu rõ điều này. | C2, PRD §10.4 |
| NFR-P07 | Rà soát pháp lý | Luật sư rà soát trước khi vận hành thật, gồm ngưỡng tuổi và các mốc lưu trữ. | PRD §10.4 |

## Hiệu năng

| Mã | Yêu cầu | Mục tiêu | Nguồn |
| --- | --- | --- | --- |
| NFR-F01 | API đọc | 95% yêu cầu dưới 300 ms, tính ở phía máy chủ. | PRD §10.2 |
| NFR-F02 | API ghi | 95% yêu cầu dưới 500 ms. | PRD §10.2 |
| NFR-F03 | Tìm kiếm gia sư | 95% yêu cầu dưới 500 ms với 10.000 hồ sơ thử. | PRD §10.2 |
| NFR-F04 | Trang công khai | LCP dưới 2,5 giây trên mạng di động 4G. | PRD §10.2, D12 |
| NFR-F05 | Chat | 95% tin nhắn đến người nhận đang trực tuyến trong dưới 1 giây. | PRD §12 câu 11 |
| NFR-F06 | Tải đồng thời | Chịu được 200 người dùng đồng thời mà vẫn đạt các mục tiêu trên. | ĐX |
| NFR-F07 | Phân trang | Mọi danh sách đều phân trang, tối đa 50 bản ghi mỗi trang. Tin nhắn dùng cursor. | PRD §10.2 |
| NFR-F08 | Tệp tải lên | Ảnh tối đa 5 MB. Giấy tờ xác minh tối đa 10 MB. Ảnh được nén trước khi hiển thị. | PRD §10.2 |

## Độ tin cậy

| Mã | Yêu cầu | Mục tiêu | Nguồn |
| --- | --- | --- | --- |
| NFR-R01 | Thời gian hoạt động | 99,5% mỗi tháng trong giai đoạn thử nghiệm. | ĐX |
| NFR-R02 | Sao lưu | Sao lưu cơ sở dữ liệu mỗi ngày, giữ 30 ngày. Thử khôi phục ít nhất một lần trước khi ra mắt. | ĐX |
| NFR-R03 | Khôi phục | RPO 24 giờ, RTO 8 giờ. | ĐX |
| NFR-R04 | Tác vụ theo lịch | Tự hủy yêu cầu, tự chốt buổi học, chốt học phí phải idempotent: chạy lại không tạo kết quả trùng. | C3, C5, C6 |
| NFR-R05 | Chốt học phí | Nếu job lúc 00:00 ngày 1 lỗi, việc chạy lại vẫn cho kết quả theo mốc thời gian đó, không phụ thuộc vào lúc chạy. | BR-805 |
| NFR-R06 | Gửi thông báo | Sự kiện được lưu cùng giao dịch nghiệp vụ. Email lỗi được thử lại tối đa 5 lần, sau đó ghi cảnh báo. | Báo cáo mục 6 |
| NFR-R07 | Chat mất kết nối | Client tải lại tin nhắn đã lỡ khi kết nối lại; tin nhắn không bị mất hoặc trùng. | PRD §12 câu 11 |

## Quan sát và vận hành

| Mã | Yêu cầu | Mục tiêu | Nguồn |
| --- | --- | --- | --- |
| NFR-O01 | Log | Log có cấu trúc, có mã theo dõi cho từng yêu cầu. | Báo cáo mục 5 |
| NFR-O02 | Theo dõi lỗi | Sentry cho Web, API và Worker. | Báo cáo mục 5 |
| NFR-O03 | Cảnh báo | Cảnh báo khi API lỗi 5xx trên 1% trong 5 phút, hàng đợi tồn đọng trên 15 phút, hoặc job theo lịch không chạy. | ĐX |
| NFR-O04 | Chỉ số sản phẩm | Đo được các chỉ số ở C13: số gia sư đã xác minh, phụ huynh đăng ký, lớp tạo từ kết nối, tỷ lệ lớp còn học sau 4 tuần. | C13 |
| NFR-O05 | Hàng chờ Manager | Hiển thị số hồ sơ chờ duyệt và số hồ sơ quá 2 ngày làm việc. | C4 |

## Trải nghiệm người dùng

| Mã | Yêu cầu | Mục tiêu | Nguồn |
| --- | --- | --- | --- |
| NFR-U01 | Thiết bị | Web dùng tốt từ chiều rộng 360 px trở lên. | PRD §10.3 |
| NFR-U02 | Trình duyệt | Chrome, Edge, Safari, Firefox, hai phiên bản mới nhất. | ĐX |
| NFR-U03 | Khả năng tiếp cận | Đạt WCAG 2.1 mức AA cho các luồng đăng ký, tìm kiếm, kết nối. | ĐX |
| NFR-U04 | Ngôn ngữ | Toàn bộ giao diện, email và thông báo lỗi có tiếng Việt và tiếng Anh. API trả mã lỗi, client tự dịch. Trang công khai có URL theo ngôn ngữ. | C11 |
| NFR-U05 | Định dạng | Tiền lưu số nguyên VND. Thời gian lưu UTC, hiển thị giờ Việt Nam. | Báo cáo mục 6 |
| NFR-U06 | Phản hồi thao tác | Có trạng thái đang tải, thành công, lỗi, trạng thái rỗng, và lỗi form chỉ rõ từng trường. | PRD §10.3 |

## Tương thích giữa các ứng dụng

| Mã | Yêu cầu | Mục tiêu | Nguồn |
| --- | --- | --- | --- |
| NFR-C01 | API | Không có thay đổi phá vỡ trong `/v1`. CI so sánh đặc tả OpenAPI và chặn thay đổi phá vỡ. | Báo cáo mục 7 |
| NFR-C02 | Mobile | Khi ra Mobile, API có endpoint phiên bản tối thiểu để buộc cập nhật. | Báo cáo mục 7, D2 |
| NFR-C03 | Migration | Theo mô hình expand và contract; mỗi bản phát hành API có thể chạy song song với bản trước trong lúc triển khai. | Báo cáo mục 7 |
