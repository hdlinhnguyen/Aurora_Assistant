# 🎨 Animation Creation Module

Thư mục `animation_creation` đảm nhiệm vai trò sinh ra các hoạt ảnh (animation) và video trực quan (visualization) cho Aurora Assistant. Khi học sinh không hiểu bài (ở các cấp độ gợi ý Bậc 2 và Bậc 3), module này kết hợp với AI Services và thư viện **Manim** để tự động tạo ra video giải thích các nguyên lý nền tảng Toán học (First-principles).

## 📁 Cấu trúc thư mục

```text
animation_creation/
├── constants.py
├── custom_config.yml
├── demo_ai_guidance.py
├── example_scenes.py
├── main.py
├── manim_installation.md  (Tài liệu HD cài đặt Manim)
├── manim_configuration.md (Tài liệu HD cấu hình Manim CLI)
└── public/
    ├── index.html
    └── media/ (Tự động sinh ra khi render video)
```

## 📝 Vai trò của các file

- **`constants.py`**: Lưu trữ các hằng số tiêu chuẩn của Manim (như tỷ lệ màn hình `ASPECT_RATIO`, độ phân giải `DEFAULT_PIXEL_HEIGHT`, các vector định hướng `UP, DOWN`, bảng màu chuẩn, v.v.). File này giúp các scenes đồng nhất về hệ quy chiếu và dễ dàng tùy biến UI video mà không phụ thuộc cứng vào core library.
- **`custom_config.yml`**: File cấu hình trung tâm. Quản lý việc định tuyến thư mục xuất video (`media`), quy định compiler biên dịch Toán học LaTeX (TeX), tỷ lệ khung hình (fps), độ phân giải (resolutions), và các cấu hình style mặc định.
- **`example_scenes.py`**: Chứa mã nguồn Python định nghĩa các kịch bản video (Scenes) dùng Manim để vẽ. Ví dụ: `TexTransformExample` (minh họa biến đổi phương trình), `CoordinateSystemExample` (vẽ đồ thị). Backend sẽ dựa vào file này để render video tương ứng với kiến thức học sinh đang vướng mắc.
- **`main.py`**: Máy chủ Backend (FastAPI) cục bộ cho module. Cung cấp API `/api/hint` giao tiếp trực tiếp với Core AI Services. Khi AI quyết định cần render video (từ Bậc 2 trở lên), `main.py` sẽ tự động kích hoạt tiến trình chạy ngầm lệnh `manim` (qua `subprocess`), xuất video MP4 vào thư mục `public/media/` và đính URL trả về cho Frontend.
- **`demo_ai_guidance.py`**: Script CLI chạy trên Terminal để kiểm thử logic Backend AI mà không cần mở trình duyệt. Script mô phỏng luồng hỏi đáp Socratic, in ra Console câu trả lời của AI và log ra hệ thống sẽ trigger loại Visualization nào (SVG hay Manim Video) ứng với từng Level.
- **`public/index.html`**: Giao diện UI test độc lập. Chứa logic phía Client: Ở Bậc 1, nó hiển thị trực tiếp SVG Animation (cắt bánh Pizza). Ở Bậc 2 trở lên, nó sẽ đọc `video_url` từ Backend và nhúng thẻ `<video>` để trình chiếu file MP4 Manim vừa render.
- **`manim_installation.md` & `manim_configuration.md`**: Bộ tài liệu chuẩn hóa về quy trình cài đặt các công cụ nền tảng cho ManimGL và các tham số dòng lệnh CLI cấu hình render.

## ⚙️ Hướng dẫn Setup và Khởi chạy

### 1. Cài đặt System Dependencies (Rất Quan Trọng)

Manim yêu cầu các thư viện hệ thống (C libraries) để vẽ hình và render video. Bạn cần cài đặt chúng trước. *(Tham khảo chi tiết tại [manim_installation.md](manim_installation.md))*

**Trên macOS (Sử dụng Homebrew):**
```bash
brew install ffmpeg pango pkg-config cairo
```

### 2. Cài đặt Python Packages

Kích hoạt môi trường và cài đặt thư viện Manim:
```bash
source .venv/bin/activate
pip install manim
```

### 3. Kiểm thử luồng Logic (CLI)

Để xem AI sinh ra Hint + Visualization (Text simulation) qua Terminal:
```bash
source .venv/bin/activate
python animation_creation/demo_ai_guidance.py
```

### 4. Triển khai API Server & Frontend Test

Khởi động máy chủ backend của module để nhận request và sinh video thực tế:
```bash
source .venv/bin/activate
python animation_creation/main.py
```
Máy chủ sẽ chạy tại `http://localhost:8089`. Giao diện test tĩnh sẽ nằm tại root (`/`).

### 5. Tích hợp với nền tảng Frontend chính
Khi Frontend Web (Next.js/React) gọi API từ Backend, nếu `level >= 2`, Response payload sẽ tự động chứa thuộc tính `video_url`. Frontend chỉ việc đưa URL này vào Video Player Component để hiển thị cho học sinh.

