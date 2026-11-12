# Decision log – TPS-Connection

Nhật ký các quyết định sản phẩm đã chốt. Khi có mâu thuẫn, quyết định ở đây thắng nội dung gốc của các tài liệu khác (xem D13). Các tài liệu [mô tả nghiệp vụ](../mo_ta_nghiep_vu.md), [công nghệ sử dụng](../cong_nghe_su_dung.md) và [kế hoạch triển khai](../ke_hoach_trien_khai.md) đã được cập nhật theo nhật ký này ngày 2026-11-12.

**Nguồn:**

- D1–D12 và C1–C13: báo cáo phân tích Giai đoạn 1 (Claude Doc, https://claude.ai/artifact/4STSytBWU2wL9rvCKT4zod). Chủ dự án đồng ý trước ngày 2026-11-12; chép sang đây ngày 2026-11-12.
- D13–D20: chủ dự án chốt ngày 2026-11-12, khi rà soát các điểm lệch giữa tài liệu.
- D21–D29: chủ dự án chốt ngày 2026-11-12, khi review [thiết kế cơ sở dữ liệu](../thiet_ke_co_so_du_lieu.md).

Quy ước: thêm quyết định mới vào cuối, không sửa nội dung quyết định cũ. Nếu đổi ý, thêm quyết định mới ghi rõ thay thế quyết định nào.

---

## 1. Quyết định phạm vi và sản phẩm (D1–D12)

| Mã  | Câu hỏi                                                             | Quyết định                                                                                                                                                                                                 |
| --- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Tên chính thức                                                      | **TPS-Connection**. Ngày 2026-11-12 xác nhận lại: dùng cho tên hiển thị với người dùng, tên miền và bundle ID của app Mobile.                                                                              |
| D2  | Mobile có trong bản phát hành đầu không?                            | Web và API ra trước. Mobile là bản phát hành kế tiếp, tập trung vào lịch, điểm danh, chat, thông báo.                                                                                                     |
| D3  | Người học trưởng thành dùng nền tảng thế nào?                       | Dữ liệu hỗ trợ từ đầu; bản đầu chỉ mở cho học sinh có phụ huynh quản lý.                                                                                                                                   |
| D4  | Tài khoản học sinh                                                  | Phụ huynh tạo và mời; học sinh chỉ xem trong bản đầu. Ngưỡng tuổi cần tư vấn pháp lý.                                                                                                                      |
| D5  | Xác minh bắt buộc gồm những gì?                                     | Bắt buộc xác minh **danh tính** trước khi hiển thị công khai và đăng bài; bằng cấp là huy hiệu tùy chọn.                                                                                                  |
| D6  | Học phí và thanh toán trực tuyến                                    | Ghi nhận học phí (thanh toán ngoài nền tảng) có trong bản đầu; thanh toán trực tuyến để sau; không giữ tiền hộ.                                                                                           |
| D7  | Lớp nhóm                                                            | Dữ liệu hỗ trợ nhóm từ đầu; bản đầu chỉ mở lớp 1 kèm 1.                                                                                                                                                     |
| D8  | Thời điểm mở chat và liên hệ                                        | Mở liên hệ khi hai bên xác nhận hợp tác. Thời điểm mở chat được làm rõ ở D14.                                                                                                                              |
| D9  | Ai tạo lớp                                                          | Hệ thống tạo lớp từ điều kiện hợp tác đã xác nhận. Lớp cho học sinh ngoài nền tảng: chưa làm.                                                                                                             |
| D10 | Bài tập, thông báo, đánh giá, yêu thích                             | Thông báo trong app: có. Bài tập và đánh giá: ngay sau bản đầu. Yêu thích: có nếu kịp.                                                                                                                     |
| D11 | Phạm vi địa lý, lọc bán kính                                        | Sản phẩm hỗ trợ toàn quốc; thử nghiệm ở một vài khu vực; lọc theo tỉnh, xã trước, bán kính để sau.                                                                                                        |
| D12 | SEO và framework backend                                            | Có SEO, dùng SSR cho trang công khai (React Router framework mode trên Vite); backend dùng Express. Tài liệu công nghệ đã cập nhật theo quyết định này ngày 2026-11-12.                                    |

## 2. Câu trả lời nghiệp vụ (C1–C13)

| Mã  | Chủ đề                         | Quyết định                                                                                                                                                                                                                                                      |
| --- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | Manager và Admin               | **Manager:** duyệt hồ sơ gia sư, bài đăng, xử lý báo cáo vi phạm và tranh chấp buổi học; xem giấy tờ khi duyệt; chỉ xem đoạn tin nhắn bị báo cáo. **Admin:** tài khoản, phân quyền, danh mục, cấu hình, xử lý khiếu nại lại. Mọi lần xem đều ghi nhật ký. |
| C2  | Xóa tài khoản                  | Khi xóa: ghi thời điểm vào `deleted_at` và ẩn ngay. Sau 6 tháng: xóa hẳn dữ liệu cá nhân, ẩn danh bản ghi lớp và đánh giá. Giấy tờ xác minh theo mốc riêng ở C4. Chi tiết hiển thị ở D19.                                                                 |
| C3  | Trạng thái kết nối             | Cả hai bên phải bấm xác nhận hợp tác. Chờ phản hồi quá 7 ngày thì tự hủy; đang trao đổi quá 30 ngày thì tự hủy, có nhắc trước. Sau đó vẫn gửi lại được. Thứ tự trạng thái được làm rõ ở D15.                                                                |
| C4  | Xác minh gia sư                | Mọi gia sư nộp CCCD; sinh viên nộp thêm thẻ sinh viên; bằng cấp tùy chọn để lấy huy hiệu. Manager duyệt trong 2 ngày làm việc. Từ chối phải nêu lý do, gia sư được nộp lại. Sau khi duyệt giữ kết quả, xóa ảnh giấy tờ sau 30 ngày (chờ luật sư rà soát). |
| C5  | Buổi học, xác nhận, tranh chấp | Báo hủy trước 2 giờ. Không tính tiền mọi trường hợp vắng, nhưng ghi rõ hủy muộn và vắng không báo; xem lại sau thử nghiệm. Phụ huynh có 48 giờ để xác nhận, được nhắc một lần; hết hạn thì tự chốt theo điểm danh của gia sư. Phụ huynh khiếu nại trong 48 giờ; buổi tạm chưa tính tiền; hai bên có 3 ngày tự thống nhất, nếu không thì Manager quyết định, chỉ sửa bản ghi, không hoàn tiền. |
| C6  | Cách tính học phí              | Tính theo buổi; cuối tháng thu một lần.                                                                                                                                                                                                                        |
| C7  | Học sinh chat                  | Bản đầu: học sinh chưa chat, gia sư trao đổi với phụ huynh. Khi mở sau: dưới 18 tuổi, phụ huynh phải bật và cùng ở trong hội thoại.                                                                                                                         |
| C8  | Khách chưa đăng nhập           | Khách xem được gia sư đã xác minh (tên hiển thị, môn, lớp, tỉnh, học phí, đánh giá) và bài tuyển học sinh. Chỉ cần tạo hồ sơ con khi gửi yêu cầu. Bài tìm gia sư không công khai; chỉ gia sư đã xác minh và đã đăng nhập mới thấy.                         |
| C9  | Phụ huynh quản lý              | Một trẻ chỉ có một phụ huynh quản lý. Admin đổi người quản lý theo yêu cầu. Quyền tự quản lý khi đủ 18 tuổi để sau bản đầu, cùng lúc với D3.                                                                                                                |
| C10 | Đánh giá gia sư                | Phụ huynh có quan hệ dạy học đã xác nhận từ 1 tháng trở lên. Mỗi quan hệ một đánh giá, có thể cập nhật. Học sinh vị thành niên không đánh giá công khai.                                                                                                      |
| C11 | Hai ngôn ngữ                   | Áp dụng cho giao diện, danh mục, email; đội dự án dịch. Không dịch nội dung người dùng tự viết.                                                                                                                                                                 |
| C12 | Kênh thông báo, số điện thoại  | Thông báo trong app và email; thông báo đẩy khi có Mobile; không dùng SMS. Bỏ đăng ký bằng số điện thoại; số điện thoại gắn nhãn tự khai.                                                                                                                    |
| C13 | Chỉ số thành công              | Đề xuất: sau 12 tuần thử nghiệm có 30 gia sư đã xác minh, 100 phụ huynh đăng ký, 20 lớp được tạo từ kết nối, ít nhất 60% lớp còn học sau 4 tuần. Quy mô đội ngũ, ngân sách, mốc ra mắt: **chưa có**.                                                       |

## 3. Quyết định rà soát tài liệu ngày 2026-11-12 (D13–D20)

| Mã  | Câu hỏi                                               | Quyết định                                                                                                                                                                                                              |
| --- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D13 | Nguồn nào thắng khi mâu thuẫn?                        | Mô tả nghiệp vụ là tài liệu gốc; các quyết định trong nhật ký này là bản sửa đổi và thắng khi mâu thuẫn. Mô tả nghiệp vụ được cập nhật theo nhật ký. Báo cáo phân tích Giai đoạn 1 dựa trên bản PRD cũ, chỉ dùng để tham khảo. |
| D14 | Chat mở khi nào?                                      | Chat mở khi **bên nhận** chấp nhận yêu cầu kết nối (gia sư nếu phụ huynh gửi; phụ huynh nếu gia sư ứng tuyển). Thay cho cách ghi "mở khi gia sư chấp nhận" ở D8.                                                      |
| D15 | Thứ tự trạng thái kết nối                             | Bỏ bước trung gian: chấp nhận thì yêu cầu chuyển ngay sang **Đang trao đổi** và chat mở. Trạng thái: Chờ phản hồi → Đang trao đổi → Đã xác nhận hợp tác; nhánh Đã từ chối, Đã hủy. "Đã chấp nhận" là sự kiện được ghi lại. |
| D16 | "Hai bên đã kết nối" là khi nào?                      | Email, số điện thoại và thông tin nhận dạng của trẻ (họ tên đầy đủ, trường, địa chỉ) chỉ mở khi **xác nhận hợp tác**. Trong lúc trao đổi, gia sư chỉ thấy cấp lớp, môn, mục tiêu và tỉnh/xã.                         |
| D17 | Ai đặt và ai được sửa học phí?                        | Học phí chốt khi xác nhận hợp tác. Muốn đổi sau đó: gia sư đề xuất, phụ huynh đồng ý; giá mới chỉ áp dụng cho các buổi từ đó về sau.                                                                                 |
| D18 | Học phí theo giờ hay theo buổi?                       | Hồ sơ gia sư ghi học phí theo giờ hoặc theo buổi để tham khảo. Lớp học luôn chốt giá theo buổi, kèm thời lượng mỗi buổi.                                                                                              |
| D19 | Khi phụ huynh xóa tài khoản, gia sư còn thấy gì?      | Lịch sử buổi học, điểm và học phí được giữ nhưng ẩn danh. Gia sư thấy "Học sinh đã xóa tài khoản" kèm số buổi và số tiền.                                                                                              |
| D20 | Bộ lọc "trạng thái xác minh" khi tìm gia sư           | Đổi thành bộ lọc "có bằng cấp đã xác minh" (huy hiệu ở D5), vì mọi gia sư hiển thị công khai đều đã xác minh danh tính.                                                                                              |

## 4. Quyết định ngày 2026-11-12: review thiết kế cơ sở dữ liệu và công cụ (D21–D29)

| Mã  | Câu hỏi                                               | Quyết định                                                                                                                                                                                                              |
| --- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D21 | Phạm vi một yêu cầu kết nối                           | Một yêu cầu kết nối dành cho một người học và một môn học. Học hai môn với cùng gia sư thì gửi hai yêu cầu và có hai lớp.                                                                                             |
| D22 | Ai được đánh giá gia sư?                              | **Cả phụ huynh và học sinh** (có tài khoản) đều được đánh giá, khi có quan hệ dạy học đã xác nhận từ 1 tháng trở lên. Mỗi người đánh giá một gia sư một lần, sửa được. Đánh giá của học sinh dưới 18 tuổi hiển thị công khai và tính vào điểm trung bình nhưng **ẩn danh** ("Học sinh lớp 8"); học sinh từ 18 tuổi hiển thị tên như phụ huynh. Thay cho phần "chỉ phụ huynh" và "học sinh vị thành niên không đánh giá công khai" ở C10. |
| D23 | Bảng học phí tháng lập theo đơn vị nào?               | Lập riêng cho từng học sinh trong từng lớp. Phụ huynh có hai con học cùng một gia sư sẽ có hai bảng học phí.                                                                                                          |
| D24 | Hạn thanh toán học phí tháng                          | Ngày 5 của tháng kế tiếp.                                                                                                                                                                                               |
| D25 | Một bài tìm gia sư gồm mấy môn?                       | Một môn, gắn với một hồ sơ con. Cần nhiều môn thì đăng nhiều bài.                                                                                                                                                      |
| D26 | Cách tính "2 ngày làm việc" duyệt xác minh (C4)       | Không tính thứ Bảy, Chủ nhật; chưa trừ ngày lễ. Hồ sơ nộp thứ Sáu thì hạn là hết thứ Ba tuần sau.                                                                                                                      |
| D27 | Sinh trước buổi học từ lịch lặp bao xa?               | 8 tuần. Đây là tham số cấu hình, đổi được mà không cần sửa dữ liệu.                                                                                                                                                    |
| D28 | Lớp có đổi gia sư được không?                         | Không. Muốn đổi gia sư thì kết thúc lớp cũ; phụ huynh kết nối với gia sư mới và hệ thống tạo lớp mới. Gia sư mới không thấy dữ liệu do gia sư cũ ghi.                                                                 |
| D29 | Trình quản lý package cho monorepo                    | **npm** (workspaces) + Turborepo thay cho pnpm, vì đội quen npm. Bù cho việc npm không chặn import thư viện chưa khai báo bằng rule ESLint `import/no-extraneous-dependencies`. Chốt ngày 2026-11-12. |

## 5. Quy tắc bổ sung khi duyệt sơ đồ trạng thái ngày 2026-11-12 (D30–D41)

Chi tiết từng luồng chuyển trạng thái nằm ở [thuật ngữ và sơ đồ trạng thái](../thuat_ngu_va_trang_thai.md).

| Mã  | Chủ đề                              | Quyết định |
| --- | ----------------------------------- | ---------- |
| D30 | Nhắc trước khi yêu cầu kết nối hết hạn | Nhắc bên nhận 24 giờ trước khi yêu cầu chờ phản hồi hết hạn; nhắc cả hai bên 3 ngày trước khi yêu cầu đang trao đổi hết hạn. |
| D31 | Bài tìm gia sư bị ẩn, đóng hoặc đã tìm được gia sư | Ẩn hoặc đóng bài thì các ứng tuyển còn chờ phản hồi tự hủy. Khi xác nhận hợp tác từ bài đó, hệ thống tự đóng bài với lý do "đã tìm được gia sư". |
| D32 | Hội thoại sau khi hủy lúc đang trao đổi | Chỉ còn xem được, không gửi thêm tin. |
| D33 | Bài tuyển học sinh đã đóng | Là trạng thái cuối; muốn đăng lại thì nhân bản thành nháp mới. |
| D34 | Điều kiện nộp xác minh danh tính | Bắt buộc có họ tên, môn – khối dạy được, hình thức dạy, học phí tham khảo. Họ tên thật bị khóa sau khi xác minh; muốn đổi phải xác minh lại. |
| D35 | Ai được tạm nghỉ, học lại, kết thúc lớp | **Chỉ gia sư.** Tạm nghỉ hủy các buổi tương lai; học lại sinh lại buổi. Phụ huynh muốn dừng thì trao đổi với gia sư; phụ huynh vẫn hủy được từng buổi học. |
| D36 | Nhắc điểm danh | Nhắc gia sư nếu sau giờ kết thúc buổi 24 giờ vẫn chưa điểm danh. |
| D37 | Sửa điểm danh khi phụ huynh chưa xác nhận | Được sửa; hạn 48 giờ để phụ huynh xác nhận tính lại từ đầu. |
| D38 | Chuyển khiếu nại lên Manager sớm | Một trong hai bên được yêu cầu Manager xử lý trước khi hết 3 ngày tự thống nhất. |
| D39 | Khiếu nại lại quyết định kiểm duyệt | Trong 7 ngày kể từ quyết định, mỗi vụ một lần, do Admin xử lý. Người báo cáo được biết báo cáo đã xử lý xong nhưng không biết chi tiết chế tài. |
| D40 | Phát hành bảng học phí tháng | Phát hành ngay ngày 1, không qua bước nháp. Điều chỉnh (giảm giá, phụ thu) đưa vào bảng tháng sau. |
| D41 | Khi nào thanh toán được tính là đã trả | Chỉ khi bên còn lại xác nhận khoản thanh toán đó. |

## 6. Danh mục đơn vị hành chính ngày 2026-11-12 (D42–D44)

Chi tiết ở [danh mục hành chính](../danh_muc_hanh_chinh.md).

| Mã  | Chủ đề | Quyết định |
| --- | ------ | ---------- |
| D42 | Nguồn dữ liệu danh mục hành chính | Nạp từ bộ dữ liệu mở `vietnamese-provinces-database` (MIT), cố định một bản phát hành (hiện là v5.2.0). Đối chiếu với Excel xuất từ danhmuchanhchinh.nso.gov.vn (Cục Thống kê) trước mỗi lần nạp; có sai lệch thì dừng và kiểm tra văn bản gốc. |
| D43 | Tần suất cập nhật danh mục | Kiểm tra hằng tháng và ngay khi có nghị quyết sắp xếp mới. Script nạp chạy chế độ so sánh trước, Admin duyệt rồi mới ghi. |
| D44 | Lưu danh mục | Mã là khóa ổn định; đổi tên, đổi loại cập nhật tại chỗ; sáp nhập, chia tách thì đơn vị cũ `is_active = false`, không xóa. Bảng có loại đơn vị, tên đầy đủ, tên tiếng Anh, mã bưu chính. |

## 7. Chỉ số thành công của pilot ngày 2026-11-12 (D45)

| Mã  | Chủ đề | Quyết định |
| --- | ------ | ---------- |
| D45 | Chỉ số thành công của pilot 12 tuần | Thay cho đề xuất ở C13. Mục tiêu: **10** gia sư đã xác minh danh tính, **30** phụ huynh đăng ký, **5** lớp được tạo từ kết nối, **≥ 50%** lớp còn học sau 4 tuần (có buổi học đã diễn ra từ tuần thứ 4). Theo dõi thêm, không đặt mục tiêu: tỷ lệ chuyển đổi gửi yêu cầu → chấp nhận → xác nhận hợp tác, thời gian duyệt xác minh, tỷ lệ buổi học được phụ huynh xác nhận so với tự chốt, số khiếu nại và báo cáo vi phạm. **Không đặt ngưỡng dừng**: chỉ số dùng để tham khảo, quyết định bước tiếp theo sau khi xem kết quả. Khu vực pilot: chưa chọn. |

## 8. Đóng giai đoạn 0 ngày 2026-11-12 (D46–D47)

| Mã  | Chủ đề | Quyết định |
| --- | ------ | ---------- |
| D46 | Wireframe và thiết kế giao diện | Duyệt wireframe 9 màn hình MVP về **nội dung và luồng**; hình thức (màu, font, icon, chi tiết bố cục, bản điện thoại) và các màn hình chưa vẽ do giai đoạn thiết kế giao diện mới (G1b) quyết định. Làm thiết kế giao diện chuẩn ngay từ đầu, song song với G1, xong trước G2. |
| D47 | Việc bên ngoài của G0 | Pháp lý (gửi luật sư), đăng ký tên miền và chọn khu vực pilot chuyển thành việc của chủ dự án: pháp lý và tên miền trước G8, khu vực pilot trước G9. G0 được coi là hoàn thành. |

## 9. Thiết kế giao diện ngày 2026-11-12 (D48)

| Mã  | Chủ đề | Quyết định |
| --- | ------ | ---------- |
| D48 | Hướng thương hiệu | **Hướng A**: màu chính xanh dương `#1D4ED8` (chế độ tối `#8AAEFF`), màu nhấn cam `#F97316` (tối `#FDBA74`), font Be Vietnam Pro, bo góc vừa (thẻ 14 px, nút 10 px). Có chế độ sáng và tối ngay từ MVP. Logo dạng chữ dùng tạm (hai chấm nối bằng đường cong); logo chính thức do designer làm sau. Tham khảo: [canvas hướng thương hiệu](https://claude.ai/artifact/J8wj5FypcPZRJA7gwwy8mg). |
| D49 | Hệ thống thiết kế | Duyệt [TPS-Connection Design System](https://claude.ai/artifact/263FLgUp1zeKVVnVnRMUY1) (bản ngày 2026-11-12, theo D48) làm chuẩn cho mọi màn hình Web và Mobile. Bước tiếp theo: áp vào 9 màn hình đã có wireframe (bản máy tính và điện thoại), rồi vẽ các màn hình chưa có. |
| D50 | Quy tắc tài khoản (từ thiết kế G1b đợt 1) | Xác thực email bằng **liên kết** gửi qua email (không dùng mã số); gửi lại cách nhau tối thiểu 45 giây. Liên kết mời con tạo tài khoản học sinh dùng một lần, hết hạn sau **7 ngày**. Đổi hoặc đặt lại mật khẩu thì đăng xuất các thiết bị khác. Mật khẩu tối thiểu 8 ký tự, có cả chữ và số. Độ tuổi tối thiểu của tài khoản học sinh vẫn chờ luật sư (D4). Chủ dự án có thể điều chỉnh sau. |
| D51 | Giao diện trên máy tính bảng | Ba cỡ màn hình theo điểm ngắt của hệ thống thiết kế. Dưới 768 px: bố cục điện thoại. 768–1023 px (máy tính bảng dọc): điều hướng như điện thoại (thanh trên gọn, thanh dưới đáy), nội dung 2 cột, cột bên xếp xuống dưới, hộp thoại ở giữa rộng tối đa 560 px. Từ 1024 px (máy tính bảng ngang, máy tính): bố cục máy tính. Không có thao tác chỉ dùng được bằng chuột. Không làm màn hình riêng cho máy tính bảng; dùng lớp theo điểm ngắt khi code. |
| D52 | Duyệt giao diện G1b | Duyệt [canvas giao diện MVP](https://claude.ai/artifact/UNVxzXt9ZZvhxvtvqMK6o3) (bản ngày 2026-11-12: 45 màn hình, 94 bảng vẽ gồm bản máy tính, điện thoại và 4 mẫu máy tính bảng) làm chuẩn để code từ G2. Chỉnh sửa về sau: chỉnh hình thức (màu, khoảng cách, chữ, vị trí) thì sửa thẳng trên canvas hoặc trong code; chỉnh làm đổi luồng hoặc quy tắc nghiệp vụ thì ghi quyết định mới vào decision log trước rồi mới sửa giao diện. Code là bản cuối cùng; canvas được cập nhật theo khi có thay đổi đáng kể. |
