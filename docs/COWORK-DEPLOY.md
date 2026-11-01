# Hướng dẫn cho Claude Cowork – Triển khai VSTEP Quest (Game 3)

> Sao chép toàn bộ khối bên dưới và dán vào Claude Cowork.

```text
NHIỆM VỤ: Triển khai "VSTEP Quest" (repo GitHub https://github.com/thoannv1976/k26game3, nhánh claude/game3-vstep)
vào CÙNG Google Cloud project "k26game1" đang chạy English City Simulator (Game 1) và English Detective (Game 2).
Game 3 dùng chung Firebase Authentication (cùng tài khoản) nhưng có Firestore database riêng "vstep", Cloud Run riêng
"vstep-api", bucket âm thanh riêng "k26game1-vstep-audio", Cloud Scheduler "vstep-jobs-tick" và trang web riêng
https://k26-vstep.web.app. KHÔNG xóa/sửa tài nguyên của Game 1 (ecs-api, database (default), site k26game1) và Game 2
(detective-api, database detective, site k26-detective) – ngoại trừ BƯỚC 10 (triển khai lại Game 1, 2 bằng script của chúng).
Làm việc trong trình duyệt của tôi (đã đăng nhập Google Cloud/Firebase bằng tài khoản thứ 2, authuser=1) và Cloud Shell của project k26game1.
Tài liệu chi tiết: docs/DEPLOYMENT.md trong repo (mục 9 = xử lý sự cố).

NGUYÊN TẮC
- Không tạo khóa JSON service account, không commit gì lên GitHub, không xóa tài nguyên có sẵn.
- Mỗi bước: chạy, đọc kết quả, chỉ sang bước sau khi thành công; lỗi không tự xử lý được → dừng, báo tôi nguyên văn.
- Hỏi tôi trước khi thay đổi chính sách tổ chức hoặc quyền cấp tổ chức.

BƯỚC 1 – Lấy mã nguồn (Cloud Shell)
  gcloud config set project k26game1
  cd ~ && git clone https://github.com/thoannv1976/k26game3.git && cd k26game3 && git checkout claude/game3-vstep
  git log --oneline -1
  source ~/.nvm/nvm.sh && nvm install 22 && nvm use 22

BƯỚC 2 – Hạ tầng cho Game 3
  bash infrastructure/bootstrap.sh
Bật API Speech-to-Text, Text-to-Speech, Storage, Cloud Scheduler; tạo database "vstep", bucket k26game1-vstep-audio
(bản ghi .wav tự xóa sau 30 ngày), Artifact Registry "vstep", service account vstep-api, vstep-scheduler, deployer +
Workload Identity Federation cho repo k26game3. Lưu lại phần in ra cuối cùng.

BƯỚC 3 – Model Gemini
Dùng model và location đang chạy cho Game 1/2. Kiểm tra:
  gcloud run services describe ecs-api --region asia-southeast1 --format="value(spec.template.spec.containers[0].env)"
Ghi lại GEMINI_MODEL và VERTEX_LOCATION (đã kiểm chứng: gemini-3-flash-preview + global). KHÔNG dùng gemini-2.5-flash (404).

BƯỚC 4 – Cấu hình web (dùng lại Web App của Game 1)
Nếu đã có ~/k26game2/apps/web/.env.production hoặc ~/k26game1/apps/web/.env.production thì sao chép:
  cp ~/k26game2/apps/web/.env.production apps/web/.env.production || cp ~/k26game1/apps/web/.env.production apps/web/.env.production
Nếu không có: Firebase Console → k26game1 → Project settings → Your apps → (web app của Game 1) → firebaseConfig, rồi tạo:
  cat > apps/web/.env.production <<'EOF'
  VITE_FIREBASE_API_KEY=<apiKey>
  VITE_FIREBASE_AUTH_DOMAIN=k26game1.firebaseapp.com
  VITE_FIREBASE_PROJECT_ID=k26game1
  VITE_FIREBASE_APP_ID=<appId>
  VITE_USE_AUTH_EMULATOR=false
  EOF
(Xóa khoảng trắng đầu dòng. Kiểm tra VITE_USE_AUTH_EMULATOR=false. Không commit file này.)

BƯỚC 5 – Đăng nhập CLI (nếu Cloud Shell chưa đăng nhập từ lần triển khai trước)
  gcloud auth application-default login
  gcloud auth application-default set-quota-project k26game1
  npx --yes firebase-tools@14.27.0 login --no-localhost
(Mở link, cho phép bằng đúng tài khoản sở hữu project, dán mã xác nhận.)

BƯỚC 6 – Triển khai Game 3
  GEMINI_MODEL=<model bước 3> VERTEX_LOCATION=<location bước 3> bash scripts/deploy.sh
Script build image (Cloud Build), deploy Cloud Run vstep-api, tạo/cập nhật Cloud Scheduler vstep-jobs-tick (mỗi 5 phút),
tạo Hosting site k26-vstep (nếu chưa có), deploy web + Firestore rules/indexes cho database vstep, rồi kiểm tra
https://k26-vstep.web.app/api/health. Bị chặn bởi chính sách tổ chức (lỗi có "constraint"/"organization policy") → DỪNG, báo tôi.

BƯỚC 7 – Authorized domains (Firebase Console)
Authentication → Settings → Authorized domains → Add domain: k26-vstep.web.app và k26-vstep.firebaseapp.com.

BƯỚC 8 – Dữ liệu ban đầu (Cloud Shell, trong thư mục ~/k26game3)
Dùng CÙNG mã trường với Game 1 (hỏi tôi nếu không biết; mặc định demo-university):
  npx tsx scripts/seed.mts --project k26game1 --tenant demo-university --name "Trường Đại học (thử nghiệm)" \
    --admin-email <EMAIL QUẢN TRỊ – hỏi tôi> --demo --approve --approve-exams
(--approve tạo âm thanh bài Nghe bằng Text-to-Speech, mất 1–3 phút. --approve-exams xuất bản bài thi thử MX1 để thử nghiệm;
 khi dùng thật, bộ phận chuyên môn sẽ duyệt lại.) Chép lại bảng tài khoản in ra.

BƯỚC 9 – Kiểm tra (trình duyệt)
1. https://k26-vstep.web.app/api/health → "app":"vstep-quest","ai":"vertex","database":"vstep","env":"production".
2. Đăng nhập quản trị → Quản trị → AI & hạn mức → "Kiểm tra kết nối AI" → ok.
3. Đăng nhập student1@demo.edu.vn (mật khẩu trong bảng ở bước 8) → "Thế giới nhiệm vụ" → Listening Island → L01 → "Bắt đầu nhiệm vụ".
   - Bấm Nghe → phải NGHE được giọng đọc tiếng Anh; số lượt nghe giảm.
   - Trả lời câu hỏi → hiện đúng/sai + giải thích + trích dẫn; bấm "Giải thích bằng AI" → có giải thích.
   - Làm hết 4 thử thách → "Nộp nhiệm vụ" → kết quả, XP; quest L02 được mở khóa.
4. Writing Academy → W01 → viết 2 bài (~120 từ mỗi bài) → "Nộp nhiệm vụ" → sau ~10–30 giây có điểm 4 tiêu chí + nhận xét.
5. Speaking Arena → S01 → cho phép micro → đồng ý thông báo ghi âm → ghi 3 phần (mỗi phần ≥ 25 giây) → thấy transcript →
   "Nộp nhiệm vụ" → có điểm; tiêu chí phát âm hiển thị "Chờ giảng viên".
6. Menu "Thi thử" → MX1 → "Bắt đầu thi thử" → "Bắt đầu phần thi" → đồng hồ đếm ngược chạy; trả lời 1 câu; "Kết thúc phần thi"
   lần lượt 4 phần → kết quả ghi "Chưa công bố đáp án".
7. Đăng nhập teacher@demo.edu.vn → "Hàng chờ thẩm định" → mở bài S01 → nghe bản ghi → nhập điểm phát âm → Lưu;
   lớp ENG101 → tab Kết quả → công bố đáp án thi thử; menu "Giải đấu" → tạo giải cho ENG101 với quest R01.
8. Sinh viên → "Hồ sơ 4 kỹ năng" → hiện biểu đồ 4 kỹ năng; bài thi thử MX1 giờ hiện đáp án (đã công bố ở mục 7).
9. Cloud Scheduler → vstep-jobs-tick → "Force run" → Success. Cloud Run → vstep-api → Logs: có "jobs.tick", không có PERMISSION_DENIED.
10. Mở https://k26game1.web.app bằng cùng tài khoản sinh viên → vẫn đăng nhập và chơi được Game 1.

BƯỚC 10 – Kết nối dữ liệu 3 game (Game 1 và Game 2 cho phép vstep-api đọc minh chứng – chỉ đọc)
Triển khai lại Game 1 và Game 2 bằng mã mới nhất (cùng model/location ở bước 3; file apps/web/.env.production của mỗi game đã có
từ lần trước – nếu thiếu, tạo như bước 4):
  cd ~/k26game1 && git fetch origin && git checkout claude/kind-faraday-0vksvn && git pull origin claude/kind-faraday-0vksvn
  git log --oneline -1        # phải thấy "LMS: learner evidence endpoint readable by the VSTEP Quest service account (D4)"
  GEMINI_MODEL=<model> VERTEX_LOCATION=<location> bash scripts/deploy.sh
  cd ~/k26game2 && git fetch origin && git checkout claude/game2-detective && git pull origin claude/game2-detective
  git log --oneline -1        # phải thấy cùng dòng "LMS: learner evidence endpoint ... (D4)"
  GEMINI_MODEL=<model> VERTEX_LOCATION=<location> bash scripts/deploy.sh
(Nếu chưa có thư mục: cd ~ && git clone https://github.com/thoannv1976/k26game1.git (hoặc k26game2.git) rồi chạy các lệnh trên.
 Nếu Game 2 chưa từng triển khai thì bỏ qua Game 2.)
Sau đó triển khai lại Game 3 để nó nhận URL của 2 game:
  cd ~/k26game3 && GEMINI_MODEL=<model> VERTEX_LOCATION=<location> bash scripts/deploy.sh
Kiểm tra: Game 1 (k26game1.web.app) và Game 2 (k26-detective.web.app) vẫn chạy; trang Hồ sơ 4 kỹ năng của Game 3 hiện phần
"Minh chứng từ các game khác" với trạng thái kết nối OK (có thể 0 mục nếu sinh viên chưa chơi Game 1/2).

BÁO CÁO CHO TÔI
- URL https://k26-vstep.web.app, GEMINI_MODEL / VERTEX_LOCATION đã dùng
- Kết quả từng mục ở bước 9 và bước 10 (đạt/không đạt, ảnh chụp nếu không đạt)
- Bảng tài khoản ở bước 8 và phần in ra cuối của bootstrap.sh
```
