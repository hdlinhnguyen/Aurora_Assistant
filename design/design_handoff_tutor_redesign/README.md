# Handoff: Redesign màn hình Học sinh (Tutor) + Gamification (Huy hiệu)

## Overview
Gói này thiết kế lại **không gian học của học sinh cấp 1** trong Aurora Assistant theo hướng
vui, thân thiện và **tối giản số bước thao tác**, đồng thời thêm hệ thống **gamification mới**
(streak, sao, huy hiệu, tủ huy hiệu, màn hoàn thành chương).

Ba deliverable chính:
1. **Aurora Tutor Hub** — màn học chính, thay cho `src/app/tutor/page.tsx` (hướng "một chạm").
2. **Aurora Badge Cabinet** — trang "Tủ huy hiệu" mới (route đề xuất `src/app/tutor/badges/`).
3. **Aurora Badges** — bảng thiết kế chuẩn của 5 huy hiệu (dùng làm nguồn tham chiếu shape/màu).

## About the Design Files
Các file `.dc.html` trong gói là **bản thiết kế tham chiếu viết bằng HTML** (prototype thể hiện
giao diện và hành vi mong muốn) — **KHÔNG phải code production để copy nguyên**. Nhiệm vụ là
**dựng lại các thiết kế này trong codebase hiện có**: **Next.js (App Router) + React + Tailwind CSS v4 + shadcn/ui**,
dùng đúng design tokens và pattern sẵn có của dự án. Các giá trị inline-style trong file HTML chỉ để
prototype paint ngay; khi implement hãy chuyển sang Tailwind class + token.

> Mở xem prototype: các file `.dc.html` cần runtime `support.js` để render. Cách nhanh nhất để
> "nhìn" thiết kế là đọc phần mô tả bên dưới (đã đủ để implement) — HTML chỉ để đối chiếu giá trị.

## Fidelity
**High-fidelity (hifi).** Màu, typography, spacing, bo góc, bóng đổ và tương tác đều là bản cuối.
Hãy dựng lại pixel-perfect bằng thư viện/pattern của codebase.

---

## Design Tokens

Dự án đã có sẵn palette "MindSync" trong `src/app/globals.css` — **tái sử dụng**, không tạo màu mới.
Bảng quy đổi các giá trị dùng trong thiết kế:

| Token | Hex | oklch (đã có trong repo) | Dùng cho |
|-------|-----|--------------------------|----------|
| Mint (primary) | `#14D9C0` | `--primary / --mint: oklch(0.82 0.17 172)` | CTA phụ, tiến độ, trạng thái "đã hiểu/đúng" |
| Mint đậm | `#0FB9A6` | — | gradient mint, chữ nhấn trên nền sáng |
| Tím (secondary) | `#7C46E8` | `--secondary / --purple: oklch(0.58 0.22 295)` | CTA chính, trạng thái "đang học" |
| Tím sáng | `#8B5CF6` | — | gradient nút chính |
| Tím pastel nền | `#EFE9FD` / `#faf7ff` | `--accent` | nền vùng chọn/nhấn tím |
| Mint pastel nền | `#F3FBF9` / `#E6FBF6` | `--accent` | nền vùng mint |
| Ink (text) | `#16161F` | `--foreground` | chữ tiêu đề/chính |
| Text phụ | `#5b6072` / `#7c8194` | `--muted-foreground` | mô tả |
| Text mờ | `#9aa1b0` / `#a2a8b4` | — | caption, khóa |
| Border | `#eef1f4` / `#e4ece9` | `--border` | viền card |
| Nền trang | `#F4FBF9` | `--background` | nền workspace |
| Nền app | `#EAF3F1` | — | ngoài khung |
| Vàng huy hiệu | `#FFC24D` → `#FF9F43` (+`#FFD76F`) | — | medal, sao thưởng |
| Cam/đỏ streak | `#FF9F43` → `#FF5F57` | — | huy hiệu lửa |
| Đỏ sai | `#c23a54` / nền `#fef3f5` / viền `#f8d3da` | `--destructive` | đáp án sai |
| Xanh dương | `#5AC8FA` → `#2A7CC0` | — | huy hiệu "Nhà Thông Thái" |

