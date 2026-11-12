# Nguồn danh mục đơn vị hành chính – TPS-Connection

Đề xuất: lấy **mã và tên chính thức** theo danh mục của Cục Thống kê; **nạp dữ liệu** từ bộ dữ liệu mở `vietnamese-provinces-database` (bản phát hành cố định), rồi đối chiếu với bản Excel xuất từ trang của Cục Thống kê trước mỗi lần nạp. Danh mục vẫn đang thay đổi trong năm 2026, nên cần một quy trình cập nhật định kỳ chứ không chỉ nạp một lần.

> Trạng thái: **đã duyệt ngày 2026-11-12** (G0, việc #6; D42–D44). Tra cứu ngày 2026-11-12. Tôi chưa tải và kiểm tra trực tiếp bộ dữ liệu; việc đó làm khi viết script seed ở G2 (mục 5).

---

## 1. Hiện trạng danh mục

| Mốc | Văn bản | Nội dung |
| --- | ------- | -------- |
| 01/07/2025 | [Quyết định 19/2025/QĐ-TTg](https://dantri.com.vn/noi-vu/chinh-thuc-co-bang-danh-muc-ma-so-cua-34-tinh-thanh-3321-xa-phuong-moi-20250705061450615.htm) | Bảng danh mục và mã số mới: **34** đơn vị cấp tỉnh, **3.321** đơn vị cấp xã. Bỏ cấp huyện |
| 30/04/2026 | Nghị quyết 30/2026/QH16 | Đồng Nai thành thành phố trực thuộc Trung ương; một số xã thành phường |
| 01/09/2026 | Nghị quyết 36/2026/QH16 | Quảng Ninh thành thành phố trực thuộc Trung ương |
| 20/09/2026 | Nghị quyết 39/2026/QH16, 388/NQ-UBTVQH16 | Bắc Ninh thành thành phố trực thuộc Trung ương; 12 xã thành phường |

Các thay đổi năm 2026 được tổng hợp từ [nhật ký phát hành của vietnamese-provinces-database](https://github.com/ThangLeQuoc/vietnamese-provinces-database/releases); cần đối chiếu với văn bản gốc khi nạp dữ liệu. Tổng số vẫn là 34 tỉnh/thành và 3.321 xã/phường/đặc khu.

**Quy tắc mã số** theo Quyết định 19/2025/QĐ-TTg ([Tuổi Trẻ](https://tuoitre.vn/plo/ma-so-don-vi-hanh-chinh-cua-34-tinh-thanh-va-3321-don-vi-cap-xa-moi-post858800.html), [VTV](https://vtv.vn/ma-so-don-vi-hanh-chinh-cua-34-tinh-thanh-va-3321-don-vi-cap-xa-moi-100250705071249688.htm)):

- Mã cấp tỉnh: 2 chữ số (01–99). Mã cấp xã: 5 chữ số (00001–99999). Hai cấp mã hóa độc lập.
- **Đổi tên hoặc đổi loại** (tỉnh → thành phố, xã → phường) **không đổi mã**.
- Mã đã cấp không được dùng lại cho đơn vị khác cùng cấp.

Hệ quả cho thiết kế: **mã là khóa ổn định**. Bản ghi tham chiếu theo mã sẽ không hỏng khi đơn vị đổi tên hay đổi loại. Chỉ khi sáp nhập hoặc chia tách mới phát sinh mã mới và mã cũ ngừng hiệu lực.

## 2. Các nguồn đã xem xét

| Nguồn | Chính thức | Định dạng | Cập nhật | Đánh giá |
| ----- | ---------- | --------- | -------- | -------- |
| [danhmuchanhchinh.nso.gov.vn](https://danhmuchanhchinh.nso.gov.vn/) (Cục Thống kê) | Có | Tra cứu web, nút "Xuất Excel", lọc theo ngày ("Đến ngày"); có file chuyển đổi đơn vị mới – cũ | Theo văn bản mới nhất | **Nguồn đối chiếu.** Không có API; phải xuất Excel thủ công. Cột: mã, tên, tên tiếng Anh, cấp, văn bản pháp lý |
| danhmuchanhchinh.gso.gov.vn (tên miền cũ) | Có | Web | Không truy cập được | Không dùng |
| [vietnamese-provinces-database](https://github.com/ThangLeQuoc/vietnamese-provinces-database) | Không (cộng đồng, giấy phép MIT) | SQL cho PostgreSQL, JSON, GeoJSON (tùy chọn) | Bản v5.2.0 ngày 21/09/2026, theo Nghị quyết 39/2026/QH16 | **Nguồn nạp dữ liệu.** Dựng từ dữ liệu Cục Thống kê và các văn bản; có tên tiếng Anh, tên đầy đủ, loại đơn vị, mã bưu chính, ranh giới hành chính |
| [vietnamadminunits](https://github.com/tranngocminhhieu/vietnamadminunits) | Không | Python, dữ liệu 34 và 63 tỉnh + bảng chuyển đổi | 2025 | Hữu ích nếu cần chuyển địa chỉ cũ sang mới; hệ thống mới chưa cần |
| dvhcvn (daohoangson) | Không | JSON | Đến 01/03/2025 | Trước sáp nhập, **không dùng** |

## 3. Đề xuất

1. **Nạp dữ liệu từ `vietnamese-provinces-database`, cố định một bản phát hành** (hiện là v5.2.0). Lấy bảng tỉnh và xã/phường: mã, tên, tên tiếng Anh, tên đầy đủ, loại đơn vị. Chưa lấy dữ liệu ranh giới; chỉ cần khi làm lọc theo bán kính (D11).
2. **Đối chiếu với Excel của Cục Thống kê** trước mỗi lần nạp: so số lượng (34 / 3.321 hoặc số mới), so từng mã và tên. Có sai lệch thì dừng, kiểm tra văn bản gốc, sửa tay rồi mới nạp.
3. **Ghi rõ phiên bản nguồn** đã nạp (tên bản phát hành, ngày xuất Excel) vào bảng cấu hình hoặc audit log, để biết danh mục đang ở mốc nào.
4. **Không phụ thuộc vào thư viện bên ngoài lúc chạy**: dữ liệu được chép vào bảng `administrative_areas` của hệ thống, ứng dụng chỉ đọc từ đó.

Lý do không nạp thẳng từ trang Cục Thống kê: không có API, phải xuất Excel thủ công và tự xử lý định dạng. Bộ dữ liệu mở đã làm sẵn việc đó, có lịch sử phát hành rõ ràng và giấy phép MIT cho phép dùng thương mại.

## 4. Điều chỉnh bảng `administrative_areas`

Thiết kế cơ sở dữ liệu đã được cập nhật theo các phát hiện trên:

| Thay đổi | Lý do |
| -------- | ----- |
| Thêm `unit_type`: cấp tỉnh `province` / `municipality` (thành phố trực thuộc Trung ương); cấp xã `commune` / `ward` / `special_zone` (đặc khu) | Đơn vị đổi loại thường xuyên (Đồng Nai, Quảng Ninh, Bắc Ninh, 12 xã thành phường) nhưng giữ mã; cần lưu loại riêng để hiển thị "Phường …", "Thành phố …" |
| Thêm `name_en`, `full_name` | Nguồn có sẵn tên tiếng Anh (phục vụ giao diện tiếng Anh, C11) và tên đầy đủ kèm loại đơn vị |
| Thêm `postal_code` (có thể NULL) | Nguồn có sẵn; hữu ích cho địa chỉ sau này |
| `code` là khóa nghiệp vụ ổn định; đổi tên, đổi loại thì **cập nhật tại chỗ** | Đúng quy tắc "đổi tên không đổi mã" |
| Sáp nhập, chia tách: bản ghi cũ `is_active = false` + `valid_to`, thêm bản ghi mới với mã mới | Dữ liệu cũ (bài đăng, hồ sơ) vẫn tham chiếu được; giao diện chỉ cho chọn đơn vị đang hiệu lực |

## 5. Quy trình cập nhật

| Bước | Ai | Khi nào |
| ---- | -- | ------- |
| Kiểm tra bản phát hành mới của nguồn và tin về nghị quyết sắp xếp đơn vị hành chính | Lập trình viên phụ trách | Hằng tháng, và ngay khi có tin |
| Xuất Excel từ trang Cục Thống kê, chạy script nạp ở chế độ **so sánh** (chỉ in khác biệt, không ghi) | Lập trình viên | Mỗi lần cập nhật |
| Chạy script nạp thật: upsert theo `code`; đơn vị không còn trong nguồn thì `is_active = false`; ghi audit log và phiên bản nguồn | Lập trình viên (Admin duyệt kết quả so sánh) | Sau khi so sánh không còn sai lệch bất thường |
| Sửa lẻ một đơn vị (lỗi chính tả, nguồn chậm cập nhật) | Admin, qua trang quản trị danh mục (C1) | Khi cần |

**Yêu cầu cho script seed (làm ở G2):**

- Idempotent: chạy lại nhiều lần cho cùng kết quả.
- Kiểm tra: đúng số lượng mong đợi; mã tỉnh 2 chữ số, mã xã 5 chữ số; mỗi xã thuộc đúng một tỉnh đang hiệu lực; không trùng mã.
- Không bao giờ xóa bản ghi đã được tham chiếu; chỉ đặt `is_active = false`.
- Có test chạy trên bộ dữ liệu mẫu nhỏ.

## 6. Đã duyệt (D42–D44)

1. Dùng `vietnamese-provinces-database` (MIT) làm nguồn nạp, Excel của Cục Thống kê làm nguồn đối chiếu.
2. Kiểm tra cập nhật danh mục hằng tháng.
3. Các thay đổi bảng `administrative_areas` ở mục 4.

---

**Nguồn đã tra cứu:**

- [Dân trí – Chính thức có bảng danh mục, mã số của 34 tỉnh thành, 3.321 xã, phường mới](https://dantri.com.vn/noi-vu/chinh-thuc-co-bang-danh-muc-ma-so-cua-34-tinh-thanh-3321-xa-phuong-moi-20250705061450615.htm)
- [Tuổi Trẻ – Mã số đơn vị hành chính của 34 tỉnh thành và 3.321 đơn vị cấp xã mới](https://tuoitre.vn/plo/ma-so-don-vi-hanh-chinh-cua-34-tinh-thanh-va-3321-don-vi-cap-xa-moi-post858800.html)
- [VTV – Mã số đơn vị hành chính của 34 tỉnh, thành và 3.321 đơn vị cấp xã mới](https://vtv.vn/ma-so-don-vi-hanh-chinh-cua-34-tinh-thanh-va-3321-don-vi-cap-xa-moi-100250705071249688.htm)
- [Cục Thống kê – Danh mục hành chính](https://danhmuchanhchinh.nso.gov.vn/)
- [vietnamese-provinces-database – mã nguồn](https://github.com/ThangLeQuoc/vietnamese-provinces-database) và [các bản phát hành](https://github.com/ThangLeQuoc/vietnamese-provinces-database/releases)
- [vietnamadminunits](https://github.com/tranngocminhhieu/vietnamadminunits)
