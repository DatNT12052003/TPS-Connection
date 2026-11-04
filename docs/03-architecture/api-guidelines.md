# Quy ước API

Tài liệu này quy định cách mọi endpoint của `apps/api` được thiết kế, để Web và Mobile phát triển độc lập trên cùng một hợp đồng. Đây là đề xuất thiết kế, chờ duyệt. Danh sách endpoint đầy đủ nằm trong đặc tả OpenAPI được sinh từ mã nguồn, không viết tay ở đây.

Phân quyền nằm ở [authorization.md](authorization.md).

## Nguyên tắc

1. **OpenAPI là hợp đồng duy nhất** giữa API và client. Web và Mobile sinh client có kiểu từ đặc tả, không dùng chung mã nguồn với API.
2. **Không phá vỡ trong `/v1`** (NFR-C01). CI so sánh đặc tả với bản trước và chặn thay đổi phá vỡ.
3. **Máy chủ là nguồn sự thật.** Không tin vai trò, giá, thời gian hay ID chủ sở hữu do client gửi.

Vì dùng Express (D12), đặc tả được sinh từ schema Zod dùng để kiểm tra dữ liệu, ví dụ qua `zod-to-openapi`. Như vậy schema kiểm tra và tài liệu không thể lệch nhau. Thư viện cụ thể sẽ chốt khi làm POC.

## Định dạng chung

| Hạng mục | Quy ước |
| --- | --- |
| Đường dẫn gốc | `/api/v1` |
| Dữ liệu | JSON, UTF-8 |
| Tên trường | `camelCase` trong JSON; `snake_case` trong cơ sở dữ liệu |
| Tên tài nguyên | Danh từ số nhiều, `kebab-case`: `/connection-requests` |
| ID | UUID dạng chuỗi |
| Thời gian | ISO 8601 UTC: `2026-11-04T13:07:09Z`. Client tự đổi sang giờ Việt Nam |
| Ngày thuần | `YYYY-MM-DD` |
| Tiền | Số nguyên VND, hậu tố `Vnd`: `pricePerLessonVnd` |
| Giá trị trạng thái | Chữ thường: `pending`, `discussing` |
| Trường trống | Trả `null`, không bỏ trường. Trừ trường nhạy cảm theo quyền, xem bên dưới |

**Trường nhạy cảm không có quyền thì không có trong phản hồi**, không trả `null`. Ví dụ `phone` chỉ xuất hiện khi hai bên đã xác nhận hợp tác (AC-CON-05.5). Client phải xử lý trường vắng mặt.

## Phương thức và thao tác

| Việc | Cách gọi |
| --- | --- |
| Đọc | `GET /connection-requests/{id}` |
| Tạo | `POST /connection-requests` |
| Sửa một phần | `PATCH /students/{id}` |
| Xóa | `DELETE /tutor-posts/{id}` |
| Chuyển trạng thái | `POST /connection-requests/{id}/accept` |

Mọi chuyển trạng thái là một endpoint hành động riêng, không dùng `PATCH { status }`. Mỗi hành động có quyền và điều kiện riêng theo [máy trạng thái](../01-requirements/state-machines.md), nên dễ kiểm tra và dễ ghi lịch sử.

## Mã trạng thái và lỗi

| Mã HTTP | Khi nào |
| --- | --- |
| 200, 201, 204 | Thành công |
| 400 | Dữ liệu sai định dạng |
| 401 | Chưa đăng nhập, hoặc token không hợp lệ |
| 403 | Đã biết tài nguyên, nhưng không được làm thao tác này |
| 404 | Không tồn tại, hoặc người gọi không được biết nó tồn tại |
| 409 | Xung đột trạng thái, trùng dữ liệu, sai phiên bản |
| 422 | Đúng định dạng, nhưng vi phạm quy tắc nghiệp vụ |
| 429 | Vượt giới hạn tần suất; kèm `Retry-After` |
| 500 | Lỗi máy chủ; không lộ chi tiết nội bộ |

Lỗi theo dạng Problem Details (RFC 9457), thêm `code` ổn định và `requestId`:

```json
{
  "type": "urn:tps-connection:error:connection-duplicate-open-request",
  "title": "Duplicate open request",
  "status": 409,
  "code": "CONNECTION_DUPLICATE_OPEN_REQUEST",
  "requestId": "01J...",
  "fields": []
}
```

- Client dịch thông báo theo `code`, không hiển thị `title` cho người dùng (C11, NFR-U04).
- Lỗi form có `fields`: `[{ "path": "email", "code": "INVALID_FORMAT" }]`.
- Mã `code` là một phần của hợp đồng. Thêm mã mới không phải là thay đổi phá vỡ, nên client phải có xử lý mặc định.

## Phân trang và lọc

