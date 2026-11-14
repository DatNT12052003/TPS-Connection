# TPS-Connection

Nền tảng kết nối gia sư, phụ huynh và học sinh: tìm và kết nối, rồi quản lý lớp học, buổi học, điểm danh và đối soát học phí. Vận hành bởi Manager (kiểm duyệt) và Admin (hệ thống).

Monorepo TypeScript (npm workspaces + Turborepo):

| Thư mục           | Gói           | Nội dung                                                                            |
| ----------------- | ------------- | ----------------------------------------------------------------------------------- |
| `apps/api`        | `@tps/api`    | API: Express 5, TypeORM, PostgreSQL, Redis, BullMQ, kho lưu tệp S3, email SMTP      |
| `apps/web`        | `@tps/web`    | Web: React Router 8 (SSR), Vite 8, Tailwind 4, TanStack Query, i18n vi/en           |
| `apps/mobile`     | (chưa có)     | React Native + Expo, phát hành ở bản thứ hai                                        |
| `packages/shared` | `@tps/shared` | Enum trạng thái, Zod schema, mã lỗi, chuỗi i18n dùng chung                          |
| `packages/config` | `@tps/config` | Token thiết kế, preset Tailwind, cấu hình TypeScript, ESLint, Prettier              |
| `docker/`         |               | Cấu hình dịch vụ local cho `compose.yaml` (PostgreSQL, Redis, SeaweedFS, Mailpit)   |
| `docs/`           |               | Đặc tả nghiệp vụ, thuật ngữ, thiết kế CSDL, kế hoạch, công nghệ, nhật ký quyết định |

## Cần cài trước

- **Node.js 24** (bản trong `.nvmrc`; tối thiểu 22.13). Có nvm thì chạy `nvm use`.
- **Docker Desktop** (hoặc Docker Engine + Compose v2), đang chạy.
- **Git**.

## Chạy lần đầu

Chạy từ thư mục gốc của repo (trên Windows dùng Git Bash, hoặc thay `cp` bằng `copy`):

```sh
git clone https://github.com/DatNT12052003/TPS-Connection.git
cd TPS-Connection

npm install                                   # cài mọi gói, đồng thời cài git hook (Husky)
npm run infra:up                              # bật PostgreSQL, Redis, SeaweedFS, Mailpit và chờ sẵn sàng
cp apps/api/.env.example apps/api/.env        # giá trị đã khớp với Docker, không cần sửa
npm run db:migrate -w @tps/api                # tạo cấu trúc CSDL (kèm danh mục môn học, khối lớp, vai trò)
npm run db:seed:areas -w @tps/api             # nạp 34 tỉnh/thành và 3.321 xã/phường
npm run dev                                   # chạy API và web cùng lúc
```

Mở http://localhost:5173/status: cả ba mục cơ sở dữ liệu, bộ nhớ đệm và kho lưu tệp phải báo "Hoạt động". Nếu có mục báo lỗi, xem [Sự cố thường gặp](#sự-cố-thường-gặp).

Tệp `apps/web/.env` không bắt buộc (thiếu thì dùng mặc định); `.env` ở thư mục gốc chỉ cần khi muốn đổi cổng Docker (xem `.env.example`).

### Địa chỉ khi chạy local

| Dịch vụ                    | Địa chỉ                                                                          |
| -------------------------- | -------------------------------------------------------------------------------- |
| Web                        | http://localhost:5173 (khu người dùng `/app`, khu Manager/Admin `/admin`)        |
| API                        | http://127.0.0.1:3000 (`/health/ready`, tài liệu API `/openapi.json`)            |
| Mailpit (xem email đã gửi) | http://127.0.0.1:8025                                                            |
| SeaweedFS (xem tệp đã lưu) | http://127.0.0.1:8888                                                            |
| PostgreSQL                 | `127.0.0.1:5433`, user / mật khẩu / database: `tps` / `tps_dev_password` / `tps` |
| Redis                      | `127.0.0.1:6379`                                                                 |

Đăng ký tài khoản ở http://localhost:5173/register; mã xác thực email xem ở Mailpit. Tài khoản Manager/Admin tạo bằng lệnh `users:staff` (xem `apps/api/README.md`).

## Lệnh

Chạy từ thư mục gốc. Lệnh không kèm `-w` chạy cho mọi gói qua Turborepo (`@tps/shared` luôn được build trước vì các gói khác dùng `dist/` của nó).

