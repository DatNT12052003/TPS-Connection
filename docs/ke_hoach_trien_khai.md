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

- Các màn hình web (mục Đầu ra), chia ba đợt:
  - ~~Đợt 1, đăng nhập thật~~: **xong ngày 2026-11-13**. Đăng ký, nhập mã OTP, đăng nhập, quên mật khẩu, đăng xuất; server web đứng giữa trình duyệt và API, chuyển cookie phiên và tự làm mới phiên (`apps/web/README.md`, mục Đăng nhập và phiên). Đã gỡ thanh chọn vai trò tạm thời. Đã chạy thử cả luồng với API, PostgreSQL, Redis, Mailpit thật.
  - ~~Đợt 2, phụ huynh~~: **xong ngày 2026-11-13**. Trang tổng quan phụ huynh (thẻ "Con của tôi") và học sinh (hồ sơ của mình); tạo hồ sơ con `/app/children/new` (kèm đồng ý xử lý dữ liệu của con); xem, sửa, xóa hồ sơ con `/app/children/:id` (dựng theo màn tạo hồ sơ con, vì canvas chưa có); mời con `/app/children/:id/invite` (gửi, gửi lại, hủy lời mời); trang nhận lời mời `/student-invitation`; hồ sơ phụ huynh (tỉnh, xã, địa chỉ) ở `/app/account`. Màn "Email đã được xác thực" của phụ huynh dẫn tới tạo hồ sơ con. Đã chạy thử cả luồng với API, PostgreSQL, Redis, Mailpit thật. Khác canvas, chưa làm:
    - Ô "Môn cần học" và "Mục tiêu học tập" trên canvas ChildProfile: hồ sơ con (`learners`) không có hai trường này; môn và mục tiêu nằm ở bài tìm gia sư và yêu cầu kết nối (`request_posts`, `connection_requests`). Làm ở G4/G5 trong form đăng bài và gửi yêu cầu.
    - Canvas ChildProfile ghi "Năm sinh"; API lưu ngày sinh đầy đủ (`date_of_birth`, dùng để tính dưới 18 tuổi khi ẩn danh đánh giá, D22) nên form dùng ô ngày: gõ `dd/mm/yyyy` hoặc chọn trên lịch (react-day-picker, có ô chọn tháng/năm).
    - Cách "sao chép liên kết mời" để gửi qua Zalo (canvas InviteStudent): API chỉ gửi liên kết qua email, không trả token cho phụ huynh. Muốn có thì cần quyết định trước: API trả liên kết cho phụ huynh (liên kết đó ai cầm cũng tạo được tài khoản).
    - Canvas InviteStudent ghi "Bạn có thể khóa tài khoản này bất cứ lúc nào": chưa có API cho phụ huynh khóa tài khoản học sinh, nên trang không hứa điều đó. Cần quyết định có làm không (và làm ở giai đoạn nào).
    - Xóa hồ sơ con đã có tài khoản học sinh: API chưa cho (409); trang ẩn nút xóa khi đã có tài khoản.
  - ~~Đợt 3, gia sư và cài đặt~~: **xong ngày 2026-11-14**. Tài khoản và cài đặt `/app/account` cho mọi vai trò (thông tin cá nhân, ảnh đại diện tải thẳng lên kho lưu trữ, nơi bạn sống với phụ huynh, giao diện và ngôn ngữ, đổi mật khẩu, thiết bị đang đăng nhập; ô tên trên thanh trên dẫn tới đây); hồ sơ và xác minh của gia sư `/app/profile` (trạng thái, bốn bước, mục còn thiếu, bằng cấp tự khai: thêm, sửa, xóa); sửa hồ sơ `/app/profile/edit` (giới thiệu, môn × khối, hình thức và khu vực, lịch rảnh, học phí tham khảo, đang nhận học sinh); trang tổng quan gia sư (trạng thái hồ sơ, việc còn thiếu, công tắc nhận học sinh); màn "Email đã được xác thực" của gia sư dẫn tới sửa hồ sơ. Đổi ngôn ngữ khi đã đăng nhập lưu cả vào tài khoản (ngôn ngữ email). API thêm `GET /catalog/areas?ids=` (tra tên tỉnh/xã đã lưu). Đã chạy thử cả luồng với API, PostgreSQL, Redis, Mailpit, SeaweedFS thật. Khác canvas, chưa làm:
    - Canvas Settings có "Đã chặn", "Xóa tài khoản", "Thông báo": chưa có API (chặn và báo cáo: G9; xóa tài khoản: G11; thông báo: G8). Trang chưa hiện các mục này.
    - Email chỉ xem, chưa đổi được (cần luồng xác thực email mới; chưa có trong kế hoạch, cần quyết định có làm ở v1 không).
    - Bước 2 "Giấy tờ danh tính" và nút "Nộp để xác minh" của bằng cấp: làm ở G3 (trang hiện ghi chú "đang được hoàn thiện").
    - Thẻ "Phụ huynh sẽ thấy" tóm tắt hồ sơ đã lưu, không cập nhật ngay khi đang gõ; nút "Xem như phụ huynh" chờ trang hồ sơ công khai (G4).
    - Lịch rảnh chọn giờ theo nấc 30 phút cho từng ngày, thay cho lưới Sáng/Chiều/Tối của canvas (API lưu giờ bắt đầu, kết thúc tùy ý).
    - Học phí tham khảo không có "thời lượng buổi" như canvas: API chưa có trường này (D18 chỉ có số tiền và đơn vị giờ/buổi).
    - Trên máy tính, thanh điều hướng của gia sư chưa có mục "Hồ sơ" (canvas TutorHome không có); vào qua trang tổng quan, hoặc mục "Hồ sơ" ở thanh dưới trên điện thoại.
- Người có nhiều vai trò (ví dụ vừa gia sư vừa phụ huynh) hiện vào khu `/app` theo thứ tự gia sư, phụ huynh, học sinh (`appRoleOf` trong `apps/web/app/lib/session.ts`); chưa có chỗ chuyển vai trò. Tự đăng ký chỉ chọn được một vai trò nên chưa gặp; thêm khi có trường hợp thật.
- Trang tổng quan `/app` và `/admin` hiện chỉ là trang giữ chỗ; canvas ParentHome, TutorHome, StudentHome cần dữ liệu của G4 đến G7 (xem "Việc chuyển từ G2" ở các giai đoạn đó). Trong G2 làm bản tối thiểu theo vai trò: phụ huynh thấy danh sách con và nút tạo hồ sơ con (đợt 2, **xong**); gia sư thấy trạng thái hồ sơ và các trường còn thiếu để nộp xác minh, từ `missingForVerification` (đợt 3, **xong**); học sinh thấy hồ sơ của mình (đợt 2, **xong**).
- ~~Thống nhất định dạng lỗi validation trước phần web~~: **xong ngày 2026-11-13**. Mọi lỗi theo từng ô có `details[].code` là khóa `validation.*` trong i18n (mã lạ quy về `invalid`); web hiển thị `t('validation.<code>')`, lỗi đầu tiên của mỗi ô.

**Câu hỏi chờ chủ dự án quyết** (chốt xong thì ghi vào decision log):

