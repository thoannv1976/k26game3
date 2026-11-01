# KẾ HOẠCH XÂY DỰNG GAME 3 – VSTEP QUEST (AI ENGLISH CHAMPIONSHIP)

> Phiên bản kế hoạch: 1.0 · Ngày lập: 01/11/2026 · Trạng thái: **chờ duyệt**
> Đặc tả gốc: [docs/spec/game3-vstep-quest.md](docs/spec/game3-vstep-quest.md)
> Kế thừa: Game 1 (giọng nói: ghi âm, Speech-to-Text, Text-to-Speech, đo độ trôi chảy) và Game 2 (nền tảng, ngân hàng nội dung có duyệt,
> chấm bất đồng bộ, chấm viết có kiểm tra trích dẫn, tự lưu bài viết).

---

## 0. Tóm tắt

VSTEP Quest là web game ôn luyện **4 kỹ năng** B1–B2 theo định dạng VSTEP. Sinh viên tạo nhân vật, đi trên bản đồ 4 khu vực
(**Listening Island, Reading Castle, Writing Academy, Speaking Arena**), làm nhiệm vụ, thi thử và tham gia giải đấu.
Nghe – Đọc **máy chấm theo đáp án đã duyệt**; Viết – Nói **AI chấm sơ bộ** theo rubric; giảng viên thẩm định.

**Ba chế độ:**

| Chế độ | Mục đích | Trợ giúp AI |
|---|---|---|
| Quest Mode | Luyện tập cá nhân theo nhiệm vụ, mở khóa dần | Có – giải thích đáp án **sau khi trả lời**, AI Coach |
| Mock Exam Mode | Thi thử 4 kỹ năng, giờ do server quản lý | **Tắt** toàn bộ trong lúc làm bài |
| Championship Mode | Giải đấu bất đồng bộ cá nhân/đội/lớp do giảng viên tổ chức | Như Quest Mode trừ khi giảng viên tắt |

**Phạm vi v1.0:** bản đồ 4 khu vực · avatar + XP + huy hiệu + mở khóa · **8 nhiệm vụ** L01, L02, R01, R02, W01, W02, S01, S02 ·
**1 bài thi thử 4 kỹ năng** · giải đấu bất đồng bộ + bảng xếp hạng · ngân hàng câu hỏi có duyệt + AI soạn câu hỏi ·
AI giải thích, AI chấm Viết/Nói, AI Coach, phân tích học tập · hồ sơ 4 kỹ năng · dashboard SV/GV/quản trị · hạn mức chi phí ·
CSV · API LMS-AI9 dùng chung định dạng `k26-evidence-1.0`.

**Đây là game lớn nhất trong ba game** (kết hợp giọng nói của Game 1, chấm viết của Game 2, cộng thêm thi có giờ và giải đấu).
Ước tính **7–9 tuần**; nút thắt là nội dung (kịch bản nghe, bài đọc, đề viết/nói, bài thi thử) và việc chuyên môn duyệt.

| GĐ | Nội dung | Ước tính | Ai làm |
|---|---|---|---|
| 0 | Tạo repo `k26game3`, chốt quyết định D1–D6 | 0,5 ngày | **Anh/chị** |
| 1 | Nền tảng: repo, lớp nền (từ Game 2), Auth dùng chung, dữ liệu, CI | 3–4 ngày | Claude Code |
| 2 | Game Engine: bản đồ, avatar, nhiệm vụ, mở khóa, XP/huy hiệu, trạng thái phiên, giờ server | 1 tuần | Claude Code |
| 3 | 4 trạm thử thách (Nghe, Đọc, Viết, Nói) + 8 nhiệm vụ | 2 tuần | Claude Code + **giảng viên duyệt nội dung** |
| 4 | AI: soạn câu hỏi, giải thích, chấm Viết, chấm Nói, Coach, phân tích | 1,5 tuần | Claude Code |
| 5 | Thi thử + giải đấu + hồ sơ 4 kỹ năng | 1,5 tuần | Claude Code + **chuyên môn duyệt cấu trúc đề** |
| 6 | Dashboard, báo cáo, CSV, API LMS, hạn mức | 1 tuần | Claude Code |
| 7 | Kiểm thử đầy đủ, tài liệu, hướng dẫn Cowork | 1 tuần (song song từ GĐ 1) | Claude Code |

