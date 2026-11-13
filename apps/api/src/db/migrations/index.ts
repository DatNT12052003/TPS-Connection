// Danh sách migration, theo thứ tự thời gian. Tạo migration mới (xem README của API) rồi THÊM VÀO ĐÂY.
// Khai báo tường minh thay vì glob để dev (tsx), test (Jest) và bản build cùng nạp đúng một danh sách.
import { InitExtensions1794960000000 } from './1794960000000-InitExtensions.js';

export const MIGRATIONS = [InitExtensions1794960000000];
