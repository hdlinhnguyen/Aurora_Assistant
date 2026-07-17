# Thiết kế module lộ trình học tập cá nhân hóa

## 1. Mục tiêu

Module tạo lộ trình học tập cá nhân hóa cho học sinh trong lớp do giáo viên quản lý. Hệ thống truy ngược Knowledge Graph để tìm khoảng trống kiến thức gốc, kể cả topic thuộc khối lớp thấp hơn, thay vì chỉ đánh dấu đúng hoặc sai tại topic hiện tại.

Đầu ra là chuỗi topic có thứ tự. Mỗi bước gồm mức thành thạo hiện tại, mức cần đạt, lý do được chọn, thời lượng dự kiến và điều kiện hoàn thành. Giáo viên đặt mục tiêu và ràng buộc; hệ thống chẩn đoán, đề xuất lộ trình, gom nhóm học sinh và ưu tiên hỗ trợ.

## 2. Phạm vi

Module phụ trách:

- Tiếp nhận mastery evidence từ bài kiểm tra giấy và quiz trên hệ thống.
- Chuẩn hóa độ tin cậy của evidence.
- Ước lượng mastery theo từng cặp `student-topic` bằng Bayesian Knowledge Tracing (BKT).
- Tính `confidence_score` độc lập với `mastery_probability`.
- Chẩn đoán root-cause gap trên prerequisite graph.
- Tạo và tối ưu lộ trình theo ràng buộc của giáo viên.
- Gom nhóm học sinh, phát hiện gap toàn lớp và xếp hạng học sinh cần hỗ trợ.
- Lưu phiên bản lộ trình và giải thích mọi thay đổi.

Module không phụ trách OCR, chấm điểm, quản lý ngân hàng câu hỏi, gắn topic hoặc tự động sửa Knowledge Graph.

## 3. Nguồn dữ liệu

### 3.1. Knowledge Graph

Graph lưu quan hệ có hướng:

```text
prerequisite_topic -> dependent_topic
```

Ví dụ:

```text
Phép cộng -> Phép nhân
Quy đồng mẫu số -> Cộng phân số -> Biểu thức số hữu tỉ
```

Graph hiện chỉ có cạnh phụ thuộc, chưa có trọng số. Các trọng số dùng để xếp hạng được tính động và không làm thay đổi graph gốc.

### 3.2. Evidence từ bài kiểm tra giấy

```text
Approved Assessment Template
-> OCR bài làm
-> Answer-Rubric Mapping
-> Teacher Final Review
-> Approved Rubric Evaluation
-> Paper Mastery Evidence
```

Evidence gồm Student ID, assessment/question/rubric item ID, topic tag, điểm đạt được, điểm tối đa, trạng thái rubric, xác nhận của giáo viên và timestamp.

Chỉ evidence đã được giáo viên xác nhận mới cập nhật mastery chính thức. Evidence chưa xác nhận được lưu ở trạng thái `provisional`.

### 3.3. Evidence từ quiz trên hệ thống

```text
Question Bank
-> Quiz Session
-> Answer Evaluation
-> Quiz Mastery Evidence
```

Evidence gồm Student ID, session/question ID, topic ID, kết quả, điểm, độ khó, thời gian trả lời, số lần thử, gợi ý đã dùng, phương pháp chấm và timestamp.

## 4. Kiến trúc logic

### 4.1. Evidence Ingestion and Calibration

- Kiểm tra schema và lineage.
- Chống trùng lặp theo `evidence_id`.
- Tránh double-count question tag và rubric tag của cùng một kết quả.
- Tính `observation_value` và `evidence_weight`.
- Bảo đảm xử lý idempotent.

### 4.2. Core Mastery Module

Dùng weighted BKT để cập nhật `mastery_probability` theo từng cặp `student-topic`. Đây là thành phần duy nhất sở hữu trạng thái mastery chính thức.

### 4.3. Gap Diagnosis Engine

Nhận topic mục tiêu, truy ngược Knowledge Graph và phân loại prerequisite:

```text
unknown | uncertain | learning | confirmed_gap | mastered
```

### 4.4. Diagnostic Assessment Planner

Chọn câu hỏi chẩn đoán ngắn cho topic `uncertain`. Mục tiêu là thu thêm evidence có giá trị phân biệt cao mà không bắt học sinh làm lại toàn bộ bài kiểm tra.

### 4.5. Root-Cause Ranker

Xếp hạng gap theo mức thiếu hụt, confidence, khoảng cách tới topic mục tiêu và ảnh hưởng tới các topic phía sau.

### 4.6. Personalized Path Planner

Tạo remediation subgraph, loại topic đã thành thạo, tối ưu theo ràng buộc và sắp thứ tự bằng topological sort.

### 4.7. Teacher Control and Class Insight

Cho phép giáo viên cấu hình, phê duyệt hoặc override lộ trình; đồng thời tổng hợp gap toàn lớp, tạo nhóm can thiệp và xếp hạng học sinh cần hỗ trợ.

## 5. Chuẩn hóa evidence

```text
CalibratedMasteryEvidence
- evidence_id
- student_id
- topic_id
- source
- observation_value
- evidence_weight
- occurred_at
- assessment_attempt_id
- question_id
- rubric_item_id
- teacher_confirmed
- lineage
- status
```

`observation_value` nằm trong khoảng `0..1`. Với rubric, giá trị được tính từ tỷ lệ điểm của rubric item. Với quiz, giá trị được tính từ kết quả đúng, sai hoặc đúng một phần.

```text
evidence_weight =
    source_reliability
  * evaluation_reliability
  * difficulty_informativeness
  * hint_factor
  * attempt_factor
  * recency_factor
```

Giá trị khởi tạo minh họa:

```text
Bài giấy đã được giáo viên xác nhận: 1.00
Quiz chấm tự động:                    0.85
Đã dùng gợi ý:                        x 0.70
Lần thử thứ hai:                      x 0.80
```

Các hệ số này phải được hiệu chỉnh bằng dữ liệu thực tế.

## 6. Bayesian Knowledge Tracing

BKT ước lượng:

```text
P(L_t) = xác suất học sinh đã thành thạo topic tại thời điểm t
```

Mỗi topic có bốn tham số:

- `P(L0)`: xác suất đã biết trước khi có evidence.
- `P(T)`: xác suất học được sau một cơ hội luyện tập.
- `P(S)`: xác suất trả lời sai dù đã biết.
- `P(G)`: xác suất trả lời đúng dù chưa biết.

Phiên bản đầu dùng tham số mặc định theo môn, khối và loại câu hỏi. Khi đủ dữ liệu, tham số được hiệu chỉnh từ lịch sử hệ thống.

Vì evidence có điểm một phần và trọng số, hệ thống dùng weighted hoặc soft-evidence BKT thay vì ép mọi quan sát thành đúng hoặc sai tuyệt đối.

BKT chỉ ước lượng mastery, không trực tiếp tạo lộ trình.

## 7. Confidence score

`mastery_probability` biểu thị khả năng học sinh đã thành thạo. `confidence_score` biểu thị mức hệ thống tin tưởng vào ước lượng đó.

### 7.1. Lượng evidence hiệu dụng

```text
effective_evidence = sum(evidence_weight_i)
evidence_sufficiency = 1 - exp(-effective_evidence / k)
```

`k` là số evidence hiệu dụng cần để đạt độ tin cậy tương đối cao, khởi tạo với `k = 5`.

### 7.2. Độ chắc chắn của posterior

```text
H(p) = -p*log(p) - (1-p)*log(1-p)
posterior_certainty = 1 - H(P_mastery) / log(2)
```

Mastery gần `0.5` tạo certainty thấp; mastery gần `0` hoặc `1` tạo certainty cao.

### 7.3. Tính nhất quán

```text
consistency = 1 - weighted_prediction_error
```