---

## 1. Quyết định cần anh/chị duyệt

| # | Vấn đề | Đề xuất | Phương án khác |
|---|---|---|---|
| **D1** | Repository | Repo mới **`thoannv1976/k26game3`** (anh/chị tạo repo trống như Game 2) | Tên `vstep-quest` như đặc tả |
| **D2** | Hạ tầng | **Dùng chung project `k26game1`** như Game 2: Firestore database riêng **`vstep`**, Cloud Run **`vstep-api`**, Hosting **`k26-vstep.web.app`**, bucket âm thanh riêng **`k26game1-vstep-audio`**. Một tài khoản dùng cho cả 3 game | Project riêng (tài khoản riêng, cấu hình lại từ đầu) |
| **D3** | Tái sử dụng | **Sao chép lớp nền đã kiểm thử** từ Game 2 + pipeline giọng nói từ Game 1 (ghi âm WAV, Speech-to-Text, đo trôi chảy, TTS có cache). Việc tách thành thư viện chung cho cả 3 game làm **sau v1.0** như một đợt tái cấu trúc riêng | Tách thư viện chung ngay (sạch hơn nhưng +2 tuần và phải sửa cả Game 1, 2 đang chạy) |
| **D4** | Kết nối dữ liệu 3 game (đặc tả: "VSTEP Quest kết nối dữ liệu của cả ba game") | **Có trong v1.0, qua API, chỉ đọc**: trang "Hồ sơ 4 kỹ năng" tổng hợp kết quả Game 3 + nhập minh chứng từ API LMS của Game 1 và Game 2 (`k26-evidence-1.0`). Game 1, 2 cần **sửa nhỏ**: cho phép tài khoản dịch vụ `vstep-api` gọi `/api/lms/v1/*` (xác thực Google OIDC giữa các dịch vụ Cloud Run) | Chỉ dữ liệu Game 3 trong v1.0; nối 3 game khi có Central API Platform |
| **D5** | Bài thi thử | **Khung cấu trúc theo VSTEP, cấu hình được** (số phần, số câu, thời lượng, thang điểm, bảng quy đổi do trường nhập). Bài thi thử mẫu v1.0 là **bản rút gọn ~75 phút** (Nghe 3 phần ~15 câu, Đọc 2–3 bài ~20 câu, Viết 2 bài, Nói 3 phần), nội dung tự soạn, ghi rõ "thi thử – không phải kỳ thi VSTEP chính thức". Bộ phận chuyên môn duyệt trước khi mở | Bài thi thử đủ độ dài (~3 giờ, ~75 câu Nghe–Đọc): tốn nhiều nội dung và thời gian duyệt hơn đáng kể |
| **D6** | Âm thanh bài Nghe | **Soạn kịch bản gốc + tạo giọng bằng Text-to-Speech** (nhiều giọng Anh-Mỹ/Anh-Anh cho hội thoại), tạo sẵn khi duyệt, lưu Cloud Storage; giảng viên **nghe duyệt** trước khi xuất bản. Có thể tải lên file ghi âm thật thay thế | Chỉ dùng file ghi âm do trường cung cấp (chất lượng tự nhiên hơn nhưng phụ thuộc nguồn bản quyền) |

Các quyết định kỹ thuật mặc định:

| # | Vấn đề | Quyết định |
|---|---|---|
| T1 | Giờ thi | Server quản lý: `startedAt`, `deadline`; câu trả lời sau hạn bị từ chối; hết giờ tự nộp. **Cloud Scheduler** gọi job nội bộ mỗi 5 phút để chốt bài hết giờ và xử lý bài chờ chấm (kết quả có cả khi sinh viên đóng trình duyệt) |
| T2 | Chấm Viết/Nói | Bất đồng bộ như Game 2 (khóa chống chấm trùng, tự thử lại), cộng job định kỳ ở T1 |
| T3 | Phát âm | **Không chấm phát âm bằng AI** trong v1.0 (chỉ có transcript): ghi "Chờ giảng viên thẩm định". Độ trôi chảy đo từ dữ liệu âm thanh (tốc độ nói, ngắt quãng) như Game 1, chỉ khi đủ dữ liệu |
| T4 | Mất kết nối | Câu trả lời lưu ngay từng câu (hàng đợi trên trình duyệt khi mất mạng, gửi lại khi có mạng, chống trùng bằng id); bài viết tự lưu có phiên bản; bản ghi âm giữ trên máy đến khi tải lên thành công |
| T5 | Nghe trong thi thử | Mỗi đoạn phát **một lần** (cấu hình được), không tua; Quest Mode cho nghe lại theo giới hạn |
| T6 | Mô hình AI | Model Gemini đang chạy ở project (`gemini-3-flash-preview`), giới hạn "thinking" (bài học từ Game 1) |