- "Tùy chọn riêng tư" (§3.1) gồm những gì? Gợi ý: bật/tắt nhận email giới thiệu (loại đồng ý `marketing_email` đã có trong bảng `user_consents`).
- Có cho phụ huynh xóa hồ sơ con đã có tài khoản học sinh không? Nếu có, tài khoản học sinh xử lý thế nào? API hiện trả 409.
- Độ tuổi tối thiểu của tài khoản học sinh (D4). Lời mời học sinh hiện chưa kiểm tra tuổi. Theo [rà soát pháp lý](00-product/ra_soat_phap_ly.md) câu 13, luật không đặt tuổi tối thiểu nếu có cha mẹ đồng ý; chờ luật sư xác nhận rồi chốt.
- Từ [rà soát pháp lý](00-product/ra_soat_phap_ly.md) (2026-11-15), chờ chủ dự án quyết và luật sư xác nhận:
  - Tách ô đồng ý khi đăng ký thành hai ô riêng (Điều khoản sử dụng; Chính sách quyền riêng tư). Hiện là một ô `acceptTerms` ghi hai bản ghi đồng ý (câu 7).
  - Học sinh từ đủ 7 tuổi tự bấm đồng ý khi kích hoạt tài khoản (loại đồng ý mới), và khi gửi đánh giá công khai (câu 12, 15).

### Giai đoạn 3. Xác minh gia sư và trang quản trị cơ bản

**Mục tiêu:** gia sư được xác minh để có thể xuất hiện công khai; Manager và Admin có công cụ làm việc tối thiểu.

**Công việc:**

- **Nộp hồ sơ xác minh** _(C4)_: mọi gia sư nộp CCCD; sinh viên nộp thêm thẻ sinh viên; bằng cấp, chứng chỉ nộp tùy chọn để lấy huy hiệu. Tệp lưu ở bucket private, xem bằng presigned URL ngắn hạn.
- **Duyệt:** Manager xem hàng chờ, duyệt hoặc từ chối kèm lý do; gia sư được nộp lại. Mục tiêu xử lý trong 2 ngày làm việc. Mỗi trường trong hồ sơ được đánh dấu tự khai hoặc đã xác minh.
- **Sau khi duyệt:** giữ kết quả xác minh, job tự xóa ảnh giấy tờ sau 30 ngày (mốc chờ luật sư xác nhận; [rà soát pháp lý](00-product/ra_soat_phap_ly.md) câu 9 đánh giá là phù hợp).
- **Từ rà soát pháp lý (2026-11-15), chờ chủ dự án quyết và luật sư xác nhận:**
  - Luật Thương mại điện tử 2025 yêu cầu xác thực điện tử danh tính người bán (ở đây là gia sư) trước khi cho cung ứng dịch vụ, có thể phải liên kết tài khoản định danh điện tử. Nếu ảnh CCCD + Manager duyệt không đạt yêu cầu, luồng xác minh của G3 phải đổi (câu 20). Ưu tiên hỏi luật sư điểm này.
  - Câu chữ đồng ý khi nộp giấy tờ (`verification_document_processing`) ghi rõ ảnh CCCD là "dữ liệu cá nhân nhạy cảm" (câu 6, 7).
  - Cam kết điện tử của gia sư khi nộp xác minh (không có tiền án liên quan đến trẻ em; tuân thủ quy định dạy thêm; giáo viên không dạy học sinh của mình), lưu như một loại đồng ý mới trong `user_consents` (câu 20, 23).
  - Lớp 1–5 hiện chọn được mọi môn. Nếu quy định không dạy thêm có thu tiền cho học sinh tiểu học áp dụng cho gia sư 1-1, giới hạn môn của cấp tiểu học hoặc cảnh báo gia sư (câu 23).
  - Thời hạn lưu `audit_logs` (đề xuất tối thiểu 24 tháng) và ghi lý do xem vào `metadata` (câu 22).
- **Quản trị (Admin):** danh sách và tìm kiếm tài khoản, khóa/mở khóa, gán vai trò Manager, quản lý danh mục môn, khối lớp, khu vực.
- **Nhật ký kiểm toán (audit log):** ghi mọi thao tác của Manager và Admin, nhất là mỗi lần xem giấy tờ tùy thân.
- **Việc chuyển từ G2:**
  - ~~Nộp xác minh chuyển hồ sơ `incomplete` → `pending_verification` (B.4.1), chỉ khi `missingForVerification` rỗng (D34)~~: **xong ở đợt 1**.
  - ~~Mở endpoint tải tệp `POST /files/uploads` cho `verification_document` và `credential`~~: **xong ở đợt 1** (chỉ gia sư).
  - Duyệt bằng cấp thì cập nhật `tutor_credentials.verification_status` và `tutor_profiles.has_verified_degree` (D20). API đã khóa sửa, xóa bằng cấp đang chờ duyệt hoặc đã xác minh.
  - Job dọn bản ghi `files` còn `pending_upload` quá 24 giờ và xóa tệp tương ứng trên kho (thiết kế CSDL mục 13). Ảnh đại diện đã tạo được bản ghi loại này từ G2.
- Thông báo khi hồ sơ được duyệt hoặc bị từ chối: email **xong ở đợt 2**; thông báo trong app làm ở G5 cùng bảng thông báo (G5 đã có loại "kết quả xác minh"), không làm bảng tạm ở G3.

**Đầu ra:** luồng xác minh đầy đủ trên web; trang `/admin` cho Manager và Admin.

**Tiến độ:** làm theo ba đợt.

- ~~Đợt 1, gia sư nộp xác minh~~: **xong ngày 2026-11-14**. Bảng `verification_requests`, `verification_documents`; gia sư tải ảnh CCCD hai mặt (thêm thẻ sinh viên nếu là sinh viên) lên kho riêng tư, đồng ý dùng giấy tờ, nộp; hồ sơ chuyển "chờ xác minh", hạn duyệt 2 ngày làm việc (D26); hủy yêu cầu đang chờ (ảnh xóa ngay); nộp 1–3 tệp để xác minh từng bằng cấp, hủy; hiện lý do từ chối. Web: bước 2 ở `/app/profile` theo canvas Verification. Trong lúc chờ duyệt, họ tên thật và nghề nghiệp bị khóa (người duyệt đối chiếu với giấy tờ; muốn sửa thì hủy yêu cầu). Lý do từ chối là danh sách có sẵn (canvas ManagerQueue) cộng ghi chú.
- ~~Đợt 2, Manager duyệt~~: **xong ngày 2026-11-14**. Hàng chờ `/admin/verifications` và màn duyệt (canvas ManagerQueue): lọc theo loại, hạn xử lý (quá hạn, còn dưới 24 giờ), lần nộp thứ mấy, lần nộp trước; xem ảnh qua URL ký sẵn sống 2 phút, chỉ khi yêu cầu đang chờ, mỗi lần xem ghi `audit_logs` (chỉ ghi thêm, trigger chặn sửa xóa); duyệt / từ chối kèm lý do (hồ sơ công khai ngay khi duyệt danh tính; duyệt bằng loại "Bằng cấp" bật huy hiệu); email kết quả theo ngôn ngữ của gia sư; job hằng ngày xóa ảnh 30 ngày sau quyết định và dọn tệp tải dở quá 24 giờ. Manager kiêm gia sư không duyệt hồ sơ của chính mình. Chỉ vai trò Manager vào được (Admin không duyệt, C1). Đã chạy thử với API, PostgreSQL, Redis, SeaweedFS, Mailpit thật. Khác canvas, chưa làm:
  - Số yêu cầu đang chờ cạnh mục "Duyệt xác minh" trên thanh điều hướng (canvas ghi "Duyệt xác minh · 6"): trang hàng chờ có số theo loại; số trên thanh điều hướng cần gọi API ở mọi trang quản trị, làm khi có thêm hàng chờ báo cáo, tranh chấp (G8).
  - Thông báo trong app khi có kết quả: chưa có bảng thông báo (G5); hiện có email và kết quả hiện ở trang hồ sơ.
  - Thu hồi xác minh (B.4.1 `verified` → `incomplete`) là kết quả của vụ việc kiểm duyệt: làm ở G8.
