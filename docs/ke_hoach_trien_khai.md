# Kế hoạch triển khai dự án TPS-Connection

Tài liệu này chia việc phát triển TPS-Connection thành các giai đoạn, từ chuẩn bị đến bản đầu (MVP), thử nghiệm và các bản mở rộng. Mỗi giai đoạn nêu mục tiêu, phạm vi công việc, sản phẩm đầu ra và tiêu chí hoàn thành.

**Căn cứ:**

- [Mô tả nghiệp vụ](mo_ta_nghiep_vu.md): phạm vi bản đầu ở §15.1, mở rộng ở §15.2, quy tắc ở §16.
- [Công nghệ sử dụng](cong_nghe_su_dung.md): stack và hạ tầng.
- [Decision log](00-product/decision-log.md): các quyết định D1–D56 và câu trả lời C1–C13 đã chốt. Tài liệu này trích mã quyết định trong ngoặc, ví dụ _(D5)_.

> Trạng thái: **đề xuất**. Chưa ước lượng thời gian theo tuần vì chưa có quy mô đội ngũ, số giờ làm việc và ngân sách (C13). Thứ tự giai đoạn là thứ tự phụ thuộc; khi có nguồn lực, một số giai đoạn có thể chạy song song như ghi chú ở mục 4.

---

## 1. Tổng quan lộ trình

| Giai đoạn | Tên                                         | Bản phát hành |
| --------- | ------------------------------------------- | ------------- |
| 0         | Chuẩn bị và chốt quyết định (**hoàn thành**) | –            |
| 1         | Nền móng kỹ thuật (**hoàn thành**)          | MVP           |
| 1b        | Thiết kế giao diện (**hoàn thành**)         | MVP           |
| 2         | Tài khoản, phân quyền và hồ sơ              | MVP           |
| 3         | Xác minh gia sư và trang quản trị cơ bản    | MVP           |
| 4         | Bài đăng và tìm kiếm (marketplace)          | MVP           |
| 5         | Kết nối, nhắn tin và thông báo              | MVP           |
| 6         | Lớp học, lịch, điểm danh và kết quả cơ bản  | MVP           |
| 7         | Ghi nhận học phí                            | MVP           |
| 8         | An toàn, kiểm duyệt và hoàn thiện ra mắt    | MVP           |
| 9         | Thử nghiệm thực tế (pilot)                  | MVP           |
| 10        | Ứng dụng Mobile                             | Bản 2         |
| 11        | Học tập: bài tập, đánh giá, báo cáo tiến độ | Bản 3         |
| 12        | Mở rộng sau                                 | Bản 4+        |

**Nguyên tắc chung cho mọi giai đoạn:**

- Mỗi giai đoạn kết thúc bằng một bản chạy được trên môi trường dev/staging, không để dở dang qua giai đoạn sau.
- Quyền truy cập theo quan hệ (phụ huynh–con, gia sư–lớp) được kiểm tra ở tầng service và có test ngay khi viết tính năng, không dồn đến cuối.
- Mọi chuỗi giao diện, danh mục và email có cả tiếng Việt và tiếng Anh ngay từ đầu. Nội dung người dùng tự viết không dịch _(C11)_.
- Dữ liệu học tập không xóa cứng; dùng trạng thái kết thúc và `deleted_at` _(C2)_.
- Mỗi tính năng có test API (Jest + Supertest) cho luồng chính và luồng bị từ chối quyền.

---

## 2. Bản đầu (MVP): Web + API

Theo _(D2)_, bản đầu gồm Web và API. Mobile là bản phát hành kế tiếp.

**Phạm vi MVP đã chốt:**

| Hạng mục                   | Trong MVP                                                        | Để sau                                               |
| -------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------- |
| Người học                  | Học sinh có phụ huynh quản lý _(D3)_                             | Người học trưởng thành tự dùng (dữ liệu hỗ trợ sẵn)  |
| Tài khoản học sinh         | Phụ huynh tạo và mời; học sinh chỉ xem _(D4)_                    | Học sinh chat, nộp bài                               |
| Xác minh                   | Bắt buộc xác minh danh tính trước khi hiển thị công khai _(D5)_  | –                                                    |
| Bằng cấp                   | Huy hiệu tùy chọn _(D5)_                                         | –                                                    |
| Lớp học                    | 1 kèm 1 _(D7)_                                                   | Lớp nhóm (dữ liệu hỗ trợ sẵn)                        |
| Học phí                    | Ghi nhận, đối chiếu, thanh toán ngoài nền tảng _(D6)_            | Thanh toán trực tuyến                                |
| Nhắn tin                   | Gia sư–phụ huynh, mở khi bên nhận chấp nhận yêu cầu _(D14)_      | Học sinh tham gia trao đổi _(C7)_                    |
| Thông tin liên hệ, danh tính trẻ | Mở khi hai bên xác nhận hợp tác _(D16)_                    | –                                                    |
| Thông báo                  | Trong app và email _(D10, C12)_                                  | Thông báo đẩy (khi có Mobile)                        |
| Yêu thích gia sư           | Có nếu kịp _(D10)_                                               | –                                                    |
| Bài tập, đánh giá gia sư   | –                                                                | Ngay sau MVP _(D10)_                                 |
| Lọc khu vực                | Theo tỉnh/thành và xã/phường _(D11)_                             | Lọc theo bán kính                                    |
| Đăng ký                    | Bằng email, xác thực OTP qua email _(C12)_                       | Đăng ký và xác thực bằng số điện thoại (cần SMS)     |

### Giai đoạn 0. Chuẩn bị và chốt quyết định

