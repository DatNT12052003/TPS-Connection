# @tps/api

API của TPS-Connection: Express 5, TypeORM 1.x trên PostgreSQL 18, Redis (ioredis), BullMQ, kho lưu tệp S3 (SeaweedFS), email qua SMTP (nodemailer), log bằng pino, OpenAPI sinh từ Zod.

## Chạy lần đầu

Chạy từ thư mục gốc của repo:

```sh
npm install
npm run infra:up                               # PostgreSQL, Redis, SeaweedFS, Mailpit (Docker)
cp apps/api/.env.example apps/api/.env         # giá trị đã khớp với Docker, không cần sửa
npm run db:migrate -w @tps/api
npm run db:seed:areas -w @tps/api             # danh mục đơn vị hành chính (chạy lại được, không trùng)
npm run dev -w @tps/api                        # http://127.0.0.1:3000
```

Kiểm tra: `http://127.0.0.1:3000/health/ready` trả `{"status":"ok", ...}` với ba mục `database`, `redis`, `storage`; tài liệu API ở `/openapi.json`. Email gửi ra nằm ở Mailpit: http://127.0.0.1:8025.

Đã có `apps/api/.env` từ trước phần dịch vụ dùng chung (G1)? Thêm các biến `S3_*`, `SMTP_*`, `EMAIL_FROM`, `WORKERS_ENABLED` từ `.env.example`, nếu không API sẽ dừng và báo thiếu biến.

## Lệnh

| Lệnh (thêm `-w @tps/api` khi chạy từ gốc)                  | Việc                                                                                                      |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `npm run dev`                                              | Chạy bằng tsx, tự khởi động lại khi sửa code                                                              |
| `npm run build` / `npm start`                              | Biên dịch ra `dist/` / chạy bản đã biên dịch                                                              |
| `npm test`                                                 | Toàn bộ test (cần Docker: test tích hợp tự bật PostgreSQL, Redis, SeaweedFS, Mailpit bằng Testcontainers) |
| `npm run test:unit`                                        | Chỉ unit test, không cần Docker                                                                           |
| `npm exec -- jest test/app.test.ts`                        | Một tệp test; thêm `-t "not_found"` để lọc theo tên                                                       |
| `npm run lint`, `npm run type-check`                       |                                                                                                           |
| `npm run db:migrate` / `db:revert` / `db:status`           | Chạy migration / hoàn tác migration cuối / xem trạng thái                                                 |
| `npm run db:seed:areas` (`-- --dry-run`: chỉ xem)          | Nạp/cập nhật đơn vị hành chính từ `src/db/seeds/data/vn-units` (xem README ở đó)                          |
| `npm run db:migration:create -- src/db/migrations/<Tên>`   | Tạo migration rỗng                                                                                        |
| `npm run db:migration:generate -- src/db/migrations/<Tên>` | Sinh migration từ khác biệt giữa entity và database                                                       |

Migration mới phải được **thêm vào** `src/db/migrations/index.ts` (danh sách tường minh, không dùng glob).

## Cấu trúc

```
src/
  main.ts              khởi động: đọc env, kết nối DB/Redis, listen, dừng êm (SIGTERM/SIGINT)
  app.ts               createApp(deps): Express app chưa listen, nhận phụ thuộc từ ngoài (test thay bằng bản giả)
  config/env.ts        biến môi trường, kiểm tra bằng Zod; sai là dừng ngay và báo tên biến
  http/                middleware dùng chung: request id + log (pino-http), validate (Zod), error handler
  lib/                 logger, Redis client, AppError, storage (S3), email/ (EmailSender + SMTP)
  jobs/                hàng đợi BullMQ và worker (hiện có: email)
  db/                  DataSource, danh sách entity và migration
  modules/<miền>/      router → controller → service → repository (G2 trở đi); hiện có health
  openapi.ts           tài liệu OpenAPI từ schema Zod của @tps/shared
test/                  test HTTP (Supertest), test tích hợp *.int.test.ts (Testcontainers)
```

## Luồng một request

```
client
  │
  ▼
helmet → cors → requestLogger (gán x-request-id, req.log) → express.json (≤ 1 MB)
  │
  ▼
router          khai báo đường dẫn + middleware của route: validate({ params, query, body }), (G2: auth, quyền)
  │             sai dữ liệu → ZodError ─────────────────────────────────────────┐
  ▼                                                                             │
controller      đọc req đã validate, gọi service, chọn HTTP status, trả JSON    │
  │                                                                             │
  ▼                                                                             │
service         nghiệp vụ + kiểm tra quyền theo quan hệ (không biết Express);   │
  │             ném AppError(code) khi vi phạm quy tắc ─────────────────────────┤
  ▼                                                                             │
repository      truy cập dữ liệu qua TypeORM (G2 trở đi)                         │
  │                                                                             │
  ▼                                                                             ▼
PostgreSQL / Redis                                   errorHandler → { error: { code, message, details?, requestId } }
```

