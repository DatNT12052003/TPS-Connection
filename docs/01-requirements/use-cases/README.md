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
