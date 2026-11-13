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
  routes/app/            khu người dùng: tổng quan theo vai trò; phụ huynh: children/new, children/:id, children/:id/invite, account
  routes/admin/          khu Manager / Admin
  routes/auth/           /login, /register, /verify-email, /forgot-password, /student-invitation; /logout (chỉ action)
  routes/catalog/        GET /catalog/provinces/:id/communes (chỉ dữ liệu, cho ô chọn xã)
  routes/preferences.ts  POST: lưu ngôn ngữ / chế độ màu vào cookie
  components/ui/         Button, Badge, Card, Alert theo hệ thống thiết kế (cva + token)
  components/ui/field    TextField, SelectField, TextAreaField, CheckboxField, ChoiceCard (ô nhập theo hệ thống thiết kế)
  components/ui/date-field  DateField: gõ dd/mm/yyyy hoặc chọn trên lịch (react-day-picker trong Popover của Radix)
  components/forms/      LocationFields (tỉnh + xã, đổi tỉnh thì tải lại xã)
  components/learners/   các ô của hồ sơ con, tình trạng tài khoản học sinh
  components/auth/       ô nhập mã OTP, nút gửi lại mã có đếm ngược
  components/layout/     PublicLayout, AppShell, AdminShell, AuthSplitLayout, AuthCenteredLayout, điều hướng, SettingsMenu (bánh răng: ngôn ngữ, chế độ màu)
  features/<tính năng>/  phần giao diện + query của từng tính năng (hiện có system-status)
  lib/                   api, server-api.server + session.server (phiên đăng nhập), catalog(.server) (danh mục cho form), learners(.server), form, format (ngày theo giờ VN), dates (dd/mm/yyyy ↔ YYYY-MM-DD), i18n, navigation, preferences, cn
test/                    setup Vitest, server msw, renderWithProviders, routeArgs (gọi loader/action trong test)
```

## Quy ước

- **Màu, chữ, khoảng cách** chỉ dùng class từ preset `@tps/config/tailwind.css` (bảng tên lớp trong `packages/config/README.md`). Không viết mã màu, không viết style inline, không thêm biến màu vào `app.css`.
- **Component:** Button, Badge, Card, Alert ở `components/ui` theo hệ thống thiết kế. Thêm component shadcn/ui bằng `npx shadcn@latest add <tên>` (chạy trong `apps/web`); nếu CLI chèn khối `:root`/`.dark` vào `app.css` thì xóa đi. Gộp class bằng `cn()`; dùng `buttonVariants(...)` cho `<Link>` trông như nút.
- **Chữ trên giao diện** lấy từ i18n (`@tps/shared`, `t('nav.overview')`), không viết cứng. Khóa sai là lỗi type-check. Tiêu đề trang (`meta`) dùng `messagesFromMatches(matches)`.
- **Gọi API:** trong `loader`/`action` dùng `getServerApi(context).call(path, { method, body, schema })` (`lib/server-api.server.ts`): chuyển cookie phiên, tự làm mới phiên. Trên trình duyệt (TanStack Query, `features/*/…-query.ts`) dùng `apiGet` của `lib/api.ts` cho dữ liệu công khai. Không gọi `fetch` trong component.
- **Ô ngày:** dùng `DateField`, không dùng `<input type="date">` (lịch của trình duyệt mỗi nơi một kiểu). Ô gửi chữ `dd/mm/yyyy`; action đổi sang `YYYY-MM-DD` bằng `displayToIso`, sai dạng thì gửi nguyên văn để API báo `invalid_date`.
- **Form:** `<Form method="post">` + `action` của route (chạy được cả khi chưa tải JavaScript). Lỗi API đổi thành thông điệp bằng `fieldErrorsFrom` / `formErrorFrom` (`lib/form.ts`): lỗi theo ô lấy `details[].code` làm khóa `validation.*`; hiển thị bằng `useMessage()`. Giữ lại giá trị đã nhập, trừ mật khẩu.
- **Điều hướng** khai báo ở `lib/navigation.ts`, đúng thứ tự trên canvas giao diện MVP (D52). Dưới 1024 px dùng thanh dưới đáy, tối đa 5 mục (D51).
- **Trạng thái giao diện:** mỗi phần lấy dữ liệu có đủ đang tải, lỗi (Alert nói rõ chuyện gì và cách xử lý), thành công; lỗi API hiển thị theo `errors.<code>`.
- **Accessibility:** liên kết "Bỏ qua, đến nội dung chính"; `aria-current` cho mục đang mở; icon đứng một mình có `aria-label`; vùng bấm tối thiểu 44 px (`min-h-control-md`).

## Đăng nhập và phiên (D57)

Server web đứng giữa trình duyệt và API: trình duyệt chỉ nói chuyện với web; loader và action gọi API thay trình duyệt.

- Middleware ở `root.tsx` (`serverApiMiddleware`) tạo một `ServerApi` cho mỗi request: chuyển cookie `tps_at`/`tps_rt`, User-Agent, Origin, X-Forwarded-For tới API, và gắn mọi Set-Cookie của API vào response gửi trình duyệt. Cookie vẫn httpOnly do API đặt; JavaScript không đọc được.
- Access token hết hạn (401): `ServerApi` gọi `/auth/refresh` một lần cho cả request rồi thử lại.
- `getCurrentUser(context)` (`lib/session.server.ts`): người dùng hiện tại dạng gọn (`SessionUser`: id, tên hiển thị, vai trò, trạng thái), không có email hay số điện thoại; trình duyệt không gửi cookie phiên thì không gọi API. Root loader đưa nó xuống giao diện (`useRouteLoaderData('root').user`).
- Trang cần đăng nhập: `requireUser(request, context, { roles })` trong loader. Chưa đăng nhập: về `/login?redirectTo=…`; thiếu vai trò: 404. `/app` cho gia sư, phụ huynh, học sinh; `/admin` cho Manager, Admin.
- Chống CSRF: React Router từ chối action có Origin khác trang (400); API kiểm tra lại Origin được chuyển tiếp. Đăng xuất là form POST `/logout`.
- Email đang chờ nhập mã giữ trong cookie httpOnly `tps_pending_verification` (1 giờ), không đặt trên URL.
- Ô nhập mã OTP là một ô (dán cả mã, `autocomplete="one-time-code"`) thay cho 6 ô trên canvas.
- Trang nhận lời mời học sinh `/student-invitation#token=…` (D50): token nằm sau `#` nên không tới server web; trang đọc token ở trình duyệt, xóa khỏi thanh địa chỉ, rồi gửi trong body tới action (tra cứu, nhận lời mời). Token chỉ được xóa sau khi tra cứu xong: StrictMode ở bản dev chạy effect hai lần. Nhận lời mời xong API trả cookie phiên: con vào thẳng `/app`.
- Hồ sơ người khác không quản lý (hoặc không tồn tại) trả 404, giống API: `loadOwnLearner` (`lib/learners.server.ts`).
- Khi chạy thật: web phải đứng sau Caddy (ghi đè X-Forwarded-For bằng IP thật), và `TRUST_PROXY` của API phải tin web; nếu không, rate limit theo IP của API chỉ thấy IP của web, hoặc người dùng giả được IP.
