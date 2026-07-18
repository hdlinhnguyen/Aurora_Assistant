# Note pitch deck — So sánh Aurora Assistant vs bằng chứng Khan Academy

Nguồn: [Multiple Studies Show Khan Academy Drives Learning Gains](https://blog.khanacademy.org/multiple-studies-show-khan-academy-drives-learning-gains-evidence-for-our-platforms-effectiveness/) (Khan Academy Blog, 02/2026)

## Nguyên tắc sử dụng

- KHÔNG nhận số liệu Khan là kết quả của Aurora. Dùng làm **bằng chứng cho phương pháp** (category evidence): mastery learning + luyện tập cá nhân hóa đã được kiểm chứng Tier 1.
- Các nghiên cứu đều về **môn toán**, phần lớn có hỗ trợ triển khai — không khái quát thành "AI tutor tăng X điểm".
- Frame chuẩn: *"Phương pháp đã có bằng chứng RCT; Aurora là phiên bản bản địa hóa cho VN + teacher-in-the-loop."*

## Số liệu then chốt (trích dẫn được)

| Số liệu | Nghiên cứu | Ý nghĩa cho Aurora |
|---|---|---|
| +0.12–0.22 SD điểm toán cuối năm | RCT ~11.000 HS lớp 3-8, mastery learning (Oreopoulos et al. 2024, Tier 1) | Aurora là hệ mastery-based: BKT + lộ trình theo điều kiện hoàn thành |
| +0.09–0.18 SD chỉ với +30 phút/tuần (hoặc 60 skills/năm) | PNAS 2026, ~200K HS (Tier 2) | "Liều lượng nhỏ, hiệu quả đo được" — mô hình dùng bổ trợ, không thay giáo viên |
| +0.44–0.47 SD khi có người đảm bảo usage ~1h/tuần | RCT Ấn Độ 2026, ~5.500 HS, 74 trường (Tier 1) | Hỗ trợ triển khai là biến quyết định → luận điểm mạnh nhất |
| Chỉ hiệu quả "khi có hỗ trợ đầy đủ" | RCT Brazil 2019, 157 trường | Củng cố luận điểm trên |
| Gần gấp đôi mức tăng NJSLA năm-qua-năm với +18h hoặc +60 skills | Panel 3 năm Newark, NJ (Tier 2) | Dosage-response bền vững |

## Luận điểm cốt lõi

**Điểm nghẽn của Khan = thiết kế của Aurora.** Kết quả tốt nhất của Khan (0.44–0.47 SD) cần "lab-in-charge" — người ngoài sản phẩm đảm bảo HS dùng đủ. Aurora tích hợp vai trò đó vào sản phẩm: giáo viên đặt mục tiêu/ràng buộc, dashboard, gom nhóm HS, xếp hạng cần hỗ trợ.

## Khác biệt Aurora (Khan không có ở VN)

- Bám chương trình GDPT 2018, đầy đủ các môn (kho data sẵn có).
- Tutor Socratic không lộ đáp án — có eval gate cứng `hard-leak = 0`.
- Feynman mode chống **học vẹt** — nghiên cứu Khan chỉ đo điểm số, không đo hiểu thật; đúng pain point VN.
- Ingest bài kiểm tra giấy (OCR + giáo viên duyệt) — khớp thực tế lớp học VN.
- Guardrail an toàn 2 lớp, báo cáo cho giáo viên.
- Chẩn đoán gap gốc: truy ngược knowledge graph, kể cả topic khối lớp dưới (đi xa hơn MAP Accelerator).

## 4 slide đề xuất

1. **Phương pháp đã được kiểm chứng** — 3 con số: 0.12–0.22 SD (RCT mastery), 0.09–0.18 SD với 30ph/tuần (PNAS), 0.44–0.47 SD khi đảm bảo usage. Ghi nguồn Khan Academy.
2. **Bài học từ Khan → thiết kế Aurora** — usage & hỗ trợ triển khai là điểm nghẽn; Aurora đưa giáo viên vào vòng lặp thay vì thuê người ngoài.
3. **Aurora làm được điều Khan không làm ở VN** — bảng khác biệt ở trên.
4. **Lộ trình bằng chứng (thang ESSA)** — đã có eval harness nội bộ với gate cứng (hard-leak = 0, distress recall 100%) → pilot correlational (Tier 3) → quasi-experimental (Tier 2). Cho thấy team hiểu cách edtech chứng minh hiệu quả.

---

# Competitive Landscape

**Bối cảnh thị trường:** EdTech Việt Nam ~5,1 tỷ USD, ~60% sản phẩm đã nhúng AI; chủ đề trung tâm 2026 là cá nhân hóa. Đối thủ nội địa lớn: VioEdu (FPT), Azota, Onluyen, Prep. Sản phẩm quốc tế/tiêu dùng đang tiếp cận HS Việt: Khanmigo, Gauth, Astra AI, và các benchmark như MagicSchool, Squirrel AI, Duolingo.

## Nguyên tắc dùng phần này khi pitch

Mỗi đối thủ mạnh MỘT mảnh. **Chưa ai hợp nhất evidence từ mọi kênh (giấy + quiz + chat) về một mô hình mastery có hiệu chỉnh, với tutor hiểu-thật và eval an toàn có gate cứng** — đó là câu "why Aurora". Không hạ thấp đối thủ; định vị Aurora vào ô trống họ để lại.

## Bản đồ định vị (2 trục)

- **Trục ngang:** Đo hiểu thật / mastery đo được  ←→  Throughput (giải nhanh, luyện đề, sinh nội dung, engagement).
- **Trục dọc:** Phục vụ học sinh (learning)  ←→  Phục vụ giáo viên (năng suất/quản trị).

| Sản phẩm | Nghiêng trục ngang | Nghiêng trục dọc | Ô định vị |
|---|---|---|---|
| Duolingo | Engagement/throughput | Học sinh | HS × engagement |
| Astra AI | Throughput (solver + ôn thi) | Học sinh (+ tab GV mỏng) | HS × throughput |
| Gauth | Throughput (giải hộ) | Học sinh | HS × throughput |
| VioEdu | Luyện đề thích ứng (mastery-ish, MCQ) | Học sinh (+ trường) | HS × throughput→mastery |
| Squirrel AI | Mastery qua KG nano (vẫn practice) | Học sinh | HS × mastery-practice |
| Khanmigo | Hiểu thật (Socratic) | Cả hai | Understanding × cả hai |
| Azota | Throughput (chấm/admin) | Giáo viên | GV × throughput |
| MagicSchool | Sinh nội dung | Giáo viên | GV × năng suất |
| **Aurora** | **Đo hiểu thật (mastery + Feynman)** | **Cả hai (teacher-in-loop)** | **Hiểu × cả hai — ô trống** |

## Từng đối thủ: điểm mạnh · bài học · khác biệt Aurora

### Khanmigo (Khan Academy) — đối thủ cùng triết lý
- **Là gì:** Tutor Socratic + bộ teacher tools, gắn kho nội dung Khan. Miễn phí GV K-12, gói phụ huynh ~4 USD/tháng; 2026 chuyển sang flow goal-driven.
- **Mạnh:** "Không đưa đáp án, dẫn dắt tự tìm"; công cụ misconceptions cho GV; voice 2 chiều.
- **Bài học:** Flow học theo mục tiêu > chat mở; gói phụ huynh giá rẻ làm kênh B2C.
- **Aurora hơn:** Gap gắn knowledge graph + BKT thay vì đếm thô; bám GDPT 2018; ingest bài giấy.

### Gauth (ByteDance) — thực tế nhu cầu HS Việt
- **Là gì:** Chụp ảnh → giải từng bước; kèm mạng gia sư người thật 24/7; phân phối khủng.
- **Mạnh:** Ma sát cực thấp (chụp là ra); "AI trước, người thật khi cần".
- **Bài học:** Chụp ảnh bài tập là bàn phím chính của HS Việt → củng cố ưu tiên input đa phương thức.
- **Aurora hơn:** Giáo viên đã trong vòng lặp (Gauth phải thuê ngoài); **không copy solver mode** — ngược triết lý Socratic. Dùng chính điểm này để pitch trường: "HS đang dùng app giải hộ; trường cần AI có kiểm soát".

### Astra AI — UX ôn thi mượt, retention tốt
- **Là gì:** Tutor đa môn cho HS Việt: wizard ôn thi (môn → ngày thi → điểm mục tiêu → lộ trình), chụp/vẽ/nói, tab giáo viên (16 template), gamification.
- **Mạnh:** Wizard tự phục vụ ~1 phút; streak + "tiết kiệm so với gia sư 156€" (reframe cho phụ huynh); Lớp học tạo network effect; cam kết "cải thiện điểm hoặc hoàn tiền".
- **Bài học:** Thêm entry point HS tự đặt mục tiêu (ngày thi/điểm) làm constraint; chụp ảnh trong chat; "tiết kiệm vs gia sư" cho slide GTM phụ huynh.
- **Aurora hơn:** Astra template chỉ prompt generic; Aurora grounded bằng `confirmed_gap` thật. **Không copy** solver + chat lớp không kiểm duyệt.

### VioEdu (FPT) — đối thủ nội địa lớn nhất
- **Là gì:** Adaptive practice + "bản đồ tri thức" cho chương trình VN. Video giảng → luyện MCQ 4 mức → giải thích tĩnh → thống kê. ~10 triệu HS, hậu thuẫn FPT + di sản Violympic.
- **Mạnh:** Retention engine rất mạnh (kim cương mốc điểm, đổi quà thật, đấu trường xếp hạng); phân phối B2B trường đã chứng minh; nhiệm vụ hằng ngày + test đầu vào; claim phát hiện mạnh/yếu 95% (số marketing).
- **Bài học:** Retention là thứ Aurora thiếu nhất; báo cáo cho phụ huynh (Aurora chưa có surface này).
- **Aurora hơn:** VioEdu đo *% đúng MCQ* (đoán/học tủ vẫn "lên xanh"); Aurora đo *hiểu thật* (Feynman, Socratic không đoán mò). Hợp nhất evidence giấy+quiz+chat; truy ngược gap gốc xuống lớp dưới; `confidence_score` + guardrail.
- **Định vị:** **Đừng đấu trực diện mảng luyện MCQ + đấu trường.** Aurora là "lớp hiểu sâu" bổ trợ, nhắm điểm mù học-vẹt. *"Họ chấm đáp án. Chúng tôi chấm tư duy."*

### Azota — wedge giáo viên thành công nhất VN
- **Là gì:** Hạ tầng đánh giá + workflow GV (KHÔNG dạy). Chấm phiếu scan "1000 bài/5 phút", CT2018, mẫu THPT 2025; AI chấm tự luận theo rubric; ngân hàng câu hỏi, trộn đề, thống kê. 300.000+ GV, 9.000+ trường.
- **Giá:** Free (chấm phiếu không giới hạn) → VIP cá nhân 149k/tháng · 999k/năm → Tổ chức 2,9tr/tháng · 35tr/năm; + Point pay-as-you-go (OCR). CTV kết nối trường.
- **Mạnh:** Freemium sắc + wedge "tiết kiệm giờ chấm"; land-and-expand GV→trường.
- **Điểm yếu = cửa Aurora:** Dừng ở *điểm số*, không mastery/không chẩn đoán/không lộ trình. **Làn sóng "anti" khi nâng AI** → thị trường nghi AI chấm hộp đen.
- **Định vị:** **Bổ trợ, không thay thế** — Aurora là tầng trên nhận kết quả đã chấm (có thể import từ Azota) rồi trả lời *em hổng gốc ở đâu, học gì tiếp*. Sự cố AI của Azota là luận điểm bán `confidence_score` + vòng GV "chấm lại". *"Azota giúp chấm xong nhanh hơn. Aurora giúp biết phải làm gì tiếp."*

### MagicSchool — chuẩn mực teacher tools
- **Là gì:** "AI Operating System for Schools": 80+ teacher tools + 50+ student tools. 5 triệu+ GV, 13.000+ trường, 160 quốc gia. 94% GV tiết kiệm 7+ giờ/tuần.
- **Mạnh:** Teacher tools phủ toàn ngày dạy (lesson plan tự phân hóa, IEP/504, rubric, writing feedback vào Google Docs); **Student Rooms** — GV chọn tool nào HS được dùng, đặt goal, giám sát real-time (mô hình "AI do GV kiểm soát" đã đóng gói + được chấp nhận); an toàn chuẩn hạ tầng (SOC2, FERPA/COPPA, AI Safety Loop).
- **Cảnh báo cho Aurora:** MagicSchool vừa **khai tử persona "Raina"** để chống parasocial attachment ở trẻ. Aurora có **"bé Bi"** — chuẩn bị câu trả lời (giới hạn thời lượng, nhắc "đây là mô phỏng", Bi là *đối tượng để giải thích* không phải bạn đồng hành).
- **Bài học:** Mượn ngôn ngữ "Student Rooms"; mô hình GTM free-forever → Plus → Enterprise + cộng đồng/PD.
- **Aurora hơn:** MagicSchool *sinh nội dung* (mỗi tool one-shot, không vòng phản hồi vào mô hình HS); Aurora *đo hiểu* + vòng khép kín. US/English-first vs GDPT 2018 + bài giấy. **Rộng vs sâu là trục định vị** — đừng đua số lượng tool. *"MagicSchool sinh tài liệu. Aurora hiểu học sinh."*

### Squirrel AI (Trung Quốc) — tiền lệ KG-adaptive quy mô lớn
- **Là gì:** OG adaptive learning quy mô lớn; ~52 triệu HS, 1.800+ trung tâm offline; lab với CAS + CMU; TIME100 2026.
- **Mạnh (lõi trùng Aurora):** Knowledge graph **nano** (~30.000 điểm cho toán THCS; SGK ~3.000, ALEKS ~1.000); chẩn đoán trước rồi hệ quyết lộ trình; MCM (tư duy/năng lực/phương pháp) vượt khỏi đúng/sai; LAM.
- **Bằng chứng (kèm caveat):** RCT 2020 peer-reviewed (adaptive > giáo viên giỏi cho toán); nghiên cứu Guinness 2025 (+8,78 điểm, rõ nhất ở HS yếu) — **nhưng Guinness không peer-review + bên làm có xung đột lợi ích**. Chỉ trích RCT 2020 làm bằng chứng chính.
- **Điểm yếu = cửa Aurora:** "Không hơn gì tài nguyên trên mạng"; lo tự học độc lập; hộp đen; nặng luyện thi. Mô hình nặng vốn (tự vận hành trung tâm); từng suýt chết vì lệnh cấm dạy thêm 2021.
- **Bài học:** Độ mịn KG là **roadmap tăng dần từ dữ liệu + LLM**, không hand-carve (Squirrel mất một thập kỷ + kho dữ liệu lớn nhất TG). Tránh mô hình nặng vốn; teacher-in-loop né rủi ro pháp lý.
- **Aurora hơn:** Đo hiểu thật (Socratic/Feynman) thay vì tối ưu đường qua điểm kiến thức; giáo viên đặt mục tiêu (Squirrel: hệ quyết, hộp đen); minh bạch bằng `confidence_score`. *"Squirrel tối ưu đường đi để nâng điểm. Aurora đo xem HS có thực sự hiểu — với bằng chứng lớp học thật + GV trong vòng lặp."*

### Duolingo — chuẩn mực retention & kinh tế học
- **Là gì:** Benchmark giữ chân + freemium tiêu dùng. Q1 2026: doanh thu 292 triệu USD (+27%), DAU 56,5 triệu, 12,5 triệu trả phí (~9,1% MAU); guidance ~1,2 tỷ USD/năm.
- **Mạnh:** Streak + **loss aversion** (mất đau gấp ~2 lần được) + cơ chế **tha thứ** (streak freeze nhiều nguồn); league matchmaking "vừa sức" (+25% hoàn thành bài); HLR/Birdbrain (spaced repetition + knowledge tracing); Max: roleplay/video call AI.
- **Điểm yếu = bài học sắc nhất:** "Rộng một dặm, sâu một inch" — **gamification thúc đẩy engagement không phải fluency**; chỉ ~50% đạt nói A2; người học vì gamification bỏ cuộc nhiều hơn. Duolingo tối ưu engagement → tỷ đô nhưng "hiệu quả học vừa phải".
- **Bài học then chốt:** **Gamify mastery, đừng gamify hoạt động.** Duolingo *không đo được* hiểu nên chỉ thưởng phút học/XP; Aurora *đo được* mastery → gắn streak/huy hiệu vào cột mốc hiểu thật. Mượn: streak có tha thứ, league theo tiến bộ cá nhân, thuật toán HLR công khai (hiện thực spaced re-check mục 3.8).
- **Aurora hơn:** *"Duolingo tối ưu để bạn quay lại. Aurora tối ưu để bạn thực sự hiểu — và mượn khoa học giữ chân đó để phục vụ điều đó."*

## Bảng tổng hợp head-to-head

| | Đo hiểu thật | KG/gap gốc | Bài giấy→mastery | Tutor Socratic | An toàn/eval | Retention | Teacher-in-loop | Bối cảnh VN |
|---|---|---|---|---|---|---|---|---|
| Khanmigo | ✅ Socratic | △ | ✕ | ✅ | ✅ | △ | ✅ | ✕ (US) |
| Gauth | ✕ (giải hộ) | ✕ | ✕ | ✕ | ✕ | △ | ✕ | ✅ phổ biến |
| Astra | ✕ | ✕ | ✕ | △ | ✕ | ✅ | △ | ✅ |
| VioEdu | ✕ (MCQ) | △ trong lớp | ✕ | ✕ | ✕ | ✅✅ | △ | ✅✅ |
| Azota | ✕ (điểm) | ✕ | △ (chấm, không mastery) | ✕ | △ | ✕ | ✅ | ✅✅ |
| MagicSchool | ✕ (sinh nội dung) | ✕ | ✕ | △ | ✅✅ | ✕ | ✅✅ Student Rooms | ✕ (US) |
| Squirrel | △ (MCM) | ✅✅ nano | ✕ | ✕ | ✕ hộp đen | ✅ | ✕ (hệ quyết) | ✕ (TQ) |
| Duolingo | ✕ | ✕ | ✕ | △ (Max) | △ | ✅✅✅ | ✕ | ✕ |
| **Aurora** | **✅✅ Feynman** | **✅ truy ngược** | **✅✅ OCR→BKT** | **✅ gate cứng** | **✅✅ 2 lớp** | **✕ cần xây** | **✅✅** | **✅✅ GDPT 2018** |

## "Why Aurora" — tổng hợp

Mỗi đối thủ sở hữu một mảnh: Azota (chấm bài), VioEdu (adaptive nội địa), Khanmigo (Socratic), MagicSchool (teacher tools + Student Rooms), Squirrel (KG quy mô), Duolingo (retention), Gauth/Astra (input ma sát thấp). Aurora là bên duy nhất **hợp nhất evidence mọi kênh (giấy + quiz + chat) → mô hình mastery có hiệu chỉnh (BKT + `confidence_score`), với tutor hiểu-thật (Socratic không lộ đáp án + Feynman chống học vẹt) và eval an toàn có gate cứng, bản địa hóa GDPT 2018, giáo viên trong vòng lặp.** Ô định vị "đo hiểu × phục vụ cả hai" gần như còn trống.

## Việc cần làm (rút từ đối thủ, theo ưu tiên)

1. **Retention gắn mastery** (từ Duolingo/VioEdu/Astra): streak *có tha thứ* + league theo tiến bộ cá nhân, nhưng thưởng cột mốc mastery thật — điểm không đối thủ nào làm được vì họ không đo hiểu. Hiện thực spaced re-check bằng thuật toán HLR công khai.
2. **Đóng gói "Student Rooms"** (từ MagicSchool): gói guardrail + teacher visibility sẵn có thành không gian AI do GV kiểm soát, có tên gọi.
3. **Wedge giáo viên freemium** (từ Azota/MagicSchool): pipeline chấm bài giấy + gap dashboard làm utility miễn phí để cắm rễ → Plus cá nhân → Enterprise trường.
4. **Xử persona "bé Bi"** (từ MagicSchool khai tử Raina): giới hạn thời lượng + nhắc "mô phỏng" trước khi pitch trường.
5. **Input đa phương thức** (từ Gauth/Astra): chụp ảnh bài tập trong chat → ảnh thành evidence đổ vào BKT (đối thủ dừng ở giải hộ).
6. **Báo cáo cho phụ huynh + "tiết kiệm vs gia sư"** (từ VioEdu/Astra): surface mới cho GTM B2C.
7. **Độ mịn KG tăng dần từ dữ liệu** (từ Squirrel): roadmap, không hand-carve; không hứa nano từ ngày một.

## Slide đề xuất bổ sung (Competitive)

5. **Bản đồ định vị 2 trục** — đặt 8 đối thủ + Aurora vào ô trống "đo hiểu × phục vụ cả hai".
6. **"Mỗi đối thủ một mảnh, Aurora hợp nhất"** — bảng head-to-head rút gọn.
7. **Ba câu định vị** — vs VioEdu: "chấm đáp án vs chấm tư duy"; vs Azota: "chấm nhanh vs biết làm gì tiếp"; vs Duolingo: "quay lại vs thực sự hiểu".

## Nguồn (Competitive Landscape)

- Astra AI: khảo sát trực tiếp app + [astra-ai.co](https://astra-ai.co/)
- Khanmigo: [khanmigo.ai](https://www.khanmigo.ai/) · [updates 2026](https://aitoolsbakery.com/blog/khanmigo-updates-2026/)
- Gauth: [App Store VN](https://apps.apple.com/vn/app/gauth-tr%E1%BB%A3-l%C3%BD-l%C3%A0m-b%C3%A0i-t%E1%BA%ADp-ai/id1542571008?l=vi)
- VioEdu: [Hệ thống đánh giá](https://vio.edu.vn/analysis-intro) · [Tính năng HS](https://tintuc.vio.edu.vn/chuc-nang-hoc-sinh/) · [FPT IS](https://fpt-is.com/vioedu/) · [Giá gói](https://ai-hay.vn/chi-phi-cac-khoa-hoc-vioedu-cap-nhat-va-nhung-dieu-can-biet-pN1UmH4Kf-8)
- Azota: [Chấm trắc nghiệm](https://azota.vn/cham-phieu-trac-nghiem/) · [Báo giá](https://azota.vn/bao-gia/) · [Làn sóng anti khi nâng AI](https://hoahoctro.tienphong.vn/nhan-ve-lan-song-anti-du-doi-chi-vi-nang-cap-cong-nghe-ai-lieu-co-bat-cong-cho-azota-post1407596.tpo)
- MagicSchool: [Teacher platform](https://www.magicschool.ai/magicschool) · [Student safety (khai tử Raina)](https://www.magicschool.ai/blog-posts/student-safety-companionship) · [Pricing](https://www.magicschool.ai/pricing)
- Squirrel AI: [Wikipedia](https://en.wikipedia.org/wiki/Squirrel_AI) · [MIT Tech Review](https://www.technologyreview.com/2019/08/02/131198/china-squirrel-has-started-a-grand-experiment-in-ai-education-it-could-reshape-how-the/) · [Guinness study 2025](https://www.einpresswire.com/article/878896713/squirrel-ai-sets-the-guinness-world-record-for-largest-ai-vs-traditional-teaching-differential-experiment) · [RCT arXiv 1901.10268](https://arxiv.org/pdf/1901.10268)
- Duolingo: [Q1 2026 8-K](https://www.sec.gov/Archives/edgar/data/0001562088/000162828026029790/q1fy26duolingo3-31x26share.htm) · [HLR paper](https://research.duolingo.com/papers/settles.acl16.pdf) · [Duolingo Max](https://blog.duolingo.com/duolingo-max/) · [Gamification vs fluency](https://tatumdale.com/duolingo-is-not-a-real-language-learning-app-is-it/)
- Thị trường: [Vietnam EdTech Report 2026](https://www.nguyentrihien.com/2026/02/vietnam-edtech-elearning-report-2026.html)
