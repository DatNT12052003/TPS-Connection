# Câu hỏi rà soát pháp lý – Nền tảng TPS-Connection

Kính gửi Luật sư,

Chúng tôi đang xây dựng TPS-Connection, một nền tảng trực tuyến kết nối gia sư với phụ huynh và học sinh tại Việt Nam. Trước khi đưa vào sử dụng thử với người dùng thật, chúng tôi cần Luật sư xác nhận nền tảng phải tuân thủ những quy định nào và các phương án chúng tôi đang dự kiến có phù hợp không.

Mỗi câu hỏi bên dưới kèm **phương án chúng tôi đang dự kiến**. Luật sư chỉ cần xác nhận phương án đó, hoặc chỉ ra điểm cần sửa và căn cứ pháp lý. Các văn bản pháp luật chúng tôi nêu chỉ là phỏng đoán của người không có chuyên môn và có thể không đầy đủ.

---

## 1. Thông tin về nền tảng

**Chức năng chính:**

- Gia sư tạo hồ sơ, đăng bài giới thiệu dịch vụ. Phụ huynh tìm gia sư hoặc đăng nhu cầu tìm gia sư.
- Hai bên gửi yêu cầu kết nối, nhắn tin trên nền tảng và xác nhận hợp tác.
- Sau khi hợp tác, gia sư quản lý lớp, lịch học, điểm danh, điểm số, nhận xét. Phụ huynh theo dõi việc học của con.
- Ghi nhận học phí và đối chiếu số buổi học. **Tiền học phí do hai bên tự thanh toán với nhau bên ngoài nền tảng**; nền tảng không thu, không giữ, không chuyển tiền.
- Phụ huynh và học sinh đánh giá gia sư.

**Mô hình kinh doanh:** miễn phí cho người dùng ở giai đoạn đầu. Sau này có thể thu phí đăng bài, phí kết nối, gói dịch vụ cho gia sư, hoặc tích hợp thanh toán trực tuyến.

**Người dùng:** gia sư (sinh viên, giáo viên, người đi làm), phụ huynh, học sinh (phần lớn **dưới 18 tuổi**, có tài khoản riêng do phụ huynh tạo và mời), cùng nhân viên vận hành nền tảng.

**Phạm vi:** toàn quốc; dạy trực tiếp và trực tuyến. Giai đoạn thử nghiệm dự kiến ở một vài tỉnh/thành, khoảng 12 tuần.

**Đơn vị vận hành:** _[chủ dự án điền: cá nhân / hộ kinh doanh / công ty; tên, mã số nếu có]_.

**Dữ liệu cá nhân nền tảng xử lý:**

| Loại dữ liệu | Của ai | Mục đích | Thời hạn lưu dự kiến |
| ------------ | ------ | -------- | -------------------- |
| Họ tên, email, số điện thoại (tự khai, chưa xác thực), ảnh đại diện | Mọi người dùng | Tài khoản, liên lạc | Đến khi xóa tài khoản + 6 tháng |
| Ảnh căn cước công dân hai mặt; thẻ sinh viên | Gia sư | Xác minh danh tính trước khi cho đăng bài | Xóa ảnh 30 ngày sau khi duyệt; chỉ giữ kết quả "đã xác minh" |
| Bằng cấp, chứng chỉ | Gia sư (tùy chọn) | Cấp huy hiệu đã xác minh | Như trên |
| Họ tên, ngày sinh, trường học, địa chỉ, khối lớp | Học sinh (trẻ em) | Tổ chức lớp học. Chỉ chia sẻ cho gia sư sau khi phụ huynh xác nhận hợp tác; không bao giờ công khai | Đến khi xóa + 6 tháng; sau đó ẩn danh hóa |
| Điểm danh, điểm số, nhận xét, bài tập | Học sinh | Theo dõi học tập, đối chiếu học phí | Giữ lâu dài ở dạng ẩn danh sau khi xóa tài khoản |
| Tin nhắn giữa gia sư và phụ huynh | Hai bên | Trao đổi | Đến khi xóa tài khoản + 6 tháng |
| Ghi nhận học phí, thanh toán | Gia sư, phụ huynh | Đối chiếu | Giữ lâu dài ở dạng ẩn danh |
| Nhật ký thao tác của nhân viên | Nhân viên | Kiểm soát truy cập giấy tờ, tin nhắn bị báo cáo | Chưa quy định |

**Nơi lưu trữ:** máy chủ và kho lưu tệp đặt tại Việt Nam. Một số dịch vụ nước ngoài nhận dữ liệu tối thiểu: Gmail (gửi email: địa chỉ email và nội dung thông báo), Sentry (báo lỗi kỹ thuật), Expo/Google/Apple (thông báo đẩy trên điện thoại, giai đoạn sau). Chúng tôi không đưa thông tin của học sinh vào các dịch vụ này.

