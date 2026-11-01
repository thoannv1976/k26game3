# VSTEP Quest – AI English Skills Adventure (K26 Game 3)

Game luyện 4 kỹ năng tiếng Anh **Nghe – Đọc – Viết – Nói** theo định dạng VSTEP (B1–B2) cho sinh viên đại học: thế giới
nhiệm vụ 4 vùng, thử thách, XP, huy hiệu, thi thử bấm giờ, giải đấu, hồ sơ 4 kỹ năng và trợ lý AI.
Kết quả là **luyện tập**, không phải điểm VSTEP chính thức.

- Web: `https://k26-vstep.web.app` (sau khi triển khai) · Tài khoản dùng chung với English City Simulator và English Detective.
- Kế hoạch: [`PLAN.md`](PLAN.md) · Đặc tả: [`docs/spec/game3-vstep-quest.md`](docs/spec/game3-vstep-quest.md)
- Triển khai: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) · Hướng dẫn cho Claude Cowork: [`docs/COWORK-DEPLOY.md`](docs/COWORK-DEPLOY.md)
- Kiến trúc [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · Dữ liệu [`docs/DATABASE.md`](docs/DATABASE.md) · API [`docs/API.md`](docs/API.md) ·
  Kiểm thử [`docs/TESTING.md`](docs/TESTING.md) · Bảo mật [`docs/SECURITY.md`](docs/SECURITY.md) · Vận hành [`docs/OPERATIONS.md`](docs/OPERATIONS.md) ·
  Nội dung [`docs/CONTENT.md`](docs/CONTENT.md) · Hướng dẫn sử dụng [`docs/USER-GUIDE.md`](docs/USER-GUIDE.md)

## Chạy trên máy (offline AI/STT/TTS)

```bash
npm ci
```

```bash
npm run emulators
```

```bash
npm run seed:local
```

```bash
npm run dev:api
```

```bash
npm run dev:web
```

Đăng nhập `student1@demo.edu.vn` / `Demo-12345` (giảng viên `teacher@demo.edu.vn`, quản trị `admin@demo.edu.vn`).

## Kiểm thử

```bash
npm run typecheck && npm run test:unit && npm run test:integration
```

```bash
npm run test:e2e
```

## Cấu trúc

`packages/shared` (schema) · `packages/game-engine` (luật chơi, bấm giờ, chấm điểm, kiểm tra nội dung) · `packages/ai`
(prompt, Gemini, bộ lọc) · `apps/api` (Fastify, Cloud Run) · `apps/web` (React) · `content/` (8 quest + đề thi thử MX1) ·
`infrastructure/` + `scripts/` (triển khai) · `firebase/` (rules, indexes).