Sai số được tính trên observation gần đây và phải tôn trọng thứ tự thời gian để không phạt học sinh vì các em đang tiến bộ.

### 7.4. Công thức tổng hợp

```text
confidence_score =
    evidence_sufficiency
  * (0.7 * posterior_certainty + 0.3 * consistency)
```

Ngưỡng khởi tạo:

```text
mastery >= 0.80 và confidence >= 0.70 -> mastered
mastery <  0.60 và confidence >= 0.70 -> confirmed_gap
confidence < 0.70                     -> uncertain
còn lại                               -> learning
```

Các ngưỡng phải cấu hình được theo môn và khối.

## 8. Hợp đồng dữ liệu

### 8.1. Student Topic Knowledge State

```text
StudentTopicKnowledgeState
- student_id
- topic_id
- mastery_probability
- confidence_score
- evidence_count
- effective_evidence
- last_evidence_at
- mastery_status
- evidence_summary
- source_breakdown
- version
```

### 8.2. Yêu cầu của giáo viên

```text
LearningPathRequest
- class_id
- student_ids[]
- target_topic_ids[]
- deadline
- estimated_minutes_per_student
- required_topic_ids[]
- excluded_topic_ids[]
- target_mastery_threshold
- minimum_confidence_threshold
- review_checkpoint
- teacher_id
```

### 8.3. Knowledge Graph

```text
Topic
- topic_id
- subject_id
- grade_level
- name
- estimated_learning_time

PrerequisiteEdge
- prerequisite_topic_id
- dependent_topic_id
```

## 9. Chẩn đoán root-cause gap

Từ topic mục tiêu, chạy reverse BFS hoặc DFS:

```text
RelevantSubgraph = ancestors(target_topics) + target_topics
```

Graph con phải là DAG. Topic `unknown` hoặc `uncertain` không được mặc định là gap.

```text
gap_score =
    mastery_deficit
  * diagnostic_confidence
  * target_relevance
  * downstream_impact
  * recency_factor
```

Trong đó:

```text
mastery_deficit   = 1 - mastery_probability
target_relevance  = 1 / (1 + distance_to_target)
downstream_impact = số topic chưa vững phụ thuộc vào topic này
```

Một root-cause candidate phải chưa thành thạo với confidence đủ cao, nằm trên đường tới topic mục tiêu, là điểm đứt sớm nhất có bằng chứng trong một nhánh prerequisite và có khả năng mở khóa topic phía sau.

Nếu confidence thấp, hệ thống yêu cầu chẩn đoán thêm thay vì kết luận.

## 10. Tạo lộ trình

Remediation subgraph gồm root-cause gap, topic trung gian chưa thành thạo, topic mục tiêu và topic bắt buộc do giáo viên đặt. Topic đã mastered được giữ trong dependency graph để giải thích nhưng không trở thành bước học.

```text
learning_cost = estimated_minutes

learning_value =
    expected_mastery_gain
  * target_relevance
  * downstream_impact
```

Nếu đủ thời gian, hệ thống lấy toàn bộ remediation subgraph. Nếu thiếu thời gian, dùng constrained knapsack heuristic nhưng vẫn bảo toàn prerequisite bắt buộc.

Không dùng shortest path đơn thuần vì một topic có thể cần nhiều prerequisite đồng thời. Khi cần tối ưu chính xác hơn, có thể thay heuristic bằng Integer Linear Programming.

Thứ tự được tạo bằng topological sort. Khi nhiều topic cùng sẵn sàng, ưu tiên gap score cao hơn, mở khóa nhiều topic hơn, chi phí thấp hơn và gần deadline hơn.

Điều kiện hoàn thành một bước:

```text
mastery_probability >= target_mastery
AND confidence_score >= minimum_confidence
```

## 11. Đầu ra lộ trình

```text
PersonalizedLearningPath
- path_id
- student_id
- class_id
- target_topic_ids[]
- teacher_constraints
- diagnosis_summary
- ordered_steps[]
- total_estimated_minutes
- generated_at
- next_review_checkpoint
- status
- version
```

