# PLAN — Chắc Gốc (8 bước, demo-critical trước)

> Nguồn: `docs/SPEC.md` (Golden path + MVP chốt + Kiến trúc). Mốc đóng băng: graph xong **giờ 8** (hết bước 1) · nội dung xong **giờ 24** (hết bước 2) · feature freeze **giờ 32** (hết bước 6) · 8h cuối = bước 8.
> Lưu ý: bước cuối KHÔNG phải Vercel — SPEC mục KHÔNG LÀM đã cắt Vercel khỏi đường demo (môi trường chấm là localhost + wifi tắt). Vercel là [NICE] sau khi nộp.

## Bước 1 — [MUST] Knowledge graph: parse + cạnh tiên quyết + kiểm chứng
- **Files:** `lib/schemas.ts` (viết lại: `NodeSchema`, `EdgeSuggestion`, `QuestionSchema`, `StudentSchema`, `StateSchema`); `scripts/build-graph.ts` (parse `d:\Vinuni\hackathon\knowledge_base\lop-*/toan/README.md` → node mạch Số & Đại số lớp 4–10, xử lý escape/rowspan/tên mạch đổi theo cấp, vá tay 3 chỗ `![][imageN]`); `scripts/suggest-edges.ts` (đề xuất cạnh, schema enum node-id đóng + trích YCCĐ, **chuỗi demo L7→L6→L5 soạn tay không qua LLM**); `data/graph.json` (~20–25 node hiển thị, 12–15 node thật, tọa độ x,y viết cứng theo cột khối lớp); `scripts/check-graph.ts`.
- **Dùng:** `extractJSON` (model `smart`, build-time, chạy ~1 lần). Không route, không package mới.
- **Test bằng mắt:** `npx tsx scripts/check-graph.ts` in PASS: DAG không chu trình · mọi cạnh trỏ node tồn tại · node thật lớp ≥5 có ≥1 tiên quyết · tồn tại đường L7-số-hữu-tỉ → L5-phân-số → L4-phân-số. Mở `data/graph.json` rà cạnh bằng mắt (người duyệt 100%).

## Bước 2 — [MUST] Ngân hàng câu hỏi: sinh + verifier tất định + người rà
- **Files:** `scripts/gen-questions.ts` (sinh 4–6 câu/node × 24 node thật, mỗi câu có `loSai` cho từng nhiễu; **verifier TS tính lại đáp án + loại nhiễu trùng key trước khi ghi**); `data/questions.json` (~95–145 câu, +câu dự phòng cho 3 node chuỗi demo; đã chốt graph 38 node/24 thật sau rà soát cuối 17/7).
- **Dùng:** `extractJSON` (model `fast`, think HIGH, temperature 0, build-time).
- **Test bằng mắt:** chạy script → console in "X câu sinh, Y loại bởi verifier, Z còn lại ≥ 60"; mở `data/questions.json` rà 100% bằng mắt (đáp án toán phải đúng tuyệt đối — việc của người).

## Bước 3 — [MUST] Engine tất định + store + seed + 2 route dữ liệu
- **Files:** `lib/engine.ts` (chọn câu thích ứng đi xuống · luật ≥2 bằng chứng · chẩn đoán truy graph · cảnh báo chiều xuôi · lộ trình rule-based · gom nhóm ngưỡng hóa · xếp ưu tiên); `lib/store.ts` (đọc/ghi `data/state.json` atomic, tuần tự hóa); `scripts/gen-students.ts` → `data/students.json` (40 em, 3 nhóm mastery rõ); `app/api/answer/route.ts`; `app/api/state/route.ts`; `scripts/check-engine.ts`.
- **Dùng:** TS thuần, không LLM. Route mới `/api/answer`, `/api/state`.
- **Test bằng mắt:** `npx tsx scripts/check-engine.ts` PASS kịch bản Minh (sai câu L7 đúng distractor → hỏi xuống L6, L5 → kết luận "quy đồng mẫu số L5") + gom 40 em ra đúng 3 nhóm; `curl localhost:3000/api/state` trả JSON lớp 7A.

