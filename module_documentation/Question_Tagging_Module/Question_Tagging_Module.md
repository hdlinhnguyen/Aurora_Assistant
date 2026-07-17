# Tài liệu thiết kế Question Tagging Module

## 1. Mục tiêu

`Question_Tagging_Module` cho phép giáo viên gắn thủ công một hoặc nhiều topic kiến thức cho câu hỏi và từng ý trong barem. Các topic được lấy từ Knowledge Graph đã có sẵn và là cơ sở để những module phía sau phân tích năng lực, truy ngược kiến thức tiên quyết và xây dựng lộ trình học tập.

Module không sử dụng AI để đề xuất, dự đoán hoặc tự động gắn topic. Mọi topic gốc đều do giáo viên lựa chọn; hệ thống chỉ kiểm tra dữ liệu và tổng hợp tag theo quy tắc xác định trước.

## 2. Phạm vi trách nhiệm

### 2.1. Trong phạm vi

- Đọc câu hỏi, loại câu hỏi và các ý barem từ Question Management.
- Đọc danh sách topic từ Knowledge Graph.
- Cho phép tìm kiếm và duyệt topic thuộc cùng môn học với câu hỏi.
- Cho phép chọn topic thuộc khối lớp khác trong cùng môn học.
- Gắn nhiều topic cho toàn bộ câu hỏi trắc nghiệm.
- Gắn nhiều topic cho từng ý barem của câu hỏi tự luận.
- Gắn các topic bổ sung ở cấp toàn bộ câu hỏi tự luận.
- Tự động tổng hợp tập topic hiệu lực của câu hỏi.
- Cho phép nhiều giáo viên cùng chỉnh sửa bằng cơ chế kiểm soát phiên bản.
- Cung cấp kết quả tagging cho các module tiêu thụ phía sau.

### 2.2. Ngoài phạm vi

- Tạo hoặc chỉnh sửa nội dung câu hỏi.
- Tạo hoặc chỉnh sửa đáp án, lời giải hay barem chấm điểm.
- Tạo, sửa hoặc xoá topic và quan hệ trong Knowledge Graph.
- Dùng AI để đề xuất hoặc tự động gắn topic.
- Tự động gắn topic cha, topic con hoặc topic tiên quyết.
- Truy ngược Knowledge Graph để tìm lỗ hổng kiến thức.
- Chấm điểm câu trả lời của học sinh.
- Bắt buộc câu hỏi phải có tag trước khi được sử dụng.
- Hỗ trợ làm việc ngoại tuyến hoặc đồng bộ sau khi mất mạng.

## 3. Các hệ thống liên quan

### 3.1. Question Management

Question Management sở hữu:

- Nội dung và metadata của câu hỏi.
- Môn học và khối lớp của câu hỏi.
- Loại câu hỏi: trắc nghiệm hoặc tự luận.
- Cấu trúc barem và các ý chấm điểm của câu tự luận.

`Question_Tagging_Module` chỉ đọc các dữ liệu này để xác định đối tượng cần gắn topic. Module không thay đổi nội dung nguồn.

### 3.2. Knowledge Graph

Knowledge Graph sở hữu topic và các quan hệ giữa topic. Module chỉ đọc topic để giáo viên lựa chọn.

Phạm vi topic hợp lệ của một câu hỏi:

```text
topic.subject_id = question.subject_id
```

`topic.grade_level` có thể khác `question.grade_level`. Giáo viên không được chọn topic thuộc môn học khác.

### 3.3. Các module tiêu thụ phía sau

Các module chẩn đoán hoặc xây dựng lộ trình học tập sử dụng kết quả tagging để truy ngược Knowledge Graph khi cần. `Question_Tagging_Module` không thực hiện bước truy ngược này.

## 4. Mô hình dữ liệu logic

### 4.1. Liên kết topic trực tiếp với câu hỏi

```text
QuestionTopicMapping
- question_id
- topic_id
- created_by
- created_at
```

Ý nghĩa:

- Với câu trắc nghiệm, đây là toàn bộ tag của câu hỏi.
- Với câu tự luận, đây là các tag bổ sung được giáo viên gắn trực tiếp ở cấp câu hỏi.
- Một cặp `question_id + topic_id` chỉ xuất hiện một lần.

### 4.2. Liên kết topic với ý barem

```text
RubricItemTopicMapping
- rubric_item_id
- topic_id
- created_by
- created_at
```

Mỗi ý barem có thể gắn nhiều topic. Các topic có vai trò ngang nhau, không phân biệt topic chính và topic phụ.

