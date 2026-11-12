# Mô tả nghiệp vụ dự án TPS-Connection

> Cập nhật ngày 2026-11-12 theo [decision log](00-product/decision-log.md). Khi tài liệu này và decision log mâu thuẫn, decision log thắng (D13). Mã quyết định được ghi trong ngoặc, ví dụ _(D5)_, tại những chỗ đã thay đổi so với bản gốc.

## 1. Tổng quan nghiệp vụ

TPS-Connection là nền tảng kết nối gia sư, phụ huynh và học sinh. Nền tảng hỗ trợ toàn bộ hành trình từ tìm kiếm, lựa chọn và thống nhất việc học với gia sư đến tổ chức lớp học, quản lý buổi học và theo dõi kết quả học tập.

Dự án hướng đến hai nhóm hoạt động nghiệp vụ chính:

1. **Kết nối cung – cầu gia sư:** Gia sư giới thiệu năng lực và nhu cầu nhận học sinh; phụ huynh tìm kiếm gia sư hoặc đăng nhu cầu tìm người dạy. Hai bên có thể chủ động tìm thấy và gửi đề nghị kết nối cho nhau.
2. **Quản lý quá trình dạy và học:** Sau khi hợp tác được xác nhận, gia sư quản lý học sinh, lớp học, lịch học, điểm danh, bài tập, kết quả và học phí; phụ huynh theo dõi quá trình học của con; học sinh theo dõi các hoạt động học tập được giao.

Nền tảng hướng đến người học ở mọi cấp độ, từ học sinh phổ thông đến sinh viên và người đi làm. Ở phiên bản đầu, nền tảng chỉ mở cho người học có phụ huynh quản lý; người học trưởng thành tự sử dụng nền tảng là hướng mở rộng, nhưng nghiệp vụ và dữ liệu cần sẵn sàng cho trường hợp này _(D3)_. Phạm vi hoạt động là toàn quốc, hỗ trợ cả học trực tiếp và trực tuyến; giai đoạn thử nghiệm triển khai ở một vài khu vực _(D11)_.

## 2. Các đối tượng tham gia và trách nhiệm nghiệp vụ

### 2.1. Gia sư

Gia sư là người cung cấp dịch vụ giảng dạy, có thể là sinh viên, giáo viên hoặc người có chuyên môn phù hợp.

Gia sư thực hiện các hoạt động:

- Tạo và duy trì hồ sơ giới thiệu bản thân, trình độ, bằng cấp, chứng chỉ, kinh nghiệm và phương pháp giảng dạy.
- Khai báo môn học, khối lớp hoặc nhóm người học có thể dạy.
- Cung cấp hình thức giảng dạy, khu vực có thể dạy trực tiếp, mức học phí dự kiến và thời gian có thể nhận lớp.
- Hoàn tất việc xác minh danh tính trước khi được hiển thị công khai và đăng bài cung cấp dịch vụ. Bằng cấp, chứng chỉ có thể được xác minh thêm để nhận huy hiệu, không bắt buộc _(D5)_.
- Đăng, cập nhật, tạm ẩn hoặc đóng bài giới thiệu dịch vụ và nhu cầu tuyển học sinh.
- Tìm các nhu cầu tìm gia sư do phụ huynh đăng và gửi đề nghị nhận dạy.
- Tiếp nhận, xem xét, chấp nhận hoặc từ chối yêu cầu kết nối; sau khi chấp nhận thì trao đổi thêm với phụ huynh.
- Trao đổi với phụ huynh để thống nhất môn học, mục tiêu, lịch học, hình thức học và học phí.
- Quản lý học sinh, lớp học và các buổi học đang phụ trách.
- Điểm danh, ghi nhận nội dung đã dạy, giao bài tập, chấm bài, nhập điểm và nhận xét.
- Theo dõi các khoản học phí, buổi học đã hoàn thành, khoản đã thanh toán và khoản còn phải thanh toán.
- Gửi báo cáo định kỳ về tình hình và tiến độ học tập cho phụ huynh.
- Tiếp nhận và phản hồi đánh giá của phụ huynh sau khi có quá trình giảng dạy thực tế.

### 2.2. Phụ huynh

Phụ huynh là người tìm kiếm, lựa chọn và phối hợp với gia sư để tổ chức việc học cho con. Một phụ huynh có thể quản lý nhiều hồ sơ học sinh; mỗi học sinh chỉ có một phụ huynh quản lý _(C9)_.

Phụ huynh thực hiện các hoạt động:

- Tạo hồ sơ phụ huynh và hồ sơ cho một hoặc nhiều người học thuộc quyền quản lý.
- Mời con tạo tài khoản học sinh liên kết với hồ sơ đã có _(D4)_.
- Khai báo nhu cầu học tập của con, gồm môn học, cấp lớp, mục tiêu, hình thức học, lịch mong muốn, ngân sách và yêu cầu đối với gia sư.
- Tìm kiếm, lọc và xem thông tin gia sư theo các tiêu chí phù hợp.
- Xem hồ sơ, năng lực, kinh nghiệm, thông tin xác minh và đánh giá của gia sư.
- Lưu gia sư quan tâm để xem xét hoặc so sánh sau.
- Gửi yêu cầu kết nối đến gia sư hoặc đăng nhu cầu tìm gia sư để gia sư chủ động ứng tuyển.
- Theo dõi trạng thái các yêu cầu kết nối; trao đổi, thống nhất điều kiện học và xác nhận bắt đầu hợp tác.
- Trao đổi với gia sư trong quá trình học.
- Theo dõi lịch học, tình trạng tham gia, các buổi học đã hoàn thành và buổi học bị hủy hoặc học bù.
- Xem bài tập, tình trạng hoàn thành, điểm số, nhận xét và báo cáo tiến độ của con.
- Theo dõi học phí, các khoản cần thanh toán và lịch sử thanh toán.
- Xác nhận hoặc khiếu nại thông tin buổi học để đối chiếu số buổi và học phí.
- Đánh giá gia sư dựa trên trải nghiệm học tập thực tế.
- Nhận thông báo về yêu cầu kết nối, tin nhắn, lịch học, bài tập, kết quả và học phí.