> **Hoàn thành ngày 2026-11-12.** Các việc bên ngoài (pháp lý, tên miền, khu vực pilot) đã chuyển sang [Việc của chủ dự án](#5-việc-của-chủ-dự-án) _(D47)_.

**Mục tiêu:** có đủ quyết định và tài liệu để thiết kế mà không phải đoán.

**Công việc:**

1. ~~Chép các quyết định sang decision log~~: **xong ngày 2026-11-12** ([decision log](00-product/decision-log.md), D1–D48, C1–C13).
2. ~~Đồng bộ mô tả nghiệp vụ, tài liệu công nghệ và `CLAUDE.md` theo decision log~~: **xong ngày 2026-11-12**.
3. ~~Lập bảng thuật ngữ Việt–Anh dùng cho code~~: **bản nháp xong ngày 2026-11-12** ([thuật ngữ và sơ đồ trạng thái](thuat_ngu_va_trang_thai.md), Phần A), đã duyệt.
4. ~~Vẽ sơ đồ trạng thái~~: **bản nháp xong ngày 2026-11-12** (cùng tài liệu, Phần B: kết nối, bài đăng, hồ sơ gia sư, lớp, buổi học, xác nhận buổi, khiếu nại, kiểm duyệt, học phí), đã duyệt; quy tắc bổ sung chốt thành D30–D41.
5. Thiết kế cơ sở dữ liệu tổng thể: **bản nháp xong ngày 2026-11-12** ([thiết kế cơ sở dữ liệu](thiet_ke_co_so_du_lieu.md)), đã review và chốt các giả định (D21–D28).
6. Chọn nguồn danh mục đơn vị hành chính: **đề xuất xong ngày 2026-11-12** ([danh mục hành chính](danh_muc_hanh_chinh.md)), đã duyệt (D42–D44).
7. Chốt chỉ số thành công cho pilot: **đã chốt ngày 2026-11-12** (D45: 10 gia sư đã xác minh, 30 phụ huynh, 5 lớp, ≥ 50% lớp còn học sau 4 tuần; không đặt ngưỡng dừng). Khu vực pilot: chuyển sang việc của chủ dự án.
8. Soạn câu hỏi rà soát pháp lý: **xong ngày 2026-11-12** ([câu hỏi pháp lý](00-product/cau_hoi_phap_ly.md), 25 câu). Việc gửi luật sư: chuyển sang việc của chủ dự án.
9. Wireframe các màn hình chính: **đã duyệt ngày 2026-11-12** _(D46)_, 9 màn hình ([canvas wireframe](https://claude.ai/artifact/P1UHBGsARFepZiutNESYR2)). Duyệt về nội dung và luồng; hình thức và các màn hình chưa vẽ (đăng ký/đăng nhập, bài tìm gia sư, tin nhắn đầy đủ, học sinh, Admin) làm ở G1b.
10. Đăng ký tên miền: chuyển sang việc của chủ dự án.

**Đầu ra:** decision log, glossary, sơ đồ trạng thái, tài liệu thiết kế CSDL, nguồn danh mục hành chính, chỉ số pilot, danh sách câu hỏi pháp lý, wireframe.

**Hoàn thành khi:** chủ dự án duyệt thiết kế CSDL và sơ đồ trạng thái. ✅ Đạt; các việc còn lại đã xong hoặc chuyển sang việc của chủ dự án.

### Giai đoạn 1. Nền móng kỹ thuật

> **Hoàn thành ngày 2026-11-13.** Mã nằm trên `main` (PR #2, #3); CI xanh trên pull request và trên `main`. Đã thử tiêu chí hoàn thành: clone repo mới, làm theo `README.md` là chạy được API, web và các dịch vụ phụ (trang `/status` báo cả ba dịch vụ hoạt động). Lưu tệp dùng SeaweedFS thay MinIO _(D53)_. Giới hạn dung lượng tệp theo từng mục đích đã chốt ở D55.

**Mục tiêu:** một bộ khung chạy được end-to-end, để các giai đoạn sau chỉ thêm tính năng.

**Công việc:**

- Monorepo npm workspaces + Turborepo _(D29)_: `apps/api`, `apps/web`, `packages/shared`, `packages/config` (tsconfig, ESLint, Prettier dùng chung).
- Docker Compose cho môi trường local: PostgreSQL (bật `unaccent`, `pg_trgm`), Redis, SeaweedFS (lưu tệp, D53), Mailpit.
- **API:** Express + TypeScript, cấu trúc module theo nghiệp vụ (router → controller → service → repository), TypeORM với migration (tắt `synchronize`), validate biến môi trường bằng Zod, logging `pino`, định dạng lỗi thống nhất với mã lỗi để client tự dịch, OpenAPI sinh từ Zod, endpoint health check.
- **Web:** React + Vite + Tailwind + shadcn/ui; React Router framework mode có SSR cho trang công khai _(D12)_; TanStack Query; i18next với hai ngôn ngữ; layout theo vai trò; route `/admin`.
- **Shared:** enum trạng thái, Zod schema, mã lỗi, file ngôn ngữ `vi`/`en`.
- Dịch vụ dùng chung: upload qua presigned URL (bucket public cho ảnh đại diện, bucket private cho giấy tờ và tệp riêng), gửi email qua interface (`nodemailer`, Gmail SMTP; Mailpit khi local), hàng đợi BullMQ.
- CI GitHub Actions: lint, type-check, test, build. Husky + lint-staged.
- Test: Jest + Supertest + Testcontainers cho API; Vitest + Testing Library + msw cho web.
- Cập nhật `CLAUDE.md` với các lệnh install, dev, build, lint, chạy một test.

**Đầu ra:** `npm run dev` chạy API, web và các dịch vụ phụ; CI xanh; một trang mẫu gọi được API.

**Hoàn thành khi:** lập trình viên mới clone repo và chạy được toàn bộ hệ thống chỉ với hướng dẫn trong README. ✅ Đạt.

### Giai đoạn 1b. Thiết kế giao diện

> **Hoàn thành ngày 2026-11-13.** Hệ thống thiết kế và giao diện MVP đã duyệt _(D49, D52)_; bộ token đã vào `packages/config` và được web dùng.

**Mục tiêu:** có giao diện hoàn chỉnh, thống nhất cho Web trước khi bắt đầu code giao diện ở G2. Làm song song với G1 _(D46)_.

**Đầu vào cần chủ dự án cung cấp:** logo và màu thương hiệu (nếu có); cảm giác muốn người dùng có (tin cậy, thân thiện hay năng động) hoặc sản phẩm tham khảo; có cần chế độ tối ngay từ MVP không.

**Công việc:**

1. **Hệ thống thiết kế:** màu (chính, phụ, màu trạng thái như chờ, đã xác nhận, quá hạn), font và thang cỡ chữ (hỗ trợ tiếng Việt), khoảng cách, bo góc, đổ bóng, icon; các thành phần: nút, ô nhập, chọn, thẻ, bảng, nhãn trạng thái, thông báo, hộp thoại, thanh điều hướng. Đạt chuẩn tương phản (WCAG AA), vùng bấm tối thiểu 44 px. **Bản đầu xong ngày 2026-11-12** theo hướng A (D48): [TPS-Connection Design System](https://claude.ai/artifact/263FLgUp1zeKVVnVnRMUY1), **đã duyệt ngày 2026-11-12** _(D49)_.
2. **Logo:** logo dạng chữ dùng tạm; logo chính thức nên do designer chuyên nghiệp làm. **Logo tạm đã có** trong hệ thống thiết kế (nhóm Logos).
3. **Giao diện hoàn chỉnh 9 màn hình đã có wireframe**, mỗi màn hình có bản máy tính và bản điện thoại. **Bản đầu xong ngày 2026-11-12**: [canvas giao diện MVP](https://claude.ai/artifact/UNVxzXt9ZZvhxvtvqMK6o3) (18 bảng vẽ, có chế độ tối), **đã duyệt ngày 2026-11-12** _(D52)_.
4. **Các màn hình chưa vẽ:** đăng ký, đăng nhập, xác thực email, quên mật khẩu; tạo hồ sơ con và mời học sinh; bài tìm gia sư (đăng và xem); trang tin nhắn; giao diện học sinh; trang Admin (tài khoản, danh mục); các trạng thái rỗng, đang tải, lỗi. Bổ sung (có liên kết từ 9 màn hình chính): lịch dạy/lịch học, danh sách lớp, chi tiết lớp phía gia sư (tạm nghỉ, kết thúc, đổi học phí, buổi bù), bài tuyển học sinh của gia sư, tìm học sinh, trang học phí, yêu thích, thông báo, tài khoản và cài đặt, hộp thoại khiếu nại buổi học, báo cáo/chặn; Manager: báo cáo vi phạm, tranh chấp buổi học, kiểm duyệt bài đăng; Admin: xử lý kháng nghị. **Bản đầu xong ngày 2026-11-12**: 36 màn hình (72 bảng vẽ máy tính và điện thoại) trên canvas giao diện MVP, chia các trang: Tài khoản và hồ sơ con; Bài đăng; Tin nhắn và thông báo; Lớp học, lịch và học phí; Học sinh, cài đặt, trạng thái; Manager và Admin; Bổ sung (sửa hồ sơ gia sư, buổi học bù, sửa lịch, tạm nghỉ/kết thúc lớp, mẫu email); Máy tính bảng (4 mẫu, quy tắc ở D51). **Đã duyệt ngày 2026-11-12** _(D52)_. Chưa vẽ (làm theo màn tương tự khi code): xem/sửa hồ sơ từng con, danh sách lớp của phụ huynh, lịch và điểm của học sinh, trang "Dành cho gia sư", điều khoản, nhật ký kiểm toán. Quy tắc tài khoản phát sinh khi thiết kế ghi ở D50.
5. **Chuyển giao cho code:** bộ token (màu, font, khoảng cách) để đưa vào cấu hình Tailwind và theme shadcn/ui. **Đã xuất ngày 2026-11-12** vào `packages/config`: `tokens.css` sinh từ `tokens.json` của hệ thống thiết kế, preset Tailwind v4 `tailwind.css`, biến shadcn/ui gán theo bảng ánh xạ. Đã nạp vào `apps/web` ngày 2026-11-12 (khung Web G1): Button, Badge, Card, Alert dựng theo hệ thống thiết kế; điều hướng theo canvas giao diện.

**Đầu ra:** hệ thống thiết kế, giao diện các màn hình MVP (máy tính và điện thoại), bộ token.

**Hoàn thành khi:** chủ dự án duyệt hệ thống thiết kế và giao diện các màn hình dùng ở G2; bộ token đã đưa vào cấu hình web. ✅ Đạt.

### Giai đoạn 2. Tài khoản, phân quyền và hồ sơ

**Mục tiêu:** người dùng đăng ký, đăng nhập theo vai trò và tạo hồ sơ; quyền truy cập theo quan hệ được thiết lập từ đầu.

**Công việc:**

- **Xác thực:** đăng ký bằng email, xác thực email bằng OTP 6 số qua email (lưu Redis có TTL; hiệu lực 10 phút, sai 5 lần thì hủy, gửi lại sau 45 giây, tối đa 5 lần mỗi giờ _(D54)_), đăng nhập, quên và đặt lại mật khẩu bằng OTP (băm `argon2`), JWT access token ngắn hạn + refresh token xoay vòng lưu hash, đăng xuất và thu hồi phiên. Rate limit cho đăng nhập và gửi OTP.
- **Vai trò:** gia sư, phụ huynh, học sinh, Manager, Admin. Thiết kế bảng vai trò cho phép một người có nhiều vai trò về sau.
- **Hồ sơ phụ huynh** và **hồ sơ học sinh:** phụ huynh tạo nhiều hồ sơ con. Hồ sơ học sinh tồn tại độc lập với tài khoản. Mỗi trẻ có đúng một phụ huynh quản lý _(C9)_. Lưu đồng ý xử lý dữ liệu của phụ huynh.
- **Tài khoản học sinh:** phụ huynh gửi lời mời qua email; học sinh nhận lời mời, tạo tài khoản và liên kết với hồ sơ có sẵn; quyền chỉ xem _(D4)_.
- **Hồ sơ gia sư:** giới thiệu, ảnh, nghề nghiệp, trường/đơn vị, chuyên ngành, kinh nghiệm, phương pháp, môn học và khối lớp dạy được, hình thức dạy, khu vực dạy trực tiếp (tỉnh, xã), học phí dự kiến theo giờ hoặc buổi để tham khảo _(D18)_, lịch rảnh theo tuần, tình trạng nhận học sinh. Trạng thái hồ sơ: chưa hoàn thiện / chờ xác minh / đã xác minh.
- **Thông tin cá nhân:** cập nhật hồ sơ, ảnh đại diện, ngôn ngữ, tùy chọn riêng tư. Số điện thoại lưu với nhãn "tự khai, chưa xác thực" _(C12)_. Email và số điện thoại không bao giờ trả về trong API công khai; chỉ trả cho bên kia sau khi xác nhận hợp tác _(D16)_.
- **Danh mục:** môn học, khối lớp/cấp học, tỉnh và xã, mỗi mục có tên hai ngôn ngữ. Nạp dữ liệu ban đầu bằng seed.
- **Phân quyền theo quan hệ:** các hàm kiểm tra dùng chung (`isParentOf`, `isStudentSelf`, `teachesStudent`) và test đi kèm.

**Đầu ra:** các màn hình đăng ký, đăng nhập, chọn vai trò, hồ sơ phụ huynh và con, hồ sơ gia sư, mời học sinh.

**Hoàn thành khi:** test chứng minh phụ huynh A không đọc được hồ sơ con của phụ huynh B, và API công khai không lộ email hay số điện thoại.

**Tiến độ (2026-11-13):** phần API đã xong: xác thực, vai trò và phân quyền, hồ sơ phụ huynh và con, đồng ý xử lý dữ liệu của con, lời mời học sinh, hồ sơ gia sư, thông tin cá nhân và ảnh đại diện, API đọc danh mục, `isParentOf` và `isStudentSelf` (`teachesStudent` làm ở G6 cùng bảng lớp học). Hai test của điều kiện hoàn thành đã có (`learners.int.test.ts`, `tutors.int.test.ts` trong `apps/api/test/integration`).

**Còn lại của G2:**

- Các màn hình web (mục Đầu ra), kể cả trang nhận lời mời `/student-invitation` (token nằm sau `#` trong liên kết email).
  - Màn xem/sửa hồ sơ từng con chưa có trên canvas giao diện (G1b mục 4): dựng theo màn tạo hồ sơ con.
  - Thay thanh chọn vai trò tạm thời khi dev (`apps/web/app/lib/dev-role.server.ts`, `routes/dev-role.ts`) bằng đăng nhập thật; xóa hai tệp đó.
- ~~Thống nhất định dạng lỗi validation trước phần web~~: **xong ngày 2026-11-13**. Mọi lỗi theo từng ô có `details[].code` là khóa `validation.*` trong i18n (mã lạ quy về `invalid`); web hiển thị `t('validation.<code>')`, lỗi đầu tiên của mỗi ô.

**Câu hỏi chờ chủ dự án quyết** (chốt xong thì ghi vào decision log):

- "Tùy chọn riêng tư" (§3.1) gồm những gì? Gợi ý: bật/tắt nhận email giới thiệu (loại đồng ý `marketing_email` đã có trong bảng `user_consents`).
- Có cho phụ huynh xóa hồ sơ con đã có tài khoản học sinh không? Nếu có, tài khoản học sinh xử lý thế nào? API hiện trả 409.
- Độ tuổi tối thiểu của tài khoản học sinh (D4, chờ luật sư). Lời mời học sinh hiện chưa kiểm tra tuổi.

### Giai đoạn 3. Xác minh gia sư và trang quản trị cơ bản

**Mục tiêu:** gia sư được xác minh để có thể xuất hiện công khai; Manager và Admin có công cụ làm việc tối thiểu.

**Công việc:**

- **Nộp hồ sơ xác minh** _(C4)_: mọi gia sư nộp CCCD; sinh viên nộp thêm thẻ sinh viên; bằng cấp, chứng chỉ nộp tùy chọn để lấy huy hiệu. Tệp lưu ở bucket private, xem bằng presigned URL ngắn hạn.
- **Duyệt:** Manager xem hàng chờ, duyệt hoặc từ chối kèm lý do; gia sư được nộp lại. Mục tiêu xử lý trong 2 ngày làm việc. Mỗi trường trong hồ sơ được đánh dấu tự khai hoặc đã xác minh.
- **Sau khi duyệt:** giữ kết quả xác minh, job tự xóa ảnh giấy tờ sau 30 ngày (mốc chờ luật sư xác nhận).
- **Quản trị (Admin):** danh sách và tìm kiếm tài khoản, khóa/mở khóa, gán vai trò Manager, quản lý danh mục môn, khối lớp, khu vực.
- **Nhật ký kiểm toán (audit log):** ghi mọi thao tác của Manager và Admin, nhất là mỗi lần xem giấy tờ tùy thân.
- **Việc chuyển từ G2:**
  - Nộp xác minh chuyển hồ sơ `incomplete` → `pending_verification` (B.4.1). Chỉ cho nộp khi `missingForVerification` của `GET /me/tutor-profile` rỗng (D34).
  - Mở endpoint tải tệp `POST /files/uploads` cho `verification_document` và `credential` (hiện chỉ nhận `avatar`, xem `UPLOADABLE_PURPOSES` trong `apps/api/src/modules/files/files.service.ts`).
  - Duyệt bằng cấp thì cập nhật `tutor_credentials.verification_status` và `tutor_profiles.has_verified_degree` (D20). API đã khóa sửa, xóa bằng cấp đang chờ duyệt hoặc đã xác minh.
  - Job dọn bản ghi `files` còn `pending_upload` quá 24 giờ và xóa tệp tương ứng trên kho (thiết kế CSDL mục 13). Ảnh đại diện đã tạo được bản ghi loại này từ G2.
- Thông báo email và trong app khi hồ sơ được duyệt hoặc bị từ chối (dùng bảng thông báo tối giản; hoàn thiện ở giai đoạn 5).

**Đầu ra:** luồng xác minh đầy đủ trên web; trang `/admin` cho Manager và Admin.

**Hoàn thành khi:** gia sư chưa được duyệt danh tính không thể đăng bài và không xuất hiện trong kết quả tìm kiếm công khai; Manager không có quyền của Admin và ngược lại.

### Giai đoạn 4. Bài đăng và tìm kiếm (marketplace)

**Mục tiêu:** phụ huynh tìm thấy gia sư, gia sư tìm thấy nhu cầu.

**Công việc:**

- **Bài tuyển học sinh của gia sư** (§4.1): tạo, sửa, lưu nháp, ẩn, xóa; trạng thái nháp / đang tuyển / tạm dừng / đã đủ học sinh / đã đóng. Chỉ gia sư đã xác minh được đăng _(D5)_. Đếm lượt xem và số yêu cầu phát sinh.
- **Bài tìm gia sư của phụ huynh** (§4.2): gắn với hồ sơ con nhưng không hiển thị danh tính, trường, địa chỉ hay liên hệ của trẻ; chỉ hiện tỉnh/xã. Tạo, sửa, ẩn, đóng.
- **Tìm kiếm gia sư** (§4.3): lọc theo môn, khối lớp, hình thức học, tỉnh/xã, mức học phí, kinh nghiệm, lịch rảnh, có bằng cấp đã xác minh _(D20)_. Sắp xếp theo mức phù hợp, kinh nghiệm, học phí, ngày cập nhật. Tìm theo từ khóa có hoặc không dấu (`unaccent`, `pg_trgm`). Bộ lọc theo đánh giá thêm ở giai đoạn 11.
- **Tìm nhu cầu** cho gia sư đã xác minh, lọc theo môn, khối, khu vực, ngân sách.
- **Trang công khai có SSR và SEO** _(C8)_: khách xem được gia sư đã xác minh (tên hiển thị, môn, lớp, tỉnh, học phí) và bài tuyển học sinh. Bài tìm gia sư của phụ huynh **không** công khai, chỉ gia sư đã xác minh và đăng nhập mới thấy.
- **Gợi ý đơn giản:** xếp hạng theo các tiêu chí giải thích được (môn, cấp lớp, ngân sách, lịch rảnh, hình thức, khu vực, tình trạng nhận học sinh).
- **Yêu thích và so sánh gia sư** _(D10, làm nếu kịp)_.
- Index cơ sở dữ liệu theo đúng các truy vấn lọc, kiểm chứng bằng `EXPLAIN ANALYZE` với dữ liệu mẫu.
- **Việc chuyển từ G2:**
  - Thêm cột `tutor_profiles.search_vector` cùng index (G2 chưa tạo, xem thiết kế CSDL mục 5.1).
  - Slug cho URL hồ sơ gia sư `/tutors/<slug>` _(D56)_. API hiện dùng id: `GET /api/v1/tutors/:tutorId`.
  - Danh sách và tìm kiếm gia sư dùng cùng điều kiện hiển thị công khai với `GET /tutors/:tutorId`: đã xác minh, tài khoản `active`, chưa xóa. Không trả email, số điện thoại, họ tên thật (đã có test ở `tutors.int.test.ts`; thêm test tương tự cho danh sách).

**Đầu ra:** trang tìm gia sư, chi tiết gia sư, chi tiết bài đăng, quản lý bài đăng của gia sư và phụ huynh.

**Hoàn thành khi:** khách chưa đăng nhập tìm được gia sư đã xác minh; trang công khai render phía server; không có dữ liệu nhận dạng của trẻ trong bất kỳ response công khai nào.

### Giai đoạn 5. Kết nối, nhắn tin và thông báo

**Mục tiêu:** hai bên gửi yêu cầu, trao đổi và cùng xác nhận hợp tác. Đây là điểm chuyển từ marketplace sang quản lý dạy học.

**Công việc:**

- **Yêu cầu kết nối hai chiều** (§5.1, §5.2): phụ huynh gửi gia sư (từ hồ sơ hoặc bài tuyển) hoặc gia sư ứng tuyển vào bài tìm gia sư. Bản ghi lưu chiều gửi, bài đăng nguồn, hồ sơ học sinh liên quan và lời nhắn.
- **Máy trạng thái** _(D15, C3)_: chờ phản hồi → đang trao đổi (khi bên nhận chấp nhận) → đã xác nhận hợp tác; nhánh đã từ chối, đã hủy. "Đã chấp nhận" là sự kiện được ghi lại, không phải trạng thái. Cả hai bên phải bấm xác nhận. Lưu lịch sử chuyển trạng thái và người thực hiện.
- **Tự hết hạn** _(C3)_: chờ phản hồi quá 7 ngày hoặc đang trao đổi quá 30 ngày thì tự hủy (job BullMQ), có nhắc trước; sau đó vẫn gửi lại được.
- **Điều kiện hợp tác:** khi xác nhận, chốt môn, mục tiêu, lịch dự kiến, hình thức, học phí theo buổi và thời lượng mỗi buổi _(C6, D18)_ thành bản ghi bất biến làm căn cứ tạo lớp.
- **Nhắn tin** (§5.4): mở khi bên nhận chấp nhận yêu cầu, dù bên đó là gia sư hay phụ huynh _(D14)_; Socket.IO có Redis adapter; gửi văn bản, ảnh, tệp; lưu lịch sử; trạng thái đã đọc. MVP chỉ gia sư và phụ huynh chat, học sinh chưa chat _(C7)_.
- **Mở thông tin liên hệ và danh tính trẻ:** email, số điện thoại và thông tin nhận dạng của trẻ (họ tên đầy đủ, trường, địa chỉ) chỉ hiện cho bên kia sau khi hai bên xác nhận hợp tác. Trong lúc trao đổi, gia sư chỉ thấy cấp lớp, môn, mục tiêu, tỉnh/xã _(D8, D16)_.
- **Chặn và báo cáo** tài khoản và tin nhắn (dữ liệu báo cáo dùng cho giai đoạn 8).
- **Thông báo** (§12): bảng thông báo, đẩy realtime qua Socket.IO, email cho sự kiện quan trọng, tùy chọn bật/tắt theo loại. Các loại trong MVP: yêu cầu mới, được chấp nhận/từ chối, tin nhắn mới, sắp hết hạn yêu cầu, kết quả xác minh. Nội dung email không chứa thông tin của trẻ.

**Đầu ra:** hộp yêu cầu kết nối của gia sư và phụ huynh, màn hình chat, trung tâm thông báo.

**Hoàn thành khi:** chạy trọn hai luồng §14.1 và §14.2 đến bước "xác nhận hợp tác" trên môi trường staging; test chứng minh chat không mở trước khi được chấp nhận và liên hệ không lộ trước khi xác nhận hợp tác.

### Giai đoạn 6. Lớp học, lịch, điểm danh và kết quả cơ bản

**Mục tiêu:** sau khi hợp tác được xác nhận, gia sư quản lý việc dạy và phụ huynh theo dõi được.

**Công việc:**

- **Tạo lớp tự động** từ điều kiện hợp tác đã xác nhận _(D9)_: tên lớp, học sinh, phụ huynh liên hệ, môn, khối, mục tiêu, ngày bắt đầu, học phí theo buổi. Dữ liệu cho phép nhiều học sinh trong một lớp, nhưng MVP chỉ mở 1 kèm 1 _(D7)_.
- **Trạng thái lớp:** đang học / tạm nghỉ / đã kết thúc. Lớp kết thúc vẫn tra cứu được lịch sử.
- **Đổi học phí** _(D17)_: gia sư đề xuất giá mới, phụ huynh đồng ý thì giá mới áp dụng cho các buổi từ thời điểm đó về sau; lưu lịch sử các mức giá.
- **Hồ sơ học sinh phía gia sư:** năng lực ban đầu, lưu ý giảng dạy, mục tiêu theo tháng hoặc học kỳ. Gia sư chỉ thấy học sinh mình đang dạy hoặc đã dạy.
- **Lịch học** (§7): buổi đơn lẻ hoặc lặp hằng tuần (lưu quy tắc RRULE, sinh buổi học cụ thể trước một khoảng thời gian); múi giờ `Asia/Ho_Chi_Minh`, lưu UTC. Sửa hoặc hủy một buổi không làm thay đổi các buổi đã qua.
- **Xem lịch** theo ngày, tuần, tháng cho gia sư, phụ huynh và học sinh.
- **Điểm danh từng học sinh:** đã học / học sinh vắng / gia sư vắng / đã hủy / học bù; ghi nhận hủy muộn (dưới 2 giờ) và vắng không báo _(C5)_. Ghi chú nội dung đã dạy và thời lượng thực tế. Mỗi buổi lưu giá học phí đã áp dụng tại thời điểm đó.
- **Phụ huynh xác nhận buổi học** _(C5)_: có 48 giờ để xác nhận hoặc khiếu nại; nhắc một lần trước hạn; hết hạn thì tự chốt theo điểm danh của gia sư.
- **Khiếu nại buổi học** _(C5)_: buổi bị khiếu nại tạm chưa tính tiền; hai bên có 3 ngày tự thống nhất, nếu không thì Manager quyết định và chỉ sửa bản ghi, không hoàn tiền.
- **Kết quả cơ bản** (§15.1): gia sư nhập điểm và nhận xét theo buổi hoặc theo bài kiểm tra; phụ huynh và học sinh xem được.
- **Thông báo:** buổi học sắp diễn ra, lịch thay đổi hoặc bị hủy, buổi cần xác nhận, điểm và nhận xét mới.
- **Việc chuyển từ G2:** hàm `teachesStudent` (gia sư dạy hoặc đã dạy người học qua lớp; thiết kế CSDL mục 12 gọi là `teachesLearner`). Đặt cạnh `isParentOf`, `isStudentSelf` trong `apps/api/src/modules/learners/learner-access.ts`, kèm test chứng minh gia sư không xem được học sinh mình không dạy. Xóa hồ sơ con khi đã có lớp: không được xóa lịch sử học tập (C2), nên phải chặn hoặc chỉ ẩn.

**Đầu ra:** trang lớp học, lịch, điểm danh, xác nhận buổi, khiếu nại buổi, xem kết quả của con.

**Hoàn thành khi:** chạy trọn luồng §14.3 từ bước 1 đến 5 và bước 8–9 (phần điểm, nhận xét); kết thúc lớp không làm mất dữ liệu; test quyền cho gia sư, phụ huynh và học sinh trên dữ liệu lớp.

### Giai đoạn 7. Ghi nhận học phí

**Mục tiêu:** hai bên đối chiếu được số buổi và số tiền; tiền được trả ngoài nền tảng _(D6)_.

**Công việc:**

- Tổng hợp học phí theo tháng _(C6)_ từ các buổi đã chốt: số buổi tính tiền, số buổi không tính tiền (vắng, hủy) kèm lý do, buổi đang khiếu nại.
- Tạo khoản phải thu hằng tháng cho từng lớp; trạng thái chưa thanh toán / đã thanh toán một phần / đã thanh toán.
- Ghi nhận thanh toán thủ công (ngày, số tiền, phương thức: tiền mặt, chuyển khoản…), cả hai bên xem được lịch sử.
- Lưu tiền bằng số nguyên VND; giá theo buổi lấy từ bản ghi buổi học, không tính lại theo giá hiện tại.
- Thông báo khoản học phí đến hạn.
- Thiết kế bảng thanh toán có trường phương thức (thủ công / trực tuyến) để mở rộng sau mà không phải đổi cấu trúc.

**Đầu ra:** trang học phí của lớp cho gia sư và phụ huynh, bảng tổng hợp theo tháng.

**Hoàn thành khi:** số liệu học phí khớp với lịch sử buổi học trong các test có buổi vắng, hủy muộn, học bù và khiếu nại.

### Giai đoạn 8. An toàn, kiểm duyệt và hoàn thiện ra mắt

**Mục tiêu:** nền tảng đủ an toàn và ổn định để có người dùng thật.

**Công việc:**

- **Kiểm duyệt** (§13): hàng chờ báo cáo vi phạm cho tài khoản, bài đăng, tin nhắn; Manager chỉ xem đoạn tin nhắn bị báo cáo _(C1)_; lưu kết quả xử lý; cảnh báo, hạn chế, khóa tài khoản; ẩn bài đăng vi phạm. Admin xử lý khiếu nại lại.
- **Xóa tài khoản** _(C2, D19)_: ghi `deleted_at` và ẩn ngay; job sau 6 tháng xóa hẳn dữ liệu cá nhân, ẩn danh bản ghi lớp và đánh giá; giấy tờ xác minh theo mốc riêng. Bên còn lại vẫn thấy lịch sử buổi học, điểm, học phí dưới nhãn "Học sinh đã xóa tài khoản".
- **Đổi phụ huynh quản lý** do Admin xử lý theo yêu cầu _(C9)_: kết thúc dòng `learner_guardians` cũ (`ended_reason = 'transferred'`, `changed_by`) rồi thêm dòng mới, trong một transaction.
- **Thống kê cơ bản** cho Admin theo các chỉ số pilot ở giai đoạn 0.
- **Review bảo mật** (skill `security-review`): xác thực, phân quyền theo quan hệ, upload tệp, rate limit, header bảo mật, CORS, lộ dữ liệu qua API, log không chứa dữ liệu của trẻ.
- **Kiểm thử end-to-end** bằng Playwright cho các luồng §14.1, §14.2, §14.3.
- **Hiệu năng:** kiểm tra truy vấn tìm kiếm và danh sách bằng dữ liệu mẫu lớn; bổ sung index thiếu.
- **Hạ tầng** (§7.1 tài liệu công nghệ): server đặt tại Việt Nam, Caddy + HTTPS, tên miền, tường lửa, backup PostgreSQL và SeaweedFS hằng ngày có mã hóa, thử khôi phục, Sentry.
- **Pháp lý và nội dung:** điều khoản sử dụng, chính sách quyền riêng tư (đã qua luật sư), hướng dẫn sử dụng cơ bản hai ngôn ngữ.

**Hoàn thành khi:** không còn lỗi bảo mật mức cao; backup đã thử khôi phục thành công; toàn bộ test E2E xanh trên staging.

### Giai đoạn 9. Thử nghiệm thực tế (pilot)

**Mục tiêu:** kiểm chứng phụ huynh và gia sư có tìm thấy nhau, kết nối và bắt đầu học được hay không.

**Công việc:**

- Ra mắt ở một vài khu vực đã chọn _(D11)_; mời gia sư đăng ký và xác minh trước để có nguồn cung khi phụ huynh vào.
- Đội vận hành (Manager) duyệt hồ sơ đúng hạn 2 ngày làm việc.
- Theo dõi chỉ số pilot (D45) hằng tuần trong 12 tuần; thu phản hồi người dùng.
- Sửa lỗi và cải thiện trải nghiệm theo đợt ngắn.
- Cuối pilot: xem lại quy định tính tiền khi vắng hoặc hủy muộn _(C5)_, thời hạn tự hủy yêu cầu _(C3)_, thời gian duyệt xác minh, và quyết định thứ tự ưu tiên cho bản 2, bản 3.

**Hoàn thành khi:** có báo cáo kết quả pilot so với chỉ số đặt ra và danh sách điều chỉnh đã thống nhất.

---

## 3. Các bản phát hành sau MVP

### Giai đoạn 10. Ứng dụng Mobile (bản 2)

**Mục tiêu:** đưa các thao tác hằng ngày lên điện thoại _(D2)_.

- React Native + Expo + Expo Router + NativeWind; dùng lại `packages/shared` và API đã có.
- Tính năng tập trung: đăng nhập, lịch học, điểm danh (gia sư), xác nhận buổi (phụ huynh), chat, thông báo.
- Thông báo đẩy qua Expo Push; bổ sung lưu device token ở API. Nội dung push không chứa thông tin của trẻ.
- Lưu token bằng `expo-secure-store`; build và phát hành qua EAS. Tên ứng dụng là TPS-Connection _(D1)_; chốt bundle ID theo tên miền trước khi lên store vì đổi sau rất tốn kém.
- Test bằng `jest-expo`; E2E bằng Maestro.

### Giai đoạn 11. Học tập: bài tập, đánh giá, báo cáo tiến độ (bản 3)

Theo _(D10)_, phần này làm ngay sau MVP. Có thể làm song song với giai đoạn 10 nếu đủ người.

- **Bài tập** (§8): gia sư giao cho một hoặc nhiều học sinh, đính kèm tệp, liên kết, hạn nộp. Học sinh nộp bằng văn bản hoặc tệp (mở quyền thao tác cho tài khoản học sinh). Trạng thái chưa nộp / đã nộp / quá hạn / đã chấm / yêu cầu làm lại. Nhắc bài sắp đến hạn.
- **Đánh giá gia sư** (§11) _(C10, D22)_: phụ huynh và học sinh có quan hệ dạy học đã xác nhận từ 1 tháng trở lên; mỗi người đánh giá một gia sư một lần, có thể cập nhật; năm tiêu chí; đánh giá của học sinh dưới 18 tuổi công khai nhưng ẩn danh ("Học sinh lớp 8"); gia sư phản hồi; người dùng báo cáo đánh giá. Bổ sung lọc và sắp xếp theo đánh giá trong tìm kiếm.
- **Báo cáo tiến độ** (§9): số buổi và tỷ lệ tham gia, bài tập hoàn thành, biểu đồ điểm theo thời gian, chủ đề đã học, điểm mạnh và nội dung cần cải thiện, mức hoàn thành mục tiêu. Gia sư gửi báo cáo sau buổi, hằng tuần, hằng tháng hoặc khi kết thúc. Điểm luôn hiển thị kèm nhận xét; không có bảng xếp hạng giữa các trẻ.

### Giai đoạn 12. Mở rộng sau (bản 4 trở đi)

Thứ tự sẽ quyết định dựa trên kết quả pilot. Các hạng mục đã có định hướng:

| Hạng mục                         | Ghi chú                                                                                          |
| -------------------------------- | ------------------------------------------------------------------------------------------------ |
| Lớp nhóm                         | Dữ liệu đã hỗ trợ _(D7)_; cần thêm quy tắc học phí từng em và quyền riêng tư giữa các phụ huynh  |
| Học sinh chat với gia sư         | Dưới 18 tuổi: phụ huynh phải bật và cùng ở trong hội thoại _(C7)_                               |
| Người học trưởng thành tự dùng   | Dữ liệu đã hỗ trợ _(D3)_; kèm quyền tự quản lý khi trẻ đủ 18 tuổi _(C9)_                         |
| Xác thực số điện thoại           | Chọn nhà cung cấp SMS và gắn vào interface gửi OTP                                               |
| Lọc theo bán kính                | PostGIS _(D11)_                                                                                  |
| Thanh toán trực tuyến            | VNPay, MoMo, PayOS; cần rà soát pháp lý về trung gian thanh toán trước                           |
| Mô hình thu phí                  | Phí đăng bài, phí kết nối, gói cho gia sư; trả phí không được làm sai lệch kết quả tìm kiếm mà không công khai |
| Phòng học video, bảng trắng      | LiveKit hoặc Jitsi                                                                               |
| Trợ lý học tập AI                | Gợi ý gia sư, tóm tắt tiến độ; gia sư phải kiểm tra nội dung trước khi gửi                       |
| Lộ trình học cá nhân, kho tài liệu, gamification, báo cáo phân tích nâng cao | Theo §15.2 mô tả nghiệp vụ                                         |

---

## 4. Phụ thuộc và khả năng làm song song

```
G0 ─┬─► G1 ──┬─► G2 ─┬─► G3 ─► G4 ─► G5 ─► G6 ─► G7 ─► G8 ─► G9
    └─► G1b ─┘       │                                    ▲
                     └── danh mục, hồ sơ dùng chung ──────┘
                                              G9 ─► G10 (Mobile)
                                              G9 ─► G11 (Học tập)
```

- G1 và G1b chạy song song; G2 cần cả hai (khung kỹ thuật và giao diện đã duyệt). Các màn hình của giai đoạn sau có thể được thiết kế tiếp trong lúc code giai đoạn trước, miễn là xong trước khi giai đoạn đó bắt đầu.
- G3 (xác minh) phải xong trước G4 vì chỉ gia sư đã xác minh được đăng bài và hiển thị công khai.
- G5 phải xong trước G6 vì lớp học được tạo từ điều kiện hợp tác đã xác nhận.
- G7 phụ thuộc dữ liệu buổi học và xác nhận buổi của G6.
- Khi có hai người trở lên: giao diện của một giai đoạn có thể làm song song với API của giai đoạn sau, miễn là hợp đồng OpenAPI đã chốt. Phần hạ tầng triển khai của G8 có thể bắt đầu từ G5.
- G10 và G11 độc lập với nhau, làm song song được.

---

## 5. Việc của chủ dự án

Các việc bên ngoài, không chặn việc viết code nhưng có hạn chót _(D47)_:

| Việc | Hạn | Ghi chú |
| ---- | --- | ------- |
| Điền thông tin đơn vị vận hành và gửi [câu hỏi pháp lý](00-product/cau_hoi_phap_ly.md) cho luật sư | Trước G8; nên gửi sớm vì luật sư cần thời gian | Kết quả có thể làm thay đổi các mốc 30 ngày (C4), 6 tháng (C2), ngưỡng tuổi tài khoản học sinh (D4) |
| Đăng ký tên miền cho TPS-Connection _(D1)_ | Trước G8 | Cần cho HTTPS và bundle ID của app Mobile |
| Chọn khu vực pilot _(D11, D45)_ | Trước G9 | Nên chọn nơi có sẵn nguồn gia sư hoặc kênh tiếp cận phụ huynh |
| Cung cấp đầu vào cho thiết kế giao diện (G1b) | Khi bắt đầu G1b | Logo, màu, cảm giác thương hiệu, chế độ tối |
| Cho biết quy mô đội ngũ, số giờ mỗi tuần, ngân sách hạ tầng | Khi có thể | Để ước lượng thời gian từng giai đoạn (C13) |

## 6. Việc cần làm tiếp

1. ~~Bắt đầu G1 (nền móng kỹ thuật) và G1b (thiết kế giao diện) song song~~: **xong ngày 2026-11-13**.
2. ~~Chốt giới hạn dung lượng tệp và ngôn ngữ của đường dẫn trang~~: **xong ngày 2026-11-13** (D55, D56).
3. Bắt đầu G2 (tài khoản, phân quyền và hồ sơ).
