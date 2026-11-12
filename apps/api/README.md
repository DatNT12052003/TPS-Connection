# @tps/api

API của TPS-Connection: Express 5, TypeORM 1.x trên PostgreSQL 18, Redis (ioredis), log bằng pino, OpenAPI sinh từ Zod.

## Chạy lần đầu

Chạy từ thư mục gốc của repo:

```sh
npm install
npm run infra:up                               # PostgreSQL, Redis, SeaweedFS, Mailpit (Docker)
cp apps/api/.env.example apps/api/.env         # giá trị đã khớp với Docker, không cần sửa
npm run db:migrate -w @tps/api
npm run dev -w @tps/api                        # http://127.0.0.1:3000
```

Kiểm tra: `http://127.0.0.1:3000/health/ready` trả `{"status":"ok", ...}`; tài liệu API ở `/openapi.json`.

## Lệnh

| Lệnh (thêm `-w @tps/api` khi chạy từ gốc)                  | Việc                                                                                  |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `npm run dev`                                              | Chạy bằng tsx, tự khởi động lại khi sửa code                                          |
| `npm run build` / `npm start`                              | Biên dịch ra `dist/` / chạy bản đã biên dịch                                          |
| `npm test`                                                 | Toàn bộ test (cần Docker: test tích hợp tự bật PostgreSQL, Redis bằng Testcontainers) |
| `npm run test:unit`                                        | Chỉ unit test, không cần Docker                                                       |
| `npm exec -- jest test/app.test.ts`                        | Một tệp test; thêm `-t "not_found"` để lọc theo tên                                   |
| `npm run lint`, `npm run type-check`                       |                                                                                       |
| `npm run db:migrate` / `db:revert` / `db:status`           | Chạy migration / hoàn tác migration cuối / xem trạng thái                             |
| `npm run db:migration:create -- src/db/migrations/<Tên>`   | Tạo migration rỗng                                                                    |
| `npm run db:migration:generate -- src/db/migrations/<Tên>` | Sinh migration từ khác biệt giữa entity và database                                   |

Migration mới phải được **thêm vào** `src/db/migrations/index.ts` (danh sách tường minh, không dùng glob).

## Cấu trúc

```
src/
  main.ts              khởi động: đọc env, kết nối DB/Redis, listen, dừng êm (SIGTERM/SIGINT)
  app.ts               createApp(deps): Express app chưa listen, nhận phụ thuộc từ ngoài (test thay bằng bản giả)
  config/env.ts        biến môi trường, kiểm tra bằng Zod; sai là dừng ngay và báo tên biến
  http/                middleware dùng chung: request id + log (pino-http), validate (Zod), error handler
  lib/                 logger, Redis client, AppError
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

## Ghi chú cho Windows

Test tích hợp cần Docker Desktop đang chạy. Một số bản Docker Desktop không mở pipe `//./pipe/docker_engine` mà Testcontainers cần; khi đó `test/global-setup.ts` tự mở pipe tạm, chuyển tiếp sang endpoint của Docker context hiện tại, và đóng lại khi test xong.