Không có route khớp → `notFoundHandler` → `not_found` (404). Phụ thuộc giữa các tầng chỉ đi một chiều từ trên xuống; `createApp(deps)` và các hàm `create…Service` nhận phụ thuộc qua tham số để test thay bằng bản giả.

## Thêm một module (G2 trở đi)

```
modules/<miền>/
  <miền>.router.ts       Router: đường dẫn, validate(...), middleware auth/quyền
  <miền>.controller.ts   create<Miền>Controller(service): RequestHandler cho từng route
  <miền>.service.ts      create<Miền>Service({ repository, ... }): nghiệp vụ, transaction
  <miền>.repository.ts   truy vấn TypeORM; entity khai báo trong src/db/entities.ts
```

Rồi gắn router vào `api` (`/api/v1`) trong `app.ts` và khai báo endpoint trong `openapi.ts`.

## Quy ước

- **Lỗi:** service ném `AppError(code, message)` với `code` trong `ErrorCode` của `@tps/shared`. Response luôn có dạng `{ "error": { "code", "message", "details?", "requestId" } }`; client hiển thị theo `code` (i18n), không dùng `message`. Lỗi Zod tự thành `validation_failed` (422) có `details` theo từng trường. Lỗi không lường trước trả `internal_error` (500), không lộ thông điệp nội bộ.
- **Validate:** ở router bằng middleware `validate({ params, query, body })` với schema Zod (ưu tiên schema trong `@tps/shared`). Controller nhận giá trị đã parse (đã ép kiểu, có default, bỏ trường thừa) và khai báo kiểu qua `RequestHandler<Params, unknown, Body, Query>`.
- **Route nghiệp vụ** gắn dưới `/api/v1` trong `app.ts`. `/health`, `/health/ready`, `/openapi.json` nằm ở gốc.
- **Entity:** mọi `@Column` ghi rõ `type`. Không bật `emitDecoratorMetadata` (tsx không hỗ trợ), không bật `synchronize`.
- **Số:** cột `bigint` (tiền `_vnd`, `COUNT(*)`) trả về `number`; vượt `Number.MAX_SAFE_INTEGER` thì báo lỗi thay vì làm tròn.
- **Thời gian:** kết nối PostgreSQL đặt `timezone=UTC`.
- **Timeout:** chờ kết nối DB tối đa 5 giây, mỗi câu truy vấn tối đa 15 giây (`statement_timeout`), mỗi request HTTP tối đa 30 giây; health check 2 giây cho mỗi phụ thuộc.
- **Log:** không log token, mật khẩu, cookie (đã che ở `lib/logger.ts`). Máy local in dễ đọc, máy chủ in JSON.

## Dịch vụ dùng chung

Tạo một lần trong `main.ts`, module nghiệp vụ nhận qua tham số (để test thay bằng bản giả).

**Lưu tệp** (`lib/storage.ts`). Trình duyệt upload thẳng lên kho lưu trữ, API không nhận nội dung tệp:

1. Client gửi `{ purpose, fileName, contentType, sizeBytes }` (schema `UploadRequest` trong `@tps/shared`).
2. `storage.createUploadTicket(...)` kiểm tra loại và dung lượng theo `FILE_RULES` (sai → 422 với mã `file_type_not_allowed` / `file_too_large`), chọn bucket theo mục đích (giấy tờ xác minh luôn private), rồi cấp URL PUT hết hạn sau 5 phút. Chữ ký gồm `Content-Type` và `Content-Length`: gửi sai loại hoặc sai số byte thì kho trả 403.
3. Client PUT tệp với đúng `headers` của ticket. (G2: tạo dòng `files` trạng thái `pending_upload` khi cấp ticket; client báo xong thì `headObject` kiểm tra rồi chuyển `ready`.)

Đọc tệp private bằng `createDownloadUrl` (5 phút, có thể đặt tên tải về); tệp public bằng `publicUrl`. Khóa lưu trữ là `<mục đích>/<chủ sở hữu>/<uuid>.<đuôi>`, không chứa tên tệp gốc. CORS của bucket đặt theo `CORS_ORIGINS` khi API khởi động (`S3_CONFIGURE_CORS`).