- ~~Đợt 3, Admin~~: **xong ngày 2026-11-14**. Tài khoản `/admin/accounts` (canvas AdminAccounts): tìm theo tên không dấu hoặc email, lọc vai trò, trạng thái (kể cả đã xóa); khóa kèm lý do (đăng xuất khỏi mọi thiết bị ngay), mở khóa; thêm Manager theo email (email mới thì tạo tài khoản không mật khẩu, người đó đặt mật khẩu bằng "Quên mật khẩu"), gỡ Manager. Danh mục `/admin/catalog` (canvas AdminCatalog): môn học và khối lớp, thêm, sửa tên hai ngôn ngữ, thứ tự, bật/tắt, số gia sư dạy. `/admin` chuyển tới màn chính theo vai trò. Mọi thay đổi ghi nhật ký kiểm toán. Test điều kiện hoàn thành ở `describe('G3 completion')` (`apps/api/test/integration/tutors.int.test.ts`). Đã chạy thử với API, PostgreSQL, Redis, Mailpit thật. Khác canvas, chưa làm:
  - Vai trò Admin không cấp, gỡ qua giao diện (chỉ bằng `npm run users:staff`), và Admin không khóa được Admin khác: tránh một Admin tự ý tước quyền Admin khác. Cần quyết định nếu muốn khác.
  - Không xóa mục danh mục (chỉ tắt): mục đã có dữ liệu không xóa được, mục chưa dùng tắt là đủ.
  - Tỉnh và xã/phường: nạp từ bộ dữ liệu hành chính chính thức (`db:seed:areas`), không sửa tay trên giao diện.
  - "Lý do báo cáo" và "Cấu hình hệ thống" (hạn xác nhận buổi, hạn tự hủy yêu cầu…): làm ở G8 cùng báo cáo vi phạm; các mốc hiện là hằng số trong code theo decision log. Mục "Khiếu nại quyết định" và "Nhật ký kiểm toán" (xem nhật ký trên giao diện) cũng ở G8.
  - Điều kiện "gia sư chưa được duyệt không đăng được bài, không hiện trong tìm kiếm": phần hồ sơ công khai đã có test; bài đăng và tìm kiếm có ở G4 và phải giữ đúng điều kiện này (test ở G4).

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

- **Việc chuyển từ G3:** test điều kiện hoàn thành của G3 cho phần mới: gia sư chưa được duyệt danh tính không đăng được bài tuyển học sinh (403) và không hiện trong kết quả tìm kiếm; tài khoản bị khóa hoặc hạn chế không hiện công khai. Bộ lọc tìm kiếm chỉ dùng môn, khối đang bật (Admin tắt được ở `/admin/catalog`).
- **Việc chuyển từ G2 (trang chủ công khai):** trang `/` hiện là khung đơn giản từ G1 (khối giới thiệu, ba thẻ tin cậy). Làm đúng canvas Main / MainMobile khi có tìm kiếm: ô tìm gia sư theo môn, lớp, khu vực; gia sư nổi bật; bài tuyển học sinh mới.

**Đầu ra:** trang tìm gia sư, chi tiết gia sư, chi tiết bài đăng, quản lý bài đăng của gia sư và phụ huynh.

**Hoàn thành khi:** khách chưa đăng nhập tìm được gia sư đã xác minh; trang công khai render phía server; không có dữ liệu nhận dạng của trẻ trong bất kỳ response công khai nào.

**Tiến độ:** làm theo ba đợt.

