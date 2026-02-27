1. 🎯 Product Vision

Ghost Radar PRO là một nền tảng Urban Legend Intelligence Platform.

Mục tiêu:

Tạo trải nghiệm “quét tại địa điểm thật”

Kết hợp dữ liệu thực tế + AI sáng tạo

Không khẳng định đúng sai

Không cổ vũ mê tín

Có mô hình kinh tế bền vững

Triết lý:

AI là hậu trường.
Trải nghiệm và kiểm soát chi phí là trung tâm.

2. 🧭 Product Positioning

Không phải app bắt ma.
Không phải app mê tín.

Là:

Nền tảng kể chuyện đô thị

Phân tích văn hóa – tâm lý – xã hội

Giải trí + khám phá

3. 🧠 Hybrid Content Strategy (B)
Layer 1 – Real Data Foundation

Vụ án nổi tiếng

Truyền thuyết địa phương

Địa điểm lịch sử

Tin tức đã công bố

Lưu DB và tái sử dụng.

Layer 2 – AI Creative Variation

Biến thể câu chuyện theo grid

Cá nhân hóa nhẹ theo location

Không search realtime mỗi user

AI không được phép chạy tuyến tính theo user.

4. 🏗 Architecture Phase 1 (A)
System Overview

Mobile/Web
↓
Fastify API (Docker)
↓
PostgreSQL (Docker)
↓
Gemini Flash API

Không Redis
Không Worker riêng
Không Microservice

5. 📂 Project Structure
ghost-radar-phase1/
│
├── apps/
│   ├── api/
│   └── web/
│
├── docker-compose.yml
├── MASTER.md
├── .env
└── .gitignore
6. 🗄 Database Design
grid_cache

Cache theo grid 2km.

grid_id (PK)

lat_center

lon_center

radius_km

events_json (JSONB)

updated_at

expires_at

TTL: 24–48 giờ.

events

Danh sách điểm hiển thị trên radar.

id (PK)

grid_id

title

type

lat

lon

teaser (<=140 ký tự)

danger_level

has_detail

created_at

event_details

Chi tiết nội dung đã generate.

event_id

level (1 hoặc 2)

story_text

witness

analysis

image_url

audio_url

generated_at

users (Phase 1.5)

id

subscription_status

created_at

usage_daily

user_id

date

level1_count

7. 🔄 API Design
POST /scan

Input:
lat, lon, radiusKm (query params)

Phase 4 update: /scan uses POST for structured payload and future extensibility.

Flow:

Tính grid_id

Nếu cache còn hạn → return

Nếu không:

Gọi Gemini Flash

Generate 10–20 events JSON

Lưu DB

Return events

Response time target: < 1s (cache hit), < 3s (miss)

GET /events/:id

Return event + detail nếu có.

POST /events/:id/expand?level=1

Flow:

Check quota

Nếu đã có detail → return

Gọi Gemini Flash (400–600 từ)

Lưu DB

Return story

Response target: 2–5s

8. 🧠 AI Prompt Design Guidelines
Scan Prompt Rules

Output strict JSON

Max 20 events

Teaser <= 140 characters

No long storytelling

No markdown

Level 1 Prompt Rules

400–600 từ

Chia 3 phần:

Summary

Witness

Analysis

Không khẳng định siêu nhiên là thật

Tone: hồ sơ mật

Level 2 Prompt (Phase 2+)

800–1200 từ

Timeline

Multi-angle analysis

Cultural context

9. 💰 Unit Economics

Giả định:

Scan Flash = $0.002
Level 1 Flash = $0.005

Free user tối đa/ngày:

1 scan
3 expand

Cost ~ $0.017/user/ngày

100 user = $1.7/ngày
1000 user = $17/ngày

Nếu không cache:
Chi phí tăng gấp 5–10 lần.

10. 📊 Cost Control Policies

Không generate lại cùng event.

Không scan nếu cache còn hạn.

Không dùng Pro model ở Phase 1.

Log số lần AI call/ngày.

Alert nếu vượt budget.

11. 🔐 Security Rules

Không expose API key.

Không cho frontend gọi Gemini.

Validate lat/lon.

Rate limit IP.

Không cho spam expand.

12. 🛡 App Store Compliance

Không khẳng định đúng sai.

Không hướng dẫn mê tín.

Không gây hoảng loạn.

Có disclaimer:

“Ứng dụng mang tính giải trí và khám phá văn hóa.”

13. 🎙 Voice Strategy

Phase 1:
Browser SpeechSynthesis

Phase 3:
AI TTS + cache audio_url

14. 📈 Monetization Strategy

Free:

Radar unlimited

3 Level 1/ngày

Pro:

Unlimited Level 1

Unlock Level 2

Premium voice

No ads

15. 📉 Risk Assessment
Technical Risk

AI latency

API failure

Mitigation:

Cache

Retry logic

Financial Risk

AI cost runaway

Mitigation:

Quota

Daily limit

Policy Risk

Mê tín content

Mitigation:

Cultural framing

16. 📦 DevOps Rules

Docker required

No local Postgres

Git branch model

Small commits

Feature branches

17. 📊 Observability

Log:

AI call count

Cache hit ratio

Expand success rate

Average response time

18. 🚦 Completion Criteria

Phase 1 done when:

✔ Scan cache works
✔ Expand level 1 works
✔ Voice works
✔ Quota works
✔ Docker stable on 2 machines
✔ Cost predictable

19. 🚀 Upgrade Path to Architecture B

Trigger when:

1000 users

Retention > 25%

IAP revenue > AI cost

Upgrade steps:

Add Redis

Add Worker service

Convert expand to async

Batch generate nightly

Add analytics microservice

20. 🧭 Founder Operating Principles

Do not optimize before retention.

Do not scale before monetization.

Do not trust AI to control cost.

Measure everything.

21. 📅 Roadmap 12 Weeks

Weeks 1–2:
Docker + DB + Scan

Weeks 3–4:
Expand + Cache

Weeks 5–6:
Gemini integration

Weeks 7–8:
Quota + UI polish

Weeks 9–10:
Internal test

Weeks 11–12:
Soft launch

22. 🧠 Long-Term Vision

Ghost Radar PRO không chỉ là app.

Có thể mở rộng thành:

Video automation

Podcast storytelling

Cultural intelligence platform

Membership community
