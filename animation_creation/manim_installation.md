# Hướng dẫn Cài đặt Manim (ManimGL)

Tài liệu tham khảo: [Manim Installation](https://3b1b.github.io/manim/getting_started/installation.html)

Manim yêu cầu Python 3.7 trở lên. Quá trình cài đặt đòi hỏi một số thư viện hệ thống (System Dependencies) trước khi cài đặt package Python.

## 1. Yêu cầu Hệ thống (System Requirements)
Bạn cần cài đặt các phần mềm sau ở cấp độ OS (Hệ điều hành):
- **FFmpeg**: Dùng để render video.
- **OpenGL**: (Đi kèm với thư viện PyOpenGL trong Python).
- **LaTeX**: (Tuỳ chọn) Nếu bạn muốn render các công thức Toán học đẹp mắt. Khuyên dùng TeXLive-full.
- **Pango**: (Chỉ dành cho Linux) Dùng để render Text.

### Cài đặt FFmpeg
- **Windows**: Chạy lệnh `choco install ffmpeg` (Yêu cầu Chocolatey). Hoặc tải file zip từ `https://www.gyan.dev/ffmpeg/builds/` và đưa vào biến môi trường PATH.
- **macOS**: Tải trực tiếp hoặc qua Homebrew `brew install ffmpeg`.
- **Linux**: `sudo apt update && sudo apt install ffmpeg`. Sau đó kiểm tra bằng `ffmpeg -version`.

## 2. Cài đặt Python Packages (Cài đặt Manim)

### Cách 1: Cài trực tiếp từ PyPI
```bash
pip install manimgl
```
Sau đó kiểm thử bằng lệnh: `manimgl`

### Cách 2: Cài từ mã nguồn (Để dev/hack library)
```bash
git clone https://github.com/3b1b/manim.git
cd manim
pip install -e .
```
Kiểm thử với ví dụ gốc:
```bash
manimgl example_scenes.py OpeningManimExample
# hoặc
manim-render example_scenes.py OpeningManimExample
```
Nếu lệnh chạy thành công và không hiện lỗi, hệ thống Manim của bạn đã sẵn sàng.

### Sử dụng Anaconda (Khuyên dùng cho Data/AI Engineer)
```bash
git clone https://github.com/3b1b/manim.git
cd manim
conda create -n manim python=3.8
conda activate manim
pip install -e .
```