- **Đợt 1, bài đăng (database và API):** **xong ngày 2026-11-15**. Bảng `tutor_posts` (môn × khối, khu vực, lịch) và `request_posts` (lịch mong muốn). Gia sư: `/api/v1/me/tutor-posts` (tạo nháp kể cả khi chưa xác minh, sửa, đổi trạng thái theo B.2, nhân bản D33, xóa mềm), bài công khai `GET /api/v1/tutor-posts/:id` (tăng lượt xem). Phụ huynh: `/api/v1/me/request-posts` (cho hồ sơ con mình quản lý, đổi trạng thái theo B.3, đóng phải có lý do), gia sư đã xác minh xem `GET /api/v1/request-posts/:id` (không có hồ sơ con, người đăng hay danh tính của trẻ). Mở bài cần gia sư đã duyệt danh tính (403 `tutor_not_verified`, mã lỗi mới) và tài khoản đang hoạt động. Bài đã đăng phải có ít nhất một môn, hình thức dạy, và khu vực nếu dạy trực tiếp. Mỗi hồ sơ con chỉ một bài chưa đóng cho mỗi môn (unique một phần, lỗi `request_post_exists`). Xóa hồ sơ con thì xóa mềm bài của con. Giới hạn: 20 bài chưa đóng mỗi gia sư, 30 mỗi phụ huynh. Test: `apps/api/test/integration/posts.int.test.ts`, gồm phần "Việc chuyển từ G3" về đăng bài và hiển thị công khai.
- **Đợt 2, tìm kiếm (API):** **xong ngày 2026-11-15**. Tìm gia sư `GET /api/v1/tutors` (khách xem được): lọc theo môn, khối, hình thức (kết hợp khớp cả hai), tỉnh hoặc xã (xã khớp cả gia sư dạy toàn tỉnh), học phí cùng đơn vị, kinh nghiệm, lịch rảnh (khung rảnh phủ trọn khoảng giờ), có bằng cấp đã xác minh (D20), đang nhận học sinh; từ khóa có dấu hoặc không dấu trên giới thiệu, nơi học, chuyên ngành và tên hiển thị (không bao giờ trên họ tên thật hay email); sắp xếp theo mức phù hợp (đang nhận học sinh, độ khớp từ khóa, bằng cấp, đánh giá, kinh nghiệm, mới cập nhật), kinh nghiệm, học phí, ngày cập nhật. Tìm bài tuyển `GET /api/v1/tutor-posts` (khách) và nhu cầu `GET /api/v1/request-posts` (chỉ gia sư đã xác minh; lọc thêm ngân sách, mục tiêu, "khớp hồ sơ của tôi"). Chỉ môn, khối đang bật. Slug công khai (D56) `/tutors/<tên-không-dấu>-<mã>` và bài tuyển `<tiêu-đề>-<mã>`: mã 10 ký tự ngẫu nhiên trong database, đổi tên không làm hỏng đường dẫn; API nhận cả slug lẫn id. Kiểm bằng `EXPLAIN ANALYZE` với 30 000 gia sư, 60 000 bài tuyển, 60 000 nhu cầu: mọi truy vấn trang đầu dưới 4 ms sau khi thêm hai index cho thứ tự mặc định; đếm tổng khi không lọc khoảng 15 ms. Test: `apps/api/test/integration/search.int.test.ts`. "Gợi ý gia sư" cho một nhu cầu làm ở web bằng cách mở tìm kiếm với bộ lọc lấy từ nhu cầu (sắp xếp theo mức phù hợp), không cần endpoint riêng.
- **Đợt 3, web:** **xong ngày 2026-11-15**, chưa chạy thử với API thật (đã kiểm bằng test loader/action với API giả, test giao diện và bản build SSR). Trang công khai SSR (khách xem được): tìm gia sư `/tutors` (canvas Main: bộ lọc là form GET, mọi bộ lọc nằm trong đường dẫn), hồ sơ gia sư `/tutors/<slug>` (TutorDetail), bài tuyển `/tutor-posts` và `/tutor-posts/<slug>` (PostList, PostDetail); slug cũ hoặc id chuyển hướng 301 về slug đúng; bộ lọc sai trong đường dẫn hiện kết quả rỗng kèm thông báo. Trang chủ: ô tìm nhanh (môn, khối, tỉnh), gia sư phù hợp, bài tuyển mới. Gia sư: `/app/posts` (MyPosts: lọc trạng thái, các nút theo B.2, nhân bản, xóa), `/app/posts/new` và `/app/posts/:id/edit` (PostEditor: Đăng bài = lưu rồi đăng; lưu được mà đăng không được thì quay về trang sửa kèm lý do), `/app/find-students` (FindStudents; gia sư chưa xác minh thấy lời nhắc, không gọi API). Phụ huynh: `/app/requests` (đăng, ẩn, hiện lại, đóng kèm lý do, xóa), `/app/requests/new` (`?learnerId=` điền sẵn khối và khu vực của con) và `/app/requests/:id/edit` (NeedPost); khối "Tìm gia sư cho con" trên trang tổng quan của phụ huynh (thanh điều hướng phụ huynh đã đủ 5 mục). Test: `app/routes/marketplace-routes.test.ts`, `app/routes/app/posts/post-editor.test.tsx`, `app/lib/marketplace.test.ts`. Khác canvas, chưa làm:
  - Trang hồ sơ gia sư và bài tuyển dùng bố cục công khai cả khi đã đăng nhập (canvas TutorDetail, PostDetail vẽ thanh điều hướng của phụ huynh); người đã đăng nhập có nút "Vào trang của tôi".
  - Gửi yêu cầu kết nối (TutorDetail, PostDetail) và ứng tuyển (FindStudents): G5. Hiện có khối giải thích và nút đăng nhập cho khách; số yêu cầu, số gia sư ứng tuyển, nhãn "Đã ứng tuyển": G5.
  - Lưu yêu thích (D10, làm nếu kịp): chưa làm, cùng bảng `favorite_tutors`.
  - MyPosts là danh sách thẻ (không phải bảng), tab không kèm số lượng (API chưa có đếm theo trạng thái).
  - PostEditor và NeedPost: lịch dùng bộ chọn khung giờ theo ngày như hồ sơ gia sư (canvas: chọn ngày + một giờ bắt đầu); không có "thời lượng buổi" (API chưa có trường này, như D18 ở hồ sơ); không có ô xem trước bài. NeedPost: yêu cầu với gia sư là một ô chữ (canvas có ô đánh dấu "có bằng cấp đã xác minh", "kinh nghiệm"); danh sách "Bài đang mở của bạn" nằm ở trang `/app/requests` riêng.
  - FindStudents không hiện tên phụ huynh (canvas "Phụ huynh Mai"): API không trả người đăng (§16.7).
  - Trang chủ chỉ có ô tìm nhanh; bộ lọc đầy đủ ở `/tutors`.
- **Chuyển sang giai đoạn sau:**
  - G5: ẩn hoặc đóng bài tìm gia sư thì hủy các ứng tuyển còn `pending` (D31); xác nhận hợp tác từ bài thì hệ thống đóng bài với lý do `found_tutor`; đếm số yêu cầu phát sinh từ bài tuyển; form gửi yêu cầu kết nối trên trang hồ sơ gia sư và bài tuyển, form ứng tuyển ở `/app/find-students`.
  - G8: Manager ẩn, bỏ ẩn bài vi phạm (`moderation_hidden_at`, cột đã có); thu hồi xác minh thì các bài đang mở, đủ học sinh chuyển `paused` (B.2); xóa tài khoản thì xóa mềm bài đăng.

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

- **Trang tổng quan (từ G2):** thêm khối yêu cầu kết nối cần xử lý và tin nhắn mới vào trang tổng quan của phụ huynh và gia sư (canvas ParentHome, TutorHome).

**Đầu ra:** hộp yêu cầu kết nối của gia sư và phụ huynh, màn hình chat, trung tâm thông báo.

**Hoàn thành khi:** chạy trọn hai luồng §14.1 và §14.2 đến bước "xác nhận hợp tác" trên môi trường staging; test chứng minh chat không mở trước khi được chấp nhận và liên hệ không lộ trước khi xác nhận hợp tác.

**Tiến độ:** làm theo ba đợt.