---

## 2. Kiến trúc

```
Trình duyệt (React SPA) ── Firebase Auth (dùng chung 3 game)
     │ /api/** + ID token
     ▼
Hosting "k26-vstep" ──► Cloud Run "vstep-api" (asia-southeast1)
                          ├─ Firestore database "vstep"
                          ├─ Cloud Storage "k26game1-vstep-audio" (âm thanh bài Nghe đã duyệt; bản ghi Nói của SV – tự xóa theo hạn)
                          ├─ Vertex AI Gemini · Speech-to-Text · Text-to-Speech
                          ├─ (D4) gọi API LMS của Game 1 & 2 bằng danh tính dịch vụ – chỉ đọc
                          └─ Cloud Scheduler → /internal/jobs (chốt bài hết giờ, chấm bài tồn)
```

```
apps/web  apps/api  packages/shared  packages/game-engine  packages/ai
content/quests (8 nhiệm vụ)  content/items (ngân hàng câu hỏi mẫu)  content/exams (khung + bài thi thử)
firebase/ infrastructure/ scripts/ tests/ docs/ .github/workflows/
```

---

## 3. Mô hình nội dung

**Ngân hàng câu hỏi (`question_bank`)** – mỗi mục có: kỹ năng, cấp độ, chủ đề, mục tiêu đánh giá, độ khó dự kiến, dạng câu
(trắc nghiệm, đúng/sai/không có thông tin, điền ngắn, ghép thông tin, viết, nói), nội dung (đoạn đọc/kịch bản nghe/đề viết/đề nói),
**đáp án hoặc rubric**, lời giải thích mẫu, nguồn (tự soạn / AI tạo), **trạng thái duyệt** và phiên bản. Chỉ mục đã duyệt mới dùng
được; **mục do AI tạo không bao giờ vào bài thi thử khi chưa duyệt**.

**Nhiệm vụ (`quests`)** – chuỗi thử thách tăng độ khó (ví dụ L01: số hiệu chuyến bay → cổng → giờ thay đổi → chọn hành động),
điều kiện mở khóa, XP, huy hiệu, giới hạn làm lại.

| Mã | Khu vực | Nhiệm vụ | Cấp độ | Nội dung chính |
|---|---|---|---|---|
| L01 | Listening | Airport Announcements | B1 | 4 thông báo sân bay, 4 thử thách tăng dần (đặc tả V) |
| L02 | Listening | University Lecture | B2 | Bài giảng ngắn + ghi chú + câu hỏi suy luận |
| R01 | Reading | International Student Life | B1 | Email, thông báo, bài báo ngắn; tìm thông tin, ý chính |
| R02 | Reading | Technology and Society | B2 | Văn bản học thuật; suy luận, quan điểm tác giả |
| W01 | Writing | Responding to an Email | B1 | Viết thư/email ~120 từ |
| W02 | Writing | Discussing an Educational Issue | B2 | Bài luận ~250 từ |
| S01 | Speaking | Everyday Social Communication | B1 | Giới thiệu bản thân, trả lời câu hỏi chủ đề |
| S02 | Speaking | Discussing Solutions to a Problem | B2 | Tình huống + phương án, chuẩn bị 1 phút, trình bày, câu hỏi mở rộng (đặc tả V) |

**Khung đề (`exam_blueprints`)** – phần, dạng câu, số câu, thời lượng, thang điểm, rubric, bảng quy đổi (trường nhập, chuyên môn xác nhận).
**Bài thi thử (`mock_exams`)** – một phiên bản đề cố định lắp từ mục đã duyệt theo khung.

Tất cả nội dung là **tự soạn**, không dùng đề/tài liệu có bản quyền.

---