### 6. Tích hợp Animation Module vào Core Backend (Production)
Để chạy chung module này trên server backend chính thay vì chạy độc lập ở `animation_creation/main.py`, hãy thực hiện các bước sau:

**Bước 1: Chuyển giao Files**
- Copy/Move các file `example_scenes.py`, `constants.py`, và `custom_config.yml` vào chung thư mục chứa core API router của Backend.
- Đảm bảo thư mục lưu file tĩnh `public/media` được khởi tạo trong Backend.

**Bước 2: Cài đặt thư viện trên Backend**
- Thêm `manim` (hoặc `manimgl`) vào file `requirements.txt` của Backend.
- Trên server production (Ubuntu/Linux), cần cài đặt thêm: `sudo apt install libcairo2-dev libpango1.0-dev ffmpeg`.

**Bước 3: Tích hợp Logic Sinh Video vào Core API**
Trong router xử lý Hint của hệ thống (ví dụ: `POST /api/hint`), đưa logic `subprocess.run(["manim", ...])` vào khi học sinh đạt `level >= 2` (tham khảo file `animation_creation/main.py`). Có thể điều chỉnh CLI flags render video (Tham khảo [manim_configuration.md](manim_configuration.md)).

**Bước 4: Serve Media Files**
Backend chính cần được cấu hình (ví dụ trong `FastAPI`) để trả về các file mp4:
```python
from fastapi.staticfiles import StaticFiles
app.mount("/media", StaticFiles(directory="public/media"), name="media")
```
Sau đó, Frontend (Next.js) có thể trỏ src của `<video>` thẳng vào `/media/videos/...`.

---

## 🚨 Thực trạng (Problem hiện có) & Đánh giá Kiến trúc
**Từ góc nhìn Senior AI Engineer:** Hệ thống này có đủ để tạo Visualization Toán Đại Số cho học sinh Lớp 6 - 12 chưa?

**Kết luận:** Cấu trúc hiện tại của `animation_creation` là một **Proof of Concept (PoC) rất tốt**, nhưng **CHƯA ĐỦ** để phục vụ thực tế cho dải kiến thức rộng từ lớp 6 tới lớp 12 trên môi trường Production. 

Dưới đây là **Thực trạng (Problem hiện có)** và hướng giải quyết:

1. **Khả năng Sinh Code Động (Dynamic Generation thay vì Static Scenes):**
   - *Thực trạng hiện tại:* Backend đang random hoặc mapping cứng 1 topic ID ra 1 Scene code được viết sẵn trong `example_scenes.py`.
   - *Thực tế (Lớp 6-12):* Bài toán vô cùng đa dạng (Giải phương trình $2x+3=7$, vẽ Parabol, giải HPT). Hệ thống cần một **LLM Code Generator Agent** (như GPT-4 hoặc Claude) để tự động dịch bài toán học sinh đang làm thành mã Python (Manim) ngay tại thời gian thực (Real-time). Hoặc ít nhất cần xây dựng một **Hệ thống Template Tham số hóa** (Parameterized Templates) truyền biến $x$, $y$, biểu thức vào Scene.

2. **Bảo mật Execution (Security & Sandboxing):**
   - *Thực trạng hiện tại:* Chạy lệnh qua `subprocess.run()` trực tiếp trên host.
   - *Thực tế:* Nếu sau này chúng ta dùng LLM để sinh code Python Manim, việc chạy thẳng mã Python do AI sinh ra lên server backend là cực kỳ nguy hiểm (lỗ hổng Remote Code Execution). Phải đẩy việc render vào một hệ thống **Sandboxed Docker Container** độc lập hoàn toàn với Core Backend.

3. **Xử lý Bất đồng bộ & Hàng đợi (Asynchronous & Queue):**
   - *Thực trạng hiện tại:* Backend đợi lệnh render (`subprocess`) xong mới trả về API. Quá trình này mất từ 5s đến 30s gây nghẽn HTTP Request.
   - *Thực tế:* Cần sử dụng Message Queue (Celery + Redis/RabbitMQ). Khi có Request, Backend trả về `job_id`, và Frontend dùng WebSockets hoặc Polling để nhận URL video khi render xong. Điều này giúp hệ thống chịu tải được hàng ngàn học sinh cùng lúc.

4. **Hệ thống Caching Video (Video Cache/CDN):**
   - *Thực trạng hiện tại:* Render lại từ đầu cho mỗi request.
   - *Thực tế:* Các phương trình đại số cơ bản (vd: Hằng đẳng thức đáng nhớ) thường trùng lặp giữa nhiều học sinh. Cần thiết kế cơ chế băm (hash) biểu thức Toán thành một ID, kiểm tra trong DB/S3 xem video này đã được AI vẽ trước đó chưa. Nếu có rồi thì trả về CDN link ngay lập tức (0.1 giây) thay vì phải tốn tài nguyên render lại.
