# HANDOFF — Knowledge Graph "Chắc Gốc" → tính năng Đề xuất lộ trình học

> Bàn giao 17/7/2026 từ repo `D:\Vinuni\hackathon\app` (nhánh `feature/command-system`, commit cuối `5977ed6`).
> Module này TỰ CHỨA: data + scripts + nguồn YCCĐ + trang review. Không phụ thuộc gì bên ngoài folder này ngoài `zod` (+ `@google/genai` nếu chạy script LLM).

## 1. Đề bài & ràng buộc BTC (đã xác nhận trực tiếp)

**Đề:** Adaptive tutor cho lớp học trình độ lệch — chẩn đoán lỗ hổng KIẾN THỨC GỐC RỄ (vd: sai toán lớp 7 vì hổng phân số lớp 5), sinh lộ trình luyện tập lấp đúng lỗ; dashboard giáo viên BẮT BUỘC (gom nhóm, giúp ai trước, lỗ hổng toàn lớp); nội dung bám CT GDPT 2018.

| Ràng buộc BTC | Trả lời |
|---|---|
| Data nội dung | KHÔNG cung cấp — đội tự dựng 100% (đã dựng xong graph, xem §3) |
| "Offline" | Chịu được mạng chập chờn/băng thông thấp; **tiêu chí chấm YÊU CẦU offline chạy thật** |
| Phạm vi demo | Phủ cả 3 cấp: tiểu học, THCS, THPT |
| Thiết bị chấm | Laptop cấu hình thấp |

**Hệ quả kiến trúc đã chốt (docs/SPEC.md):** vòng lặp học sinh (làm bài → chấm → chẩn đoán → lộ trình) phải **100% tất định trên dữ liệu tĩnh — KHÔNG gọi LLM lúc runtime**; LLM chỉ ở lớp "wow" degrade được (lời giảng cá nhân hóa, insight — có fallback tĩnh + timeout AbortController 3–5s). Không LLM local (máy yếu không kéo nổi).

## 2. Cách "đề xuất lộ trình học" được thiết kế (theo SPEC — phần liên quan nhất tới việc của bạn)

Toàn bộ là **thuật toán tất định trên graph**, không LLM:

1. **Chẩn đoán gốc rễ = đi NGƯỢC chiều mũi tên.** Học sinh sai câu ở node X → hỏi tiếp xuống các node trong `tienQuyet` của X (đi sâu dần về lớp dưới). **Luật ≥2 bằng chứng**: phải sai ≥2 câu cùng node mới kết luận node đó hổng (chống nhiễu do bất cẩn).
2. **Gốc rễ** = node hổng sâu nhất trên chuỗi (node hổng mà mọi tiên quyết của nó đều vững).
3. **Lộ trình học** = topo-sort các node hổng theo thứ tự tiên quyết: học node gốc rễ trước → lần lượt đi lên (node nào có tiên quyết đã vững/đã lấp thì được mở khóa). Rule-based, không cần tổng quát hóa quá mức.
4. **Cảnh báo chiều xuôi** = đi XUÔI mũi tên từ node gốc rễ, liệt kê hậu duệ ("không lấp quy đồng lớp 5 → vướng Phương trình lớp 8 → Đạo hàm lớp 11") — dùng cả node mờ.
5. Kịch bản demo chuẩn: học sinh lớp 7 sai "Phép tính với số hữu tỉ" → truy `l7-phep-tinh-so-huu-ti` → `l6-phep-tinh-phan-so` → **gốc rễ: `l5-quy-dong-phan-so`** (Quy đồng mẫu số, lớp 5). Chuỗi này đã được kiểm chứng tự động trong `check-graph.ts`.

## 3. Trạng thái knowledge graph (CHỐT bước 1 — 17/7)

`data/graph.json` — **38 node / 24 thật / 14 mờ / 64 cạnh**, mạch **Số & Đại số lớp 4→12**, nguồn: YCCĐ trích **nguyên văn** Thông tư 32/2018/TT-BGDĐT (bằng chứng "aligned CT 2018" khi pitch).

- **Node** = 1 "chủ đề con" trong bảng YCCĐ. Schema (xem `lib/schemas.ts` — `KnowledgeNodeSchema`): `{ id, ten, lop, cap (TH|THCS|THPT), mach, chuDe, chuDeCon, yccd[] (nguyên văn), tienQuyet[] (id các node phải học trước), mo (node mờ), x, y }`.
- **Chiều cạnh**: `tienQuyet` → node, tức A→B nghĩa là "học A trước mới học được B". Bất biến đã kiểm: DAG không chu trình, lớp(A) ≤ lớp(B).
- **Node mờ (`mo: true`)** = hiển thị trên bản đồ + có cạnh, nhưng CHƯA kích hoạt nội dung (không câu hỏi/lời giảng, engine không ra đề). Gồm toàn bộ lớp 9–12 + vài node khái niệm lớp 6–7. Kích hoạt = đổi cờ + sinh câu hỏi.
- Cạnh gồm: xương sống soạn tay + 9 cạnh Gemini đề xuất ĐÃ ĐƯỢC NGƯỜI DUYỆT (`data/edges-approved.json`). **Chuỗi demo soạn tay 100%, không nhận từ LLM** — nguyên tắc đã chốt sau vòng phản biện 4 vai.

