# Dữ liệu đơn vị hành chính

Chép nguyên văn, không sửa, từ [vietnamese-provinces-database](https://github.com/ThangLeQuoc/vietnamese-provinces-database), bản phát hành **v5.2.0** (ngày 21/09/2026, theo Nghị quyết 39/2026/QH16 và 388/NQ-UBTVQH16). Giấy phép MIT, xem `LICENSE`.

| Tệp                                      | Đường dẫn gốc trong bản phát hành                                                      |
| ---------------------------------------- | -------------------------------------------------------------------------------------- |
| `full_json_generated_data_vn_units.json` | `json/full_json_generated_data_vn_units.json` (34 tỉnh/thành, 3.321 xã/phường/đặc khu) |
| `vn_provinces_metadata.json`             | `json/vn_provinces_metadata.json` (phiên bản, văn bản mới nhất)                        |
| `LICENSE`                                | `LICENSE`                                                                              |

Nạp vào bảng `administrative_areas`: `npm run db:seed:areas -w @tps/api` (thêm `-- --dry-run` để chỉ xem khác biệt).

**Cập nhật khi có bản phát hành mới** (quy trình ở `docs/danh_muc_hanh_chinh.md` mục 5):

1. Tải ba tệp trên từ bản phát hành mới, thay vào thư mục này; sửa số phiên bản trong README này.
2. Xuất Excel từ [danhmuchanhchinh.nso.gov.vn](https://danhmuchanhchinh.nso.gov.vn/) và đối chiếu số lượng, mã, tên.
3. Chạy `-- --dry-run`, xem danh sách thêm / sửa / ngừng hiệu lực. Nếu số lượng tỉnh, xã thay đổi, chạy kèm `--expect-provinces <n> --expect-communes <n>`.
4. Chạy thật, rồi commit dữ liệu mới.