## Bước 4 — [MUST] Trang học sinh: quiz + màn chẩn đoán wow + bản đồ SVG + lộ trình
- **Files:** `app/hoc-sinh/page.tsx`; `components/KnowledgeMap.tsx` (SVG, tọa độ từ graph.json, tô màu chuỗi truy ngược, node mờ L8–10); `components/Quiz.tsx`; `components/LoTrinh.tsx`.
- **Dùng:** `POST /api/answer`, `GET /api/state`. UI tiếng Việt.
- **Test bằng mắt:** mở `http://localhost:3000/hoc-sinh`, làm 8 câu theo kịch bản (cố tình sai câu L7) → thấy bản đồ tô màu chuỗi truy ngược + "Gốc rễ: Quy đồng mẫu số — Phân số (lớp 5)" + cảnh báo "Không lấp → vướng Phương trình L8, Hàm số L10" + lộ trình; luyện bài 1 đúng → node đổi màu ngay.

## Bước 5 — [MUST] "Giảng lại cho em": cache → live → fallback offline
- **Files:** `app/api/explain/route.ts` (thứ tự: cache hit → `chatStream` có AbortController 3–5s + timeout theo chunk → fallback tĩnh có nhãn; ghi cache theo (node, phương án sai)); `scripts/gen-explanations.ts` → `data/explanations.json` (lời giảng tĩnh 12–15 node + insight GV kiểm chữ số); nút "Giảng lại cho em" trong `app/hoc-sinh/page.tsx`.
- **Dùng:** `chatStream` (model `fast`; prompt = diễn giải lời giải đã duyệt + distractor em chọn, CẤM tự tính ví dụ mới); `extractJSON` (build-time cho explanations).
- **Test bằng mắt:** có mạng: bấm nút → lời giảng stream ra từng chữ, nhắc đúng phương án sai đã chọn. **Tắt wifi**: bấm lại → trong <5s hiện bản tĩnh nhãn "bản offline", không đứng hình.

## Bước 6 — [MUST] Dashboard giáo viên + giao bài
- **Files:** `app/giao-vien/page.tsx` (nút "Giao bài chẩn đoán: Số hữu tỉ" · 3 nhóm theo nhu cầu · danh sách "giúp ai trước hôm nay" · biểu đồ lỗ hổng toàn lớp SVG thuần theo pattern `lib/chart.ts` · 1 dòng insight từ `data/explanations.json` có nhãn nguồn).
- **Dùng:** `GET /api/state`, `POST /api/state` (giao bài). Không LLM runtime.
- **Test bằng mắt:** mở `http://localhost:3000/giao-vien` thấy 3 nhóm + biểu đồ "12/40 em hổng Phân số (lớp 5)" + insight; ở tab học sinh nộp bài của Minh → quay lại tab GV thấy số liệu ĐÃ cập nhật (kể cả khi offline).

## Bước 7 — [NICE] Trang chọn vai + polish demo
- **Files:** `app/page.tsx` (2 nút: "Tôi là Học sinh" / "Tôi là Giáo viên"); loading/error state cho `/api/explain`; badge trạng thái mạng (online/offline) ở header; tinh chỉnh chữ to rõ cho máy chiếu.
- **Dùng:** không thêm gì.
- **Test bằng mắt:** mở `http://localhost:3000` → 2 nút vai; rút wifi thấy badge chuyển "Ngoại tuyến" mà app vẫn thao tác bình thường.

## Bước 8 — [MUST] Tổng duyệt đúng môi trường chấm (thay cho Vercel — theo SPEC)
- **Files:** không file mới (sửa bug phát sinh); `data/explain-cache.json` được làm ấm.
- **Dùng:** `npm run build` (phải xanh) → `next start`.
- **Test bằng mắt (Definition of Done của DevOps):** trên đúng laptop demo: chạy trọn golden path 7 bước với **wifi tắt từ đầu đến cuối** → mọi màn hình sống; kill process giữa chừng → `next start` lại → dashboard còn nguyên dữ liệu; mở DevTools Network lúc offline → 0 request lọt ra ngoài (font/CDN); bấm "Giảng lại" khi có mạng 1 lần để quay video dự phòng (điện thoại + USB).
- **[NICE] sau khi nộp:** deploy Vercel bản "xem cho biết" (state chuyển read-only/in-memory) — ngoài đường găng, không làm trước bước 8.