### 4.3. Tập topic hiệu lực của câu hỏi

`EffectiveQuestionTopics` là dữ liệu tổng hợp, không phải một nguồn tag độc lập.

Với câu trắc nghiệm:

```text
EffectiveQuestionTopics(question)
= DirectQuestionTopics(question)
```

Với câu tự luận:

```text
EffectiveQuestionTopics(question)
= DirectQuestionTopics(question)
∪ RubricItemTopics(all rubric items of question)
```

Topic trùng nhau chỉ xuất hiện một lần trong kết quả. Hệ thống nên tính tập topic hiệu lực từ hai loại mapping gốc để tránh dữ liệu tổng hợp bị sai lệch.

### 4.4. Trạng thái phiên bản của tagging

```text
QuestionTaggingState
- question_id
- version
- updated_by
- updated_at
```

`version` tăng sau mỗi lần thay đổi mapping của câu hỏi hoặc bất kỳ ý barem nào thuộc câu hỏi đó. Trạng thái này được dùng để phát hiện chỉnh sửa đồng thời.

## 5. Quy tắc nghiệp vụ

1. Việc gắn topic hoàn toàn do giáo viên thực hiện thủ công.
2. Một câu hỏi hoặc một ý barem có thể gắn nhiều topic.
3. Tất cả topic được gắn có vai trò ngang nhau.
4. Topic phải thuộc cùng môn học với câu hỏi nhưng có thể thuộc khối lớp khác.
5. Hệ thống không tự gắn topic cha, topic con hoặc topic tiên quyết.
6. Câu hỏi không có tag vẫn được lưu và sử dụng bình thường.
7. Câu trắc nghiệm được gắn tag ở cấp toàn bộ câu hỏi.
8. Câu tự luận được gắn tag cho từng ý barem và có thể có tag bổ sung ở cấp câu hỏi.
9. Tag hiệu lực của câu tự luận luôn bao gồm hợp của tag bổ sung và tag của tất cả ý barem.
10. Khi một topic bị xoá khỏi tất cả ý barem, topic đó tự biến mất khỏi tập tổng hợp nếu không còn là tag bổ sung cấp câu hỏi.
11. Nếu một topic vừa là tag bổ sung vừa xuất hiện trong barem, việc xoá topic khỏi barem không xoá tag bổ sung.
12. Nhiều giáo viên có thể chỉnh sửa tag của cùng một câu hỏi.

## 6. Luồng xử lý chính

### 6.1. Mở màn hình tagging

1. Giáo viên chọn một câu hỏi.
2. Module đọc câu hỏi, môn học, loại câu hỏi và các ý barem.
3. Module tải các topic thuộc cùng môn học từ Knowledge Graph.
4. Module tải các mapping hiện có và hiển thị trạng thái tagging hiện tại.

### 6.2. Tag câu hỏi trắc nghiệm

1. Giáo viên tìm kiếm hoặc duyệt topic.
2. Giáo viên chọn một hoặc nhiều topic cho toàn bộ câu hỏi.
3. Module kiểm tra tất cả topic thuộc đúng môn học.
4. Module lưu `QuestionTopicMapping`.
5. Tập topic hiệu lực được cập nhật từ các mapping vừa lưu.

### 6.3. Tag câu hỏi tự luận

1. Module hiển thị toàn bộ các ý barem của câu hỏi.
2. Giáo viên gắn một hoặc nhiều topic cho từng ý barem.
3. Giáo viên có thể gắn thêm topic trực tiếp cho toàn bộ câu hỏi.
4. Module kiểm tra tất cả topic thuộc đúng môn học.
5. Module lưu riêng `RubricItemTopicMapping` và `QuestionTopicMapping`.
6. Tag Aggregator tạo tập topic hiệu lực bằng phép hợp hai nguồn mapping.

### 6.4. Sửa hoặc xoá tag

1. Giáo viên thêm hoặc xoá topic tại cấp câu hỏi hoặc ý barem.
2. Module lưu thay đổi vào đúng loại mapping.
3. Tag Aggregator tính lại tập topic hiệu lực.
4. Các module phía sau nhận kết quả mới nhất khi đọc dữ liệu tagging.

## 7. Giao diện logic của module

Các thao tác nghiệp vụ chính:

```text
GetTaggingContext(question_id)
SetQuestionTopics(question_id, topic_ids[], expected_version)
SetRubricItemTopics(rubric_item_id, topic_ids[], expected_version)
GetEffectiveQuestionTopics(question_id)
```

