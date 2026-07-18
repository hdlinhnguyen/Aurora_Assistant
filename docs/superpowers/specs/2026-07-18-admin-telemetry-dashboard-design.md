# Thiết kế dashboard Telemetry Metrics & EDA cho Admin

## 1. Mục tiêu

Xây dựng một khu vực phân tích ngay trên trang admin để quản trị viên theo dõi chất lượng học tập và độ ổn định của hệ thống từ dữ liệu telemetry đã thu thập. Dashboard phải trả lời nhanh ba nhóm câu hỏi:

- Người học đang sử dụng hệ thống như thế nào: thời gian học chủ động, số phiên học, thời gian giải câu, độ chính xác, số gợi ý và tỷ lệ bỏ dở.
- Chất lượng hệ thống thay đổi ra sao theo thời gian: độ trễ API, tỷ lệ lỗi, số lần chuyển trạng thái mastery và xu hướng của các chỉ số chính.
- Dữ liệu telemetry có đáng tin để phân tích hay không: lifecycle bị thiếu, giá trị ngoại lệ, phân phối dữ liệu và khác biệt theo topic hoặc nguồn phát sinh sự kiện.

Phiên bản đầu ưu tiên tốc độ triển khai và khả năng giải thích. Dữ liệu được tổng hợp trực tiếp từ `telemetry_events` và `question_attempt_facts`; không tạo bảng aggregate, pipeline ETL hoặc số liệu giả.

## 2. Phạm vi

Phiên bản đầu bao gồm:

- Bộ lọc thời gian `7d`, `30d`, `90d`; mặc định `30d`.
- KPI tổng hợp cho khoảng thời gian hiện tại và mức thay đổi so với khoảng liền trước có cùng độ dài.
- Chuỗi thời gian theo ngày cho các metric chính.
- EDA về chất lượng dữ liệu, phân phối thời gian giải, phân phối số gợi ý, topic và source.
- Trạng thái loading, lỗi có thể thử lại và trạng thái chưa đủ dữ liệu.
- API chỉ dành cho admin và chỉ trả dữ liệu aggregate.

Ngoài phạm vi phiên bản đầu:

- Dashboard theo từng học sinh hoặc trả actor ID.
- Truy vấn raw event/property từ giao diện.
- Bộ lọc tùy ý theo ngày, lớp, môn hoặc giáo viên.
- Scheduled ETL, materialized view, data warehouse hoặc cảnh báo tự động.
- Dự đoán, phát hiện bất thường bằng mô hình ML hoặc kiểm định thống kê nâng cao.

## 3. Quyết định kiến trúc

### 3.1. Phương án được chọn

Backend chạy các truy vấn SQL aggregate có tham số thời gian trực tiếp trên PostgreSQL. Đây là phương án phù hợp nhất cho MVP vì hai bảng nguồn đã tồn tại, các khoảng thời gian bị giới hạn và admin cần dữ liệu gần thời gian thực.

Service phân tích được tách khỏi handler quản trị hiện có:

```text
backend/internal/adminmetrics/domain.go
backend/internal/adminmetrics/service.go
backend/internal/adminmetrics/service_test.go
backend/internal/handler/admin_metrics.go
```

Handler chỉ xác thực query, gọi service và ánh xạ lỗi HTTP. Service sở hữu định nghĩa khoảng thời gian, truy vấn aggregate, phép tính so sánh và response domain. Cách tách này tránh làm `admin.go` lớn thêm và cho phép kiểm thử SQL độc lập.

### 3.2. Route và phân quyền

Route mới:

```http
GET /api/admin/telemetry-dashboard?range=30d
```

Route được đăng ký dưới `adminGroup`, vì vậy tiếp tục sử dụng `Protected` và `RequireRole("admin")` hiện có. Giá trị `range` chỉ nhận `7d`, `30d`, `90d`; giá trị khác trả `400` với lỗi ổn định `invalid telemetry range`.

### 3.3. Mốc thời gian

Mọi phép tính dùng UTC:

```text
current window  = [now - range, now)
previous window = [now - 2 * range, now - range)
```

Trend được nhóm theo ngày UTC. Khi `hasData=true`, API trả đủ ngày trong khoảng đã chọn. Metric dạng count không có dữ liệu trong ngày nhận giá trị `0`; metric dạng rate/average không có mẫu số nhận `null`, không nhận `0`, để tránh diễn giải sai.

Với `question_attempt_facts`, thời điểm phân tích của một attempt là `submitted_at` nếu có, nếu không là `presented_at`. Fact thiếu cả hai timestamp không tham gia KPI/trend nhưng được phản ánh trong quality flags.

## 4. Định nghĩa metric

### 4.1. Học tập