---

## 2. Câu hỏi

Mức ưu tiên: **[Trước thử nghiệm]** cần có câu trả lời trước khi có người dùng thật; **[Sau]** cần trước khi mở rộng hoặc thu phí.

### A. Tư cách pháp lý và thủ tục

1. **[Trước thử nghiệm]** Đơn vị vận hành có cần thành lập doanh nghiệp không, hay cá nhân được vận hành ở giai đoạn thử nghiệm miễn phí?
2. **[Trước thử nghiệm]** Nền tảng có thuộc diện **sàn giao dịch thương mại điện tử** hoặc **website cung cấp dịch vụ trực tuyến** phải đăng ký hoặc thông báo với cơ quan nhà nước (ví dụ Bộ Công Thương) không, khi đang miễn phí và không thu tiền hộ? Nếu có: thủ tục, thời gian, và cần soạn những văn bản gì (ví dụ quy chế hoạt động)?
3. **[Trước thử nghiệm]** Có cần giấy phép hoặc thủ tục nào liên quan đến **giáo dục** không, khi nền tảng chỉ kết nối và cung cấp công cụ quản lý, không tự tổ chức dạy học?
4. **[Sau]** Khi bắt đầu thu phí (phí đăng bài, phí kết nối, gói dịch vụ) hoặc tích hợp thanh toán trực tuyến, phát sinh thêm nghĩa vụ gì?

### B. Dữ liệu cá nhân

5. **[Trước thử nghiệm]** Theo quy định về bảo vệ dữ liệu cá nhân hiện hành (chúng tôi biết có Nghị định 13/2023/NĐ-CP và Luật Bảo vệ dữ liệu cá nhân năm 2025), nền tảng phải thực hiện những thủ tục gì? Ví dụ: hồ sơ đánh giá tác động xử lý dữ liệu, thông báo với cơ quan có thẩm quyền, chỉ định người phụ trách bảo vệ dữ liệu.
6. **[Trước thử nghiệm]** Ảnh căn cước công dân và dữ liệu của trẻ em có phải là **dữ liệu nhạy cảm** không? Nếu có, cần thêm biện pháp gì?
7. **[Trước thử nghiệm]** **Phương án:** người dùng tích chọn đồng ý điều khoản sử dụng và chính sách quyền riêng tư khi đăng ký; nền tảng lưu lại phiên bản văn bản và thời điểm đồng ý. Cách này có đủ không?
8. **[Trước thử nghiệm]** **Phương án xóa dữ liệu:** khi người dùng xóa tài khoản, tài khoản bị ẩn ngay; sau 6 tháng dữ liệu cá nhân bị xóa hẳn; lịch sử học tập và học phí được giữ ở dạng ẩn danh (không còn liên kết được tới người cụ thể). Thời hạn 6 tháng và việc giữ dữ liệu ẩn danh có phù hợp không? Có quy định nào buộc giữ lâu hơn (ví dụ để phục vụ cơ quan chức năng) hoặc xóa sớm hơn không?
9. **[Trước thử nghiệm]** **Phương án:** xóa ảnh căn cước sau 30 ngày kể từ khi duyệt xác minh, chỉ giữ kết quả. Có phù hợp không? Có được hoặc có phải lưu số căn cước không?
10. **[Trước thử nghiệm]** Người dùng có quyền gì với dữ liệu của mình (xem, sửa, tải về, rút lại đồng ý, yêu cầu xóa) và nền tảng phải đáp ứng trong bao lâu?
11. **[Trước thử nghiệm]** Khi có sự cố lộ lọt dữ liệu, nền tảng phải thông báo cho ai và trong thời hạn nào?

### C. Trẻ em

12. **[Trước thử nghiệm]** Để xử lý dữ liệu của trẻ em, cần đồng ý của ai và theo hình thức nào? Trẻ từ một độ tuổi nhất định có phải tự đồng ý thêm không?
13. **[Trước thử nghiệm]** Từ bao nhiêu tuổi trẻ được có tài khoản riêng trên nền tảng? **Phương án:** phụ huynh tạo hồ sơ cho con và gửi lời mời; con dùng tài khoản để xem lịch học, bài tập, điểm số, chưa được nhắn tin.
14. **[Sau]** **Phương án sau này:** cho học sinh nhắn tin với gia sư. Với học sinh dưới 18 tuổi, phụ huynh phải bật chức năng này và cùng có mặt trong hội thoại. Phương án này có đủ để bảo vệ trẻ không, và có nghĩa vụ pháp lý nào khác?
15. **[Trước thử nghiệm]** **Phương án:** học sinh dưới 18 tuổi được đánh giá gia sư công khai nhưng ẩn danh (chỉ hiện "Học sinh lớp 8"). Có vấn đề pháp lý gì không?
16. **[Trước thử nghiệm]** Nền tảng có nghĩa vụ gì khi phát hiện hoặc nhận báo cáo về hành vi xâm hại trẻ em giữa gia sư và học sinh (ví dụ báo cơ quan chức năng, lưu giữ bằng chứng)?