**Email** (`lib/email/`). Nghiệp vụ dùng interface `EmailSender`; bản cài đặt hiện tại là SMTP (Mailpit khi local, Gmail SMTP + App Password khi chạy thật, chỉ khác biến môi trường). Không gửi thẳng trong request: xếp vào hàng đợi bằng `jobs.enqueueEmail({ to, subject, text, html? })`. Nội dung email không chứa thông tin của trẻ (§12).

**Hàng đợi** (`jobs/`, BullMQ trên Redis). Job thử lại 5 lần, chờ 30 giây rồi tăng gấp đôi; dữ liệu job sai dạng thì ném `UnrecoverableError` (không thử lại). Log không ghi nội dung thư, địa chỉ nhận được che (`ph***@gmail.com`). Worker chạy cùng tiến trình API (`WORKERS_ENABLED=true`); khi cần tách, chạy thêm một tiến trình với `true` và đặt `false` cho các tiến trình API. Thêm loại việc mới (tự hủy yêu cầu quá hạn, tự xác nhận buổi học, xóa ảnh giấy tờ…): một hàng đợi + một worker trong `jobs/` theo mẫu email.

## Xác thực (G2)

Module `src/modules/auth`, quyết định D54 (mã OTP) và D57 (phiên đăng nhập). Các endpoint dưới `/api/v1/auth` (chi tiết ở `/openapi.json`):

| Endpoint                                        | Việc                                                              |
| ----------------------------------------------- | ----------------------------------------------------------------- |
| `POST /register`                                | Đăng ký phụ huynh/gia sư, gửi mã; chưa đăng nhập                  |
| `POST /email-verification/resend`, `/confirm`   | Gửi lại mã / nhập mã: xác thực email và đăng nhập                 |
| `POST /login`, `/refresh`, `/logout`            | Đăng nhập, làm mới phiên (xoay refresh token), đăng xuất          |
| `POST /password-reset/request`, `/confirm`      | Quên mật khẩu bằng mã; đổi xong đăng xuất mọi thiết bị            |
| `GET /me`                                       | Người dùng hiện tại                                               |
| `POST /password/change`                         | Đổi mật khẩu; đăng xuất các thiết bị khác, giữ thiết bị đang dùng |
| `GET /sessions`, `POST /sessions/revoke-others` | Thiết bị đang đăng nhập; đăng xuất thiết bị khác                  |

- Token nằm trong cookie httpOnly `tps_at` (access, 15 phút) và `tps_rt` (refresh). App mobile gửi `Authorization: Bearer <access>`.
- Middleware `authenticate` (`src/http/authenticate.ts`) kiểm tra token rồi đọc lại tài khoản ở mỗi request (khóa tài khoản có hiệu lực ngay), gắn `req.auth`.
- `originCheck` từ chối request thay đổi dữ liệu từ origin ngoài `CORS_ORIGINS` (chống CSRF).
- Mã OTP và bộ đếm rate limit ở Redis; mật khẩu băm argon2id; refresh token chỉ lưu hash SHA-256.
- Không lộ email nào đã đăng ký: gửi lại mã và quên mật khẩu luôn trả cùng một kết quả; đăng nhập sai email hay sai mật khẩu cùng là `invalid_credentials`.
- Không bao giờ log mật khẩu, mã OTP, token.

**Phân quyền** (`src/http/authorize.ts`, đặt sau `authenticate`): `requireRole('tutor', 'parent')` (có ít nhất một vai trò), `requireStaff()` (Manager hoặc Admin), `requireActiveAccount()` (chặn tài khoản bị hạn chế với hành động đăng bài, gửi yêu cầu, nhắn tin mới; B.9.3). Không có `req.auth` thì 401 (mặc định từ chối). Trong controller lấy người dùng bằng `requireAuth(req)`. Quyền theo quan hệ (phụ huynh – con, gia sư – lớp) kiểm tra ở service của từng module.

**Tạo Admin/Manager** (nhân viên không tự đăng ký):

```sh
npm run users:staff -w @tps/api -- grant  --email admin@vidu.vn --role admin --name "Nguyễn Văn A"
npm run users:staff -w @tps/api -- revoke --email admin@vidu.vn --role admin
```

Tài khoản mới chưa có mật khẩu: người được cấp chọn "Quên mật khẩu" để nhận mã qua email và tự đặt mật khẩu (không có mật khẩu nào đi qua terminal). Lệnh không cho thu hồi Admin cuối cùng.