| Metric | Định nghĩa |
| --- | --- |
| `activeLearningMinutes` | `SUM(active_time_ms) / 60000` trên attempt trong khoảng thời gian. |
| `sessions` | `COUNT(DISTINCT session_id)` trên fact; session null không được tính. |
| `questionsAnswered` | Số fact có `submitted_at IS NOT NULL`. |
| `accuracyRate` | `AVG(is_correct::int)` trên fact có `is_correct IS NOT NULL`. |
| `avgSolveTimeSeconds` | `AVG(active_time_ms) / 1000` trên fact đã submit và `active_time_ms > 0`. |
| `hintsPerQuestion` | `SUM(hint_count) / COUNT(*)` trên các fact trong khoảng thời gian. |
| `completionRate` | Số fact đã submit / số fact đã được trình bày. |
| `abandonmentRate` | Số fact có `abandoned = true` và chưa submit / số fact đã được trình bày. Attempt đang mở không thuộc completion hoặc abandonment. |
| `masteryTransitions` | Số event `mastery_status_changed`. Không suy diễn tốt/xấu ở KPI; cặp `status_before -> status_after` được trình bày trong EDA. |

Tỷ lệ có mẫu số bằng `0` được trả về `null`.

### 4.2. Độ ổn định API

Các metric API lấy từ event `api_request_completed`:

| Metric | Định nghĩa |
| --- | --- |
| `apiRequests` | Số event `api_request_completed`. |
| `apiErrorRate` | Số event có `status_class IN ('4xx', '5xx', 'network_error')` / tổng API event. |
| `apiP95LatencyMs` | `percentile_cont(0.95)` trên `properties.duration_ms` hợp lệ và không âm. |

Giá trị JSONB phải được kiểm tra dạng số trước khi cast. Event sai kiểu không làm endpoint lỗi; chúng bị loại khỏi phép tính latency và được tính vào quality flag `invalid_duration`.

### 4.3. So sánh kỳ trước

Mỗi KPI hỗ trợ so sánh có ba trường:

```json
{
  "current": 48.2,
  "previous": 51.7,
  "deltaPercent": -6.77
}
```

`deltaPercent = (current - previous) / abs(previous) * 100`. Nếu current hoặc previous là `null`, hoặc previous bằng `0`, `deltaPercent` là `null`. UI hiển thị tăng/giảm nhưng không mặc định coi mọi giá trị tăng là tốt; ví dụ accuracy tăng là tích cực trong khi API error tăng là tiêu cực.

## 5. Hợp đồng API

Response thành công:

```json
{
  "range": "30d",
  "generatedAt": "2026-07-18T10:00:00Z",
  "hasData": true,
  "summary": {
    "activeLearningMinutes": 1240.5,
    "sessions": 385,
    "questionsAnswered": 924,
    "accuracyRate": 0.73,
    "avgSolveTimeSeconds": 48.2,
    "hintsPerQuestion": 0.64,
    "completionRate": 0.91,
    "abandonmentRate": 0.08,
    "masteryTransitions": 74,
    "apiRequests": 3600,
    "apiErrorRate": 0.012,
    "apiP95LatencyMs": 420
  },
  "comparison": {
    "accuracyRate": {
      "current": 0.73,
      "previous": 0.69,
      "deltaPercent": 5.8
    }
  },
  "trends": [
    {
      "date": "2026-07-18",
      "activeLearningMinutes": 42.5,
      "sessions": 18,
      "questionsAnswered": 31,
      "accuracyRate": 0.76,
      "avgSolveTimeSeconds": 44.1,
      "hintsPerQuestion": 0.5,
      "completionRate": 0.93,
      "abandonmentRate": 0.06,
      "masteryTransitions": 3,
      "apiRequests": 140,
      "apiErrorRate": 0.01,
      "apiP95LatencyMs": 390
    }
  ],
  "eda": {
    "missingPresented": 3,
    "missingGrade": 5,
    "invalidDuration": 1,
    "outlierAttemptCount": 7,
    "outlierThresholdSeconds": 300,
    "p50SolveTimeSeconds": 35,
    "p95SolveTimeSeconds": 180,
    "solveTimeDistribution": [
      { "bucket": "0-15s", "count": 20 },
      { "bucket": "15-30s", "count": 38 }
    ],
    "hintDistribution": [
      { "bucket": "0", "count": 70 },
      { "bucket": "1", "count": 20 },
      { "bucket": "2", "count": 8 },
      { "bucket": "3+", "count": 2 }
    ],
    "topicBreakdown": [
      {
        "topicId": "topic-id",
        "topicName": "Phân số",
        "attempts": 42,
        "accuracyRate": 0.68,
        "avgSolveTimeSeconds": 57,
        "hintsPerQuestion": 0.8
      }
    ],
    "sourceBreakdown": [
      { "source": "frontend", "events": 1200 },
      { "source": "go_backend", "events": 900 }
    ],
    "masteryTransitionBreakdown": [
      { "from": "learning", "to": "mastered", "count": 21 }
    ],
    "qualityFlags": [
      { "flag": "missing_grade", "count": 5 }
    ]
  }
}
```

