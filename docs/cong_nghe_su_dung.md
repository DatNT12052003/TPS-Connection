# Công nghệ sử dụng – TPS-Connection

Tài liệu này đề xuất công nghệ cho API, Web và Mobile dựa trên [mô tả nghiệp vụ](mo_ta_nghiep_vu.md). Các lựa chọn bám theo stack mặc định của các skill trong `.claude/skills/` (Express + TypeScript + PostgreSQL/TypeORM, React + Vite + Tailwind) và ưu tiên **dùng chung TypeScript trên cả ba ứng dụng** để chia sẻ kiểu dữ liệu, schema validation và hằng số trạng thái nghiệp vụ.

> Trạng thái: **đề xuất**. Những mục đánh dấu _(cần chốt)_ cần chủ dự án quyết định trước khi khởi tạo. Phiên bản cụ thể sẽ được khóa (pin) khi scaffold từng ứng dụng. Cập nhật ngày 2026-11-12 theo [decision log](00-product/decision-log.md).

---

## 1. Tổng quan kiến trúc

```
TPS-Connection/
├── apps/
│   ├── api/       Node.js + Express + TypeScript (REST + WebSocket)
│   ├── web/       React + React Router (SSR) + Vite + Tailwind (phụ huynh, gia sư, học sinh, Manager, Admin)
│   └── mobile/    React Native + Expo (phụ huynh, gia sư, học sinh) – bản phát hành thứ hai
└── packages/
    ├── shared/    Kiểu dữ liệu, Zod schema, enum trạng thái, hằng số, chuỗi i18n dùng chung
    └── config/    tsconfig, ESLint, Prettier dùng chung
```

| Thành phần                        | Công nghệ chính                                      |
| --------------------------------- | ---------------------------------------------------- |
| Ngôn ngữ                          | TypeScript (strict) cho toàn bộ dự án                |
| Monorepo                          | npm workspaces + Turborepo (D29)                     |
| API                               | Node.js (LTS) + Express + TypeORM                    |
| Cơ sở dữ liệu                     | PostgreSQL                                           |
| Cache / hàng đợi / realtime scale | Redis                                                |
| Lưu trữ tệp                       | Object storage tương thích S3 (SeaweedFS, D53) |
| Web                               | React + React Router (framework mode, SSR cho trang công khai) + Vite + Tailwind CSS |
| Mobile                            | React Native + Expo (bản phát hành thứ hai, D2)      |
| Môi trường phát triển             | Docker Compose                                       |

**Lý do chọn React Native + Expo cho mobile:** cùng ngôn ngữ và hệ sinh thái với web (React, TanStack Query, Zod, i18next), nên dùng lại được `packages/shared` và kinh nghiệm của đội. Expo cũng hỗ trợ sẵn push notification, chọn ảnh/tệp, lưu token an toàn và build qua EAS. Phương án thay thế là Flutter, nhưng sẽ không chia sẻ được code với web và API. _(đã chốt: React Native + Expo)_

**Trang quản trị** (cho Manager và Admin) được đặt trong `apps/web` dưới nhánh route `/admin` có kiểm tra vai trò, chưa tách thành app riêng ở phiên bản đầu.

**Thứ tự phát hành** _(D2)_: bản đầu gồm API và Web; Mobile là bản phát hành kế tiếp.

---

## 2. Ánh xạ nghiệp vụ → công nghệ