## 4. Game Engine (code xác định)

- **Thế giới & mở khóa:** nhiệm vụ mở theo điều kiện (hoàn thành nhiệm vụ trước, đạt XP/cấp độ, hoặc lộ trình giảng viên giao).
- **Phiên chơi & bài làm:** trạng thái do server giữ; mỗi câu trả lời có id chống trùng; nộp một lần; bài thi khóa sau hạn.
- **Chấm tự động Nghe/Đọc:** theo đáp án đã duyệt (chuẩn hóa chữ/dấu như Game 2).
- **Hai hệ thống điểm tách riêng:**
  - **Learning Assessment Score**: 0–100 cho từng kỹ năng; điểm tổng hợp tham khảo = trung bình 4 kỹ năng **chỉ khi đủ 4 kết quả hợp lệ**.
    Bài thi thử dùng thang và bảng quy đổi do trường phê duyệt; **không tuyên bố đạt chứng chỉ VSTEP**.
  - **XP**: hoàn thành nhiệm vụ, chuỗi ngày luyện tập, thử thách mới, thành tích. Không thay điểm năng lực.
- **Huy hiệu:** Listening Explorer, Reading Master, Writing Challenger, Speaking Champion, Four-Skill Explorer, Daily Learning Hero
  (thành tích trong game, không phải chứng nhận trình độ).
- **Avatar:** chọn nhân vật, đổi trang phục/phụ kiện mở khóa bằng XP (không mua bán).

---

## 5. Hệ thống AI

| Thành phần | Khi nào | Kiểm soát |
|---|---|---|
| **Question Generator** | Giảng viên tạo câu hỏi/nhiệm vụ | Chỉ tạo **bản nháp** có đủ metadata + đáp án/rubric; kiểm tra nhất quán bằng code; duyệt mới dùng |
| **Listening & Reading Explainer** | **Sau khi** trả lời trong Quest Mode | Giải thích đúng/sai, trích dẫn từ bài đọc/kịch bản nghe (kiểm tra trích dẫn có thật); tắt trong thi thử |
| **Writing Grader** | Sau khi nộp | Task Fulfillment, Organization & Coherence, Vocabulary, Grammar; ví dụ lỗi **phải trích đúng từ bài** (như Game 2); lưu bài gốc, phiên bản rubric/prompt/model |
| **Speaking Grader** | Sau khi nộp | Lưu âm thanh → Speech-to-Text → AI chấm Task Fulfillment, Vocabulary, Grammar từ transcript; **Fluency** từ dữ liệu thời gian (khi đủ dữ liệu); **Pronunciation: chờ giảng viên**; tiêu chí thiếu dữ liệu ghi "chưa đánh giá" |
| **Learning Coach** | Quest Mode | Giải thích lỗi, phương pháp, từ vựng, kế hoạch ôn luyện; **không thấy đáp án câu đang làm**; tắt trong thi thử |
| **Learning Analytics** | Dashboard | Phần lớn là thống kê bằng code (dạng bài hay sai, chủ đề yếu, tiến bộ); AI viết nhận xét tóm tắt (lưu cache) |

Bắt buộc: prompt riêng từng chức năng, schema đầu ra + zod, giới hạn token/lượt, ghi chi phí, xử lý lỗi, chống prompt injection,
**không đưa đáp án/rubric bí mật cho người học trong chế độ thi**, **AI không sửa điểm đã thẩm định**.

---

## 6. Thi thử và giải đấu

**Thi thử:** sinh viên vào bài → server đặt hạn giờ theo từng phần/kỹ năng → tắt Coach, giải thích, gợi ý → nghe một lần → viết tự lưu →
ghi âm phần nói → nộp hoặc hết giờ tự nộp → Nghe/Đọc chấm ngay, Viết/Nói chấm AI bất đồng bộ → giảng viên thẩm định → kết quả
có dòng "điểm tham khảo, không phải chứng chỉ VSTEP". Đáp án chỉ hiện sau khi giảng viên cho phép.

