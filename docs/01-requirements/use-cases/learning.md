# Use case: Theo dõi học tập

MVP gồm ghi chú, điểm, nhận xét cơ bản và màn hình kết quả cho phụ huynh. Bài tập làm ngay sau MVP (D10). Báo cáo nâng cao nằm ngoài MVP (PRD §6.2).

## UC-LRN-01: Ghi mục tiêu và đánh giá ban đầu

**Tác nhân:** Gia sư.

**Quy tắc:** BR-905, PRD §3.8.

**Luồng chính:**

1. Gia sư nhập mục tiêu của lớp và ghi chú năng lực ban đầu.
2. Phụ huynh xem được các nội dung này.

**Tiêu chí nghiệm thu:**

- [ ] **AC-LRN-01.1:** Không có loại ghi chú nào về học sinh mà phụ huynh không xem được.
- [ ] **AC-LRN-01.2:** Chỉ gia sư đang dạy mới sửa được; lớp đã kết thúc chỉ đọc.

## UC-LRN-02: Nhập điểm và nhận xét

**Tác nhân:** Gia sư.

**Quy tắc:** BR-901, BR-903, BR-904, BR-906.

**Luồng chính:**

1. Gia sư tạo một mục kết quả: tên, ngày, điểm và thang điểm, nhận xét, bối cảnh.
2. Hệ thống lưu và thông báo cho phụ huynh.
3. Gia sư có thể sửa; hệ thống lưu lịch sử và báo cho phụ huynh.

**Tiêu chí nghiệm thu:**

- [ ] **AC-LRN-02.1:** Điểm không vượt quá thang điểm; thang mặc định là 10.
- [ ] **AC-LRN-02.2:** Có thể chỉ nhập nhận xét, không có điểm.
- [ ] **AC-LRN-02.3:** Gia sư chỉ nhập được cho học sinh mình đang dạy; đổi ID học sinh bị từ chối.
- [ ] **AC-LRN-02.4:** Mọi lần sửa đều lưu giá trị cũ, người sửa, thời điểm.
- [ ] **AC-LRN-02.5:** Gia sư của môn khác không xem được kết quả của lớp này.

## UC-LRN-03: Xem kết quả học tập

**Tác nhân:** Phụ huynh, Học sinh.

**Quy tắc:** BR-902, BR-903, NFR-F07.

**Luồng chính:**

1. Người dùng mở kết quả, phụ huynh chọn con và lớp.
2. Hệ thống hiện số buổi đã học, tỷ lệ tham gia, ghi chú từng buổi, điểm và nhận xét.
3. Biểu đồ điểm theo thời gian hiện kèm phần bối cảnh của gia sư.

**Tiêu chí nghiệm thu:**

- [ ] **AC-LRN-03.1:** Phụ huynh A đọc kết quả con phụ huynh B bằng cách đổi ID bị từ chối.
- [ ] **AC-LRN-03.2:** Học sinh không đọc được kết quả của anh chị em.
- [ ] **AC-LRN-03.3:** Tỷ lệ tham gia bằng số buổi đã học chia cho số buổi đã học cộng học sinh vắng; buổi đã hủy và gia sư vắng không tính.
- [ ] **AC-LRN-03.4:** Biểu đồ có cách đọc được bằng văn bản và không so sánh với học sinh khác.
- [ ] **AC-LRN-03.5:** Lịch sử dài được tải dần.
- [ ] **AC-LRN-03.6:** Có trạng thái rỗng khi chưa có điểm.