### 2.3. Học sinh

Học sinh là người trực tiếp tham gia học tập. Học sinh có tài khoản riêng do phụ huynh tạo hồ sơ và gửi lời mời; tài khoản liên kết với hồ sơ học sinh mà phụ huynh quản lý _(D4)_. Việc tiếp cận và sử dụng thông tin của học sinh cần phù hợp với độ tuổi và quyền riêng tư; ngưỡng tuổi được mở tài khoản cần tư vấn pháp lý.

Ở phiên bản đầu, học sinh chỉ xem thông tin, chưa thao tác hay nhắn tin _(D4, C7)_. Học sinh thực hiện các hoạt động:

- Xem thông tin lớp học, gia sư và thời khóa biểu của mình.
- Theo dõi lịch học sắp tới và các thông báo liên quan.
- Xem bài tập, tài liệu và hạn nộp được gia sư giao.
- Theo dõi trạng thái bài tập, điểm số và nhận xét sau khi được gia sư chấm.
- Xem lịch sử học tập và mục tiêu học tập cá nhân.

Các hoạt động mở ở giai đoạn sau:

- Thực hiện và nộp bài tập bằng nội dung hoặc tệp đính kèm.
- Đánh giá gia sư sau khi học từ 1 tháng trở lên; học sinh dưới 18 tuổi được hiển thị ẩn danh _(D22)_.
- Gửi câu hỏi hoặc trao đổi với gia sư. Với học sinh dưới 18 tuổi, phụ huynh phải bật chức năng này và cùng tham gia hội thoại _(C7)_.

### 2.4. Người kiểm duyệt và quản trị viên

Nền tảng có hai vai trò vận hành với ranh giới quyền tách biệt _(C1)_. Mọi lần xem giấy tờ tùy thân, tin nhắn bị báo cáo và mọi thao tác xử lý của hai vai trò này đều được ghi nhật ký.

**Người kiểm duyệt (Manager)** chịu trách nhiệm duy trì hoạt động lành mạnh và an toàn hằng ngày:

- Tiếp nhận và xét duyệt hồ sơ xác minh của gia sư: thông tin danh tính, bằng cấp hoặc chứng chỉ. Chỉ xem giấy tờ khi duyệt.
- Kiểm duyệt bài đăng và xử lý nội dung không phù hợp.
- Tiếp nhận báo cáo về tài khoản, bài đăng, tin nhắn hoặc hành vi đáng ngờ. Chỉ xem đoạn tin nhắn bị báo cáo, không xem toàn bộ hội thoại.
- Phân xử tranh chấp về buổi học giữa gia sư và phụ huynh.
- Kiểm tra, xử lý các đánh giá không phù hợp.
- Cảnh báo, hạn chế hoặc khóa tài khoản vi phạm theo mức độ phù hợp.

**Quản trị viên (Admin)** chịu trách nhiệm về hệ thống:

- Quản lý tài khoản, vai trò và quyền sử dụng của người dùng.
- Quản lý danh mục môn học, khối lớp và khu vực hoạt động.
- Quản lý cấu hình nền tảng.
- Xử lý khiếu nại lại đối với quyết định của người kiểm duyệt.
- Đổi phụ huynh quản lý của học sinh theo yêu cầu _(C9)_.
- Theo dõi tình hình hoạt động của người dùng và nền tảng.

## 3. Nghiệp vụ tài khoản và hồ sơ

### 3.1. Đăng ký và sử dụng tài khoản

Người dùng đăng ký tài khoản bằng email, xác thực email và đăng nhập để sử dụng các chức năng tương ứng với vai trò. Phiên bản đầu không đăng ký bằng số điện thoại. Người dùng có thể khai báo số điện thoại, nhưng số này được ghi nhận là thông tin tự khai, chưa xác thực _(C12)_.

Các vai trò nghiệp vụ gồm gia sư, phụ huynh, học sinh, người kiểm duyệt và quản trị viên. Phụ huynh có thể tạo, cập nhật và quản lý hồ sơ của nhiều học sinh. Tài khoản học sinh được tạo qua lời mời của phụ huynh.

Người dùng có thể cập nhật thông tin cá nhân, ảnh đại diện, ngôn ngữ và các lựa chọn riêng tư. Thông tin liên hệ như số điện thoại và email không được công khai; chỉ được chia sẻ giữa hai bên khi đã xác nhận hợp tác _(D8, D16)_.

Khi người dùng xóa tài khoản, tài khoản được ẩn ngay. Sau 6 tháng, dữ liệu cá nhân bị xóa hẳn; lịch sử học tập (buổi học, điểm, học phí) và đánh giá được giữ lại dưới dạng ẩn danh _(C2)_. Bên còn lại chỉ thấy "Học sinh đã xóa tài khoản" (hoặc tương tự) kèm số buổi và số tiền, không thấy thông tin cá nhân _(D19)_.

### 3.2. Hồ sơ gia sư và xác minh

Hồ sơ gia sư là căn cứ để phụ huynh đánh giá mức độ phù hợp trước khi gửi yêu cầu kết nối. Hồ sơ có thể gồm:

- Thông tin giới thiệu và ảnh đại diện.
- Vai trò nghề nghiệp, trường học hoặc đơn vị công tác nếu có.
- Chuyên ngành, trình độ, bằng cấp và chứng chỉ.
- Kinh nghiệm giảng dạy.
- Môn học và khối lớp có thể nhận dạy.
- Hình thức dạy trực tiếp, trực tuyến hoặc kết hợp.
- Khu vực có thể dạy trực tiếp, theo tỉnh/thành và xã/phường.
- Học phí dự kiến theo giờ hoặc theo buổi, dùng để tham khảo; học phí của lớp học được chốt theo buổi khi xác nhận hợp tác _(D18)_.
- Lịch có thể nhận lớp.
- Phương pháp giảng dạy và thành tích có căn cứ.
- Tài liệu hoặc video giới thiệu nếu có.

