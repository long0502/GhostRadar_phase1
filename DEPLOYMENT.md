# 🚀 GhostRadar — Railway Deployment Guide

> Hướng dẫn deploy lên Railway, dựa trên các lỗi đã gặp và fix (19/03/2026).

---

## 1. Kiến trúc Monorepo

```
GhostRadar_phase1/
├── apps/api/          ← Fastify API (Dockerfile)
├── apps/admin/        ← Admin Dashboard (Dockerfile)
├── web/               ← Next.js Frontend (Nixpacks)
```

Mỗi service trên Railway cần **Root Directory** riêng hoặc cấu hình đúng trong dashboard.

---

## 2. Railway Services & Settings

| Service | Root Directory | Builder    | Start Command          |
|---------|---------------|------------|------------------------|
| **api** | `apps/api`    | Dockerfile | `npm start` (auto)     |
| **web** | `web`         | Nixpacks   | `npm start` (auto)     |
| **admin** | `apps/admin` | Dockerfile | `npm start` (auto)    |
| **Postgres** | —        | —          | Railway managed        |

### ⚠️ Lưu ý quan trọng

- Railway **dùng `npm start`** thay vì Dockerfile CMD → logic startup phải nằm trong `package.json` script `"start"`
- API service: `"start": "node scripts/docker-start.js"` — script này chạy `prisma db push` trước khi start server

---

## 3. Environment Variables

### API Service (`apps/api`)

| Variable | Bắt buộc | Ví dụ |
|----------|----------|-------|
| `DATABASE_URL` | ✅ | Link từ Postgres service (Railway auto-inject) |
| `GEMINI_API_KEY` | ✅ | Từ [Google AI Studio](https://aistudio.google.com/apikey) |
| `GEMINI_MODEL` | ✅ | `gemini-2.5-flash` (KHÔNG dùng `-lite` nếu cần Google Search) |
| `NODE_ENV` | ✅ | `production` |
| `PORT` | ✅ | Railway auto-inject |

### Web Service (`web`)

| Variable | Bắt buộc | Giá trị |
|----------|----------|---------|
| `NEXT_PUBLIC_API_BASE_URL` | ✅ | `https://api-production-XXXX.up.railway.app` (**KHÔNG có `/` ở cuối!**) |
| `PORT` | ✅ | Railway auto-inject |

---

## 4. Checklist Deploy

### Trước khi push code
- [ ] Commit trên branch `dev` (Railway watch branch `dev`)
- [ ] **KHÔNG commit API keys** vào git — dùng Railway Variables
- [ ] Kiểm tra `apps/api/package.json` → `"start"` phải là `"node scripts/docker-start.js"`

### Sau khi push
- [ ] Railway tự detect và build
- [ ] Kiểm tra **Build Logs**: `prisma generate` phải thành công
- [ ] Kiểm tra **Deploy Logs**: phải thấy `=== DB push SUCCESS ===`
- [ ] Test: `GET /health` → `{"status":"ok"}`
- [ ] Test: `GET /ready` → `{"status":"ready"}`
- [ ] Test: `GET /__routes` → Route tree đầy đủ
- [ ] Test: `POST /scan?lat=10.77&lon=106.7&radiusKm=5&lang=vi` → events có data

---

## 5. Các lỗi thường gặp & cách fix

### ❌ "Route not found" cho mọi endpoint
**Nguyên nhân**: `NEXT_PUBLIC_API_BASE_URL` có dấu `/` thừa ở cuối → tạo double slash `//scan`
```diff
- https://api-production-XXXX.up.railway.app/
+ https://api-production-XXXX.up.railway.app
```

### ❌ "Table does not exist"
**Nguyên nhân**: `prisma db push` chưa chạy khi container start
- Kiểm tra deploy log có `=== DB push SUCCESS ===` không
- `prisma.config.ts` cần `prisma` package → Dockerfile phải COPY `node_modules/prisma` từ builder

### ❌ "DB_NOT_READY" nhưng `/ready` trả 200
**Nguyên nhân**: Error handler regex quá rộng bắt nhầm lỗi khác thành DB error
- Đã fix: regex giờ chỉ match `econnrefused|prisma\s*client|connection\s*pool`

### ❌ "API key was reported as leaked" (403)
**Nguyên nhân**: API key bị commit vào git → Google vô hiệu hóa
- Tạo key mới tại [Google AI Studio](https://aistudio.google.com/apikey)
- Chỉ lưu key trong Railway Variables, KHÔNG trong code

### ❌ "unknown option: --skip-generate"
**Nguyên nhân**: Prisma 7 không hỗ trợ `--skip-generate` trong `db push`
- Đã fix trong `scripts/docker-start.js`

### ❌ Build fail với "url no longer supported in schema"  
**Nguyên nhân**: Prisma 7 không cho `url = env("DATABASE_URL")` trong `schema.prisma`
- URL phải nằm trong `prisma.config.ts` (đã cấu hình đúng)

---

## 6. Prisma 7 Notes

```
schema.prisma    → KHÔNG có `url` trong datasource
prisma.config.ts → Có `datasource.url: process.env["DATABASE_URL"]`
```

- `prisma generate` cần `prisma.config.ts` + `tsx` để load TypeScript
- `prisma db push` cần `prisma` package trong runner container
- Dockerfile runner phải copy: `.prisma`, `@prisma`, `prisma` từ builder stage

---

## 7. File quan trọng

| File | Mô tả |
|------|--------|
| `apps/api/Dockerfile` | Multi-stage build cho API |
| `apps/api/scripts/docker-start.js` | Startup script: prisma db push + server |
| `apps/api/prisma.config.ts` | Prisma 7 config với DATABASE_URL |
| `apps/api/prisma/schema.prisma` | Database schema (KHÔNG có url) |
| `railway.json` | Config-as-code (có thể bị Railway dashboard override) |