| Loại danh sách | Cách phân trang | Ví dụ |
| --- | --- | --- |
| Thay đổi liên tục (tin nhắn, thông báo) | Cursor | `?cursor=abc&limit=20` |
| Tìm kiếm, danh sách quản trị | Số trang | `?page=2&limit=20` |

Tối đa 50 bản ghi mỗi trang (NFR-F07). Phản hồi:

```json
{ "data": [], "page": { "nextCursor": null, "limit": 20 } }
```

Bộ lọc và sắp xếp dùng query string và chỉ nhận các giá trị đã khai báo: `GET /tutors?subjectId=...&sort=price_asc`. Giá trị lạ trả 400.

## Đồng thời và gửi lại

| Tình huống | Cách xử lý | Liên quan |
| --- | --- | --- |
| Tạo có thể bị gửi lại do mất mạng | Header `Idempotency-Key`, lưu 24 giờ. Gửi lại trả đúng kết quả cũ | Tạo yêu cầu, đánh dấu thanh toán |
| Gửi tin nhắn | `clientMessageId` trong nội dung | AC-MSG-02.4 |
| Xác nhận bộ điều kiện | Gửi `termsVersion`; khác phiên bản mới nhất trả 409 | AC-CON-05.2 |
| Sửa dữ liệu có thể xung đột | Gửi `version` đọc được; lệch trả 409 | Lớp, lịch, hồ sơ |
| Hai người cùng nhận một hồ sơ | Cập nhật có điều kiện; người sau nhận 409 | AC-VER-02.6 |

## Xác thực

| Client | Access token | Refresh token |
| --- | --- | --- |
| Web | Cookie `httpOnly`, `Secure`, `SameSite=Lax` | Cookie riêng, chỉ gửi tới `/api/v1/auth` (refresh và đăng xuất đều cần) |
| Mobile (chưa làm, D2) | Header `Authorization: Bearer` | SecureStore, gửi trong nội dung khi refresh |

- Access token sống 15 phút; refresh token sống 30 ngày và xoay vòng (NFR-S03).
- Web dùng thêm CSRF token cho mọi thao tác ghi vì đăng nhập bằng cookie. API yêu cầu header `X-CSRF-Token` ở mọi route không công khai trừ `GET`. Token là HMAC của `family_id`, nên giữ nguyên qua các lần xoay vòng. Giá trị nằm trong cookie `tps_csrf`; Web phải đưa nó vào trang rồi nhận lại qua form, không được tự chép từ cookie sang header vì như vậy mất tác dụng.
- Route công khai không kiểm tra CSRF vì không hành động theo danh tính đã đăng nhập. `refresh` và `logout` là route công khai, dựa vào `SameSite=Lax`.
- CORS chỉ cho phép các domain Web đã khai báo.
- Trình duyệt chỉ nói chuyện với Web. Web gọi API từ máy chủ và chuyển tiếp `Set-Cookie` về trình duyệt, nên cookie thuộc domain của Web. Vì cookie refresh chỉ gửi tới `/api/v1/auth`, Web có route trùng đường dẫn `/api/v1/auth/refresh` và `/api/v1/auth/logout`.
- SSR của Web chuyển tiếp cookie người dùng khi gọi API. Trang công khai gọi các endpoint công khai và không dùng cookie, để có thể cache an toàn.
- Liên kết trong email để token ở fragment (`#token=...`) để token không vào log máy chủ và header `Referer`. Trang chỉ xác nhận khi người dùng bấm nút, vì trình quét email cũng mở liên kết.
- Đăng ký, gửi lại xác thực và quên mật khẩu trả `202` với nội dung như nhau dù email có tồn tại hay không. Giới hạn tần suất tính theo địa chỉ email, kể cả email chưa có tài khoản, nên `429` cũng không làm lộ thông tin.

## Tệp

1. Client gọi `POST /files` kèm mục đích, tên, loại, dung lượng. API kiểm tra quyền và giới hạn rồi trả URL tải lên đã ký.
2. Client tải trực tiếp lên kho tệp.
3. Client gọi `POST /files/{id}/complete`. API kiểm tra nội dung tệp thật, không theo đuôi tệp (NFR-S07).
4. Khi đọc, client gọi endpoint của tài nguyên để nhận URL đọc đã ký, ngắn hạn. API không trả đường dẫn cố định.

Giấy tờ xác minh chỉ dùng bucket riêng và URL 5 phút.

