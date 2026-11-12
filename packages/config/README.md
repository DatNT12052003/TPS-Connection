# @tps/config

Cấu hình dùng chung của TPS-Connection: token thiết kế, preset Tailwind, TypeScript, ESLint, Prettier.

## TypeScript, ESLint, Prettier

| Dùng                 | Cách                                                                                                                                                                                                                                                     |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript           | `"extends": "@tps/config/tsconfig/library.json"` (package biên dịch ra `dist/`, ví dụ `@tps/shared`) hoặc `@tps/config/tsconfig/node.json` (API). Cả hai dựa trên `tsconfig/base.json`: strict, ESM `NodeNext`, `noUncheckedIndexedAccess`               |
| ESLint (flat config) | `eslint.config.js`: `import { createConfig } from '@tps/config/eslint'; export default createConfig({ tsconfigRootDir: import.meta.dirname });`. Kiểm tra theo kiểu TypeScript, chặn import thư viện chưa khai báo (`import/no-extraneous-dependencies`) |
| Prettier             | Khai báo một lần ở `package.json` gốc: `"prettier": "@tps/config/prettier"`                                                                                                                                                                              |

## Token thiết kế

| Tệp                         | Vai trò                                                                                                                                                                                   |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `design-tokens/tokens.json` | Nguồn: bản sao `tokens.json` của [TPS-Connection Design System](https://claude.ai/artifact/263FLgUp1zeKVVnVnRMUY1) (D49).                                                                 |
| `design-tokens/build.mjs`   | Sinh `tokens.css` từ `tokens.json`. Bảng ánh xạ shadcn/ui và cỡ chữ trên điện thoại nằm ở đầu tệp.                                                                                        |
| `tokens.css`                | **Tệp sinh ra, không sửa tay.** Biến `--tps-*` (màu sáng/tối, chữ, khoảng cách, bo góc, đổ bóng, kích thước, điểm ngắt) và biến của shadcn/ui (`--background`, `--primary`, `--radius`…). |
| `tailwind.css`              | Preset Tailwind CSS v4: đặt tên lớp Tailwind cho các biến trên, biến thể `dark:`, lớp nền (`body`, vòng focus).                                                                           |

Đổi token: sửa trong hệ thống thiết kế, chép `tokens.json` mới vào `design-tokens/`, rồi chạy

```sh
npm run tokens -w @tps/config        # ghi lại tokens.css
npm run tokens:check -w @tps/config  # CI: báo lỗi nếu tokens.css lệch với tokens.json
```

### Dùng trong ứng dụng web

```css
/* app.css */
@import 'tailwindcss';
@import '@tps/config/tailwind.css';
```

Nạp font Be Vietnam Pro trong `<head>`:

```html
<link
  rel="stylesheet"
  href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&display=swap"
/>
```

Chế độ tối: mặc định theo hệ điều hành; đặt `<html data-theme="dark">` hoặc `data-theme="light"` để ghi đè theo lựa chọn của người dùng. Biến thể `dark:` của Tailwind theo cùng quy tắc, nhưng thường không cần vì mọi màu đã tự đổi theo token.

### Tên lớp

| Nhóm          | Lớp                                                                                                                                                                                                                                                                               |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Màu shadcn/ui | `bg-background`, `text-foreground`, `bg-card`, `bg-popover`, `bg-primary`, `text-primary-foreground`, `bg-secondary`, `bg-muted`, `text-muted-foreground`, `bg-accent` (nền khi di chuột, **không** phải màu cam), `bg-destructive`, `border-border`, `border-input`, `ring-ring` |
| Màu riêng TPS | `bg-primary-hover`, `bg-primary-subtle`, `text-primary-subtle-foreground`, `bg-surface`, `bg-surface-raised`, `bg-surface-sunken`, `border-border-strong`                                                                                                                         |
| Màu nhấn cam  | `bg-brand-accent`, `bg-brand-accent-subtle`, `text-brand-accent-subtle-foreground`. Chỉ để trang trí                                                                                                                                                                              |
| Trạng thái    | `text-success` / `bg-success-subtle`, `text-warning` / `bg-warning-subtle`, `text-danger` / `bg-danger-subtle`, `bg-danger-solid` / `text-danger-solid-foreground`                                                                                                                |
| Chữ           | `font-sans`, `text-display`, `text-h1`, `text-h2`, `text-h3`, `text-body-lg`, `text-body`, `text-body-strong`, `text-small`, `text-label`, `text-overline` (gồm cả line-height, độ đậm, giãn chữ; `display` và `h1` tự nhỏ lại dưới 768 px)                                       |
| Khoảng cách   | Thang mặc định của Tailwind: `p-1` = `space-1` (4 px) … `p-16` = `space-16` (64 px)                                                                                                                                                                                               |
| Kích thước    | `h-control-md` (44 px, vùng bấm tối thiểu), `h-control-lg` (52 px), `max-w-page` (1280 px)                                                                                                                                                                                        |
| Bo góc        | `rounded-sm` 6, `rounded-md` 10 (nút, ô nhập), `rounded-lg` 14 (thẻ), `rounded-xl` 20 (hộp thoại), `rounded-full`                                                                                                                                                                 |
| Đổ bóng       | `shadow-sm`, `shadow-md`, `shadow-lg` (đổi theo chế độ sáng/tối)                                                                                                                                                                                                                  |
| Điểm ngắt     | `sm` 640, `md` 768, `lg` 1024, `xl` 1280                                                                                                                                                                                                                                          |

### shadcn/ui

`tokens.css` đã khai báo các biến shadcn/ui theo bảng ánh xạ trong README của hệ thống thiết kế, nên component thêm bằng `npx shadcn add …` tự nhận màu. Khi `shadcn init` sinh khối `:root { --background: … }` và `.dark { … }` trong CSS của ứng dụng thì xóa các khối đó đi, để không ghi đè token.