**Spacing / radius / shadow**
- Bo góc: nút/chip `12–15px`, card `20–24px`, modal `28–30px`, medal tròn `50%`, pill `999px`.
- Shadow card: `0 14px 34px -24px rgba(0,0,0,.25)`.
- Shadow nút chính (tím): `0 12px 22px -8px rgba(124,70,232,.5)`; nút mint: `0 12px 22px -8px rgba(15,185,166,.55)`.
- Gap lưới huy hiệu: `20–22px`; padding main: `24–34px`.

**Typography** (đã preload trong `src/app/layout.tsx`)
- Tiêu đề vui (hero, tên huy hiệu, tiêu đề màn hoàn thành): **"Baloo 2"** 800 — *cần thêm vào link Google Fonts hiện có.*
- Tiêu đề/nút/nhãn: **"Poppins"** 700–800 (đã có).
- Nội dung: **"Inter"** 400–700 (đã có).
- Cỡ chữ tham chiếu: hero title 27–28px, tên bài 25–28px, câu hỏi 18px, đáp án 14px, mô tả 13–14px, caption 10.5–12px.

---

## Screens / Views

### 1) Aurora Tutor Hub — màn học chính (thay `tutor/page.tsx`)
**Purpose:** học sinh vào là học ngay, không qua modal chọn chế độ, không sơ đồ cây rối.

**Layout:** full-viewport, flex ngang.
- **Sidebar trái `290px`** (nền trắng, viền phải `#eef1f4`):
  - Header: logo gradient mint→tím (ô 38px, radius 12) + "Aurora" + dropdown môn "📐 Toán lớp 5".
  - Tiêu đề "Chương Phân số" + `doneCount/6` + thanh tiến độ chương (mint gradient).
  - **Danh sách lộ trình 6 bước** (component `RoadmapStep`): mỗi dòng có badge tròn 26px + tên + nhãn trạng thái.
    - `done`: nền `#F3FBF9`, badge mint `#14D9C0` chữ "✓", bấm được.
    - `current`: nền gradient tím pastel, `inset 0 0 0 2px #7C46E8`, badge tím, nhãn "đang học".
    - `locked`: mờ, badge xám `#eef1f4`, icon 🔒, không bấm.
  - Footer: avatar cam + tên + "🔥 5 ngày · ⭐ {stars}".
