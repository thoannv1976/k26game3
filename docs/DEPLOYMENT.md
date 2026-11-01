# DEPLOYMENT – Triển khai VSTEP Quest (Game 3)

VSTEP Quest chạy **trong cùng project GCP/Firebase với Game 1 và Game 2** (`k26game1`):

| Thành phần | Game 1 | Game 2 | Game 3 (mới) |
|---|---|---|---|
| Firebase Auth | dùng chung | dùng chung | dùng chung (cùng tài khoản) |
| Firestore | `(default)` | `detective` | **`vstep`** |
| Cloud Run | `ecs-api` | `detective-api` | **`vstep-api`** |
| Hosting | `k26game1.web.app` | `k26-detective.web.app` | **`k26-vstep.web.app`** |
| Cloud Storage | `k26game1-audio` | – | **`k26game1-vstep-audio`** (âm thanh bài Nghe .mp3 + bản ghi Nói .wav, .wav tự xóa sau 30 ngày) |
| Service account | `ecs-api@…` | `detective-api@…` | **`vstep-api@…`** (Firestore chỉ database `vstep`, Storage chỉ bucket của mình) |
| Cloud Scheduler | – | – | **`vstep-jobs-tick`** mỗi 5 phút (SA `vstep-scheduler@…`) |

Không tài nguyên nào của Game 1/2 bị thay đổi, trừ việc **triển khai lại Game 1 và Game 2** (mục 7) để bật endpoint chỉ đọc
cho hồ sơ 4 kỹ năng (D4).

## 0. Điều kiện

- Game 1 đã triển khai trên `k26game1` (billing, Firebase, Authentication đã bật). Game 2 có thể có hoặc chưa.
- Model Gemini đang chạy cho Game 1/2 (đã kiểm chứng: `gemini-3-flash-preview`, location `global`; `gemini-2.5-flash` trả 404).
- Cấu hình Web App Firebase của Game 1 (`apiKey`, `appId`) – dùng lại.

## 1. Mã nguồn

```bash
git clone https://github.com/thoannv1976/k26game3.git && cd k26game3 && git checkout claude/game3-vstep
```

## 2. Hạ tầng (một lần)

```bash
bash infrastructure/bootstrap.sh
```

Bật thêm API Speech-to-Text, Text-to-Speech, Cloud Storage, Cloud Scheduler; tạo database `vstep` (asia-southeast1), bucket
`k26game1-vstep-audio` (lifecycle xóa `.wav` sau `AUDIO_RETENTION_DAYS`=30 ngày), Artifact Registry `vstep`, service account
`vstep-api` (IAM có điều kiện: chỉ database `vstep`), `vstep-scheduler`, deployer `gh-vstep-deployer` + Workload Identity
Federation cho repo `thoannv1976/k26game3`. Chạy lại an toàn.

## 3. Cấu hình web

```bash
cp apps/web/.env.example apps/web/.env.production
```

Điền **giống Game 1**: `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN=k26game1.firebaseapp.com`, `VITE_FIREBASE_PROJECT_ID=k26game1`,
`VITE_FIREBASE_APP_ID`, `VITE_USE_AUTH_EMULATOR=false`. Không commit file này.

## 4. Triển khai

Đăng nhập một lần trong Cloud Shell:

```bash
gcloud auth application-default login && gcloud auth application-default set-quota-project k26game1
```

```bash
npx --yes firebase-tools@14.27.0 login --no-localhost
```

```bash
GEMINI_MODEL=gemini-3-flash-preview VERTEX_LOCATION=global bash scripts/deploy.sh
```

Script: cài thư viện → unit test → Cloud Build image → Cloud Run `vstep-api` (biến `FIRESTORE_DATABASE=vstep`, `AUDIO_BUCKET`,
`JOBS_INVOKERS`, `PEER_CITY_URL`/`PEER_DETECTIVE_URL` tự lấy từ `ecs-api`/`detective-api` nếu có) → tự tắt invoker IAM check nếu
tổ chức chặn truy cập công khai → `JOBS_AUDIENCE` = URL Cloud Run → tạo/cập nhật Cloud Scheduler `vstep-jobs-tick` → build web →
tạo Hosting site `k26-vstep` nếu chưa có → deploy Hosting + rules/indexes database `vstep` → kiểm tra `/api/health`.

**Firebase Console → Authentication → Settings → Authorized domains:** thêm `k26-vstep.web.app` và `k26-vstep.firebaseapp.com`.

## 5. Dữ liệu ban đầu

Dùng **cùng mã trường** với Game 1 (ví dụ `demo-university`):

```bash
npx tsx scripts/seed.mts --project k26game1 --tenant demo-university --name "Trường Đại học (thử nghiệm)" --admin-email <email-quan-tri> --demo --approve
```

- `--approve`: xuất bản ngân hàng câu hỏi + 8 quest và **tạo sẵn âm thanh bài Nghe bằng Text-to-Speech** (≈ 20 nghìn ký tự, chi phí rất nhỏ).
- Bài thi thử `mx1` vẫn ở **nháp**: quản trị trường (bộ phận chuyên môn) xem và bấm Duyệt trong Quản trị → Nội dung → Bài thi thử.
  Muốn xuất bản ngay khi thử nghiệm: thêm `--approve-exams`.