| Nghiệp vụ (mục trong tài liệu nghiệp vụ)                           | Giải pháp kỹ thuật                                                                                                                                                                  |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Đăng ký bằng email/số điện thoại, xác thực liên hệ (§3.1)          | OTP lưu ở Redis có TTL; gửi email qua Gmail SMTP (App Password). Bản đầu **chưa dùng SMS**, nên số điện thoại chưa xác thực bằng OTP. Việc gửi bọc sau interface để sau này thay nhà cung cấp email hoặc thêm SMS (eSMS, SpeedSMS…) |
| Đăng nhập theo vai trò, phân quyền (§3.1, §13)                     | JWT access token ngắn hạn + refresh token xoay vòng (lưu hash trong DB); RBAC theo vai trò (gia sư, phụ huynh, học sinh, Manager, Admin) và **kiểm tra quyền theo quan hệ** (phụ huynh–con, gia sư–lớp) ở tầng service; nhật ký kiểm toán cho thao tác của Manager và Admin |
| Xác minh danh tính gia sư, huy hiệu bằng cấp (§3.2)                | Upload CCCD, thẻ sinh viên, bằng cấp lên **bucket private**, truy cập bằng presigned URL ngắn hạn; Manager duyệt; trường "tự khai / đã xác minh" lưu riêng; job BullMQ xóa ảnh giấy tờ 30 ngày sau khi duyệt |
| Trang công khai, SEO (§4.1, §4.3)                                  | SSR bằng React Router framework mode cho trang tìm gia sư, hồ sơ gia sư và bài tuyển học sinh _(D12)_; chỉ hiển thị gia sư đã xác minh danh tính; bài tìm gia sư của phụ huynh không công khai |
| Tìm kiếm, lọc gia sư (§4.3)                                        | PostgreSQL full-text search + extension `unaccent`, `pg_trgm` cho tiếng Việt có/không dấu; danh mục tỉnh/thành – xã/phường (theo danh mục hành chính sau sắp xếp 2025); PostGIS cho tính khoảng cách là tùy chọn giai đoạn sau |
| Yêu cầu kết nối (§5.3)                                             | Máy trạng thái ở tầng service, lưu lịch sử chuyển trạng thái; job BullMQ tự hủy yêu cầu chờ quá 7 ngày, đang trao đổi quá 30 ngày                                                  |
| Nhắn tin trực tiếp (§5.4)                                          | Socket.IO (Redis adapter khi chạy nhiều instance); hội thoại chỉ mở khi bên nhận chấp nhận yêu cầu; lịch sử tin nhắn lưu PostgreSQL; tệp đính kèm qua object storage             |
| Lịch học đơn lẻ / lặp hằng tuần (§7)                               | Lưu quy tắc lặp (RRULE) và sinh các buổi học cụ thể; xử lý múi giờ `Asia/Ho_Chi_Minh`                                                                                               |
| Thông báo (§12)                                                    | Bảng notification trong DB + đẩy realtime qua Socket.IO + push mobile (Expo Push/FCM) + email                                                                                       |
| Nhắc lịch, bài tập sắp đến hạn, học phí đến hạn (§7, §8, §10, §12) | Job định kỳ/trì hoãn bằng BullMQ trên Redis                                                                                                                                         |
| Bài tập, nộp bài có tệp (§8)                                       | Upload trực tiếp lên object storage bằng presigned URL; giới hạn loại/kích thước tệp                                                                                                |
| Báo cáo tiến độ, biểu đồ điểm (§9)                                 | Truy vấn tổng hợp trên PostgreSQL; Recharts (web), Victory Native hoặc react-native-gifted-charts (mobile)                                                                          |
| Xác nhận buổi học (§7)                                             | Job BullMQ nhắc phụ huynh và tự chốt buổi học sau 48 giờ; theo dõi hạn 3 ngày của khiếu nại                                                                                          |
| Học phí, đối chiếu buổi học (§10)                                  | Lưu tiền dạng số nguyên VND (`bigint`), không dùng float; mỗi buổi học lưu giá theo buổi đã áp dụng; tổng hợp theo tháng; chưa tích hợp cổng thanh toán ở bản đầu                    |
| Không xóa lịch sử học tập (§6, §16)                                | Soft delete (`deleted_at`) và trạng thái kết thúc thay vì xóa cứng; job xóa dữ liệu cá nhân 6 tháng sau khi xóa tài khoản và ẩn danh lịch sử học tập                                |
| Hỗ trợ tiếng Việt và tiếng Anh (§16)                               | i18next trên web và mobile; API trả mã lỗi để client tự dịch                                                                                                                        |
| Báo cáo vi phạm, chặn, khiếu nại (§13)                             | Module moderation riêng trong API; ghi audit log cho thao tác của quản trị viên                                                                                                     |