**Giải đấu (bất đồng bộ):** giảng viên tạo giải (cá nhân / đội / lớp), chọn nhiệm vụ, thời gian mở–đóng, quy tắc tính điểm →
sinh viên làm trong thời hạn → bảng xếp hạng theo **điểm giải đấu** (từ điểm trò chơi và kết quả đã chấm); **điểm Nói/Viết chưa thẩm định
không tự động quyết định thứ hạng chính thức** (hiển thị "tạm tính" cho đến khi giảng viên xác nhận) → chốt giải, trao huy hiệu, báo cáo thành tích.

---

## 7. Dữ liệu (Firestore database `vstep`, theo trường)

`tenants/{t}`: `users`, `courses`, `assignments`, `question_bank/{id}/versions`, `quests/{id}/versions`, `exam_blueprints`,
`mock_exams/{id}/versions`, `game_sessions` (+ `attempts`/câu trả lời theo id), `writing_submissions` (phiên bản), `speaking_recordings`
(metadata + đường dẫn âm thanh), `assessments`, `championships` (+ đội, bảng điểm), `achievements`, `learning_profiles`,
`usage_counters`, `usage_logs`, `audit_logs`. Đáp án, rubric, đề thi chỉ backend đọc; Firestore Rules cấm client ghi và cấm đọc nội dung đề.

---

## 8. Giao diện

| Màn hình | Nội dung |
|---|---|
| Tạo nhân vật | Chọn avatar, tên hiển thị |
| Bản đồ Quest World | 4 khu vực 2.5D (SVG), nhiệm vụ đã xong / đang mở / bị khóa, lộ trình giảng viên giao |
| Màn thử thách | Tự đổi theo kỹ năng: **Nghe** (trình phát, số lần nghe còn lại, câu hỏi) · **Đọc** (văn bản + câu hỏi song song) · **Viết** (đề, đếm từ, tự lưu, đồng hồ) · **Nói** (đề, đồng hồ chuẩn bị, ghi âm, nghe lại, câu hỏi mở rộng) |
| Kết quả | Điểm, đáp án và giải thích (khi được phép), XP, huy hiệu, nhận xét AI, nhiệm vụ đề xuất |
| Thi thử | Màn thi có đồng hồ server, điều hướng phần, cảnh báo trước khi hết giờ, nộp bài |
| Giải đấu | Danh sách giải, thời hạn, thử thách, bảng xếp hạng, thành tích |
| Hồ sơ 4 kỹ năng | Biểu đồ 4 kỹ năng (đủ/thiếu dữ liệu), tiến bộ theo thời gian, dạng bài hay sai, kế hoạch ôn luyện; (D4) minh chứng từ Game 1 & 2 |
| Giảng viên | Lớp, giao nhiệm vụ/lộ trình, tạo bài thi thử từ khung, tạo giải đấu, **hàng chờ thẩm định Viết/Nói (nghe bản ghi)**, báo cáo, CSV |
| Quản trị | Người dùng, lớp, **ngân hàng câu hỏi + AI soạn câu hỏi + duyệt (kèm nghe âm thanh)**, khung đề, cấu hình AI, hạn mức, chi phí, nhật ký |

Responsive (điện thoại), hỗ trợ bàn phím và trình đọc màn hình, thông báo lỗi rõ ràng; tiếng Việt/Anh.

---

## 9. Kiểm thử bắt buộc

Unit, Integration (Firebase Emulator), E2E (Playwright), Rules; thêm các kiểm thử đặc thù:
**chống lộ đáp án** (API/Rules không trả đáp án, trợ giúp tắt trong thi thử) · **giới hạn thời gian** (giờ server, câu trả lời sau hạn bị từ chối,
tự nộp) · **lưu bài khi mất kết nối** (hàng đợi câu trả lời, bản nháp, bản ghi âm chờ tải) · **chống gửi trùng** (câu trả lời, bài nộp, chấm) ·
**chi phí và hạn mức** · **AI** (giả lập + kiểm thử thủ công với Gemini thật: giải thích trích dẫn đúng, chấm có cơ sở, Coach không lộ đáp án) ·
phân quyền và tách dữ liệu trường · giải đấu (điểm chưa thẩm định không quyết định thứ hạng) · 8 nhiệm vụ và bài thi thử chạy trọn.

---

## 10. Ánh xạ tiêu chí nghiệm thu (đặc tả XV)