- **Đợt 1, yêu cầu kết nối (database và API):** **xong ngày 2026-11-16**. Bảng `connection_requests`, `connection_terms`, `connection_events` (migration `CreateConnections`). API `/api/v1/connection-requests`: phụ huynh gửi gia sư cho hồ sơ con mình quản lý, có thể từ một bài tuyển (gia sư phải đang hiển thị công khai, đang nhận học sinh, dạy môn đó); gia sư đã xác minh ứng tuyển vào bài tìm gia sư đang mở; danh sách theo vai trò, đã nhận/đã gửi, đang mở/đã kết thúc, theo bài; chấp nhận, từ chối kèm lời nhắn, rút, hủy khi đang trao đổi; đề xuất điều kiện hợp tác theo phiên bản (học phí theo buổi, thời lượng, số buổi mỗi tuần, lịch dự kiến, ngày bắt đầu) và xác nhận phiên bản mới nhất (409 `terms_outdated` nếu đã có bản mới hơn). Cả hai xác nhận thì yêu cầu sang `confirmed`; lúc đó mới trả liên hệ của bên kia và danh tính của trẻ cho gia sư (D16). Yêu cầu lưu ảnh chụp nhu cầu (môn, khối, mục tiêu, hình thức, tỉnh/xã) nên gia sư không bao giờ đọc hồ sơ con khi chưa xác nhận; tên phụ huynh chỉ hiện với gia sư sau khi yêu cầu được chấp nhận. Một yêu cầu đang mở cho mỗi gia sư × con × môn (unique một phần, 409 `connection_exists`). Giới hạn: 30 yêu cầu đang chờ mỗi người gửi, 20 lần gửi mỗi giờ. Nội dung một phiên bản điều khoản không sửa, không xóa được (trigger). D31: ẩn, đóng hoặc xóa bài tìm gia sư thì ứng tuyển còn chờ tự hủy (`source_closed`); xác nhận hợp tác từ một ứng tuyển thì đóng bài với lý do `found_tutor` và hủy các ứng tuyển còn chờ khác. Xóa hồ sơ con và Admin khóa tài khoản thì hủy các yêu cầu đang mở liên quan. Job `expire-connection-requests` 15 phút một lần: ghi nhắc 24 giờ trước hạn chờ, 3 ngày trước hạn trao đổi (D30), rồi tự hủy yêu cầu quá hạn (C3); thao tác của người dùng trên yêu cầu đã quá hạn bị từ chối ngay cả khi job chưa chạy. Mã lỗi mới: `connection_exists`, `tutor_not_accepting`, `terms_outdated`, `limit_reached`. Test: `apps/api/test/integration/connections.int.test.ts`; thử tay: `apps/api/http/connections.http`.
- **Đợt 2, nhắn tin (database, API, realtime):** **xong ngày 2026-11-16**. Bảng `conversations`, `conversation_participants`, `messages`, `message_attachments` (migration `CreateMessaging`, tạo luôn hội thoại cho các yêu cầu đã chấp nhận ở đợt 1). Bên nhận chấp nhận thì mở hội thoại giữa gia sư và phụ huynh trong cùng transaction (D14, C7); chi tiết yêu cầu có `conversationId`. API `/api/v1/conversations`: danh sách (tin cuối, số tin chưa đọc tối đa 99, bên kia đã đọc đến đâu, `canSend`), số hội thoại chưa đọc, tin nhắn theo khóa (`before`/`after`, id UUIDv7), gửi chữ và/hoặc tối đa 5 tệp (`purpose: message_attachment`, gia sư và phụ huynh tải được), đánh dấu đã đọc (chỉ tiến), xóa mềm tin của mình, URL xem tệp 5 phút. Gửi được khi yêu cầu `negotiating` hoặc `confirmed`; đã hủy thì chỉ còn xem (D32, 409 `conversation_closed`, mã lỗi mới); chặn nhau cũng 409 `conversation_closed`; tài khoản bị hạn chế 403 `account_restricted`; 30 tin mỗi phút mỗi tài khoản. Người ngoài hội thoại: 404. Gia sư không thấy liên hệ hay danh tính trẻ trong hội thoại (D16). Realtime: Socket.IO + Redis adapter (`src/realtime/realtime.ts`), chỉ đẩy sự kiện tới phòng của từng người (`message:new`, `message:deleted`, `conversation:read`, `conversation:opened`); gửi tin qua REST. Bắt tay bằng cookie `tps_at` hoặc `auth.token`, kiểm Origin, ngắt khi access token hết hạn. Test: `apps/api/test/integration/messaging.int.test.ts`; thử tay: `apps/api/http/messaging.http`. Chưa làm ở đợt này:
  - Màn hình chat trên web: làm ở đợt 3.
  - Chống gửi trùng khi mạng chập chờn (khóa idempotency do client sinh): chưa có, client tránh bấm gửi lại khi đang chờ.
  - Tệp của tin đã xóa vẫn nằm trong kho (giữ cho xử lý báo cáo G8); chính sách dọn tệp tin nhắn làm cùng G8 và xóa tài khoản.
  - OpenAPI chưa có endpoint G5 (cả yêu cầu kết nối lẫn hội thoại).
- **Đợt 3, thông báo, chặn và báo cáo, trang web:** **xong ngày 2026-11-16** (API và web: type-check, lint, test, build đều qua; đã thử tay luồng xác minh gia sư bằng tài khoản manager).
  - API (migration `CreateNotificationsAndReports`): bảng `notifications`, `notification_preferences`, `violation_reports`. Thông báo ghi trong cùng transaction với sự kiện, sau commit đẩy `notification:new` qua Socket.IO và xếp email (`src/modules/notifications`): yêu cầu mới (bên nhận), được chấp nhận / bị từ chối (bên gửi), xác nhận hợp tác (bên còn lại), sắp hết hạn (job: đang chờ báo bên nhận, đang trao đổi báo cả hai), tin nhắn mới (mỗi hội thoại một thông báo chưa đọc, gộp số tin; đọc hội thoại thì thông báo thành đã đọc), kết quả xác minh (chỉ trong app; email đã có từ G3). Dữ liệu thông báo và email chỉ có id, môn, tên hiển thị; không có thông tin của trẻ, không có nội dung tin nhắn. Tùy chọn theo loại, trong app và email (`NOTIFICATION_DEFAULTS`: email tin nhắn mặc định tắt và chỉ gửi khi tạo thông báo chưa đọc mới). `/api/v1/notifications` (danh sách, chưa đọc, đọc một, đọc hết), `/api/v1/me/notification-preferences`. Chặn `/api/v1/me/blocks` (theo gia sư hoặc theo hội thoại; hủy các yêu cầu đang mở giữa hai người). Báo cáo `/api/v1/reports` (gia sư, bên kia của hội thoại, bài tuyển, bài tìm gia sư, tin nhắn; người báo cáo phải thấy được đối tượng; một báo cáo đang mở mỗi đối tượng). Test: `apps/api/test/integration/notifications.int.test.ts`, thông báo kết quả xác minh trong `tutors.int.test.ts`.
  - Web: hộp yêu cầu `/app/connections` (đang mở / đã kết thúc, đã nhận / đã gửi, "Chờ bạn"), chi tiết `/app/connections/:id` (chấp nhận, từ chối kèm lời nhắn, rút, kết thúc; đề xuất điều kiện hợp tác với lịch dự kiến, xác nhận phiên bản mới nhất; liên hệ và thông tin học sinh khi đã xác nhận; lịch sử; chặn, báo cáo), gửi yêu cầu `/app/connections/new?tutor=&post=` (nút trên hồ sơ gia sư và bài tuyển, chỉ phụ huynh), ứng tuyển và nhãn "Đã ứng tuyển" ở `/app/find-students`, tin nhắn `/app/messages` và `/app/messages/:id` (gửi chữ, ảnh, PDF; xóa tin của mình; báo cáo tin; "Đã xem"; tự đánh dấu đã đọc), trung tâm thông báo `/app/notifications`, cài đặt thông báo và danh sách đã chặn ở `/app/account`, khối "Yêu cầu kết nối" và "Tin nhắn mới" trên `/app`, số chưa đọc trên chuông và mục Kết nối. Realtime trong trình duyệt (`lib/realtime.ts`): một kết nối Socket.IO cùng origin với web (`/socket.io`; dev server Vite chuyển tiếp tới API để trình duyệt gửi kèm cookie phiên), có sự kiện thì tải lại loader; token hết hạn thì gọi `/app/realtime/session` (BFF làm mới phiên) rồi kết nối lại.
  - Chưa làm, chuyển sau:
    - G8 (triển khai): reverse proxy chuyển `/socket.io` (WebSocket) của domain web tới API, giữ header Origin; không có thì realtime trên môi trường thật không chạy (trang vẫn dùng được, chỉ không tự cập nhật).
    - G8 (kiểm duyệt): hàng chờ báo cáo cho Manager; `violation_reports.case_id` chưa có khóa ngoại.
    - Chặn người dùng chưa ẩn gia sư bị chặn khỏi kết quả tìm kiếm của người chặn.
    - Không thông báo khi yêu cầu bị hủy (rút, kết thúc, hết hạn, bài nguồn đóng); bảng `notification_deliveries` (theo dõi gửi từng email) và `device_tokens` làm khi có push ở bản mobile; cột `muted` của người tham gia hội thoại chưa dùng.
    - Số yêu cầu phát sinh từ mỗi bài tuyển và số ứng tuyển trên mỗi bài tìm gia sư (MyPosts, `/app/requests`): API chưa có đếm theo bài; nhãn "Đã ứng tuyển" mới có ở bài đang chọn, chưa có trên từng dòng của danh sách.
    - Trang chi tiết yêu cầu không tự hiện tên môn/khối đã tắt trong danh mục (hiện trống).