`comparison` chứa đủ các key của `summary`; ví dụ rút gọn ở trên chỉ để tài liệu dễ đọc. Response tuyệt đối không chứa `actor_id`, `session_id`, `attempt_id`, raw `properties`, đáp án hoặc nội dung người dùng.

`hasData` là `true` khi khoảng hiện tại có ít nhất một learning fact hoặc một event telemetry thuộc nhóm metric. Khi `hasData=false`, `summary` vẫn giữ đầy đủ shape với count bằng `0`, rate/average bằng `null`, còn `trends` và các breakdown EDA là mảng rỗng. Frontend hiển thị “Chưa đủ dữ liệu” thay vì biểu đồ hoặc số giả.

## 6. Thiết kế truy vấn và EDA

### 6.1. Query boundaries

Service chạy các query có trách nhiệm riêng:

1. Learning summary cho current và previous window.
2. API/mastery summary cho current và previous window.
3. Daily learning trend.
4. Daily API/mastery trend.
5. EDA distributions, percentiles và quality flags.
6. Topic/source/mastery transition breakdown.

Tất cả time bounds được truyền bằng bind parameters. Không nối chuỗi từ query parameter vào SQL. Các query độc lập có thể chạy tuần tự trong MVP để giữ code đơn giản; tối ưu song song hoặc cache chỉ thực hiện sau khi đo được bottleneck.

### 6.2. Timing EDA

Chỉ attempt đã submit với `active_time_ms > 0` được dùng cho timing EDA.

- P50 và P95 dùng `percentile_cont`.
- Outlier MVP có ngưỡng cố định `300 giây`, giúp admin diễn giải nhất quán giữa các kỳ.
- Bucket cố định: `0-15s`, `15-30s`, `30-60s`, `60-120s`, `120-300s`, `300s+`.

### 6.3. Hint EDA

Bucket số hint: `0`, `1`, `2`, `3+`. Đây là count attempt, không phải count event `hint_requested`, để tránh double-count do retry hoặc lifecycle chưa hoàn chỉnh.

### 6.4. Data quality

- `missing_presented`: fact có submit hoặc abandoned nhưng `presented_at IS NULL`.
- `missing_grade`: fact có `submitted_at IS NOT NULL` nhưng `is_correct IS NULL`.
- `missing_timestamp`: fact thiếu cả `presented_at` và `submitted_at`.
- `invalid_duration`: API event có `duration_ms` thiếu, sai kiểu hoặc âm.
- Các flag trong `quality_flags_json` được bung bằng JSONB và cộng count; flag trùng với các rule trên chỉ xuất hiện một lần trong response sau khi service gộp theo tên.

### 6.5. Breakdown

- Topic breakdown chỉ trả 20 topic có nhiều attempt nhất, sắp theo `attempts DESC`, rồi `topicId ASC` để ổn định. `topicName` được lấy bằng left join với `nodes`; nếu không tìm thấy, frontend dùng `topicId`.
- Source breakdown đếm event theo `source` trong current window.
- Mastery transition breakdown nhóm theo `status_before`, `status_after`, giới hạn 20 cặp nhiều nhất.

## 7. Thiết kế frontend

### 7.1. Cấu trúc

```text
frontend/src/app/admin/components/TelemetryDashboard.tsx
frontend/src/lib/admin-metrics.ts
```

`admin-metrics.ts` chứa type, hàm gọi API và formatter thuần. `TelemetryDashboard.tsx` sở hữu state range/loading/error/data và các khối hiển thị. Trang `frontend/src/app/admin/page.tsx` đặt component thành section “Metrics & EDA” bên dưới phần tổng quan/trạng thái hệ thống hiện có, giữ nguyên visual language và không thêm một lớp điều hướng mới.

### 7.2. Layout

Theo thứ tự từ trên xuống:

1. Header “Phân tích hệ thống”, nút `7 ngày`, `30 ngày`, `90 ngày`, nút refresh và thời điểm tạo dữ liệu.
2. KPI cards, chia thành nhóm “Học tập” và “Hệ thống”. Mỗi card hiển thị current value và delta kỳ trước khi có thể tính.
3. Trend chart chính. Admin chọn một metric; chart hiển thị đúng một series để các đơn vị khác nhau không bị đặt chung một trục.
4. EDA timing gồm P50, P95, outlier và histogram bucket.
5. Data quality cards và danh sách quality flags.
6. Hint distribution, source distribution và mastery transition breakdown.
7. Bảng topic có thể sắp xếp phía client theo attempts, accuracy, solve time hoặc hints.

