# @tps/shared

Code dùng chung cho API, Web và Mobile. Mỗi thứ khai báo **một lần** ở đây.

| Tệp               | Nội dung                                                                                                                                                                                                                   |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/statuses.ts` | Enum nghiệp vụ (trạng thái, loại, lý do) dạng `z.enum`. Giá trị khớp với `CHECK` trong [thiết kế CSDL](../../docs/thiet_ke_co_so_du_lieu.md); vòng đời ở [thuật ngữ và trạng thái](../../docs/thuat_ngu_va_trang_thai.md). |
| `src/errors.ts`   | Mã lỗi (`ErrorCode`), HTTP status tương ứng, định dạng thân lỗi `{ error: { code, message, details?, requestId? } }`.                                                                                                      |
| `src/schemas/`    | Zod schema dùng chung: email, mật khẩu (D50), số tiền VND, phân trang…                                                                                                                                                     |
| `src/i18n/`       | Chuỗi giao diện `vi` (gốc) và `en`. Khóa theo `<miền>.<khóa>`, ví dụ `lessonStatus.tutor_absent`, `errors.not_found`.                                                                                                      |

```ts
import { LessonStatus, messages } from '@tps/shared';

LessonStatus.parse(input); // kiểm tra giá trị
LessonStatus.options; // ['scheduled', 'held', 'cancelled', 'tutor_absent']
const status: LessonStatus = LessonStatus.enum.held;
messages.vi.lessonStatus[status]; // 'Đã dạy'
```

## Quy tắc

- Thêm giá trị trạng thái: sửa `statuses.ts`, thêm nhãn vào **cả** `vi.ts` và `en.ts` (thiếu là type-check báo lỗi), rồi sửa `CHECK` trong migration của API.
- Lỗi validation trong schema dùng **mã** (`{ error: 'password_too_short' }`) có bản dịch ở `validation.*`, không viết câu thông báo trực tiếp.
- Không đặt code chỉ dùng ở một app vào đây; không phụ thuộc Express, React hay TypeORM.

## Lệnh

```sh
npm run build -w @tps/shared       # biên dịch ra dist/ (app khác import bản này)
npm run dev -w @tps/shared         # biên dịch lại khi sửa
npm test -w @tps/shared            # Vitest
npm exec -w @tps/shared -- vitest run src/schemas/common.test.ts   # chạy một tệp test
npm exec -w @tps/shared -- vitest run -t "Password"                # chạy test theo tên
```