```text
PathStep
- topic_id
- order
- current_mastery
- current_confidence
- target_mastery
- minimum_confidence
- gap_score
- estimated_minutes
- inclusion_reason
- completion_condition
- status
- teacher_locked
```

```text
Draft -> Approved -> Active -> Paused -> Completed
                         |
                         -> Superseded
```

## 12. Quyền kiểm soát của giáo viên

Giáo viên được đặt topic mục tiêu, deadline, thời lượng, ngưỡng mastery, topic bắt buộc, topic bị loại và thời điểm tái đánh giá.

Giáo viên có thể phê duyệt hàng loạt, thêm hoặc xóa topic, đổi thứ tự, khóa bước, tạo lại lộ trình, tạm dừng hoặc giao cùng hoạt động cho một nhóm.

Mỗi override lưu `teacher_id`, timestamp, phạm vi và lý do. Hệ thống không được âm thầm đảo ngược override của giáo viên.

Giáo viên điều chỉnh chính sách học tập, không điều chỉnh trực tiếp các tham số `slip`, `guess` hoặc `transition` của BKT.

## 13. Gom nhóm và ưu tiên cấp lớp

Học sinh được nhóm theo root-cause gap và hình thức can thiệp, không theo tổng điểm:

```text
group_key =
    root_cause_topic
  + mastery_band
  + target_topic
  + recommended_intervention
```

Một học sinh có thể có nhiều nhu cầu nhưng chỉ có một `primary_intervention_group` tại một thời điểm.

### 13.1. Gap toàn lớp

```text
confirmed_gap_rate =
    confirmed_gap_students
    / students_with_sufficient_confidence

class_gap_score =
    confirmed_gap_rate
  * average_gap_severity
  * target_relevance
  * average_confidence
```

Học sinh thiếu evidence không nằm trong mẫu số kết luận.

```text
>= 40%       -> đề xuất dạy lại cả lớp
15% đến <40% -> đề xuất dạy nhóm nhỏ
< 15%        -> đề xuất hỗ trợ cá nhân
```

### 13.2. Học sinh cần hỗ trợ trước

```text
help_priority =
    gap_severity
  * diagnostic_confidence
  * curricular_urgency
  * downstream_impact
  * intervention_need
```

Học sinh có confidence thấp được ưu tiên chẩn đoán, không mặc định được xếp đầu danh sách cần giáo viên kèm trực tiếp.

### 13.3. Đầu ra dashboard

```text
ClassLearningInsight
- class_id
- target_topics
- class_mastery_distribution
- class_wide_gaps[]
- suggested_reteach_topics[]
- intervention_groups[]
- prioritized_students[]
- insufficient_evidence_students[]
- path_approval_summary
- changes_since_last_checkpoint
```

## 14. Luồng xử lý end-to-end

1. Giáo viên chọn lớp, topic mục tiêu và ràng buộc.
2. Paper Evidence và Quiz Evidence được chuẩn hóa.
3. Core Mastery Module cập nhật weighted BKT và confidence.
4. Sự kiện `StudentTopicMasteryUpdated` được phát.
5. Gap Diagnosis Engine truy ngược Knowledge Graph.
6. Topic `uncertain` quan trọng được gửi sang Diagnostic Assessment Planner.
7. Root-Cause Ranker xác định gap gốc.
8. Path Planner tạo và tối ưu remediation subgraph.
9. Hệ thống tạo Draft Path kèm giải thích.
10. Giáo viên phê duyệt, sửa hoặc override.
11. Học sinh thực hiện từng bước.
12. Kết quả luyện tập tạo evidence mới.
13. Tại checkpoint, hệ thống đánh giá lại mastery, lộ trình và dashboard lớp.

Path Planner chỉ tái lập kế hoạch khi kết thúc assessment, học sinh hoàn thành bước, gap được xác nhận, giáo viên đổi ràng buộc, đến checkpoint hoặc evidence quan trọng bị sửa.