## 4. Cách chạy (trong folder `knowledge-graph/`)

Cần: Node.js + `npm i zod` (thêm `@google/genai` nếu chạy suggest-edges). Chạy từ **chính folder này** (cwd = `knowledge-graph/`):

```powershell
$env:KNOWLEDGE_BASE_DIR = "knowledge_base"   # nguồn YCCĐ nằm trong module
npx --yes tsx scripts/build-graph.ts          # parse YCCĐ + whitelist + merge cạnh đã duyệt -> data/graph.json
npx --yes tsx scripts/check-graph.ts          # 17 assert (DAG, chuỗi demo, YCCĐ sạch...) — PHẢI 17 PASS
npx --yes tsx scripts/suggest-edges.ts        # (tùy chọn, cần GEMINI_API_KEY trong .env.local) đề xuất cạnh mới -> data/edges-suggested.json
```

**Quy trình sửa graph (không bao giờ sửa tay graph.json):** sửa whitelist/cạnh trong `scripts/build-graph.ts` (hoặc duyệt cạnh đề xuất → copy vào `data/edges-approved.json`) → chạy lại build + check.

**Xem/duyệt bằng mắt:** mở `docs/graph-review.html` bằng trình duyệt (tự chứa, offline): bố cục dọc nền-tảng-ở-dưới, bấm node = focus chuỗi liên quan + YCCĐ; tab "Nội dung node" để rà; tab duyệt cạnh sinh sẵn JSON approved. Lưu ý: file HTML nhúng cứng data — sau khi graph đổi phải tái tạo (template gốc ở repo cũ, hoặc cứ xem trực tiếp `data/graph.json`).

## 5. Quyết định & bẫy quan trọng (rút từ vòng phản biện 4 subagent PO/PM/AI-Eng/DevOps)

1. **Đường găng là NỘI DUNG, không phải code** — 4/4 vai đồng thuận. Vì thế mới có khái niệm node mờ và trần số node.
2. **Schema-valid ≠ toán đúng.** Mọi thứ LLM sinh chạm tới toán phải có verifier tất định (code tính lại đáp án) + người rà. Cạnh LLM đề xuất phải: enum node-id đóng (không bịa được node) + trích YCCĐ làm căn cứ + người duyệt 100%.
3. **Bước tiếp theo theo PLAN cũ** (docs/PLAN.md — nếu team muốn tham chiếu): bước 2 = ngân hàng ~95–145 câu (4–6 câu/node thật, trường `loSai` gắn mỗi phương án nhiễu với đúng misconception — đây là thứ làm chẩn đoán thông minh hơn đúng/sai); bước 3 = engine tất định (`lib/engine.ts`); các bước 4–8 UI + tổng duyệt offline.
4. Demo 1 laptop 2 tab (học sinh + giáo viên), state = file JSON ghi atomic, chạy `next build && next start`, tắt wifi đúng 1 lần trong kịch bản — chi tiết ở `docs/SPEC.md` mục 4–5 và mục Kiến trúc.

## 6. Danh mục file bàn giao

| Đường dẫn | Là gì |
|---|---|
| `data/graph.json` | Knowledge graph CHỐT (38 node/64 cạnh) — tài sản chính |
| `data/edges-approved.json` | 9 cạnh Gemini đề xuất đã người duyệt (build-graph tự merge) |
| `data/edges-suggested.json` | Bản đề xuất gốc (đã merge hết, giữ làm provenance) |
| `scripts/build-graph.ts` | Parser tất định YCCĐ → graph + whitelist node + cạnh soạn tay |
| `scripts/check-graph.ts` | 17 assert kiểm chứng — chạy sau MỌI thay đổi data |
| `scripts/suggest-edges.ts` | LLM đề xuất cạnh (enum đóng, có guard), output chờ người duyệt |
| `lib/schemas.ts` | Zod schemas: KnowledgeNode/Edge/Question/Student/State (+ schemas cũ của kit, bỏ qua) |
| `lib/llm.ts`, `lib/ollama.ts` | Seam LLM của kit (chỉ suggest-edges cần; extractJSON/chatStream...) |
| `docs/SPEC.md` | Nguồn chân lý sản phẩm: golden path, MVP chốt sau phản biện, kiến trúc |
| `docs/PLAN.md` | Kế hoạch 8 bước (bước 1 ĐÃ XONG, dừng theo yêu cầu) |
| `docs/graph-review.html` | Trang duyệt graph offline (bố cục dọc, focus mode) |
| `knowledge_base/lop-*/toan/README.md` | YCCĐ nguyên văn 12 lớp môn Toán (nguồn parse) |