- **Chuyển sang giai đoạn sau:**
  - ~~G6: xác nhận hợp tác tạo lớp, ghi danh và mức học phí đầu tiên trong cùng transaction (D9). Yêu cầu đã `confirmed` trước khi có bảng lớp cần được tạo lớp bằng migration dữ liệu. Hàm `teachesStudent` dùng lớp~~: xong ở G6 đợt 1. "Gia sư được xem danh tính trẻ" trong yêu cầu kết nối vẫn dựa vào `connection_requests.status = 'confirmed'`.
  - G8: thu hồi xác minh gia sư thì hủy các yêu cầu đang mở của gia sư (B.1); hiện gia sư bị thu hồi chỉ bị chặn chấp nhận và xác nhận.

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

- **Trang tổng quan (từ G2):** thêm buổi học sắp tới, buổi cần xác nhận, lớp đang học vào trang tổng quan của phụ huynh, gia sư, học sinh (canvas ParentHome, TutorHome, StudentHome).

**Đầu ra:** trang lớp học, lịch, điểm danh, xác nhận buổi, khiếu nại buổi, xem kết quả của con.

**Hoàn thành khi:** chạy trọn luồng §14.3 từ bước 1 đến 5 và bước 8–9 (phần điểm, nhận xét); kết thúc lớp không làm mất dữ liệu; test quyền cho gia sư, phụ huynh và học sinh trên dữ liệu lớp.

**Tiến độ:** làm theo ba đợt.

- **Đợt 1, lớp học, ghi danh, học phí, mục tiêu (database và API):** **xong ngày 2026-11-16**. Bảng `tutoring_classes`, `class_enrollments`, `enrollment_fee_rates`, `learning_goals` (migration `CreateTeachingClasses`, tạo luôn lớp cho các yêu cầu đã `confirmed` ở G5; khóa ngoại `conversations.class_id`). Xác nhận hợp tác tạo lớp 1 kèm 1, ghi danh `active` và mức học phí `active` từ phiên bản điều khoản đã chốt trong cùng transaction (D9); ngày bắt đầu theo điều khoản, không có thì hôm nay (giờ Việt Nam); chi tiết yêu cầu kết nối có `classId`. API `/api/v1/classes`: danh sách theo vai trò (gia sư, phụ huynh đang quản lý học sinh, chính học sinh; đang học / đã kết thúc; theo con), chi tiết (gia sư thấy liên hệ phụ huynh và danh tính học sinh, phụ huynh thấy liên hệ gia sư, D16), đặt tên lớp, tạm nghỉ, cho học lại, kết thúc kèm lý do (chỉ gia sư, D35; kết thúc thì ghi danh rời lớp, đề xuất học phí còn chờ tự rút, lớp chỉ còn xem), năng lực ban đầu và lưu ý giảng dạy, đổi học phí (gia sư đề xuất kèm lời nhắn, phụ huynh đồng ý hoặc từ chối, gia sư rút; đồng ý thì mức cũ `superseded`, mức mới áp dụng từ lúc đó, D17; một đề xuất chờ mỗi ghi danh, 409 `fee_change_pending`), mục tiêu theo tháng / học kỳ / khoảng tự chọn kèm kết quả và ghi chú tiến độ. Người ngoài lớp: 404; thao tác không dành cho vai trò của mình: 403. Học sinh chỉ xem: không thấy học phí, năng lực ban đầu, liên hệ, hội thoại. Lưu ý giảng dạy chỉ gia sư thấy. `teachesStudent` trong `learner-access.ts` (gia sư dạy hoặc đã dạy học sinh qua lớp của chính mình, D28). Xóa hồ sơ con còn lớp đang học hoặc tạm nghỉ: 409 `learner_in_class` (C2); lớp đã kết thúc thì xóa được, gia sư vẫn tra cứu lịch sử. Mã lỗi mới: `learner_in_class`, `fee_change_pending`. Test: `apps/api/test/integration/classes.int.test.ts`; thử tay: `apps/api/http/classes.http`. Giả định đã chọn (owner xem lại nếu cần):
  - Tên lớp để trống được: giao diện ghép từ môn và tên học sinh theo ngôn ngữ người xem; gia sư đặt tên riêng nếu muốn.
  - Phụ huynh thấy năng lực ban đầu do gia sư ghi; học sinh thấy mục tiêu học tập nhưng không thấy học phí.
  - Tài khoản bị hạn chế (B.9.3) vẫn quản lý được lớp đang có.
  - Mục tiêu học tập không xóa được (giữ lịch sử học tập), chỉ sửa và đổi kết quả.