Trên mobile, KPI chuyển thành một cột hoặc hai cột tùy chiều rộng; chart cho phép cuộn ngang tối thiểu thay vì ép nhãn ngày chồng lên nhau; bảng topic nằm trong container scroll ngang.

### 7.3. Trạng thái UI

- Loading lần đầu: skeleton giữ đúng kích thước card/chart để tránh layout shift.
- Đổi range: giữ dữ liệu cũ ở trạng thái dimmed trong khi tải dữ liệu mới.
- Error: thông báo ngắn, không lộ nội dung lỗi backend, có nút “Thử lại”.
- Empty: hiển thị “Chưa đủ dữ liệu trong khoảng thời gian này” và không render chart giả.
- Giá trị null: hiển thị `—`, không hiển thị `0`.
- Rate định dạng phần trăm một chữ số thập phân; duration chọn ms hoặc giây theo metric; count dùng locale `vi-VN`.

## 8. Bảo mật và quyền riêng tư

- Middleware admin là lớp bảo vệ bắt buộc; không tạo route public tương đương.
- API response dùng struct định kiểu rõ ràng, không marshal trực tiếp model GORM hoặc map raw từ database.
- SQL chỉ select aggregate và các dimension cho phép: ngày, topic ID/name, source, mastery status pair và quality flag name.
- Không log response dashboard, raw properties hoặc truy vấn kèm dữ liệu định danh.
- Topic ID và source là dimension hệ thống, không phải định danh người dùng. Mọi breakdown có giới hạn số dòng.

## 9. Xử lý lỗi

- Range không hợp lệ: `400`.
- Lỗi database: `500` với message chung; chi tiết chỉ được ghi ở server log.
- Một query lỗi làm toàn endpoint lỗi; không trả response nửa vời vì admin có thể so sánh các số không cùng snapshot.
- `generatedAt` lấy từ clock của service và cùng một `now` được dùng cho toàn bộ query trong request.
- JSONB có dữ liệu không hợp lệ bị bỏ khỏi metric liên quan và được phản ánh trong quality flags, không gây panic hoặc cast error.

## 10. Kiểm thử

### 10.1. Backend

- Service tests trên PostgreSQL schema cô lập cho current/previous windows, UTC day grouping, null denominator và percentile.
- Test lifecycle thiếu presented/grade, invalid duration, timing outlier và JSONB quality flag merge.
- Test giới hạn/sắp xếp topic breakdown.
- Handler tests cho default `30d`, đủ ba range hợp lệ, range sai, lỗi service và admin authorization qua route integration.
- Privacy contract test marshal response và khẳng định không có `actor`, `session`, `attempt`, `properties` hoặc selected option.

### 10.2. Frontend

- Vitest cho gọi API mặc định `30d` và đổi `7d`/`90d`.
- Test KPI formatting, delta direction và null value.
- Test loading, retry, empty data và API error.
- Test metric selector đổi series chart.
- Test topic sorting không thay đổi response gốc.

### 10.3. Verification

Trước khi hoàn tất implementation:

```text
backend:  go test ./...
backend:  go vet ./...
frontend: npm test -- --run
frontend: TypeScript noEmit
frontend: Next production build
```

Dashboard cũng được kiểm tra trực quan trên desktop và mobile bằng dữ liệu telemetry thật hoặc fixture test nằm trong test suite; production UI không chứa fallback mock.

## 11. Hiệu năng và hướng mở rộng

MVP không thêm cache. Các query phải lọc thời gian trước khi group và tận dụng index `telemetry_events(event_name, occurred_at)` hiện có. Query facts dùng timestamp hiệu lực `COALESCE(submitted_at, presented_at)`; trong implementation cần kiểm tra `EXPLAIN` trên dữ liệu đại diện. Nếu query facts vượt 500 ms ở range `90d`, thêm expression index tương ứng trong migration thay vì cache response thiếu kiểm soát.

Khi dữ liệu lớn hơn, lộ trình mở rộng là:

1. Bổ sung index dựa trên `EXPLAIN ANALYZE`.
2. Tạo daily aggregate table hoặc materialized view.
3. Refresh aggregate theo background job và lưu watermark.
4. Thêm bộ lọc lớp/môn với kiểm soát cardinality.

Các bước này không thuộc MVP và không làm thay đổi API contract chính.

## 12. Tiêu chí hoàn thành

- Admin chọn được `7d`, `30d`, `90d` và xem dữ liệu aggregate tương ứng.
- KPI và trend dùng cùng định nghĩa, cùng UTC window và có so sánh kỳ trước.
- EDA hiển thị timing, hints, data quality, topic, source và mastery transition.
- Không có raw telemetry property hoặc định danh người dùng trong response.
- Không có dữ liệu thì UI nói rõ chưa đủ dữ liệu; không phát sinh mock metric.
- Endpoint từ chối role không phải admin.
- Các test backend/frontend và build hiện có đều vượt qua.