**Xác minh** _(D5, C4)_:

- Gia sư bắt buộc xác minh danh tính trước khi được hiển thị công khai và đăng bài. Mọi gia sư nộp căn cước công dân; gia sư là sinh viên nộp thêm thẻ sinh viên.
- Bằng cấp và chứng chỉ có thể nộp để xác minh thêm và nhận huy hiệu; không bắt buộc.
- Người kiểm duyệt xét duyệt trong 2 ngày làm việc, không tính thứ Bảy và Chủ nhật _(D26)_. Khi từ chối phải nêu lý do; gia sư được sửa và nộp lại.
- Sau khi duyệt, nền tảng giữ kết quả xác minh và xóa ảnh giấy tờ sau 30 ngày. Mốc này cần luật sư rà soát.

Nền tảng cần thể hiện rõ thông tin nào do gia sư tự khai và thông tin nào đã được xác minh. Hồ sơ gia sư có trạng thái chưa hoàn thiện, chờ xác minh hoặc đã xác minh; đồng thời gia sư cập nhật tình trạng đang nhận học sinh hoặc tạm ngừng nhận học sinh.

### 3.3. Hồ sơ học sinh

Phụ huynh tạo và quản lý hồ sơ cho từng người học. Hồ sơ phục vụ việc tìm gia sư, tổ chức lớp và theo dõi quá trình học. Thông tin cần thiết có thể gồm cấp lớp, nhu cầu môn học, mục tiêu học tập và các thông tin phục vụ giảng dạy. Hồ sơ học sinh tồn tại kể cả khi học sinh chưa có tài khoản.

Mỗi học sinh chỉ có một phụ huynh quản lý. Việc đổi phụ huynh quản lý do quản trị viên xử lý theo yêu cầu. Quyền tự quản lý khi học sinh đủ 18 tuổi để sau phiên bản đầu _(C9)_.

Thông tin nhận dạng (họ tên đầy đủ), trường học, địa chỉ và thông tin liên hệ của trẻ không được công khai trong bài đăng tìm gia sư. Trong lúc trao đổi, gia sư chỉ thấy cấp lớp, môn học, mục tiêu và tỉnh/xã. Các thông tin nhận dạng chỉ được chia sẻ cho gia sư sau khi hai bên xác nhận hợp tác _(D16)_.

## 4. Nghiệp vụ đăng nhu cầu và tìm kiếm gia sư

### 4.1. Gia sư đăng bài tuyển học sinh

Chỉ gia sư đã xác minh danh tính mới được đăng bài _(D5)_. Gia sư có thể đăng bài giới thiệu dịch vụ để phụ huynh tìm thấy và liên hệ. Nội dung bài đăng có thể gồm tiêu đề, phần giới thiệu, môn học, khối lớp, hình thức dạy, khu vực dạy trực tiếp, học phí dự kiến, lịch có thể dạy, số lượng học sinh có thể nhận và thời gian bắt đầu nhận học sinh.

Gia sư được quyền tạo, chỉnh sửa, lưu nháp, ẩn hoặc xóa bài đăng. Bài đăng có thể ở các trạng thái như đang tuyển, đã đủ học sinh hoặc tạm dừng. Gia sư theo dõi mức độ quan tâm và các yêu cầu kết nối phát sinh từ bài đăng.

Bài tuyển học sinh là công khai: người chưa đăng nhập cũng xem được _(C8)_.

### 4.2. Phụ huynh đăng nhu cầu tìm gia sư

Phụ huynh có thể chủ động đăng nhu cầu tìm gia sư thay vì chỉ tìm trong danh sách hồ sơ có sẵn. Mỗi bài đăng dành cho một hồ sơ con và một môn học; cần nhiều môn thì đăng nhiều bài _(D25)_. Một bài đăng nhu cầu có thể bao gồm:

- Môn học và cấp lớp của người học.
- Mục tiêu học tập như củng cố kiến thức, luyện thi hoặc học nâng cao.
- Hình thức học mong muốn.
- Khu vực học nếu học trực tiếp, chỉ ở mức tỉnh/thành và xã/phường.
- Ngân sách dự kiến.
- Lịch học mong muốn và ngày dự kiến bắt đầu.
- Yêu cầu đối với gia sư.
- Mô tả bổ sung về nhu cầu.

Phụ huynh có thể tạo, chỉnh sửa, ẩn hoặc đóng bài đăng. Bài tìm gia sư không công khai: chỉ gia sư đã xác minh và đã đăng nhập mới xem được _(C8)_. Gia sư xem nhu cầu phù hợp và gửi đề nghị nhận dạy. Phụ huynh xem hồ sơ các gia sư ứng tuyển, so sánh và chấp nhận hoặc từ chối lời đề nghị.

### 4.3. Tìm kiếm, lọc và lựa chọn gia sư

Chỉ gia sư đã xác minh danh tính mới xuất hiện trong kết quả tìm kiếm. Người chưa đăng nhập cũng tìm kiếm và xem được tên hiển thị, môn, lớp, tỉnh, học phí và đánh giá của gia sư. Phụ huynh chỉ cần tạo hồ sơ con khi gửi yêu cầu kết nối _(C8)_.

Phụ huynh tìm kiếm gia sư theo các tiêu chí:

- Môn học và khối lớp.
- Hình thức học.
- Khu vực: tỉnh/thành và xã/phường. Lọc theo bán kính di chuyển để giai đoạn sau _(D11)_.
- Mức học phí.
- Kinh nghiệm và trình độ.
- Lịch có thể dạy.
- Có bằng cấp đã được xác minh _(D20)_.
- Đánh giá từ phụ huynh khác.

Kết quả có thể được sắp xếp theo mức độ phù hợp, đánh giá, kinh nghiệm, học phí hoặc thời điểm hồ sơ được cập nhật. Phụ huynh có thể xem chi tiết hồ sơ, lưu gia sư yêu thích và so sánh một số gia sư trước khi quyết định.