## 15. Ngoại lệ

- **Không đủ evidence:** gắn `uncertain` và đề xuất quiz chẩn đoán.
- **Evidence mâu thuẫn:** giảm confidence, hiển thị source breakdown và đề xuất assessment xác nhận.
- **Graph có cycle:** trả `graph_validation_error` và không tạo lộ trình mới trên vùng lỗi.
- **Topic chưa có mastery:** gắn `unknown`, không mặc định là gap.
- **Không có đường tới mục tiêu:** trả `no_valid_prerequisite_path` và cảnh báo kiểm tra graph.
- **Không đủ thời gian:** trả `minimum_required_minutes`, `blocked_target_topics`, `recommended_core_steps` và `deferred_steps`.
- **Không có content:** giữ topic, gắn `content_unavailable` và cho phép giao hoạt động ngoài hệ thống.
- **Evidence bị sửa:** đánh dấu evidence cũ `superseded`, tính lại mastery và đánh dấu path `stale`.
- **Giáo viên override:** giữ override và cảnh báo nếu học sinh tiếp tục thất bại thay vì tự thêm lại topic.
- **Cập nhật đồng thời:** dùng `version` và optimistic concurrency để không ghi đè quyết định của giáo viên.

## 16. Kiểm thử và chỉ số đánh giá

Kiểm thử phải bao phủ:

- BKT với evidence đúng, sai, một phần, trùng lặp và bị thu hồi.
- Confidence khi evidence ít, cũ hoặc mâu thuẫn.
- Reverse traversal, cycle detection và root-cause diagnosis.
- Topological order và bảo toàn prerequisite.
- Required, excluded, locked topic và giới hạn thời gian.
- Class-wide gap, intervention group và help priority.
- Teacher override và version history.

Chỉ số đánh giá chính:

- BKT prediction accuracy, log loss và calibration.
- Tỷ lệ gap được giáo viên xác nhận.
- Mastery gain sau mỗi path step.
- Thời gian để đạt topic mục tiêu.
- Tỷ lệ học sinh quay lại theo kịp lớp.
- Tỷ lệ đề xuất được giáo viên phê duyệt không cần sửa.
- Độ chính xác của đề xuất dạy lại cả lớp.

## 17. Phạm vi phiên bản đầu

Phiên bản đầu gồm:

- Hai adapter evidence hiện có.
- Evidence calibration có cấu hình.
- Weighted BKT theo `student-topic`.
- Confidence score.
- Reverse graph traversal và cycle validation.
- Rule-based root-cause ranking.
- Remediation subgraph, topological sort và knapsack heuristic.
- Draft path, phê duyệt, override và versioning.
- Gom nhóm theo root-cause topic.
- Class-wide gap và help priority có giải thích.

Chưa cần trong phiên bản đầu:

- Học tham số BKT riêng cho từng câu hỏi.
- Integer Linear Programming.
- Tự động học evidence weight.
- Deep Knowledge Tracing.
- Tự động thay đổi Knowledge Graph.

## 18. Quyết định thiết kế đã chốt

- Lộ trình ở mức topic kèm mastery mục tiêu và điều kiện chuyển tiếp.
- Giáo viên đặt ràng buộc; hệ thống tự tạo và cập nhật trong phạm vi đó.
- Cho phép truy ngược prerequisite xuyên khối lớp.
- Kết hợp lịch sử và assessment chẩn đoán bổ sung.
- Mastery cập nhật theo evidence; cấu trúc path cập nhật tại checkpoint.
- Dùng BKT cho mastery, không dùng BKT như thuật toán tạo lộ trình.
- Dùng graph traversal, root-cause ranking, topological sort và constrained optimization để tạo path.
- Tách `confidence_score` khỏi `mastery_probability`.
- Giáo viên giữ quyền phê duyệt và override.
- Dashboard phải gom nhóm theo nhu cầu, chỉ ra ai cần hỗ trợ trước và gap nào cần dạy lại cả lớp.
