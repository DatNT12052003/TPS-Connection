# Use case

Mỗi phân hệ MVP có một file. Mỗi use case gồm tác nhân, điều kiện, các luồng và tiêu chí nghiệm thu. Một tính năng chỉ được coi là xong khi đạt mọi tiêu chí nghiệm thu của nó.

Use case không định nghĩa lại quy tắc. Chúng trỏ tới [quy tắc nghiệp vụ](../business-rules.md), [máy trạng thái](../state-machines.md) và [phân quyền](../roles-permissions.md). Khi có khác biệt, ba tài liệu đó được ưu tiên.

Giá trị ghi `ĐX` là đề xuất, chưa được chủ sản phẩm xác nhận.

## Tiến độ

| File | Phân hệ | Trạng thái |
| --- | --- | --- |
| [accounts.md](accounts.md) | Tài khoản | Chờ duyệt |
| [verification.md](verification.md) | Xác minh gia sư | Chờ duyệt |
| [connection.md](connection.md) | Kết nối | Chờ duyệt |
| [marketplace.md](marketplace.md) | Hồ sơ gia sư, bài đăng, tìm kiếm | Chờ duyệt |
| [messaging.md](messaging.md) | Chat, chặn | Chờ duyệt |
| [notifications.md](notifications.md) | Thông báo | Chờ duyệt |
| [teaching.md](teaching.md) | Lớp, lịch, điểm danh, xác nhận, tranh chấp | Chờ duyệt |
| [learning.md](learning.md) | Ghi chú, điểm, nhận xét | Chờ duyệt |
| [tuition.md](tuition.md) | Học phí | Chờ duyệt |
| [moderation.md](moderation.md) | Báo cáo, kiểm duyệt, quản trị | Chờ duyệt |

Bài tập và đánh giá làm ngay sau MVP (D10), nên chưa có file trong đợt này.

## Câu hỏi cần xác nhận

| Mã | Câu hỏi | Đề xuất | Ảnh hưởng |
| --- | --- | --- | --- |
| N4 | Phụ huynh có được tự kết thúc lớp không? Tài liệu phân quyền ban đầu chỉ cho gia sư, khiến phụ huynh không dừng được việc học của con, và cũng không xóa được tài khoản theo BR-1303. | Có. Cả hai bên đều tự kết thúc được, không cần bên kia đồng ý. | BR-611, UC-TCH-09 |
| N5 | Khi có báo cáo về dấu hiệu xâm hại trẻ em, nền tảng làm gì ngoài việc khóa tài khoản? PRD chưa có quy trình báo cơ quan chức năng hay giữ bằng chứng. | Luật sư tư vấn và viết thành quy trình vận hành trước khi thử nghiệm. Phần mềm đã có tạm khóa khẩn cấp, ưu tiên hàng chờ và lưu bản sao nội dung. | UC-MOD-01, UC-MOD-02 |
| N6 | Có cho chặn người đang dạy hoặc đang học với mình không? | Không. Phải kết thúc lớp trước, vì đang có lớp mà không liên lạc được thì không vận hành được. Người dùng vẫn báo cáo được ngay. | BR-512, UC-MSG-04 |
| N7 | Bài đăng cần Manager duyệt trước khi hiện, hay hiện ngay rồi xử lý khi có báo cáo? C1 ghi Manager duyệt bài đăng, còn PRD §3.3 ghi kiểm duyệt nếu cần. | Hiện ngay rồi xử lý khi có báo cáo, vì gia sư đã xác minh danh tính và bài tìm gia sư không công khai. Duyệt trước sẽ tăng đáng kể việc cho Manager. | BR-307, UC-MKT-02 |