Nền tảng có thể đề xuất gia sư dựa trên nhu cầu đã khai báo; việc ghép nối cần dựa trên các tiêu chí có thể giải thích như môn học, cấp lớp, ngân sách, lịch rảnh, hình thức học, khu vực, kinh nghiệm, đánh giá và tình trạng nhận học sinh.

## 5. Nghiệp vụ kết nối gia sư và phụ huynh

### 5.1. Kết nối do phụ huynh khởi tạo

1. Phụ huynh tìm kiếm hoặc xem bài đăng của gia sư.
2. Phụ huynh xem hồ sơ và đánh giá để xác định mức độ phù hợp.
3. Phụ huynh gửi yêu cầu kết nối cho một hồ sơ học sinh, kèm lời nhắn và thông tin nhu cầu học cần thiết.
4. Gia sư nhận thông báo, xem nội dung yêu cầu và hồ sơ liên quan.
5. Gia sư chấp nhận hoặc từ chối. Khi gia sư chấp nhận, yêu cầu chuyển sang trạng thái đang trao đổi và hai bên có thể nhắn tin _(D14, D15)_.
6. Hai bên thống nhất môn học, mục tiêu, lịch, hình thức học và học phí theo buổi kèm thời lượng mỗi buổi _(D18)_.
7. Cả hai bên cùng xác nhận bắt đầu hợp tác _(C3)_.
8. Sau khi xác nhận, thông tin liên hệ và thông tin nhận dạng của học sinh được chia sẻ cho hai bên _(D16)_; hệ thống tạo lớp học từ các điều kiện đã thống nhất để chuyển sang nghiệp vụ quản lý học sinh và lớp học _(D9)_.

### 5.2. Kết nối do gia sư khởi tạo

1. Phụ huynh đăng bài nêu nhu cầu tìm gia sư.
2. Gia sư đã xác minh tìm kiếm các nhu cầu phù hợp.
3. Gia sư gửi đề nghị kết nối hoặc ứng tuyển, kèm lời giới thiệu phù hợp.
4. Phụ huynh xem đề nghị và hồ sơ gia sư.
5. Phụ huynh chấp nhận hoặc từ chối. Khi phụ huynh chấp nhận, yêu cầu chuyển sang trạng thái đang trao đổi và hai bên có thể nhắn tin _(D14, D15)_.
6. Hai bên thống nhất các điều kiện học tập, gồm học phí theo buổi kèm thời lượng mỗi buổi.
7. Cả hai bên cùng xác nhận bắt đầu hợp tác; hệ thống tạo lớp học và chuyển sang quản lý lớp học _(D9)_.

### 5.3. Trạng thái yêu cầu kết nối

Một yêu cầu kết nối có các trạng thái _(D15, C3)_:

- **Chờ phản hồi:** Đã gửi và đang chờ bên nhận xem xét.
- **Đang trao đổi:** Bên nhận đã chấp nhận; hai bên đang thảo luận điều kiện hợp tác. Việc chấp nhận được ghi lại như một sự kiện, không phải một trạng thái riêng.
- **Đã xác nhận hợp tác:** Cả hai bên đã xác nhận bắt đầu việc dạy và học.
- **Đã từ chối:** Bên nhận không đồng ý.
- **Đã hủy:** Bên gửi hủy khi đang chờ phản hồi, một bên hủy khi đang trao đổi, hoặc yêu cầu tự hết hạn.

Mỗi yêu cầu kết nối dành cho một người học và một môn học; học nhiều môn với cùng gia sư thì gửi nhiều yêu cầu _(D21)_.

Thứ tự chuyển: Chờ phản hồi → Đang trao đổi → Đã xác nhận hợp tác. Từ Chờ phản hồi có thể sang Đã từ chối hoặc Đã hủy; từ Đang trao đổi có thể sang Đã hủy.

Quy định thời hạn _(C3)_:

- Chờ phản hồi quá 7 ngày thì yêu cầu tự hủy.
- Đang trao đổi quá 30 ngày mà chưa xác nhận hợp tác thì yêu cầu tự hủy.
- Các bên được nhắc trước khi yêu cầu hết hạn. Sau khi hủy, vẫn có thể gửi yêu cầu mới.

Lịch sử chuyển trạng thái và người thực hiện được lưu lại.

### 5.4. Trao đổi giữa hai bên

Khi bên nhận chấp nhận yêu cầu kết nối, gia sư và phụ huynh có thể nhắn tin trực tiếp trên nền tảng _(D14)_. Nội dung trao đổi có thể gồm văn bản, hình ảnh hoặc tệp cần thiết. Lịch sử trao đổi được lưu để hai bên theo dõi. Người dùng có thể chặn hoặc báo cáo tài khoản và tin nhắn có hành vi không phù hợp.

Ở phiên bản đầu, chỉ gia sư và phụ huynh nhắn tin với nhau; học sinh chưa tham gia trao đổi _(C7)_.

Thông tin liên hệ cá nhân như email và số điện thoại không hiển thị công khai; chỉ được chia sẻ khi hai bên đã xác nhận hợp tác _(D8, D16)_.

## 6. Nghiệp vụ quản lý học sinh và lớp học

Sau khi gia sư và phụ huynh xác nhận hợp tác, hệ thống tạo lớp học từ các điều kiện đã thống nhất; gia sư tiếp nhận học sinh và tổ chức lớp học _(D9)_. Phiên bản đầu chưa hỗ trợ tạo lớp cho học sinh ngoài nền tảng.

Thông tin quản lý lớp có thể gồm:

- Tên lớp và học sinh tham gia.
- Phụ huynh liên hệ.
- Môn học, khối lớp và mục tiêu học tập.
- Ngày bắt đầu.
- Lịch học đã thống nhất.
- Học phí theo buổi và thời lượng mỗi buổi đã thống nhất.
- Tình trạng lớp: đang học, tạm nghỉ hoặc đã kết thúc.

Gia sư có thể:

- Xem danh sách học sinh đang giảng dạy và thông tin từng học sinh.
- Ghi nhận tình trạng, năng lực ban đầu và các lưu ý phục vụ giảng dạy.
- Thiết lập mục tiêu theo tháng hoặc học kỳ.
- Quản lý nhiều môn học cho một học sinh.
- Tổ chức lớp một kèm một. Lớp có nhiều học sinh được chuẩn bị sẵn về nghiệp vụ nhưng mở ở giai đoạn sau _(D7)_.
- Đề xuất thay đổi học phí; thay đổi chỉ có hiệu lực khi phụ huynh đồng ý và chỉ áp dụng cho các buổi học từ thời điểm đó về sau _(D17)_.
- Tạm dừng hoặc kết thúc lớp.
- Tra cứu lịch sử học tập sau khi lớp đã kết thúc.

Một học sinh có thể học nhiều môn và có thể có nhiều gia sư khác nhau. Việc một gia sư phụ trách một hay nhiều học sinh được xác định theo lớp học đã thống nhất.

Mỗi lớp gắn cố định với một gia sư. Muốn đổi gia sư thì kết thúc lớp cũ; phụ huynh kết nối với gia sư mới và hệ thống tạo lớp mới. Gia sư mới không xem được dữ liệu học tập do gia sư cũ ghi nhận _(D28)_.

## 7. Nghiệp vụ lịch học và điểm danh

Gia sư và phụ huynh thống nhất lịch học cho từng lớp. Lịch có thể là buổi học đơn lẻ hoặc lặp lại hằng tuần, với ngày, giờ, thời lượng và hình thức học cụ thể.

Các nghiệp vụ liên quan:

- Gia sư tạo lịch học theo thỏa thuận với phụ huynh.
- Hai bên theo dõi lịch theo ngày, tuần hoặc tháng.
- Gia sư cập nhật hoặc hủy buổi học khi có thay đổi. Việc thay đổi không làm thay đổi các buổi học đã diễn ra.
- Các bên nhận thông báo về buổi học sắp diễn ra, thay đổi hoặc hủy.
- Gia sư ghi nhận điểm danh cho từng học sinh sau buổi học.
- Gia sư ghi chú nội dung đã dạy và thời lượng thực tế.
- Buổi học được ghi nhận theo các tình trạng như đã học, học sinh vắng, gia sư vắng, đã hủy hoặc học bù.

**Quy định hủy và vắng** _(C5)_:

- Các bên báo hủy buổi học trước ít nhất 2 giờ.
- Ở phiên bản đầu, mọi trường hợp vắng hoặc hủy đều không tính tiền. Tuy vậy, hủy muộn (dưới 2 giờ) và vắng không báo được ghi nhận rõ để xem lại quy định sau giai đoạn thử nghiệm.

**Xác nhận buổi học** _(C5)_:

- Sau khi gia sư điểm danh, phụ huynh có 48 giờ để xác nhận hoặc khiếu nại thông tin buổi học. Phụ huynh được nhắc một lần trước khi hết hạn.
- Hết 48 giờ mà phụ huynh không phản hồi, buổi học tự động được chốt theo điểm danh của gia sư.
- Nếu phụ huynh khiếu nại, buổi học tạm chưa tính tiền. Hai bên có 3 ngày để tự thống nhất; nếu không thống nhất được, người kiểm duyệt quyết định. Vì học phí thanh toán ngoài nền tảng, người kiểm duyệt chỉ sửa bản ghi, không hoàn tiền.

Lịch sử buổi học, điểm danh, xác nhận và khiếu nại được lưu lại để phục vụ việc theo dõi tiến độ và đối chiếu học phí.

## 8. Nghiệp vụ bài tập, tài liệu và kiểm tra

> Nghiệp vụ bài tập được triển khai ngay sau phiên bản đầu _(D10)_. Ở phiên bản đầu, gia sư chỉ nhập điểm và nhận xét cơ bản (mục 9).

### 8.1. Gia sư giao bài

Gia sư tạo bài tập cho một hoặc nhiều học sinh trong lớp. Mỗi bài tập có thể có nội dung hướng dẫn, tệp hoặc hình ảnh đính kèm, đường dẫn tham khảo và hạn nộp. Gia sư theo dõi tình trạng nộp bài, chấm điểm, ghi nhận xét và yêu cầu học sinh làm lại nếu cần.

### 8.2. Học sinh thực hiện bài tập

Học sinh xem nội dung và hạn nộp, tải tài liệu liên quan, thực hiện bài tập rồi nộp bằng văn bản hoặc tệp đính kèm. Học sinh theo dõi trạng thái bài tập như chưa nộp, đã nộp hoặc quá hạn; sau khi gia sư chấm, học sinh có thể xem điểm và nhận xét.

### 8.3. Phụ huynh theo dõi bài tập

Phụ huynh xem bài tập đã giao cho con, tình trạng hoàn thành, bài đã nộp, điểm số và nhận xét của gia sư. Qua đó, phụ huynh nắm được mức độ chủ động và tình hình thực hiện nhiệm vụ học tập của con.

## 9. Nghiệp vụ theo dõi kết quả và báo cáo học tập

Nền tảng hỗ trợ gia sư ghi nhận và chia sẻ tiến độ học tập để phụ huynh hiểu được quá trình học của con, thay vì chỉ nhận thông tin về số buổi đã học.

Ở phiên bản đầu, gia sư ghi chú nội dung học, nhập điểm và nhận xét cơ bản; phụ huynh và học sinh xem được. Báo cáo tiến độ đầy đủ được triển khai ngay sau phiên bản đầu _(D10)_.

Các nội dung theo dõi có thể gồm:

- Số buổi đã học và tỷ lệ tham gia.
- Số bài tập được giao, đã hoàn thành và chưa hoàn thành.
- Điểm bài kiểm tra theo thời gian.
- Các kiến thức hoặc chủ đề đã học.
- Điểm mạnh và nội dung cần cải thiện.
- Mức độ hoàn thành mục tiêu học tập.
- Nhận xét của gia sư.
- Đề xuất nội dung cần tập trung trong giai đoạn tiếp theo.

