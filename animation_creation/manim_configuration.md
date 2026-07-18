# CLI Flags and Configuration (ManimGL)

Tài liệu tham khảo: [Manim Configuration](https://3b1b.github.io/manim/getting_started/configuration.html)

## 1. Giao diện Dòng lệnh (CLI)
Cú pháp cơ bản để chạy Manim từ terminal:
```bash
manimgl <file_name.py> <SceneName> <flags>
```
- `<file_name.py>`: File python chứa mã nguồn Scene (phải nằm cùng cấp với thư mục `manimlib/` hoặc gọi bằng đường dẫn tuyệt đối/tương đối).
- `<SceneName>`: Tên class kế thừa từ Scene. Nếu bỏ trống, CLI sẽ liệt kê các Scene có trong file để bạn chọn.
- `<flags>`: Các cờ định cấu hình xuất video.

## 2. Các cờ hữu ích thường dùng (Useful Flags)
- `-w` : Ghi/Xuất Scene ra một file video (Write).
- `-o` : Ghi Scene ra file và tự động Mở (Open) video sau khi hoàn thành.
- `-s` : Bỏ qua hoạt ảnh và chỉ xuất ra frame cuối cùng (Skip to end).
- `-so`: Lưu frame cuối thành ảnh (Image) và hiển thị nó.
- `-n <number>` : Bắt đầu render từ hoạt ảnh (animation) thứ `n` thay vì từ đầu.
- `-f` : Chạy cửa sổ preview ở chế độ Toàn màn hình (Fullscreen).

## 3. Các cờ bổ sung khác
- **Chất lượng Video**:
  - `-l` (low_quality): Nhanh nhất, chất lượng thấp.
  - `-m` (medium_quality): 720p.
  - `--hd`: 1080p.
  - `--uhd`: 4K.
- **Tùy chọn Render**:
  - `-t` (transparent): Quay video nền trong suốt (Alpha channel).
  - `-i` (gif): Xuất video định dạng GIF.
  - `-p` (presenter_mode): Tạm dừng giữa các `wait()` calls để dùng như slide thuyết trình.
  - `-q` (quiet): Ẩn log hiển thị trên terminal (ngoại trừ log lỗi).

## 4. Custom Config (`custom_config.yml`)
Thay vì lúc nào cũng phải gõ cờ thủ công (ví dụ `-w --hd -c "#000000"`), bạn có thể thay đổi cấu hình mặc định vĩnh viễn bằng cách ghi đè thông qua file `custom_config.yml`.
Manim sẽ ưu tiên đọc `custom_config.yml` nằm ở thư mục hiện tại của project. Bạn cũng có thể dùng cờ `--config_file /path/to/custom_config.yml` để trỏ tới file cụ thể.