- **Đợt 2, lịch, buổi học, điểm danh, xác nhận, khiếu nại, điểm (database, API, job):** **xong ngày 2026-11-16**. Bảng `class_schedules`, `lessons`, `lesson_attendances`, `attendance_disputes`, `assessments` (migration `CreateLessons`, thêm 8 loại thông báo vào CHECK).
  - Lịch lặp hằng tuần (các thứ, giờ bắt đầu, thời lượng, hình thức, địa điểm / đường dẫn học trực tuyến, từ ngày, đến ngày): `/api/v1/classes/:classId/schedules` (thêm, sửa, dừng; tối đa 7 lịch đang áp dụng mỗi lớp). Thêm lịch thì sinh ngay buổi trong 8 tuần tới (D27); job `generate-lessons` hằng ngày 01:15 sinh tiếp; không sinh trùng (`lessons_occurrence_uq`). Sửa lịch xóa các buổi tương lai còn `scheduled` của lịch rồi sinh lại; buổi đã qua, đã dời, đã hủy, đã điểm danh giữ nguyên (§7). Giờ địa phương Việt Nam, lưu UTC.
  - Buổi lẻ và buổi bù (`POST /classes/:classId/lessons`, buổi bù trỏ tới buổi đã hủy / gia sư vắng; không trước ngày bắt đầu lớp, không lùi quá 30 ngày, không xa quá một năm), dời giờ (gia sư, trước giờ học, báo phụ huynh và học sinh), hủy (gia sư hoặc phụ huynh, kèm lý do; báo dưới 2 giờ là hủy muộn, C5; báo bên kia). Lịch `GET /api/v1/lessons?from&to` (tối đa 62 ngày, theo lớp hoặc theo con) và việc cần làm `GET /lessons/todo` (gia sư: buổi chưa điểm danh; phụ huynh: buổi chờ xác nhận).
  - Lớp tạm nghỉ thì các buổi tương lai thành `cancelled` (`cancel_kind = class_paused`, không tính hủy muộn); học lại khôi phục các buổi đó và sinh tiếp; kết thúc lớp hủy buổi tương lai (`class_ended`) và dừng lịch (B.5.1). Phụ huynh và học sinh nhận thông báo đổi trạng thái lớp.
  - Điểm danh `PUT /lessons/:id/attendance` (gia sư, sau giờ bắt đầu): `held` (từng học sinh có mặt / vắng có báo / vắng không báo, kèm nhận xét) hoặc `tutor_absent`; nội dung đã dạy, ghi chú, thời lượng thực tế. Chụp giá học phí đang áp dụng (D17); chỉ buổi `held` và học sinh có mặt mới tính tiền (C5). Hạn xác nhận 48 giờ, báo phụ huynh. Gửi lại khi phụ huynh chưa xác nhận là sửa điểm danh: hạn tính lại, báo lại (D37). Đã xác nhận thì khóa.
  - Phụ huynh xác nhận hoặc khiếu nại trước hạn (C5). Khiếu nại: 3 ngày tự thống nhất (gia sư sửa điểm danh, phụ huynh đồng ý; hoặc phụ huynh rút), một bên chuyển Manager sớm (D38), hết hạn thì job chuyển. Manager: `/api/v1/admin/attendance-disputes` (hàng chờ, chi tiết không có danh tính trẻ, quyết định trạng thái buổi và điểm danh kèm ghi chú; chỉ sửa bản ghi, tính lại tiền, ghi audit log `attendance_dispute.resolved`).
  - Điểm và nhận xét (`/classes/:classId/enrollments/:enrollmentId/assessments`): theo buổi, kiểm tra ngắn, bài kiểm tra; điểm để trống được nhưng nhận xét bắt buộc (§9); gắn với một buổi đã dạy nếu có. Phụ huynh và học sinh xem trong chi tiết lớp và chi tiết buổi. Chi tiết lớp có thêm `schedules` và `assessments`.
  - Job `lessons-maintenance` 15 phút một lần: nhắc buổi sắp diễn ra (24 giờ trước; gia sư, phụ huynh, học sinh), nhắc gia sư điểm danh (24 giờ sau khi kết thúc, D36), nhắc phụ huynh xác nhận (một lần, 24 giờ trước hạn), tự chốt khi hết 48 giờ, chuyển Manager khiếu nại quá 3 ngày.
  - Thông báo mới (`class_status`, `fee_change`, `lesson_upcoming`, `lesson_changed`, `attendance_reminder`, `lesson_to_confirm`, `lesson_dispute`, `assessment_new`): chỉ id, môn, thời điểm và tên hiển thị; không tên học sinh, nội dung buổi, điểm hay nhận xét. Email mặc định tắt với buổi sắp diễn ra và điểm mới. Web đã hiển thị được nội dung các loại này ở trung tâm thông báo (trang đích là trang lớp, trang buổi học của đợt 3).
  - Test: `apps/api/test/integration/lessons.int.test.ts`; thử tay: `apps/api/http/lessons.http`. Giả định đã chọn (owner xem lại nếu cần):
    - Buổi lẻ và buổi bù không cần dòng lịch; bảng lịch chỉ có lịch hằng tuần (bỏ `kind = 'one_off'` của thiết kế).
    - Ghi chú của gia sư trong buổi học (`notes`) và nhận xét từng học sinh: phụ huynh và học sinh đều xem được. Lưu ý giảng dạy riêng tư vẫn nằm ở ghi danh (đợt 1).
    - Nhắc buổi sắp diễn ra 24 giờ trước; nhắc phụ huynh xác nhận khi còn 24 giờ.
    - Gia sư vẫn điểm danh, phụ huynh vẫn xác nhận / khiếu nại được các buổi đã diễn ra của lớp đã kết thúc (để đối chiếu học phí).
    - Dừng hoặc sửa lịch lặp không gửi thông báo (lịch trên web tự cập nhật); dời và hủy từng buổi thì có.
  - Chưa làm, chuyển sau: kiểm tra trùng giờ giữa các buổi của cùng gia sư; `moderation_cases` cho khiếu nại đã chuyển (G8, hiện Manager xử lý thẳng trên `attendance_disputes`); khiếu nại lại quyết định của Manager lên Admin (G8, D39); OpenAPI cho endpoint G6.
- **Đợt 3, trang web:** chưa làm (trang lớp, lịch, điểm danh, xác nhận buổi, khiếu nại, kết quả; khối trên trang tổng quan; liên kết "Đi tới lớp" ở yêu cầu kết nối đã xác nhận).
- **Chưa làm, chuyển sau:** OpenAPI chưa có endpoint G6 (như G5); ẩn danh hóa tên học sinh trong lớp khi hồ sơ bị xóa quá 6 tháng làm cùng job ẩn danh hóa (C2, D19).

### Giai đoạn 7. Ghi nhận học phí

**Mục tiêu:** hai bên đối chiếu được số buổi và số tiền; tiền được trả ngoài nền tảng _(D6)_.

**Công việc:**

- Tổng hợp học phí theo tháng _(C6)_ từ các buổi đã chốt: số buổi tính tiền, số buổi không tính tiền (vắng, hủy) kèm lý do, buổi đang khiếu nại.
- Tạo khoản phải thu hằng tháng cho từng lớp; trạng thái chưa thanh toán / đã thanh toán một phần / đã thanh toán.
- Ghi nhận thanh toán thủ công (ngày, số tiền, phương thức: tiền mặt, chuyển khoản…), cả hai bên xem được lịch sử.
- Lưu tiền bằng số nguyên VND; giá theo buổi lấy từ bản ghi buổi học, không tính lại theo giá hiện tại.
- Thông báo khoản học phí đến hạn.
- Thiết kế bảng thanh toán có trường phương thức (thủ công / trực tuyến) để mở rộng sau mà không phải đổi cấu trúc.

- **Trang tổng quan (từ G2):** thêm khối học phí tháng này vào trang tổng quan của phụ huynh và gia sư (canvas ParentHome, TutorHome).

**Đầu ra:** trang học phí của lớp cho gia sư và phụ huynh, bảng tổng hợp theo tháng.

**Hoàn thành khi:** số liệu học phí khớp với lịch sử buổi học trong các test có buổi vắng, hủy muộn, học bù và khiếu nại.

### Giai đoạn 8. An toàn, kiểm duyệt và hoàn thiện ra mắt

**Mục tiêu:** nền tảng đủ an toàn và ổn định để có người dùng thật.

**Công việc:**