### D. Lưu trữ tại Việt Nam và dịch vụ nước ngoài

17. **[Trước thử nghiệm]** Nền tảng có thuộc diện bắt buộc lưu trữ dữ liệu tại Việt Nam theo Luật An ninh mạng 2018 và Nghị định 53/2022/NĐ-CP không? Phương án đặt máy chủ trong nước như trên đã đủ chưa?
18. **[Trước thử nghiệm]** Việc gửi email qua Gmail, báo lỗi qua Sentry, thông báo đẩy qua dịch vụ nước ngoài có bị coi là **chuyển dữ liệu cá nhân ra nước ngoài** không? Nếu có, cần thủ tục gì, hay nên thay bằng dịch vụ trong nước?

### E. Trách nhiệm với nội dung và giao dịch giữa người dùng

19. **[Trước thử nghiệm]** Nền tảng chịu trách nhiệm đến đâu về: thông tin gia sư tự khai (kinh nghiệm, thành tích), chất lượng dạy, tranh chấp học phí giữa hai bên, đánh giá sai sự thật? Cần ghi gì trong điều khoản để giới hạn trách nhiệm?
20. **[Trước thử nghiệm]** **Phương án:** chỉ xác minh danh tính gia sư (bắt buộc); bằng cấp là tùy chọn và chỉ hiện huy hiệu khi đã xác minh. Nền tảng có nghĩa vụ kiểm tra thêm gì không, ví dụ lý lịch tư pháp với người tiếp xúc trẻ em?
21. **[Trước thử nghiệm]** Khi tranh chấp về buổi học, người kiểm duyệt của nền tảng chỉ sửa bản ghi điểm danh, không hoàn tiền (vì tiền trả ngoài nền tảng). Cách này có tạo trách nhiệm pháp lý nào cho nền tảng không?
22. **[Trước thử nghiệm]** Nghĩa vụ gỡ nội dung vi phạm, lưu nhật ký, cung cấp thông tin cho cơ quan chức năng khi được yêu cầu?

### F. Quy định về dạy thêm

23. **[Trước thử nghiệm]** Quy định về dạy thêm, học thêm của Bộ Giáo dục và Đào tạo (chúng tôi biết có Thông tư 29/2024/TT-BGDĐT) có áp dụng cho gia sư cá nhân trên nền tảng không? Đặc biệt với gia sư là **giáo viên đang công tác**: nền tảng có trách nhiệm gì (ví dụ yêu cầu gia sư cam kết không dạy học sinh của chính mình ở trường)?
24. **[Sau]** Gia sư cá nhân có phải đăng ký kinh doanh để nhận dạy qua nền tảng không? Nền tảng có phải nhắc hoặc kiểm tra điều này không?

### G. Thuế

25. **[Sau]** Nền tảng có nghĩa vụ khai thay, khấu trừ hoặc cung cấp thông tin về thu nhập của gia sư cho cơ quan thuế không? Câu trả lời có khác khi tiền đi ngoài nền tảng (hiện tại) so với khi có thanh toán trực tuyến (sau này)?

---

## 3. Văn bản đề nghị Luật sư soạn hoặc rà soát

| Văn bản | Ghi chú |
| ------- | ------- |
| Điều khoản sử dụng | Cho mọi người dùng; có phần riêng cho gia sư |
| Chính sách quyền riêng tư | Tiếng Việt và tiếng Anh (nền tảng hỗ trợ hai ngôn ngữ) |
| Nội dung đồng ý của phụ huynh khi tạo hồ sơ và tài khoản cho con | |
| Cam kết của gia sư khi đăng ký | Thông tin trung thực; quy tắc ứng xử với trẻ em; các cam kết theo câu 23 nếu cần |
| Quy chế hoạt động | Nếu nền tảng thuộc diện ở câu 2 |
| Quy trình xử lý yêu cầu về dữ liệu và sự cố lộ lọt dữ liệu | Theo câu 10 và 11 |

**Tài liệu có thể gửi kèm:** mô tả nghiệp vụ chi tiết của nền tảng (tiếng Việt).