### 7.1. GetTaggingContext

Trả về:

- Thông tin nhận diện câu hỏi.
- Môn học, khối lớp và loại câu hỏi.
- Danh sách ý barem nếu là câu tự luận.
- Tag trực tiếp của câu hỏi.
- Tag của từng ý barem.
- Tập topic hiệu lực.
- Phiên bản dữ liệu hiện tại.

### 7.2. Các thao tác Set

- Thay thế tập topic hiện tại của đúng đối tượng được chỉnh sửa.
- Kiểm tra topic tồn tại và thuộc cùng môn học với câu hỏi.
- Không yêu cầu danh sách topic phải có phần tử.
- Sử dụng `expected_version` để tránh ghi đè âm thầm thay đổi của giáo viên khác.

### 7.3. GetEffectiveQuestionTopics

Trả về tập topic duy nhất sau khi áp dụng quy tắc tổng hợp theo loại câu hỏi. Kết quả này là hợp đồng chính dành cho các module chẩn đoán và phân tích năng lực.

## 8. Chỉnh sửa đồng thời

Module sử dụng optimistic concurrency:

1. Giáo viên mở câu hỏi và nhận phiên bản tagging hiện tại.
2. Khi lưu, client gửi kèm `expected_version`.
3. Nếu phiên bản chưa thay đổi, module lưu mapping và tăng phiên bản.
4. Nếu dữ liệu đã được giáo viên khác cập nhật, module tải trạng thái mới nhất.
5. Các thay đổi không xung đột có thể được hợp nhất; thay đổi xung đột phải được giáo viên xác nhận trước khi lưu lại.

## 9. Kiểm tra hợp lệ

Module từ chối thay đổi khi:

- Câu hỏi không tồn tại.
- Ý barem không tồn tại hoặc không thuộc câu hỏi đang chỉnh sửa.
- Topic không tồn tại.
- Topic thuộc môn học khác với câu hỏi.
- Phiên bản dữ liệu đã thay đổi và chưa hoàn tất bước hợp nhất.

Việc không chọn topic không phải là lỗi nghiệp vụ.

## 10. Dữ liệu đầu ra

Kết quả tối thiểu cung cấp cho module phía sau:

```text
EffectiveQuestionTopicSet
- question_id
- subject_id
- topic_ids[]
- version
- updated_at
```

Khi cần truy xuất chi tiết theo barem:

```text
RubricItemTopicSet
- question_id
- rubric_item_id
- topic_ids[]
- version
```

Module tiêu thụ phải dùng Knowledge Graph để truy ngược topic tiên quyết; không được hiểu `topic_ids[]` là danh sách đã bao gồm topic cha.

## 11. Tiêu chí kiểm thử chấp nhận

- Giáo viên gắn được nhiều topic cho một câu trắc nghiệm.
- Giáo viên gắn được nhiều topic riêng cho từng ý barem của câu tự luận.
- Giáo viên gắn được topic bổ sung cho toàn bộ câu tự luận.
- Tập topic hiệu lực của câu tự luận bằng hợp của hai nguồn tag và không có phần tử trùng.
- Xoá tag khỏi một ý barem làm kết quả tổng hợp thay đổi đúng quy tắc.
- Tag bổ sung vẫn tồn tại khi topic tương ứng bị xoá khỏi barem.
- Topic khác khối lớp nhưng cùng môn học được chấp nhận.
- Topic thuộc môn học khác bị từ chối.
- Câu hỏi không có tag vẫn được lưu và sử dụng.
- Module không tự thêm topic cha hoặc topic tiên quyết.
- Cập nhật đồng thời không âm thầm ghi đè thay đổi của giáo viên khác.

## 12. Quyết định thiết kế đã chốt

- Chọn kiến trúc module tagging độc lập trong cùng hệ thống.
- Module sở hữu `QuestionTopicMapping` và `RubricItemTopicMapping`.
- Question Management sở hữu câu hỏi và barem.
- Knowledge Graph sở hữu topic và quan hệ giữa topic.
- Tagging hoàn toàn thủ công, không sử dụng AI.
- Cho phép nhiều topic có vai trò ngang nhau.
- Cho phép tag xuyên khối lớp nhưng không xuyên môn học.
- Không tự động mở rộng tag theo quan hệ trong Knowledge Graph.
- Tag câu hỏi là tùy chọn, không phải điều kiện để sử dụng câu hỏi.
- Hệ thống hoạt động trực tuyến; không thiết kế luồng offline.