- **Main phải (flex-1, scroll)**, nền có 2 radial-gradient nhạt (mint góc trái, tím góc phải):
  - **Hero bài học**: gradient `120deg,#14D9C0,#0FB9A6`, radius 24, chữ trắng, có 2 vòng tròn trắng mờ trang trí. Bên trái: nhãn "Bài N · Chương Phân số" + tên bài (Baloo 2, 28px) + blurb. Bên phải: ô kính mờ hiển thị `masteryPct%` "đã hiểu" + thanh nhỏ.
  - **3 tab gộp** (`TabPill`): "📖 Học lý thuyết", "✏️ Luyện tập (badge số câu)", "💬 Hỏi thầy AI". Tab active nền ink `#16161F` chữ trắng; inactive nền trắng viền.
  - **Panel theo tab** (chỉ render tab đang chọn, có fade-in 0.28s):
    - **Lý thuyết**: card trắng (flex 1.2) — ảnh placeholder cắt bánh (sọc chéo) + "Ý tưởng chính" + công thức `1/2 + 1/3 = 3/6 + 2/6 = 5/6` trên nền mint; nút "Mình hiểu rồi → Luyện tập" (gradient tím) + nút 🔊. Bên phải card tím pastel `264px`: avatar bạn đồng hành + bong bóng gợi mở + 2 nút gợi ý (đều nhảy sang tab chat).
    - **Luyện tập** (`PracticeCard`, max 820px): nhãn độ khó (Nhận biết/Thông hiểu/Vận dụng — màu xanh/vàng/cam) + "Câu n/N"; câu hỏi 18px; **4 đáp án** (component `AnswerOption`): badge chữ A–D + text + mark.
      - chưa chọn: viền `#eef1f4`; đang chọn: viền tím 2px + `box-shadow 0 0 0 4px #EFE9FD`; sau khi trả lời: đúng = viền/nền mint + "✅", đáp án sai đã chọn = viền/nền đỏ + "✗", còn lại mờ.
      - Gợi ý (hộp mint), banner phản hồi (mint nếu đúng / đỏ nhạt nếu sai), nút chính "Trả lời" → "Câu tiếp theo →" → (câu cuối) "🎉 Hoàn thành bài học"; nút phụ "💡 Gợi ý" (chỉ khi chưa trả lời).
    - **Hỏi thầy AI** (`ChatPanel`, cao 560px): header avatar; list bong bóng (AI trái nền `#f7f9fb`, học sinh phải nền ink trắng chữ); chip nhanh "🤔 Em chưa hiểu", "💡 Cho em ví dụ"; ô nhập + nút gửi mint.
  - **Màn hoàn thành chương** (overlay `position:fixed`): nền tối mờ, card trắng radius 30, animation pop; **huy chương lớn** (medal 148px, xem mục Huy hiệu) + ✨/⭐ nổi; chip "Huy hiệu mới · Vua Phân Số"; tiêu đề "Chinh phục Chương Phân số! 🎉" (Baloo 2); lời khen từ bạn đồng hành; **3 ô stats** (6/6 bài · +sao · % chính xác); **bộ sưu tập 4 huy hiệu** (1 mở khóa vàng, 3 khóa xám); 2 nút "Tiếp tục chương mới →" / "Đóng".
  - **Confetti**: overlay fixed, ~40 mảnh rơi (`@keyframes` rơi + xoay), bật khi trả lời đúng và khi hoàn thành chương.

### 2) Aurora Badge Cabinet — "Tủ huy hiệu" (route mới `tutor/badges/`)
**Purpose:** học sinh xem lại thành tích, tạo động lực.

**Layout:** full-viewport, flex ngang.
- **Nav rail trái `250px`**: logo + 4 mục (🏠 Học hôm nay, 🗺️ Lộ trình, 🏆 Tủ huy hiệu *(active — nền tím pastel + inset ring tím)*, 📊 Tiến bộ của em) + footer profile.
- **Main (scroll)**:
  - **Hero cá nhân**: gradient `120deg,#7C46E8,#8B5CF6 55%,#14D9C0`, radius 24, chữ trắng. Trái: ô 76px 🏆 + "Tủ huy hiệu của Bảo Bi" + tiêu đề "Đã sưu tầm {earned}/{total} huy hiệu" (Baloo 2) + chip "⭐ Cấp N · Nhà thám hiểm" + thanh XP + "620/1000 XP". Phải: 2 ô "🔥 5 ngày", "⭐ 290".
  - **Filter tabs** (`FilterPill`): Tất cả / ✓ Đã mở khóa / ⏳ Đang tiến hành (kèm số đếm). Active nền ink.
  - **Lưới huy hiệu** `grid-template-columns: repeat(auto-fill, minmax(212px,1fr)); gap:20px`. Mỗi ô là card trắng radius 22, hover nhấc lên `translateY(-5px)`, bấm mở modal.
    - Card: medal 108px + tên (Baloo 2) + mô tả + footer (chip "Đạt: …" nếu mở khóa / thanh % nếu đang tiến hành / "Chưa mở khóa" nếu khóa).
  - **Modal chi tiết** (`BadgeDetailModal`): overlay tối mờ, card 420px radius 28, animation pop; medal phóng to 132px + chip nhóm + tên + mô tả + hộp trạng thái (mint nếu đạt / tím nếu đang / xám nếu khóa) + nút Đóng. Click nền ngoài cũng đóng.

### 3) Aurora Badges — bảng chuẩn 5 huy hiệu (tham chiếu)
Board tĩnh trình bày 5 huy hiệu ở các trạng thái để chốt shape/màu. Dùng làm "source of truth" cho component `Medal`.