Thử tay các endpoint: [http/auth.http](http/auth.http) (extension REST Client của VS Code), hoặc import [http/tps-auth.postman_collection.json](http/tps-auth.postman_collection.json) vào Postman Desktop (cùng 21 bước, có test status code; bước nhập mã OTP tự lấy mã từ email mới nhất trong Mailpit).

Khi dev: mã OTP xem ở Mailpit (http://127.0.0.1:8025). Gọi thử bằng curl trên Windows: gửi body từ tệp UTF-8 (`--data-binary @body.json`); tham số dòng lệnh của Git Bash làm mất dấu tiếng Việt.

## Hồ sơ phụ huynh, hồ sơ con, lời mời học sinh (G2)

Module `src/modules/parents` và `src/modules/learners`; thiết kế ở docs/thiet_ke_co_so_du_lieu.md mục 5.2 và 12, quyết định C9, D4, D16, D50.

| Endpoint                                      | Ai                          | Việc                                                         |
| --------------------------------------------- | --------------------------- | ------------------------------------------------------------ |
| `GET`, `PUT /me/parent-profile`               | phụ huynh                   | Hồ sơ của chính mình (tỉnh, xã, địa chỉ)                     |
| `GET /learners`                               | phụ huynh, học sinh         | Con đang quản lý / hồ sơ của chính học sinh                  |
| `POST /learners`                              | phụ huynh                   | Tạo hồ sơ con, bắt buộc đồng ý xử lý dữ liệu của con         |
| `GET /learners/:id`                           | phụ huynh quản lý, học sinh | Một hồ sơ                                                    |
| `PATCH`, `DELETE /learners/:id`               | phụ huynh quản lý           | Sửa; xóa mềm (rút đồng ý, hủy lời mời)                       |
| `POST`, `DELETE /learners/:id/invitation`     | phụ huynh quản lý           | Gửi lời mời (thay lời mời cũ); hủy lời mời đang mở           |
| `POST /student-invitations/lookup`, `/accept` | chưa đăng nhập              | Xem lời mời; nhận lời mời: tạo tài khoản học sinh, đăng nhập |

- **Quyền theo quan hệ** ở `src/modules/learners/learner-access.ts`: `isParentOf(userId, learnerId)` (qua view `learner_managers`), `isStudentSelf(userId, learnerId)`, `assertParentOf`, `assertCanView`. Mọi endpoint chạm vào một hồ sơ con đi qua các hàm này trong service. Không có quyền thì **404**, giống hồ sơ không tồn tại, để không lộ hồ sơ có tồn tại hay không. `teachesStudent` thêm ở G6 cùng bảng lớp học.
- Mỗi hồ sơ con có đúng một phụ huynh quản lý (C9): partial unique index `learner_guardians_one_active_uq`.
- Đồng ý xử lý dữ liệu của con: một dòng `user_consents` loại `child_data_processing` gắn `learner_id`, phiên bản `CHILD_DATA_CONSENT_VERSION` (@tps/shared), ghi cùng transaction với hồ sơ. Xóa hồ sơ thì ghi `withdrawn_at`, giữ dòng làm bằng chứng.
- Học sinh chỉ xem (D4); không thấy ghi chú phụ huynh viết cho gia sư và lời mời.
- Lời mời (D50): token 256 bit, chỉ lưu SHA-256; dùng một lần, hết hạn 7 ngày; mỗi hồ sơ một lời mời đang mở. Liên kết trong email là `<WEB_URL>/student-invitation#token=…` (token sau `#` không tới máy chủ web, không vào log). Nhận lời mời bằng email đã có tài khoản đã xác thực: 409 `email_taken`. Mời không kiểm tra email đã đăng ký hay chưa (không lộ email). Giới hạn 10 lời mời mỗi giờ cho một phụ huynh, cộng giới hạn theo IP.
- Chưa làm ở bản này: xóa hồ sơ đã có tài khoản học sinh (409), đổi phụ huynh quản lý (Admin, C9), ngưỡng tuổi tài khoản học sinh (chờ luật sư, D4).

Thử tay: [http/learners.http](http/learners.http).

## Ghi chú cho Windows

Test tích hợp cần Docker Desktop đang chạy. Một số bản Docker Desktop không mở pipe `//./pipe/docker_engine` mà Testcontainers cần; khi đó `test/global-setup.ts` tự mở pipe tạm, chuyển tiếp sang endpoint của Docker context hiện tại, và đóng lại khi test xong.