- Tài khoản đã có từ Game 1/2 giữ nguyên mật khẩu.

## 6. Kiểm tra

1. `https://k26-vstep.web.app/api/health` → `{"ok":true,"app":"vstep-quest","ai":"vertex","database":"vstep","env":"production"}`.
2. Quản trị → AI & hạn mức → **Kiểm tra kết nối AI** → ok.
3. Sinh viên demo: Quest World → Listening Island → L01 → bấm Nghe → có âm thanh (giọng Anh) → trả lời → thấy giải thích, "Giải thích bằng AI".
4. W01: viết 2 bài → nộp → sau ~10–30 giây có điểm 4 tiêu chí + nhận xét.
5. S01: cho phép micro, đồng ý thông báo ghi âm, ghi 3 phần → nộp → có transcript, độ trôi chảy; phát âm "chờ giảng viên".
6. Giảng viên: lớp ENG101 → Hàng chờ thẩm định → chấm phát âm → kết quả sinh viên cập nhật.
7. Cloud Scheduler → `vstep-jobs-tick` → Run now → trạng thái Success; Cloud Run `vstep-api` → Logs có `jobs.tick`, không có `PERMISSION_DENIED`.

## 7. Kết nối dữ liệu 3 game (D4, tùy chọn nhưng nên làm)

Game 1 và Game 2 có endpoint mới `GET /api/lms/v1/learners/:uid/evidence` chỉ đọc, chấp nhận Google ID token của `vstep-api`
(audience `k26-lms`, header `X-K26-Tenant`). Biến `LMS_SERVICE_ACCOUNTS` mặc định `vstep-api@k26game1.iam.gserviceaccount.com`
trong `scripts/deploy.sh` của 2 game. Triển khai lại:

```bash
cd ~/k26game1 && git pull && GEMINI_MODEL=<model> VERTEX_LOCATION=<location> bash scripts/deploy.sh
```

```bash
cd ~/k26game2 && git pull && GEMINI_MODEL=<model> VERTEX_LOCATION=<location> bash scripts/deploy.sh
```

Sau đó **triển khai lại Game 3** (mục 4) để `PEER_CITY_URL`/`PEER_DETECTIVE_URL` được điền. Trang Hồ sơ 4 kỹ năng hiện "Minh chứng từ
English City Simulator / English Detective". Nếu một game chưa triển khai, hồ sơ vẫn chạy bình thường (chỉ báo nguồn không khả dụng).

## 8. GitHub Actions (tùy chọn)

Environment `development` trong repo `k26game3` với các biến bootstrap in ra (`GCP_PROJECT_ID`, `GCP_REGION`, `WIF_PROVIDER`,
`DEPLOYER_SA`, `RUNTIME_SA`, `SCHEDULER_SA`, `HOSTING_SITE`, `GEMINI_MODEL`, `VERTEX_LOCATION`, `VITE_FIREBASE_*`, tùy chọn
`PEER_CITY_URL`, `PEER_DETECTIVE_URL`). Push `main` + CI xanh → deploy dev; **Deploy production** chạy tay, cần người duyệt.

## 9. Sự cố thường gặp

| Hiện tượng | Xử lý |
|---|---|
| `/api/**` 404 trên k26-vstep.web.app | Cloud Run `vstep-api` chưa có ở asia-southeast1 |
| 403 khi Hosting gọi Cloud Run | `gcloud run services update vstep-api --region asia-southeast1 --no-invoker-iam-check` |
| `NOT_PROVISIONED … not been set up in VSTEP Quest` | Chưa seed trường (mục 5) hoặc mã trường khác Game 1 |
| Bấm Nghe báo "audio not ready" | Bài Nghe được duyệt khi TTS lỗi: Quản trị → Nội dung → item → "Tạo bản nghe thử" rồi duyệt lại; kiểm tra API Text-to-Speech đã bật |
| Ghi âm báo "Speech recognition is not available" | API Speech-to-Text chưa bật hoặc SA thiếu `serviceusage.serviceUsageConsumer` – chạy lại bootstrap |
| Bài Viết/Nói "AI chưa khả dụng – giảng viên sẽ chấm" | Sai `GEMINI_MODEL`/`VERTEX_LOCATION`; xem log `writing grading failed` |
| Scheduler job 401/403 | `JOBS_INVOKERS` phải là `vstep-scheduler@…`, `JOBS_AUDIENCE` = URL Cloud Run, job dùng OIDC audience = cùng URL |
| `PERMISSION_DENIED` Firestore / Storage | Sai `FIRESTORE_DATABASE` (phải `vstep`) hoặc `AUDIO_BUCKET`; chạy lại bootstrap |
| `requires an index` | `npx firebase-tools@14.27.0 deploy --only firestore --project k26game1`, đợi index build xong |
| Hồ sơ báo nguồn Game 1/2 "HTTP 401/403" | Game 1/2 chưa triển khai lại (mục 7) hoặc `LMS_SERVICE_ACCOUNTS` khác email `vstep-api` |
