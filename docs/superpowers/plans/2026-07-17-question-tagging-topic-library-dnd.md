# Kế hoạch thư viện topic kéo-thả

1. Mở rộng browser smoke test để yêu cầu sidepanel, folder theo khối và thao tác kéo một topic vào ý barem.
2. Chạy test với demo hiện tại để xác nhận test thất bại vì tính năng chưa tồn tại.
3. Thêm markup và CSS cho cột phải gồm thư viện topic dạng folder/file và thẻ effective topics hiện có.
4. Render topic từ `available_topics`, nhóm theo `grade_level`, escape toàn bộ dữ liệu động và đánh dấu topic đang hiệu lực.
5. Thêm native HTML drag-and-drop, highlight drop zone, chống thêm trùng và gọi lại `updateScope`.
6. Chạy browser smoke test, toàn bộ pytest với warning là lỗi, compile check và kiểm tra screenshot.
7. Khởi động lại demo trên port 8009 rồi xác minh health, HTML và thao tác kéo-thả.