| Lệnh                                      | Việc                                                                      |
| ----------------------------------------- | ------------------------------------------------------------------------- |
| `npm install`                             | Cài phụ thuộc (CI dùng `npm ci`; nhớ commit `package-lock.json`)          |
| `npm run dev`                             | Chạy API, web và `@tps/shared` ở chế độ theo dõi thay đổi                 |
| `npm run build`                           | Build mọi gói                                                             |
| `npm run lint`                            | ESLint                                                                    |
| `npm run type-check`                      | TypeScript                                                                |
| `npm test`                                | Mọi test (test tích hợp của API cần Docker đang chạy)                     |
| `npm run format` / `npm run format:check` | Prettier: sửa / chỉ kiểm tra                                              |
| `npm run <lệnh> -w <gói>`                 | Chạy cho một gói, ví dụ `npm run dev -w @tps/api`, `npm test -w @tps/web` |
| `npm run infra:up` / `infra:down`         | Bật / tắt dịch vụ Docker (giữ dữ liệu)                                    |
| `npm run infra:reset`                     | Tắt và **xóa toàn bộ dữ liệu** Docker (CSDL, tệp, email)                  |
| `npm run infra:logs` / `infra:ps`         | Xem log / trạng thái dịch vụ Docker                                       |

### Chạy một test

```sh
# API (Jest): một tệp, lọc theo tên bằng -t
npm exec -w @tps/api -- jest test/app.test.ts -t "not_found"
npm run test:unit -w @tps/api                 # chỉ unit test, không cần Docker

# Web (Vitest)
npm exec -w @tps/web -- vitest run app/lib/api.test.ts -t "tên test"

# Shared (Vitest)
npm exec -w @tps/shared -- vitest run src/schemas/common.test.ts -t "Password"
```

Lệnh riêng của từng gói (migration, build bản chạy thật, token thiết kế...) có trong README của gói: [apps/api](apps/api/README.md), [apps/web](apps/web/README.md), [packages/shared](packages/shared/README.md), [packages/config](packages/config/README.md).

## Commit và CI

- **Trước mỗi commit**, Husky chạy lint-staged trên các tệp đã stage: `eslint --fix` trong gói chứa tệp, rồi Prettier. Còn lỗi lint thì commit bị chặn. Cấu hình ở `lint-staged.config.js`.
- **CI** (GitHub Actions, `.github/workflows/ci.yml`) chạy với mỗi pull request và mỗi lần push lên `main` hoặc `develop`: kiểm tra định dạng, `compose.yaml`, lint, type-check, build, rồi toàn bộ test (kể cả test tích hợp với PostgreSQL, Redis, SeaweedFS, Mailpit thật, và kiểm tra `tokens.css` khớp `tokens.json`).
- Message commit theo dạng Conventional Commits, ví dụ `feat(api): ...`, `fix(web): ...`, `docs: ...`.

## Sự cố thường gặp

| Hiện tượng                                           | Cách xử lý                                                                                                                              |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run infra:up` báo cổng đã bị dùng               | Chép `.env.example` thành `.env` ở thư mục gốc, đổi cổng bị trùng, rồi sửa URL tương ứng trong `apps/api/.env`                          |
| API dừng ngay với "Biến môi trường không hợp lệ"     | Thiếu biến trong `apps/api/.env` (thường do tệp được tạo từ bản cũ). Thêm các biến được nêu tên, lấy giá trị từ `apps/api/.env.example` |
| Trang `/status` báo "Không kết nối được API"         | API chưa chạy, hoặc chạy ở cổng khác: kiểm tra `npm run dev` và http://127.0.0.1:3000/health                                            |
| Mục cơ sở dữ liệu / bộ nhớ đệm / kho lưu tệp báo lỗi | Docker chưa chạy hoặc dịch vụ chưa lên: `npm run infra:ps`, rồi `npm run infra:up`                                                      |
| Mở web bằng `127.0.0.1:5173` thì gọi API lỗi CORS    | Dùng `localhost:5173` (khớp `CORS_ORIGINS` của API)                                                                                     |
| Test tích hợp trên Windows không tìm thấy Docker     | Mở Docker Desktop rồi chạy lại; xem [Ghi chú cho Windows](apps/api/README.md#ghi-chú-cho-windows)                                       |

## Tài liệu

| Tài liệu                                                           | Nội dung                                                                |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| [docs/00-product/decision-log.md](docs/00-product/decision-log.md) | Các quyết định của chủ dự án; **thắng mọi tài liệu khác khi mâu thuẫn** |
| [docs/mo_ta_nghiep_vu.md](docs/mo_ta_nghiep_vu.md)                 | Đặc tả nghiệp vụ: vai trò, luồng, trạng thái, 19 quy tắc nghiệp vụ      |
| [docs/thuat_ngu_va_trang_thai.md](docs/thuat_ngu_va_trang_thai.md) | Thuật ngữ (tên dùng trong code) và máy trạng thái                       |
| [docs/thiet_ke_co_so_du_lieu.md](docs/thiet_ke_co_so_du_lieu.md)   | Thiết kế CSDL PostgreSQL                                                |
| [docs/ke_hoach_trien_khai.md](docs/ke_hoach_trien_khai.md)         | Kế hoạch triển khai theo giai đoạn G0–G12                               |
| [docs/cong_nghe_su_dung.md](docs/cong_nghe_su_dung.md)             | Công nghệ và thư viện                                                   |
