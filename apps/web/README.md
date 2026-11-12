# @tps/web

Web của TPS-Connection: React Router 8 (framework mode, SSR), Vite 8, Tailwind CSS 4 với preset `@tps/config`, component theo shadcn/ui, TanStack Query, i18next (vi/en).

## Chạy

Chạy từ thư mục gốc, sau khi API đã chạy (xem `apps/api/README.md`):

```sh
cp apps/web/.env.example apps/web/.env   # không bắt buộc: thiếu thì dùng giá trị mặc định
npm run dev -w @tps/web                  # http://localhost:5173
```

Trang cần xem: `/` (trang chủ), `/status` (trang mẫu gọi API `/health/ready`), `/app` (khu người dùng), `/admin` (khu Manager/Admin).

| Lệnh (thêm `-w @tps/web` khi chạy từ gốc)    | Việc                                                                    |
| -------------------------------------------- | ----------------------------------------------------------------------- |
| `npm run dev`                                | Dev server có HMR                                                       |
| `npm run build` / `npm start`                | Build ra `build/` / chạy bản build (đọc `HOST`, `PORT` trong `.env`)    |
| `npm test`                                   | Vitest + Testing Library + msw                                          |
| `npm exec -- vitest run app/lib/api.test.ts` | Một tệp test; thêm `-t "tên test"` để lọc                               |
| `npm run lint`, `npm run type-check`         | Cả hai chạy `react-router typegen` trước (sinh kiểu `./+types/<route>`) |

## Cấu trúc

```
app/
  root.tsx               khung HTML: lang + data-theme từ cookie (SSR, không nháy), provider i18n + TanStack Query, trang lỗi
  routes.ts              khai báo route
  routes/public/         khu công khai (SSR cho SEO): trang chủ, /status, 404
  routes/app/            khu người dùng: gia sư, phụ huynh, học sinh
  routes/admin/          khu Manager / Admin
  routes/preferences.ts  POST: lưu ngôn ngữ / chế độ màu vào cookie
  components/ui/         Button, Badge, Card, Alert theo hệ thống thiết kế (cva + token)
  components/layout/     PublicLayout, AppShell, AdminShell, điều hướng, chọn ngôn ngữ/màu
  features/<tính năng>/  phần giao diện + query của từng tính năng (hiện có system-status)
  lib/                   api (gọi API), i18n, navigation, preferences, cn
test/                    setup Vitest, server msw, renderWithProviders
```

## Quy ước

- **Màu, chữ, khoảng cách** chỉ dùng class từ preset `@tps/config/tailwind.css` (bảng tên lớp trong `packages/config/README.md`). Không viết mã màu, không viết style inline, không thêm biến màu vào `app.css`.
- **Component:** Button, Badge, Card, Alert ở `components/ui` theo hệ thống thiết kế. Thêm component shadcn/ui bằng `npx shadcn@latest add <tên>` (chạy trong `apps/web`); nếu CLI chèn khối `:root`/`.dark` vào `app.css` thì xóa đi. Gộp class bằng `cn()`; dùng `buttonVariants(...)` cho `<Link>` trông như nút.
- **Chữ trên giao diện** lấy từ i18n (`@tps/shared`, `t('nav.overview')`), không viết cứng. Khóa sai là lỗi type-check. Tiêu đề trang (`meta`) dùng `messagesFromMatches(matches)`.
- **Gọi API** qua `lib/api.ts` (`apiGet` + schema Zod), không gọi `fetch` trong component. Dữ liệu lần đầu lấy trong `loader` (SSR); dữ liệu cần cập nhật trên trình duyệt dùng TanStack Query (`features/*/…-query.ts`).
- **Điều hướng** khai báo ở `lib/navigation.ts`, đúng thứ tự trên canvas giao diện MVP (D52). Dưới 1024 px dùng thanh dưới đáy, tối đa 5 mục (D51).
- **Trạng thái giao diện:** mỗi phần lấy dữ liệu có đủ đang tải, lỗi (Alert nói rõ chuyện gì và cách xử lý), thành công; lỗi API hiển thị theo `errors.<code>`.
- **Accessibility:** liên kết "Bỏ qua, đến nội dung chính"; `aria-current` cho mục đang mở; icon đứng một mình có `aria-label`; vùng bấm tối thiểu 44 px (`min-h-control-md`).

## Tạm thời đến G2

Chưa có đăng nhập. Ở môi trường dev, thanh màu vàng trên đầu `/app` và `/admin` cho chọn vai trò để xem layout (`lib/dev-role.server.ts`, `routes/dev-role.ts`). Ở production, `/app`, `/admin`, `/dev/role` trả 404. G2 thay bằng phiên đăng nhập thật và xóa hai tệp này.