- **Kiểm duyệt** (§13): hàng chờ báo cáo vi phạm cho tài khoản, bài đăng, tin nhắn; Manager chỉ xem đoạn tin nhắn bị báo cáo _(C1)_; lưu kết quả xử lý; cảnh báo, hạn chế, khóa tài khoản; ẩn bài đăng vi phạm. Admin xử lý khiếu nại lại.
- **Xóa tài khoản** _(C2, D19)_: ghi `deleted_at` và ẩn ngay; job sau 6 tháng xóa hẳn dữ liệu cá nhân, ẩn danh bản ghi lớp và đánh giá; giấy tờ xác minh theo mốc riêng. Bên còn lại vẫn thấy lịch sử buổi học, điểm, học phí dưới nhãn "Học sinh đã xóa tài khoản".
  - **Chờ chủ dự án quyết lại C2:** [rà soát pháp lý](00-product/ra_soat_phap_ly.md) câu 8 cho thấy khi chủ thể yêu cầu xóa, phải hoàn thành trong 20 ngày (30 ngày nếu cần bên thứ ba), nên 6 tháng là quá dài. Đề xuất: xóa hoặc khử nhận dạng trong 20 ngày, trừ tài khoản đang tranh chấp hoặc bị cơ quan chức năng yêu cầu giữ (cần cờ giữ dữ liệu); log hệ thống và `audit_logs` giữ theo thời hạn riêng; khi khử nhận dạng, kiểm tra cả các trường văn bản tự do.
  - Xóa ảnh giấy tờ xác minh ngay khi gia sư xóa tài khoản, không chờ mốc 30 ngày (câu 9).
  - Thêm cách để người dùng tải bản sao dữ liệu của mình và một đầu mối nhận yêu cầu về dữ liệu (câu 10).
- **Đổi phụ huynh quản lý** do Admin xử lý theo yêu cầu _(C9)_: kết thúc dòng `learner_guardians` cũ (`ended_reason = 'transferred'`, `changed_by`) rồi thêm dòng mới, trong một transaction.
- **Thống kê cơ bản** cho Admin theo các chỉ số pilot ở giai đoạn 0.
- **Review bảo mật** (skill `security-review`): xác thực, phân quyền theo quan hệ, upload tệp, rate limit, header bảo mật, CORS, lộ dữ liệu qua API, log không chứa dữ liệu của trẻ.
- **Kiểm thử end-to-end** bằng Playwright cho các luồng §14.1, §14.2, §14.3.
- **Hiệu năng:** kiểm tra truy vấn tìm kiếm và danh sách bằng dữ liệu mẫu lớn; bổ sung index thiếu.
- **Hạ tầng** (§7.1 tài liệu công nghệ): server đặt tại Việt Nam, Caddy + HTTPS, tên miền, tường lửa, backup PostgreSQL và SeaweedFS hằng ngày có mã hóa, thử khôi phục, Sentry.
- **Việc chuyển từ G3:** khóa ngoại `account_sanctions.case_id → moderation_cases` (bảng vụ việc tạo ở G8); hạn chế tài khoản (`restricted`) và thu hồi xác minh (B.4.1 `verified` → `incomplete`) là kết quả của vụ việc; trang "Lý do báo cáo", "Cấu hình hệ thống" (các mốc thời gian hiện là hằng số theo decision log), "Khiếu nại quyết định" và xem "Nhật ký kiểm toán" trên giao diện Admin (canvas AdminCatalog, Appeals); số việc đang chờ cạnh các mục điều hướng của Manager.
- **Việc chuyển từ G2 (triển khai web):** server web gọi API thay trình duyệt và chuyển tiếp header `X-Forwarded-For`. Khi chạy thật: chỉ cho web nhận request qua Caddy (Caddy ghi đè `X-Forwarded-For` bằng IP thật, không giữ giá trị trình duyệt gửi), và đặt `TRUST_PROXY` của API tin địa chỉ của server web. Nếu không, rate limit theo IP của API hoặc chỉ thấy IP của web (mọi người dùng chung một giới hạn), hoặc người dùng giả được IP. Đặt `COOKIE_DOMAIN` là tên miền gốc và `COOKIE_SECURE=true` (D57). Kiểm tra trong review bảo mật ở trên.
- **Pháp lý và nội dung:** điều khoản sử dụng, chính sách quyền riêng tư (đã qua luật sư), hướng dẫn sử dụng cơ bản hai ngôn ngữ. Bộ văn bản đầy đủ và checklist kỹ thuật ở [rà soát pháp lý](00-product/ra_soat_phap_ly.md) mục 4, 5.
- **Dữ liệu gửi ra nước ngoài** (câu 18 rà soát pháp lý): khi tích hợp Sentry, lọc bỏ IP, email, tên trước khi gửi hoặc tự host trong nước; quyết định giữ Gmail SMTP (phải lập hồ sơ chuyển dữ liệu xuyên biên giới) hay đổi sang SMTP trong nước.

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
| Điền thông tin đơn vị vận hành và gửi [câu hỏi pháp lý](00-product/cau_hoi_phap_ly.md) cho luật sư, kèm bản [tự rà soát](00-product/ra_soat_phap_ly.md) | Trước G8; nên gửi sớm vì luật sư cần thời gian | Kết quả có thể làm thay đổi các mốc 30 ngày (C4), 6 tháng (C2), ngưỡng tuổi tài khoản học sinh (D4) và luồng xác minh gia sư (câu 26) |
| Thành lập doanh nghiệp làm đơn vị vận hành | Trước khi đăng ký nền tảng | Rà soát pháp lý câu 1 |
| Đăng ký nền tảng thương mại điện tử trung gian với Bộ Công Thương (đề án hoạt động, quy chế hoạt động) | Được xác nhận trước G9 | Thời hạn xác nhận 07 ngày làm việc, thực tế có thể lâu hơn (rà soát pháp lý câu 2) |
| Hồ sơ đánh giá tác động xử lý dữ liệu cá nhân; hồ sơ chuyển dữ liệu xuyên biên giới (nếu dùng dịch vụ nước ngoài); chỉ định nhân sự bảo vệ dữ liệu | Trước G9 | Gửi Cục A05, Bộ Công an (rà soát pháp lý câu 5, 18) |
| Đăng ký tên miền cho TPS-Connection _(D1)_ | Trước G8 | Cần cho HTTPS và bundle ID của app Mobile |
| Chọn khu vực pilot _(D11, D45)_ | Trước G9 | Nên chọn nơi có sẵn nguồn gia sư hoặc kênh tiếp cận phụ huynh |
| Cung cấp đầu vào cho thiết kế giao diện (G1b) | Khi bắt đầu G1b | Logo, màu, cảm giác thương hiệu, chế độ tối |
| Cho biết quy mô đội ngũ, số giờ mỗi tuần, ngân sách hạ tầng | Khi có thể | Để ước lượng thời gian từng giai đoạn (C13) |

## 6. Việc cần làm tiếp

1. ~~Bắt đầu G1 (nền móng kỹ thuật) và G1b (thiết kế giao diện) song song~~: **xong ngày 2026-11-13**.
2. ~~Chốt giới hạn dung lượng tệp và ngôn ngữ của đường dẫn trang~~: **xong ngày 2026-11-13** (D55, D56).
3. ~~Bắt đầu G2 (tài khoản, phân quyền và hồ sơ)~~: **xong ngày 2026-11-14**.
4. ~~G3 (xác minh gia sư và trang quản trị cơ bản)~~: **xong ngày 2026-11-14**.
5. Bắt đầu G4 (bài đăng và tìm kiếm).