Gia sư có thể gửi báo cáo sau mỗi buổi học, hàng tuần, hàng tháng hoặc khi kết thúc khóa học. Phụ huynh xem báo cáo để theo dõi tiến bộ và trao đổi với gia sư về việc điều chỉnh kế hoạch học tập.

Kết quả điểm số cần được đặt trong bối cảnh nhận xét của gia sư, tránh đánh giá toàn bộ năng lực của học sinh chỉ dựa trên một chỉ số đơn lẻ. Nền tảng không xếp hạng hay so sánh giữa các học sinh. Lịch sử học tập được duy trì kể cả khi lớp học kết thúc.

## 10. Nghiệp vụ học phí và thanh toán

Học phí của lớp được hai bên thống nhất khi xác nhận hợp tác và luôn tính theo buổi, kèm thời lượng mỗi buổi _(C6, D18)_. Học phí dự kiến theo giờ trong hồ sơ gia sư chỉ dùng để tham khảo.

Nền tảng hỗ trợ:

- Ghi nhận mức học phí theo buổi đã thống nhất.
- Mỗi buổi học lưu mức học phí áp dụng tại thời điểm đó, để thay đổi học phí sau này không làm sai số liệu cũ _(D17)_.
- Tổng hợp số buổi học đã diễn ra và số buổi được tính tiền, theo các quy định ở mục 7.
- Tổng hợp học phí theo tháng, lập riêng cho từng học sinh trong từng lớp; phụ huynh thanh toán một lần cho mỗi tháng, hạn là ngày 5 tháng kế tiếp _(C6, D23, D24)_.
- Ghi nhận các khoản phụ huynh cần thanh toán.
- Theo dõi trạng thái đã thanh toán hoặc chưa thanh toán.
- Lưu lịch sử thanh toán.

Ở phiên bản đầu, các bên thanh toán ngoài nền tảng; nền tảng chỉ ghi nhận và đối chiếu học phí, không thu hay giữ tiền hộ _(D6)_. Thanh toán trực tuyến có thể được mở rộng sau.

Hiện tại, các chức năng dành cho người dùng được định hướng miễn phí. Nghiệp vụ cần có khả năng mở rộng để sau này nền tảng có thể áp dụng các hình thức thu phí như phí đăng bài, phí kết nối, phí giao dịch hoặc gói dịch vụ dành cho gia sư. Các chính sách thu phí cụ thể chưa được chốt. Việc trả phí không được làm sai lệch kết quả tìm kiếm mà không công khai.

## 11. Nghiệp vụ đánh giá và uy tín gia sư

> Nghiệp vụ đánh giá được triển khai ngay sau phiên bản đầu _(D10)_.

Phụ huynh và học sinh (có tài khoản) có quan hệ dạy học đã xác nhận với gia sư từ 1 tháng trở lên được đánh giá gia sư đó _(C10, D22)_. Tiêu chí đánh giá gồm:

- Chất lượng giảng dạy.
- Khả năng truyền đạt.
- Sự đúng giờ và tinh thần trách nhiệm.
- Khả năng trao đổi, phối hợp với phụ huynh.
- Mức độ tiến bộ của học sinh.

Đánh giá cần gắn với trải nghiệm học tập hợp lệ, không cho phép đánh giá tùy ý từ người chưa từng có quan hệ học tập với gia sư. Mỗi người chỉ đánh giá một gia sư một lần và có thể cập nhật đánh giá của mình. Đánh giá của học sinh dưới 18 tuổi được hiển thị công khai và tính vào điểm trung bình nhưng ẩn danh, chỉ ghi cấp lớp (ví dụ "Học sinh lớp 8"); đánh giá của học sinh từ 18 tuổi hiển thị tên như phụ huynh _(D22)_. Gia sư có thể phản hồi đánh giá. Người dùng có thể báo cáo nội dung đánh giá không phù hợp; nền tảng tiếp nhận và xử lý nhằm hạn chế đánh giá giả hoặc hành vi trao đổi đánh giá.

Thông tin đánh giá là một căn cứ để phụ huynh tham khảo khi lựa chọn gia sư, nhưng cần được xem xét cùng hồ sơ, kinh nghiệm và nhu cầu cụ thể của người học.

## 12. Nghiệp vụ thông báo

Nền tảng thông báo cho người dùng khi phát sinh sự kiện có liên quan đến vai trò hoặc hoạt động của họ. Ở phiên bản đầu, thông báo được gửi trong ứng dụng và qua email; thông báo đẩy trên điện thoại được bổ sung khi có ứng dụng di động; không dùng tin nhắn SMS _(C12)_. Nội dung thông báo gửi ra ngoài nền tảng (email, thông báo đẩy) không chứa thông tin nhận dạng của học sinh.

Các sự kiện cần thông báo gồm:

- Có yêu cầu kết nối mới.
- Yêu cầu kết nối được chấp nhận hoặc từ chối.
- Yêu cầu kết nối sắp hết hạn.
- Có tin nhắn mới.
- Kết quả xét duyệt xác minh gia sư.
- Có lịch học sắp diễn ra.
- Lịch học được thay đổi hoặc hủy.
- Có buổi học cần phụ huynh xác nhận.
- Có bài tập mới hoặc bài tập sắp đến hạn.
- Có điểm số hoặc nhận xét mới.
- Có báo cáo học tập mới.
- Có khoản học phí đến hạn.

Thông báo giúp gia sư, phụ huynh và học sinh cập nhật kịp thời các công việc cần thực hiện.

## 13. Nghiệp vụ an toàn, xác minh và xử lý khiếu nại

Do nền tảng có đối tượng sử dụng là trẻ em và lưu trữ thông tin học tập, việc bảo vệ người học là một phần cốt lõi của nghiệp vụ.

Các nguyên tắc và hoạt động chính:

- Xác thực email của người dùng; số điện thoại được ghi nhận là thông tin tự khai.
- Yêu cầu gia sư xác minh danh tính theo quy trình trước khi hiển thị công khai và đăng bài.
- Phân biệt thông tin do người dùng tự khai với thông tin đã được xác minh.
- Không công khai thông tin nhận dạng, địa chỉ nhà, trường học hoặc thông tin liên hệ nhạy cảm của trẻ.
- Chỉ chia sẻ thông tin học sinh cần thiết cho gia sư sau khi hai bên xác nhận hợp tác.
- Giới hạn quyền xem hồ sơ và báo cáo học tập theo quan hệ giữa phụ huynh, học sinh và gia sư.
- Cho phép người dùng báo cáo tài khoản, bài đăng, tin nhắn hoặc đánh giá đáng ngờ.
- Cho phép chặn người dùng.
- Người kiểm duyệt tiếp nhận, xem xét và lưu lại kết quả xử lý báo cáo, khiếu nại; quản trị viên xử lý khiếu nại lại.
- Áp dụng biện pháp cảnh báo, hạn chế hoặc khóa tài khoản khi có vi phạm.
- Ghi nhật ký mọi lần người kiểm duyệt hoặc quản trị viên xem giấy tờ tùy thân, tin nhắn bị báo cáo và mọi thao tác xử lý.

Phụ huynh chỉ được xem dữ liệu học tập của những học sinh thuộc quyền quản lý của mình. Học sinh chỉ truy cập thông tin học tập của bản thân và các nội dung được phép. Gia sư chỉ tiếp cận thông tin của học sinh có quan hệ giảng dạy phù hợp.

## 14. Các luồng nghiệp vụ tổng thể

### 14.1. Luồng phụ huynh tìm gia sư

1. Phụ huynh tìm kiếm, lọc danh sách gia sư đã xác minh hoặc xem các bài đăng giới thiệu dịch vụ (chưa cần đăng nhập).
2. Phụ huynh xem hồ sơ, thông tin xác minh và đánh giá của gia sư.
3. Phụ huynh đăng ký và đăng nhập.
4. Phụ huynh tạo hồ sơ cho con.
5. Phụ huynh xác định môn học, cấp lớp, mục tiêu, ngân sách, lịch và hình thức học.
6. Phụ huynh lưu gia sư yêu thích hoặc gửi yêu cầu kết nối.
7. Gia sư chấp nhận yêu cầu; hai bên nhắn tin và thống nhất điều kiện học, gồm học phí theo buổi.
8. Cả hai bên xác nhận bắt đầu hợp tác; thông tin liên hệ được chia sẻ.
9. Hệ thống tạo lớp học từ điều kiện đã thống nhất; gia sư thiết lập lịch học chi tiết.
10. Trong quá trình học, phụ huynh theo dõi lịch, điểm danh, bài tập, điểm số, nhận xét, báo cáo và học phí của con.

### 14.2. Luồng gia sư tìm học sinh

1. Gia sư đăng ký và đăng nhập.
2. Gia sư hoàn thiện hồ sơ và xác minh danh tính; có thể xác minh thêm bằng cấp.
3. Gia sư đăng bài giới thiệu dịch vụ, môn học, mức phí và lịch có thể dạy.
4. Gia sư tìm các bài đăng nhu cầu tìm gia sư của phụ huynh.
5. Gia sư gửi đề nghị kết nối đến phụ huynh phù hợp.
6. Phụ huynh xem hồ sơ và chấp nhận hoặc từ chối đề nghị.
7. Hai bên nhắn tin, thống nhất điều kiện học và cùng xác nhận hợp tác.
8. Hệ thống tạo lớp học; gia sư quản lý lịch và học phí.
9. Gia sư tổ chức buổi học, điểm danh, giao bài tập, chấm bài và ghi nhận kết quả.
10. Gia sư gửi báo cáo tiến độ để phụ huynh theo dõi.

### 14.3. Luồng nghiệp vụ học tập sau khi kết nối

1. Quan hệ dạy học được xác nhận.
2. Hệ thống tạo lớp học với học sinh, môn học, mục tiêu và học phí theo buổi đã thống nhất.
3. Gia sư thiết lập lịch học theo thỏa thuận với phụ huynh.
4. Các buổi học được tổ chức theo lịch đã thống nhất.
5. Sau mỗi buổi, gia sư ghi nhận điểm danh, nội dung đã dạy và ghi chú cần thiết.
6. Phụ huynh xác nhận hoặc khiếu nại buổi học trong 48 giờ.
7. Gia sư giao bài tập hoặc tài liệu cho học sinh.
8. Học sinh thực hiện và nộp bài.
9. Gia sư chấm bài, nhập điểm và nhận xét.
10. Phụ huynh theo dõi tình hình học tập và trao đổi với gia sư khi cần.
11. Gia sư tổng hợp báo cáo định kỳ; cuối tháng hai bên đối chiếu học phí.
12. Khi kết thúc việc học, lớp được chuyển sang trạng thái kết thúc nhưng lịch sử học tập vẫn được lưu để tra cứu.

Bước 7, 8 và báo cáo định kỳ ở bước 11 được triển khai ngay sau phiên bản đầu.

## 15. Phạm vi nghiệp vụ theo giai đoạn

### 15.1. Phạm vi nghiệp vụ cốt lõi của phiên bản đầu

Phiên bản đầu cần giải quyết trọn vẹn hành trình cơ bản từ tìm gia sư đến bắt đầu học và theo dõi kết quả ban đầu:

- Người dùng đăng ký bằng email, đăng nhập và sử dụng theo vai trò.
- Gia sư tạo hồ sơ, khai báo năng lực, học phí và lịch rảnh; xác minh danh tính, có thể xác minh thêm bằng cấp.
- Gia sư đăng, cập nhật, ẩn hoặc đóng bài tuyển học sinh.
- Phụ huynh tạo hồ sơ con, mời con tạo tài khoản và đăng nhu cầu tìm gia sư.
- Phụ huynh tìm kiếm, lọc và xem hồ sơ gia sư; lưu gia sư yêu thích nếu kịp triển khai.
- Gia sư và phụ huynh gửi, nhận, chấp nhận hoặc từ chối yêu cầu kết nối.
- Gia sư và phụ huynh nhắn tin, trao đổi và xác nhận hợp tác.
- Hệ thống tạo lớp một kèm một từ điều kiện đã xác nhận; gia sư quản lý danh sách học sinh.
- Gia sư tạo lịch, cập nhật buổi học và ghi nhận trạng thái buổi học; phụ huynh xác nhận hoặc khiếu nại buổi học.
- Gia sư ghi chú nội dung học, cập nhật điểm và nhận xét cơ bản.
- Phụ huynh và học sinh xem lịch học và kết quả học tập.
- Ghi nhận và đối chiếu học phí theo tháng; thanh toán ngoài nền tảng.
- Thông báo trong ứng dụng và qua email.
- Người kiểm duyệt duyệt xác minh gia sư, kiểm duyệt bài đăng, xử lý báo cáo vi phạm và tranh chấp buổi học.
- Quản trị viên quản lý tài khoản, vai trò và danh mục.

### 15.2. Các nghiệp vụ có thể mở rộng ở giai đoạn sau

Triển khai ngay sau phiên bản đầu _(D2, D10)_:

- Ứng dụng trên điện thoại, tập trung vào lịch học, điểm danh, nhắn tin và thông báo.
- Bài tập: giao bài, nộp bài, chấm và yêu cầu làm lại.
- Đánh giá gia sư.
- Báo cáo tiến độ học tập.

Các nội dung sau được đề xuất là hướng phát triển, không phải điều kiện bắt buộc của phiên bản đầu:

- Học sinh trao đổi với gia sư, với sự cho phép và tham gia của phụ huynh.
- Người học trưởng thành tự sử dụng nền tảng; học sinh tự quản lý khi đủ 18 tuổi.
- Xác thực và đăng ký bằng số điện thoại.
- Lọc gia sư theo bán kính di chuyển.
- Mở rộng quản lý lớp học nhóm.
- Thanh toán trực tuyến, biên nhận điện tử, hoàn tiền và xử lý tranh chấp thanh toán.
- Học trực tuyến với phòng học video, chia sẻ màn hình và bảng trắng.
- Trợ lý học tập hỗ trợ gợi ý gia sư, soạn bài tập, tóm tắt tiến độ và đề xuất nội dung ôn tập.
- Lộ trình học tập cá nhân với đánh giá đầu vào, mục tiêu và các mốc hoàn thành.
- Kho tài liệu học tập dùng chung và bộ tài liệu theo lớp.
- Cơ chế tạo động lực học tập như mục tiêu tuần, huy hiệu và điểm thưởng.
- Gợi ý ghép nối gia sư – học sinh nâng cao.
- Các gói dịch vụ hoặc chính sách thu phí dành cho gia sư và người dùng.
- Báo cáo phân tích tiến độ học tập nâng cao.

## 16. Các quy tắc nghiệp vụ quan trọng

1. Nền tảng hỗ trợ cả hai chiều kết nối: phụ huynh tìm gia sư và gia sư tìm học sinh.
2. Một phụ huynh có thể quản lý nhiều hồ sơ học sinh; mỗi học sinh chỉ có một phụ huynh quản lý.
3. Một học sinh có thể học nhiều môn và có thể có nhiều gia sư.
4. Lớp học có thể theo hình thức một kèm một hoặc có nhiều học sinh; phiên bản đầu chỉ mở lớp một kèm một.
5. Gia sư phải được xác minh danh tính trước khi được hiển thị công khai và đăng bài. Xác minh bằng cấp là tùy chọn và được thể hiện bằng huy hiệu.
6. Email và số điện thoại không được công khai; chỉ chia sẻ giữa hai bên sau khi đã xác nhận hợp tác.
7. Thông tin nhận dạng và vị trí chính xác của trẻ không được công khai trong bài đăng; chỉ chia sẻ cho gia sư sau khi xác nhận hợp tác.
8. Phụ huynh chỉ được xem thông tin học tập của học sinh thuộc quyền quản lý.
9. Học sinh chỉ xem và thao tác trên nội dung học tập của bản thân trong phạm vi được phép.
10. Gia sư chỉ quản lý thông tin học tập của học sinh có quan hệ giảng dạy phù hợp.
11. Chỉ phụ huynh và học sinh có quan hệ học tập đã xác nhận từ 1 tháng trở lên mới được đánh giá gia sư; mỗi người đánh giá một gia sư một lần; đánh giá của học sinh dưới 18 tuổi hiển thị ẩn danh.
12. Lịch sử buổi học, điểm danh và xác nhận buổi học là căn cứ để theo dõi quá trình học và đối chiếu học phí.
13. Khi lớp kết thúc, lịch sử học tập vẫn được lưu để phục vụ tra cứu. Khi tài khoản bị xóa, lịch sử học tập được giữ ở dạng ẩn danh.
14. Ở giai đoạn hiện tại, nền tảng định hướng miễn phí; các phương án doanh thu được để mở cho giai đoạn sau.
15. Nền tảng hỗ trợ hoạt động trên phạm vi toàn quốc, với cả hình thức học trực tiếp và trực tuyến.
16. Nền tảng hỗ trợ tiếng Việt và tiếng Anh cho giao diện, danh mục và email; nội dung người dùng tự viết không được dịch _(C11)_.
17. Nhắn tin chỉ mở khi bên nhận chấp nhận yêu cầu kết nối.
18. Học phí của lớp tính theo buổi, chốt khi xác nhận hợp tác; mọi thay đổi cần phụ huynh đồng ý và chỉ áp dụng cho các buổi từ đó về sau.
19. Buổi học phụ huynh không phản hồi trong 48 giờ được chốt theo điểm danh của gia sư; buổi đang khiếu nại chưa được tính tiền.

---

_Tài liệu này tập trung mô tả đối tượng tham gia, mục tiêu, quy trình và quy tắc nghiệp vụ của TPS-Connection. Không đặc tả công nghệ, kiến trúc hệ thống, thiết kế dữ liệu, API hoặc giao diện._