---

## Component: `Medal` (dựng bằng CSS, KHÔNG dùng ảnh)
Mỗi huy hiệu = 2 lớp chồng nhau (outer + inner cùng shape) + glyph emoji ở giữa.

- **Shape qua `clip-path`** (inner thụt vào ~9.3% cạnh):
  - circle: `border-radius:50%`
  - hexagon: `polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%)`
  - star: `polygon(50% 0%,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)`
  - shield: `polygon(50% 0,100% 12%,100% 55%,50% 100%,0 55%,0 12%)`
  - octagon: `polygon(30% 0,70% 0,100% 30%,100% 70%,70% 100%,30% 100%,0 70%,0 30%)`
- **Đã mở khóa**: outer = gradient màu chủ đề + `box-shadow 0 14px 26px -12px <glow>`; inner = gradient sáng hơn + `inset` sáng; glyph có `drop-shadow`; medal `@keyframes float` nhẹ; có ✨ góc trên.
- **Chưa mở khóa (progress/locked)**: outer/inner xám (`#dfe6ea→#c3ccd4` / `#eef2f5→#dbe2e8`), glyph `filter:grayscale(1);opacity:.5`; locked thêm 🔒.
- Kích thước: card 108px, modal 132px, màn hoàn thành 148px (chỉ đổi `width/height`, inset & font scale theo tỉ lệ).

### Dữ liệu 5 huy hiệu chuẩn (+3 khóa để đầy tủ)
| Tên | Shape | Màu chủ đề | Glyph | Nhóm | Tiêu chí |
|-----|-------|-----------|-------|------|----------|
| Vua Phân Số | circle | vàng `#FFD76F→#FF9F43` | 👑 | Chương học | Hoàn thành trọn 1 chương |
| Ngọn Lửa Chăm Chỉ | hexagon | cam-đỏ `#FFB65C→#FF5F57` | 🔥 | Thói quen | Học đều 7 ngày liên tục |
| Tia Chớp Thần Tốc | star | tím `#A78BFA→#6D28D9` | ⚡ | Kỹ năng | Đúng 5 câu liền, không gợi ý |
| Trái Tim Kiên Trì | shield | mint `#19E0C6→#0FB9A6` | 💪 | Tinh thần | Làm lại đúng sau khi từng sai (x5) |
| Nhà Thông Thái | octagon | xanh `#5AC8FA→#2A7CC0` | 💡 | Ham học | Hỏi thầy AI 10 câu chất lượng |
| Thánh Phép Tính *(khóa)* | circle | — | ➗ | Chương học | Hoàn thành chương Phép tính |
| Bậc Thầy Hình Học *(khóa)* | hexagon | — | 📐 | Chương học | Hoàn thành chương Hình học |
| Chúa Tể Số Học *(khóa)* | star | — | 🔢 | Cột mốc | Tích lũy 1000 sao |

---

## Interactions & Behavior
- **Chuyển tab** (Hub): đổi panel, fade-in 0.28s. Nút "Mình hiểu rồi" và các nút gợi ý ở tab Lý thuyết chuyển sang tab tương ứng.
- **Chọn bài trên lộ trình**: `done`/`current` bấm được → set bài hiện tại + về tab Lý thuyết; `locked` vô hiệu.
- **Luyện tập**: chọn đáp án → "Trả lời" chấm đúng/sai (đúng: +10 sao, confetti 2.6s; sai: hiện gợi ý, cho làm lại) → "Câu tiếp" → câu cuối "🎉 Hoàn thành bài học" mở màn hoàn thành chương (+50 sao, confetti 3.2s).
- **Chat**: gửi tin → thêm bong bóng học sinh + phản hồi AI kiểu **gợi mở, không cho đáp án sẵn** (Socratic). Chip nhanh chèn câu hỏi mẫu.
- **Tủ huy hiệu**: filter lọc lưới; click card → modal; click nền/Đóng → đóng.
- **Animations**: `float` (medal, 3.2–3.9s), `spark` (✨, 2.4s), `pop` (modal/màn hoàn thành, cubic-bezier(.16,1,.3,1)), `confetti fall` (2–3.4s), `fade` panel.
- **Hover**: card huy hiệu nhấc `-5px` + shadow đậm; nút `active:scale`.