---

## 3. API – `apps/api`

### Nền tảng

- **Node.js LTS**, **Express**, **TypeScript**
- **PostgreSQL** + **TypeORM** (entity, migration, transaction)
- **Redis** (OTP, rate limit, hàng đợi, Socket.IO adapter)

### Thư viện dự kiến

| Nhóm              | Thư viện                                                                                      |
| ----------------- | --------------------------------------------------------------------------------------------- |
| Cơ sở dữ liệu     | `typeorm`, `pg`, `reflect-metadata`                                                           |
| Validation        | `zod` (dùng chung schema với client qua `packages/shared`)                                    |
| Xác thực          | `jsonwebtoken` hoặc `jose`, `argon2` (băm mật khẩu)                                           |
| Bảo mật HTTP      | `helmet`, `cors`, `express-rate-limit` + `rate-limit-redis`, `cookie-parser`                  |
| Realtime          | `socket.io`, `@socket.io/redis-adapter`                                                       |
| Hàng đợi / job    | `bullmq`, `ioredis`                                                                           |
| Upload / lưu trữ  | `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `multer` (khi cần nhận tệp qua server) |
| Email             | `nodemailer` (Gmail SMTP + App Password); SMS chưa dùng ở bản đầu                             |
| Lịch / thời gian  | `date-fns` + `date-fns-tz` (hoặc `dayjs`), `rrule`                                            |
| Cấu hình          | `dotenv` + Zod để validate biến môi trường                                                    |
| Logging           | `pino`, `pino-http`                                                                           |
| Tài liệu API      | `@asteasolutions/zod-to-openapi`, `swagger-ui-express`                                        |
| Push notification | `expo-server-sdk`                                                                             |
| Kiểm thử          | `jest`, `ts-jest`, `supertest`, `@testcontainers/postgresql`                                  |
| Dev               | `tsx` (chạy watch), `tsc` (build)                                                             |

### Định hướng tổ chức

Chia module theo nghiệp vụ: `auth`, `users`, `tutors`, `students`, `posts`, `connections`, `messages`, `classes`, `sessions`, `assignments`, `reports`, `fees`, `reviews`, `notifications`, `moderation`, `catalog`. Mỗi module có router → controller → service → repository. Logic kiểm tra quyền theo quan hệ nằm ở service, không chỉ ở middleware vai trò.

---

## 4. Web – `apps/web`

### Nền tảng

- **React** + **TypeScript** (strict) + **Vite**
- **Tailwind CSS**

### Thư viện dự kiến

| Nhóm                                        | Thư viện                                                                                                 |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Routing, SSR                                | `react-router` ở framework mode (SSR cho trang công khai, client rendering cho khu vực đã đăng nhập)     |
| Gọi API / cache dữ liệu server              | `@tanstack/react-query`, `axios` (hoặc `ky`)                                                             |
| State phía client                           | `zustand` (phiên đăng nhập, UI state)                                                                    |
| Form                                        | `react-hook-form`, `@hookform/resolvers`, `zod`                                                          |
| UI component                                | `shadcn/ui` (trên `@radix-ui/*`), `lucide-react`, `clsx`, `tailwind-merge`, `class-variance-authority`   |
| Bảng dữ liệu (quản trị, danh sách học sinh) | `@tanstack/react-table`                                                                                  |
| Lịch học                                    | `@fullcalendar/react` (xem ngày/tuần/tháng)                                                              |
| Biểu đồ tiến độ                             | `recharts`                                                                                               |
| Đa ngôn ngữ                                 | `i18next`, `react-i18next`, `i18next-browser-languagedetector`                                           |
| Realtime                                    | `socket.io-client`                                                                                       |
| Thời gian                                   | `date-fns` (dùng chung với API)                                                                          |
| Thông báo dạng toast                        | `sonner`                                                                                                 |
| Kiểm thử                                    | `vitest`, `@testing-library/react`, `@testing-library/user-event`, `msw`, `@playwright/test` |

---

## 5. Mobile – `apps/mobile`

### Nền tảng

- **React Native** + **Expo** (managed workflow) + **TypeScript**
- Build và phát hành bằng **EAS Build / EAS Submit**

### Thư viện dự kiến

| Nhóm                               | Thư viện                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------ |
| Điều hướng                         | `expo-router`                                                                  |
| Styling                            | `nativewind` (cú pháp Tailwind, đồng bộ với web)                               |
| Gọi API / state                    | `@tanstack/react-query`, `axios`, `zustand`                                    |
| Form                               | `react-hook-form`, `@hookform/resolvers`, `zod`                                |
| Lưu token an toàn                  | `expo-secure-store`                                                            |
| Push notification                  | `expo-notifications`, `expo-device`                                            |
| Chọn ảnh / tệp nộp bài             | `expo-image-picker`, `expo-document-picker`, `expo-file-system`                |
| Hiển thị ảnh                       | `expo-image`                                                                   |
| Lịch học                           | `react-native-calendars`                                                       |
| Biểu đồ                            | `victory-native` hoặc `react-native-gifted-charts`                             |
| Đa ngôn ngữ                        | `i18next`, `react-i18next`, `expo-localization`                                |
| Realtime                           | `socket.io-client`                                                             |
| Danh sách hiệu năng cao (tin nhắn) | `@shopify/flash-list`                                                          |
| Kiểm thử                           | `jest-expo`, `@testing-library/react-native`; E2E bằng Maestro (giai đoạn sau) |

---

## 6. Dùng chung – `packages/shared`

- Zod schema cho request/response, dùng cho cả validate ở API lẫn form ở client.
- Enum trạng thái nghiệp vụ: yêu cầu kết nối (§5.3), lớp học (§6), buổi học (§7), bài tập (§8), hồ sơ gia sư (§3.2), bài đăng (§4.1).
- Kiểu dữ liệu, mã lỗi, file ngôn ngữ `vi` / `en`.

---

## 7. Hạ tầng và công cụ phát triển

| Nhóm                       | Công cụ                                                                                                     |
| -------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Quản lý package / monorepo | `npm` (workspaces), `turbo`                                                                                           |
| Chất lượng code            | `eslint` (typescript-eslint), `prettier`, `husky`, `lint-staged`                                            |
| Môi trường local           | Docker Compose: PostgreSQL, Redis, SeaweedFS (D53), Mailpit (bắt email test)                                          |
| CI                         | GitHub Actions: lint, type-check, test, build                                                               |
| Theo dõi lỗi               | Sentry (`@sentry/node`, `@sentry/react`, `@sentry/react-native`)                                            |
| Triển khai                 | Docker Compose trên một máy chủ đặt tại Việt Nam, xem mục 7.1                                               |

### 7.1. Hosting và lưu trữ

**Nguyên tắc:** cơ sở dữ liệu và tệp chứa dữ liệu cá nhân (hồ sơ học sinh, giấy tờ xác minh gia sư, bài nộp, tin nhắn) được lưu **tại Việt Nam**. Lý do là các quy định về lưu trữ dữ liệu trong nước (Luật An ninh mạng 2018, Nghị định 53/2022) và về chuyển dữ liệu cá nhân ra nước ngoài (Nghị định 13/2023, Luật Bảo vệ dữ liệu cá nhân 2025). Cần người am hiểu pháp lý xác nhận lại trước khi đưa vào vận hành thật.

**Lộ trình theo giai đoạn:**

| Giai đoạn                 | Nơi chạy                                                                       | Ghi chú                                                                |
| ------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| Phát triển                | Máy của lập trình viên, Docker Compose (PostgreSQL, Redis, SeaweedFS, Mailpit) | Chưa cần server                                                        |
| MVP / thử nghiệm          | **VPS trong nước** (Viettel IDC, VNG Cloud, FPT Cloud, CMC Cloud…) _(đề xuất)_ hoặc PC tự host tại nhà | VPS tốn ít chi phí ban đầu, ổn định hơn và có sẵn IP tĩnh |
| Vận hành có người dùng thật | VPS / cloud trong nước, nâng cấu hình khi cần                                | Dùng chung bộ Docker Compose nên chuyển máy gần như không phải sửa gì |

**Mô hình triển khai trên một máy:**

```
Internet ── tên miền (HTTPS) ── Caddy (reverse proxy, tự cấp SSL Let's Encrypt)
                                  ├── web      (Node chạy SSR + file tĩnh React build)
                                  ├── api      (Express + Socket.IO)
                                  ├── postgres (không mở ra Internet)
                                  ├── redis    (không mở ra Internet)
                                  └── seaweedfs (lưu tệp, API tương thích S3; D53)
```

- Tên miền (.vn hoặc .com) là bắt buộc, vì app mobile và trình duyệt cần HTTPS hợp lệ.
- Lưu tệp bằng SeaweedFS _(D53, thay MinIO vì MinIO ngừng phát hành Docker image bản cộng đồng)_. Code dùng `@aws-sdk/client-s3` nên có thể chuyển sang object storage của nhà cung cấp trong nước chỉ bằng cách đổi cấu hình.
- Chỉ reverse proxy được truy cập từ Internet. SSH chỉ cho đăng nhập bằng khóa, bật tường lửa (`ufw`) và tự động cập nhật bản vá.
- **Backup:** dump PostgreSQL và đồng bộ dữ liệu SeaweedFS hằng ngày ra nơi khác (ổ ngoài hoặc máy/cloud khác), **mã hóa** trước khi chuyển đi, và thử khôi phục định kỳ.
- Dịch vụ bên thứ ba ở nước ngoài (Gmail, Sentry, Expo Push) chỉ nhận lượng dữ liệu cá nhân tối thiểu: không ghi thông tin học sinh vào log, báo lỗi hay nội dung push.

**Nếu chọn PC tự host tại nhà:**

| Hạng mục       | Khuyến nghị                                                                                          |
| -------------- | ---------------------------------------------------------------------------------------------------- |
| Phần cứng      | Mini PC tiết kiệm điện (Intel N100/N150 hoặc Ryzen dòng U), **RAM 16GB**, SSD NVMe 512GB–1TB, ổ ngoài để backup |
| Hệ điều hành   | Ubuntu Server LTS                                                                                    |
| Mạng           | Cắm dây LAN. Dùng **Cloudflare Tunnel** khi IP động, bị CGNAT hoặc nhà mạng chặn port 80/443. Lưu lượng khi đó đi qua Cloudflare, nhưng dữ liệu vẫn lưu tại máy |
| Điện           | UPS để tránh tắt máy đột ngột làm hỏng dữ liệu                                                       |
| Hạn chế        | Phụ thuộc điện và mạng gia đình nên chấp nhận có lúc gián đoạn. Chỉ phù hợp cho MVP hoặc server dev/test |

---

## 8. Công nghệ cho giai đoạn mở rộng (chưa dùng ở bản đầu)

Ứng với §15.2 của tài liệu nghiệp vụ:

| Nghiệp vụ mở rộng                              | Phương án tham khảo                                                    |
| ---------------------------------------------- | ---------------------------------------------------------------------- |
| Thanh toán trực tuyến                          | VNPay, MoMo, PayOS                                                     |
| Phòng học video, chia sẻ màn hình, bảng trắng  | LiveKit, Jitsi; `tldraw` hoặc Excalidraw cho bảng trắng                |
| Trợ lý học tập (gợi ý gia sư, tóm tắt tiến độ) | Claude API (`@anthropic-ai/sdk`)                                       |
| Ghép nối nâng cao theo khoảng cách             | PostGIS                                                                |
| Tìm kiếm nâng cao                              | Meilisearch hoặc OpenSearch khi PostgreSQL full-text không còn đáp ứng |

---

## 9. Các điểm cần chốt

1. Mobile dùng React Native + Expo (đề xuất) hay Flutter.
   => **Đã chốt: React Native + Expo** (managed workflow, build bằng EAS).
   - Dùng chung TypeScript và `packages/shared` (Zod schema, enum trạng thái, chuỗi i18n) với web và API.
   - Dùng chung thư viện với web: TanStack Query, React Hook Form, i18next, Socket.IO client. Giao diện viết bằng NativeWind theo cú pháp Tailwind.
   - Push notification qua `expo-notifications` và Expo Push Service.
2. Nhà cung cấp SMS OTP và email.
   => **Email:** trước mắt gửi qua **Gmail SMTP bằng App Password** (thư viện `nodemailer`), dùng cho OTP xác thực email, đặt lại mật khẩu và email thông báo.
   - App Password lưu trong biến môi trường, không commit vào repo.
   - Gmail cá nhân giới hạn số email gửi mỗi ngày và dễ vào spam. Khi có nhiều người dùng cần chuyển sang dịch vụ email chuyên dụng. Phần gửi email bọc sau interface nên chỉ cần đổi cấu hình.
   - Khi chạy local, dùng Mailpit để bắt email test, không gửi thật.

   => **SMS: chưa dùng ở bản đầu.**
   - Đăng ký và xác thực tài khoản bằng **email**. Số điện thoại vẫn được lưu nhưng ở trạng thái **chưa xác thực**.
   - Khi cần xác thực số điện thoại hoặc đăng nhập bằng số điện thoại, sẽ chọn nhà cung cấp SMS (eSMS, SpeedSMS…) và gắn vào cùng interface gửi OTP.
3. Nơi hosting và object storage, có cân nhắc yêu cầu lưu trữ dữ liệu cá nhân trẻ em tại Việt Nam.
   => Định hướng: lưu dữ liệu tại Việt Nam; giai đoạn phát triển chạy local; MVP dùng VPS trong nước hoặc PC tự host (chưa mua máy). Chọn nhà cung cấp cụ thể khi gần ra MVP. Xem mục 7.1
4. Vitest hay Jest cho web (API giữ Jest theo skill `testing`).
   => **Đã chốt: web dùng Vitest** kết hợp React Testing Library và `msw` để giả lập API.
   - Vitest dùng chung cấu hình với Vite nên không phải cấu hình transform riêng như Jest, và chạy nhanh hơn.
   - API vẫn dùng Jest + Supertest. Mobile dùng `jest-expo` vì Expo hỗ trợ chính thức Jest.
   - Test end-to-end trên trình duyệt dùng Playwright.
5. Có cần SEO cho trang công khai không; backend dùng Express hay NestJS.
   => **Đã chốt (D12): có SEO, dùng Express.**
   - Web dùng React Router ở framework mode, vẫn chạy trên Vite: render phía server cho trang tìm gia sư, hồ sơ gia sư và bài tuyển học sinh; khu vực đã đăng nhập render phía client.
   - Khi triển khai, web không còn là file tĩnh thuần mà cần một tiến trình Node chạy SSR phía sau Caddy.
6. Tên sản phẩm.
   => **Đã chốt (D1): TPS-Connection**, dùng cho tên hiển thị, tên miền và bundle ID của app Mobile.
7. Trình quản lý package: npm hay pnpm.
   => **Đã chốt (D29): npm** (workspaces) + Turborepo, vì đội quen npm.
   - Khai báo các app trong trường `workspaces` của `package.json` gốc; package nội bộ tham chiếu bằng tên và phiên bản (ví dụ `"@tps/shared": "*"`).
   - Chạy lệnh cho từng app bằng `npm run <script> -w apps/api` hoặc qua Turborepo (`npx turbo run build --filter=api`).
   - Commit `package-lock.json`; CI dùng `npm ci`.
   - Lưu ý: npm cho phép import thư viện chưa khai báo trong `package.json` của app (do cài phẳng). Bật rule ESLint `import/no-extraneous-dependencies` để bắt lỗi này.