- Với Web, "client" ở bước 2 là máy chủ Web: trình duyệt gửi tệp cho Web, Web đẩy lên kho. Trình duyệt vì vậy chỉ nói chuyện với Web, kho tệp không cần mở CORS, và form vẫn chạy khi không có JavaScript. Mobile sẽ tải thẳng lên kho.
- URL tải lên có ký cả dung lượng, nên kho từ chối tệp lớn hơn số đã khai. Bước 3 vẫn đo lại dung lượng thật.
- Bước 3 giải mã toàn bộ ảnh, nên tệp đổi đuôi hoặc phần đầu thật nhưng dữ liệu hỏng đều bị từ chối. SVG bị từ chối vì có thể chứa script.
- Ảnh đại diện được mã hóa lại thành WebP 512 px, nên thông tin vị trí và máy ảnh trong ảnh chụp không bao giờ tới người xem.
- Ở môi trường phát triển và CI, kho tệp là SeaweedFS. Code chỉ dùng giao thức S3, nên không phụ thuộc vào máy chủ cụ thể.

## Thời gian thực

Socket.IO chỉ dùng để đẩy sự kiện. Mọi thao tác ghi đều đi qua REST, nên quyền và kiểm tra dữ liệu chỉ có một đường đi.

| Sự kiện | Dữ liệu | Khi nào |
| --- | --- | --- |
| `message.created` | `conversationId`, `messageId`, `createdAt` | Có tin nhắn mới |
| `conversation.read` | `conversationId`, `userId`, `lastReadMessageId` | Có người đọc |
| `conversation.read_only` | `conversationId` | Hội thoại bị đóng |
| `notification.created` | `notificationId`, `type` | Có thông báo mới |

- Sự kiện chỉ chứa ID; client gọi REST để lấy nội dung, nhờ vậy nội dung luôn được kiểm tra quyền.
- Riêng `message.created` có thể kèm nội dung để đạt NFR-F05, vì phòng chat đã được kiểm tra quyền khi vào.
- Sau khi kết nối lại, client gọi `GET /conversations/{id}/messages?afterId=...` để lấy tin đã lỡ (NFR-R07).

## Các nhóm endpoint

Bảng này giúp định hướng; chi tiết nằm trong OpenAPI.

| Nhóm | Ví dụ | Use case |
| --- | --- | --- |
| Xác thực | `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout` | [accounts](../01-requirements/use-cases/accounts.md) |
| Tài khoản | `GET, PATCH /me`, `DELETE /me`, `/students`, `/students/{id}/invitations` | accounts |
| Công khai | `GET /public/tutors`, `/public/tutors/{id}`, `/public/tutor-posts`, `/catalog/*` | [marketplace](../01-requirements/use-cases/marketplace.md) |
| Bài đăng | `/tutor-posts`, `/tutor-request-posts`, `POST /tutor-posts/{id}/publish` | marketplace |
| Xác minh | `/verification-requests`, `POST /verification-requests/{id}/approve` | [verification](../01-requirements/use-cases/verification.md) |
| Kết nối | `/connection-requests`, hành động `accept`, `reject`, `discuss`, `cancel`, `/terms`, `/terms/{version}/confirm` | [connection](../01-requirements/use-cases/connection.md) |
| Chat | `/conversations`, `/conversations/{id}/messages`, `/user-blocks` | [messaging](../01-requirements/use-cases/messaging.md) |
| Thông báo | `/notifications`, `/notification-preferences` | [notifications](../01-requirements/use-cases/notifications.md) |
| Lớp, buổi | `/classes`, `/classes/{id}/schedules`, `/lessons/{id}/cancel`, `/attendance`, `/confirm`, `/dispute` | [teaching](../01-requirements/use-cases/teaching.md) |
| Học tập | `/classes/{id}/assessments`, `/students/{id}/results` | [learning](../01-requirements/use-cases/learning.md) |
| Học phí | `/tuition-records`, `POST /tuition-records/{id}/mark-paid`, `/tuition-records/export` | [tuition](../01-requirements/use-cases/tuition.md) |
| Quản trị | `/admin/*`, `/moderation/*` | [moderation](../01-requirements/use-cases/moderation.md) |
| Vận hành | `GET /health`, `GET /meta/min-client-version` | NFR-C02 |

## Tiến hóa API

| Thay đổi | Có phá vỡ không? |
| --- | --- |
| Thêm endpoint, thêm trường phản hồi, thêm tham số tùy chọn, thêm mã lỗi | Không |
| Xóa hoặc đổi tên trường, đổi kiểu, thêm trường bắt buộc khi gửi, đổi ý nghĩa | Có; cần `/v2` hoặc lộ trình bỏ dần |

Trường sắp bỏ được đánh dấu `deprecated` trong OpenAPI và giữ cho đến khi không còn client dùng. Với Mobile, thời gian này dài hơn Web vì phiên bản cũ tồn tại lâu trên máy người dùng.

## Log và theo dõi

- Mọi phản hồi có header `X-Request-Id`, trùng với `requestId` trong lỗi và log (NFR-O01).
- Không log nội dung yêu cầu của các endpoint xác thực, chat, xác minh (NFR-S09).