## State Management
**Tutor Hub**
- `activeTab: 'theory'|'practice'|'chat'`
- `currentStep: number` (id bài trên lộ trình)
- `qIndex, selected, answered, isCorrect, showHint`
- `correctSession` (đếm đúng phiên → tính mastery & accuracy)
- `stars`, `screen: 'lesson'|'complete'`, `celebrate: boolean`
- `chat: {sender:'ai'|'student', text}[]`
- Dẫn xuất: `masteryPct = min(95, 45 + correctSession*16)`; `chapterAccuracy = round(correctSession/total*100)`.
- Data cần từ API: bài học + lý thuyết + danh sách câu hỏi (đã có endpoint `/nodes/:id/questions`, `/nodes/:id/answer`, `/nodes/:id/chat-theory` trong repo); tiến độ lộ trình (`/student/learning-path`).

**Badge Cabinet**
- `filter: 'all'|'earned'|'progress'`, `detailId: string|null`
- Badge model: `{id, name, desc, category, glyph, shape, status:'earned'|'progress'|'locked', pct?, foot, colors...}`
- **Backend mới cần thêm** (chưa có trong repo): bảng `badges` + `student_badges` (điều kiện đạt, thời điểm), API `GET /student/badges`, và logic phát huy hiệu khi: hoàn thành chương / streak / chuỗi đúng / vượt khó / số câu hỏi chat. Streak & sao (XP) cũng là dữ liệu mới cần lưu.

## Interactions phụ / Responsive
- Thiết kế cho **desktop web** (yêu cầu của khách). Nếu làm responsive: sidebar co lại thành thanh icon dưới `<1024px`; lưới huy hiệu `auto-fill minmax` tự xuống dòng.

## Assets
- Không dùng ảnh thật. Ảnh minh hoạ trong bài là **placeholder sọc chéo** — thay bằng minh hoạ thật của dự án khi có.
- Icon: đang dùng **emoji** (khớp phong cách hiện tại của repo — `page.tsx`/`tutor` đã dùng emoji). Có thể thay bằng bộ `lucide-react` (đã cài) nếu muốn nhất quán icon nét.
- Huy hiệu: **thuần CSS** (clip-path + gradient), không cần file ảnh.

## Files (trong gói này)
- `Aurora Tutor Hub.dc.html` — màn học 1b (đầy đủ tương tác: tab, luyện tập, chat, hoàn thành chương, confetti).
- `Aurora Badge Cabinet.dc.html` — Tủ huy hiệu (hero, filter, lưới, modal chi tiết).
- `Aurora Badges.dc.html` — bảng chuẩn 5 huy hiệu (tham chiếu shape/màu).
- `_explorations/Aurora Tutor Redesign (3 options).dc.html` — 3 hướng ban đầu (1a bản đồ phiêu lưu, 1b một chạm ✅ đã chọn, 1c chat companion) để tham khảo bối cảnh.

## Gợi ý mapping vào repo
- Màn học: refactor `src/app/tutor/page.tsx` theo bố cục Hub; tách `RoadmapRail`, `LessonHero`, `TabPill`, `TheoryPanel`, `PracticePanel`/`AnswerOption`, `ChatPanel`, `ChapterCompleteModal`, `Confetti`.
- Tủ huy hiệu: route mới `src/app/tutor/badges/page.tsx` + component `Medal`, `BadgeCard`, `BadgeDetailModal`, `BadgeFilter`.
- Style: dùng Tailwind + token trong `globals.css` (map bảng Design Tokens ở trên). Thêm font **Baloo 2** vào `<link>` Google Fonts trong `layout.tsx`.
- Giữ nguyên các endpoint học tập hiện có; bổ sung backend gamification (badges/streak/XP) như mục State Management.