| # | Tiêu chí | GĐ |
|---|---|---|
| 1 | Đăng nhập, chọn nhân vật, vào thế giới | 1–2 |
| 2–3 | 4 khu vực, 8 nhiệm vụ hoạt động | 3 |
| 4 | Chấm Nghe/Đọc chính xác theo đáp án duyệt | 3 |
| 5–6 | Soạn, lưu, nộp bài Viết; ghi âm và nộp bài Nói | 3 |
| 7–8 | AI chấm sơ bộ Nói/Viết; giảng viên thẩm định | 4, 6 |
| 9 | Ít nhất một bài thi thử 4 kỹ năng | 5 |
| 10 | Giải đấu bất đồng bộ + bảng xếp hạng | 5 |
| 11 | XP, huy hiệu, mở khóa | 2 |
| 12 | Dashboard SV/GV/quản trị | 6 |
| 13 | API LMS-AI9 | 6 |
| 14–15 | Tách dữ liệu trường; hạn mức chi phí AI | 1–6 |
| 16 | Kiểm thử chức năng và bảo mật | 7 |
| 17–18 | Triển khai GCP/Firebase; bàn giao mã và tài liệu | 7 |

---

## 11. Chi phí ước tính (tham khảo)

| Hoạt động | Ước tính / lượt |
|---|---|
| Nhiệm vụ Nghe/Đọc (máy chấm; giải thích AI khi yêu cầu) | ~0,005–0,01 USD |
| Nhiệm vụ Viết (1 lần chấm) | ~0,01–0,02 USD |
| Nhiệm vụ Nói (STT 2–4 phút + chấm) | ~0,05–0,08 USD |
| Bài thi thử 4 kỹ năng | ~0,15–0,25 USD |
| Âm thanh bài Nghe (TTS) | Tạo **một lần** khi duyệt, không tốn theo lượt nghe |

Ví dụ 200 SV × (8 nhiệm vụ + 2 bài thi thử)/tháng ≈ **120–200 USD/tháng**. Hạn mức Vertex AI/Speech **dùng chung với Game 1, 2** trong project
`k26game1` – cần theo dõi khi nhiều lớp dùng cùng lúc.

---

## 12. Rủi ro

| Rủi ro | Xử lý |
|---|---|
| Cấu trúc đề chưa đúng VSTEP mà trường áp dụng | Khung đề cấu hình được; chuyên môn xác nhận trước khi mở; ghi rõ "thi thử" |
| Bản quyền nội dung | Toàn bộ nội dung tự soạn; AI chỉ tạo bản nháp; giảng viên duyệt |
| Âm thanh TTS chưa tự nhiên | Nhiều giọng, tốc độ theo cấp độ, giảng viên nghe duyệt; cho phép thay bằng file ghi âm thật |
| Gian lận khi thi thử trực tuyến | Đây là thi thử luyện tập: giờ server, nghe một lần, tắt trợ giúp; không giám sát (proctoring) trong v1.0 |
| Chấm Nói thiếu tin cậy | Chỉ chấm tiêu chí có dữ liệu; phát âm chờ giảng viên; giảng viên nghe lại và thẩm định |
| Hạn mức AI dùng chung 3 game | Hạn mức nội bộ theo game/trường; theo dõi quota Vertex; xin tăng quota nếu cần |
| Phạm vi lớn | Làm theo giai đoạn, báo cáo sau mỗi giai đoạn; nội dung soạn song song |

---

## 13. Ngoài phạm vi v1.0 (kiến trúc chừa sẵn)

Thi đấu thời gian thực, giải liên trường, chấm phát âm tự động bằng công cụ chuyên dụng, giám sát thi, LTI 1.3/SSO LMS-AI9,
đồng bộ sổ điểm Moodle, Central API Platform, tách thư viện nền chung cho 3 game.

---

## 14. Bước tiếp theo

1. Anh/chị duyệt kế hoạch và chọn **D1–D6**.
2. Tạo repo trống **`thoannv1976/k26game3`** (Public, không tích README) và cấp quyền cho Claude như Game 2.
3. Nếu chọn D4 = có: tôi sẽ sửa nhỏ Game 1 và Game 2 (cho phép `vstep-api` đọc API LMS) trong cùng đợt.
4. Tôi làm lần lượt GĐ 1 → 7, báo cáo sau mỗi giai đoạn, cuối cùng gửi hướng dẫn cho Claude Cowork triển khai.
